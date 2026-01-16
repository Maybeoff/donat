#!/bin/bash

set -e

echo "🚀 Автоматическая установка сайта доната"
echo "=========================================="
echo ""

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Требуются права root. Запустите: sudo ./setup.sh"
    exit 1
fi

# Функция установки Docker
install_docker() {
    echo "📦 Установка Docker..."
    apt-get update
    apt-get install -y ca-certificates curl gnupg lsb-release
    
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    systemctl start docker
    systemctl enable docker
    
    echo "✅ Docker установлен"
}

# Проверка и установка Docker
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker не найден. Устанавливаю..."
    install_docker
else
    echo "✅ Docker уже установлен"
fi

# Определение команды compose
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo "✅ Используется: $COMPOSE_CMD"
echo ""

# Запрос данных
read -p "Введите домен (например, donat.example.com): " DOMAIN
read -p "Введите email для Let's Encrypt: " EMAIL
read -p "Введите YOOMONEY_CLIENT_ID: " YOOMONEY_CLIENT_ID
read -p "Введите YOOMONEY_CLIENT_SECRET: " YOOMONEY_CLIENT_SECRET
read -p "Введите YOOMONEY_RECEIVER (номер счета): " YOOMONEY_RECEIVER

YOOMONEY_REDIRECT_URI="https://${DOMAIN}/oauth/callback"

# Создание .env
echo ""
echo "📝 Создание .env файла..."
cat > .env << EOF
YOOMONEY_CLIENT_ID=${YOOMONEY_CLIENT_ID}
YOOMONEY_CLIENT_SECRET=${YOOMONEY_CLIENT_SECRET}
YOOMONEY_REDIRECT_URI=${YOOMONEY_REDIRECT_URI}
YOOMONEY_RECEIVER=${YOOMONEY_RECEIVER}
PORT=3000
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
EOF

echo "✅ .env создан"

# Создание директорий
echo ""
echo "📁 Создание директорий..."
mkdir -p certbot/conf certbot/www data

# Остановка системного nginx если запущен
echo ""
echo "🛑 Остановка системного nginx..."
systemctl stop nginx 2>/dev/null || true
systemctl disable nginx 2>/dev/null || true

echo "✅ Системный nginx остановлен"

# Удаление лишних файлов
echo ""
echo "🗑️  Удаление лишних файлов..."
rm -rf vite public_old .git .gitignore TODO README.md README-DOCKER.md

echo "✅ Лишние файлы удалены"

# Сборка Docker образа
echo ""
echo "🔨 Сборка Docker образа..."
docker build -t donat-app .

echo "✅ Образ собран"

# Временный nginx для получения сертификата
echo ""
echo "📝 Создание временной конфигурации nginx..."
cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name _;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'OK';
            add_header Content-Type text/plain;
        }
    }
}
EOF

# Запуск nginx для получения сертификата
echo ""
echo "🚀 Запуск nginx для получения сертификата..."
$COMPOSE_CMD up -d nginx

sleep 5

# Получение SSL сертификата
echo ""
echo "🔐 Получение SSL сертификата..."
$COMPOSE_CMD run --rm --entrypoint certbot certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email ${EMAIL} \
    --agree-tos \
    --no-eff-email \
    --non-interactive \
    -d ${DOMAIN}

if [ $? -ne 0 ]; then
    echo "❌ Ошибка получения SSL сертификата"
    echo "Проверьте что домен ${DOMAIN} указывает на этот сервер"
    $COMPOSE_CMD down
    exit 1
fi

echo "✅ SSL сертификат получен"

# Создание финальной конфигурации nginx
echo ""
echo "📝 Создание финальной конфигурации nginx..."
cat > nginx.conf << EOF
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    upstream app {
        server app:3000;
    }

    server {
        listen 80;
        server_name ${DOMAIN};

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://\$host\$request_uri;
        }
    }

    server {
        listen 443 ssl http2;
        server_name ${DOMAIN};

        ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        client_max_body_size 10M;

        # Статика
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            proxy_pass http://app;
            proxy_cache_valid 200 1d;
            add_header Cache-Control "public, immutable";
        }

        # API и динамические запросы
        location / {
            proxy_pass http://app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
            proxy_read_timeout 300;
            proxy_connect_timeout 300;
            proxy_send_timeout 300;
        }
    }
}
EOF

# Перезапуск всех контейнеров
echo ""
echo "🔄 Запуск всех контейнеров..."
$COMPOSE_CMD down
$COMPOSE_CMD up -d

echo ""
echo "✅ Установка завершена!"
echo ""
echo "📊 Статус контейнеров:"
$COMPOSE_CMD ps
echo ""
echo "🌐 Сайт доступен: https://${DOMAIN}"
echo "⚙️  Настройки: https://${DOMAIN}/settings.html"
echo "🏆 Топ донатеров: https://${DOMAIN}/top.html"
echo ""
echo "📝 Полезные команды:"
echo "  $COMPOSE_CMD logs -f app      # Логи приложения"
echo "  $COMPOSE_CMD logs -f nginx    # Логи nginx"
echo "  $COMPOSE_CMD restart          # Перезапуск"
echo "  $COMPOSE_CMD down             # Остановка"
echo ""

