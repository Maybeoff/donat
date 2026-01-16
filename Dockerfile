FROM node:18-alpine

WORKDIR /app

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
