#!/bin/bash

set -e

echo "🚀 Настройка Docker окружения для сайта доната"
echo "================================================"
echo ""

# Функция установки Docker
install_docker() {
    echo "📦 Установка Docker..."
    
    # Обновление пакетов
    apt-get update
    apt-get install -y ca-certificates curl gnupg lsb-release
    
    # Добавление GPG ключа Docker
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Добавление репозитория Docker
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Установка Docker
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Запуск Docker
    systemctl start docker
    systemctl enable docker
    
    echo "✅ Docker установлен"
}

# Проверка и установка Docker
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker не найден. Устанавливаю..."
    
    # Проверка прав root
    if [ "$EUID" -ne 0 ]; then 
        echo "❌ Для установки Docker требуются права root. Запустите: sudo ./setup.sh"
        exit 1
    fi
    
    install_docker
else
    echo "✅ Docker уже установлен"
fi

# Проверка docker compose (новая версия - плагин)
if ! docker compose version &> /dev/null; then
    if ! command -v docker-compose &> /dev/null; then
        echo "❌ Docker Compose не найден и не может быть установлен автоматически."
        echo "Попробуйте переустановить Docker или установите docker-compose вручную."
        exit 1
    else
        echo "✅ Используется docker-compose (старая версия)"
        COMPOSE_CMD="docker-compose"
    fi
else
    echo "✅ Docker Compose установлен"
    COMPOSE_CMD="docker compose"
fi

# Создание .env если не существует
if [ ! -f .env ]; then
    echo "📝 Создание файла .env..."
    echo ""
    
    read -p "Введите домен (например, donat.example.com): " DOMAIN
    read -p "Введите email для Let's Encrypt: " EMAIL
    read -p "Введите YOOMONEY_CLIENT_ID: " YOOMONEY_CLIENT_ID
    read -p "Введите YOOMONEY_CLIENT_SECRET: " YOOMONEY_CLIENT_SECRET
    read -p "Введите YOOMONEY_RECEIVER (номер счета): " YOOMONEY_RECEIVER
    
    YOOMONEY_REDIRECT_URI="https://${DOMAIN}/oauth/callback"
    
    cat > .env << EOF
YOOMONEY_CLIENT_ID=${YOOMONEY_CLIENT_ID}
YOOMONEY_CLIENT_SECRET=${YOOMONEY_CLIENT_SECRET}
YOOMONEY_REDIRECT_URI=${YOOMONEY_REDIRECT_URI}
YOOMONEY_RECEIVER=${YOOMONEY_RECEIVER}
PORT=3000
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
EOF
    
    echo "✅ Файл .env создан"
else
    echo "✅ Файл .env уже существует"
    source .env
fi

# Создание директорий
echo ""
echo "📁 Создание необходимых директорий..."
mkdir -p certbot/conf certbot/www data

# Создание nginx.conf из шаблона
echo ""
echo "📝 Создание конфигурации nginx..."
envsubst '${DOMAIN}' < nginx.conf.template > nginx.conf

# Временный nginx конфиг для получения сертификата
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

echo "✅ Временная конфигурация nginx создана"

# Запуск nginx для получения сертификата
echo ""
echo "🔐 Получение SSL сертификата..."
$COMPOSE_CMD up -d nginx

# Ожидание запуска nginx
sleep 5

# Получение сертификата
$COMPOSE_CMD run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email ${EMAIL} \
    --agree-tos \
    --no-eff-email \
    -d ${DOMAIN}

if [ $? -eq 0 ]; then
    echo "✅ SSL сертификат успешно получен"
else
    echo "❌ Ошибка получения SSL сертификата"
    exit 1
fi

# Создание финальной конфигурации nginx
echo ""
echo "📝 Создание финальной конфигурации nginx..."
envsubst '${DOMAIN}' < nginx.conf.template > nginx.conf

# Перезапуск с финальной конфигурацией
echo ""
echo "🔄 Перезапуск контейнеров..."
$COMPOSE_CMD down
$COMPOSE_CMD up -d

echo ""
echo "✅ Установка завершена!"
echo ""
echo "📊 Статус контейнеров:"
$COMPOSE_CMD ps
echo ""
echo "🌐 Сайт доступен по адресу: https://${DOMAIN}"
echo "⚙️  Настройки: https://${DOMAIN}/settings.html"
echo "🏆 Топ донатеров: https://${DOMAIN}/top.html"
echo ""
echo "📝 Полезные команды:"
echo "  $COMPOSE_CMD logs -f          # Просмотр логов"
echo "  $COMPOSE_CMD restart          # Перезапуск"
echo "  $COMPOSE_CMD down             # Остановка"
echo "  $COMPOSE_CMD up -d            # Запуск"
echo ""
