#!/bin/bash

set -e

echo "🚀 Настройка Docker окружения для сайта доната"
echo "================================================"
echo ""

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен. Установите Docker и попробуйте снова."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose не установлен. Установите Docker Compose и попробуйте снова."
    exit 1
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
docker-compose up -d nginx

# Ожидание запуска nginx
sleep 5

# Получение сертификата
docker-compose run --rm certbot certonly \
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
docker-compose down
docker-compose up -d

echo ""
echo "✅ Установка завершена!"
echo ""
echo "📊 Статус контейнеров:"
docker-compose ps
echo ""
echo "🌐 Сайт доступен по адресу: https://${DOMAIN}"
echo "⚙️  Настройки: https://${DOMAIN}/settings.html"
echo "🏆 Топ донатеров: https://${DOMAIN}/top.html"
echo ""
echo "📝 Полезные команды:"
echo "  docker-compose logs -f          # Просмотр логов"
echo "  docker-compose restart          # Перезапуск"
echo "  docker-compose down             # Остановка"
echo "  docker-compose up -d            # Запуск"
echo ""
