FROM node:20-alpine

WORKDIR /app

# Установка зависимостей для сборки native модулей
RUN apk add --no-cache python3 make g++

# Копируем package файлы
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install --production

# Копируем остальные файлы
COPY . .

# Создаем директорию для БД
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
