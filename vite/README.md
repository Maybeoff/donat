# Донат сайт

Красивый сайт для приёма донатов через YooMoney.

## Установка

```bash
npm install
```

## Запуск (dev)

```bash
npm run dev
```

Откроется на http://localhost:5173

## Сборка для продакшена

```bash
npm run build
```

Готовые файлы будут в папке `dist/`

## Важно

Для работы нужен бэкенд с API:
- `POST /api/create-payment` — создание платежа
- `GET /api/payments` — список донатов
- `GET /api/account-info` — инфо о счёте YooMoney

Бэкенд должен быть настроен на тот же домен или проксироваться.
