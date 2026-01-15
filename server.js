require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const { paymentQueries, settingsQueries } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Хранилище токена в БД
let accessToken = null;

// Загружаем токен из БД при старте
const savedToken = settingsQueries.get.get('access_token');
if (savedToken) {
  accessToken = savedToken.value;
  console.log('🔑 Токен загружен из БД');
}

// OAuth авторизация - шаг 1: перенаправление на YooMoney
app.get('/oauth/authorize', (req, res) => {
  const redirectUri = process.env.YOOMONEY_REDIRECT_URI;
  const clientId = process.env.YOOMONEY_CLIENT_ID;
  
  console.log('🔐 Параметры OAuth:');
  console.log('  Client ID:', clientId);
  console.log('  Redirect URI:', redirectUri);
  
  const authUrl = `https://yoomoney.ru/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=account-info%20operation-history`;
  
  console.log('  Auth URL:', authUrl);
  
  res.redirect(authUrl);
});

// OAuth авторизация - шаг 2: получение токена
app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.send('Ошибка: код авторизации не получен');
  }
  
  try {
    console.log('🔑 Получение access token...');
    
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', process.env.YOOMONEY_CLIENT_ID);
    params.append('client_secret', process.env.YOOMONEY_CLIENT_SECRET);
    params.append('redirect_uri', process.env.YOOMONEY_REDIRECT_URI);
    params.append('grant_type', 'authorization_code');
    
    const response = await axios.post(
      'https://yoomoney.ru/oauth/token',
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    accessToken = response.data.access_token;
    
    // Сохраняем токен в БД
    settingsQueries.set.run('access_token', accessToken);
    
    console.log('✅ Access token получен и сохранен в БД:', accessToken);
    
    res.send(`
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial; padding: 50px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
            .success { background: white; color: #333; padding: 30px; border-radius: 15px; max-width: 500px; margin: 0 auto; }
            button { background: #667eea; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="success">
            <h1>✅ Авторизация успешна!</h1>
            <p>Access Token: <code>${accessToken}</code></p>
            <p>Токен сохранен в памяти сервера</p>
            <button onclick="window.location.href='/'">Вернуться на главную</button>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Ошибка получения токена:', error.response?.data || error.message);
    res.send(`Ошибка получения токена: ${error.response?.data?.error || error.message}`);
  }
});

// Проверка статуса авторизации
app.get('/api/auth-status', (req, res) => {
  res.json({ 
    authorized: !!accessToken,
    token: accessToken ? `${accessToken.substring(0, 50)}...` : null
  });
});

// Удаление токена
app.post('/api/revoke-token', (req, res) => {
  try {
    accessToken = null;
    settingsQueries.set.run('access_token', '');
    console.log('🗑️ Токен удален из БД');
    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка удаления токена:', error);
    res.status(500).json({ error: 'Ошибка удаления токена' });
  }
});

// Очистка всех платежей
app.post('/api/clear-payments', (req, res) => {
  try {
    const result = paymentQueries.deleteAll.run();
    console.log(`🗑️ Удалено платежей: ${result.changes}`);
    res.json({ success: true, cleared: result.changes });
  } catch (error) {
    console.error('Ошибка очистки платежей:', error);
    res.status(500).json({ error: 'Ошибка очистки платежей' });
  }
});

// Удаление конкретного платежа
app.delete('/api/payment/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const result = paymentQueries.delete.run(orderId);
    
    if (result.changes > 0) {
      console.log(`🗑️ Удален платеж: ${orderId}`);
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Платеж не найден' });
    }
  } catch (error) {
    console.error('Ошибка удаления платежа:', error);
    res.status(500).json({ error: 'Ошибка удаления платежа' });
  }
});

// Функция проверки платежа через YooMoney API
async function checkPaymentStatus(orderId) {
  if (!accessToken) {
    console.log('⚠️ Access token отсутствует');
    return null;
  }
  
  try {
    const params = new URLSearchParams();
    params.append('type', 'deposition'); // Только входящие платежи
    params.append('label', orderId); // Фильтр по label
    params.append('records', '10');
    
    const response = await axios.post(
      'https://yoomoney.ru/api/operation-history',
      params,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    console.log(`🔍 Проверка платежа ${orderId}...`);
    
    if (response.data.operations && response.data.operations.length > 0) {
      console.log(`📊 Найдено операций с label "${orderId}": ${response.data.operations.length}`);
      
      // Ищем успешную входящую операцию
      const operation = response.data.operations.find(op => {
        console.log(`  - Операция: id="${op.operation_id}", direction="${op.direction}", status="${op.status}", amount=${op.amount}, label="${op.label}"`);
        return op.status === 'success' && op.direction === 'in';
      });
      
      if (operation) {
        console.log(`✅ Найден платеж: ${orderId} - ${operation.amount} ₽`);
        return operation;
      } else {
        console.log(`⏳ Платеж ${orderId} еще не подтвержден`);
      }
    } else {
      console.log(`⏳ Операций с label "${orderId}" не найдено`);
    }
    
    return null;
  } catch (error) {
    console.error('❌ Ошибка проверки платежа:', error.response?.data || error.message);
    return null;
  }
}

// Автоматическая проверка всех pending платежей каждые 10 секунд
setInterval(async () => {
  try {
    const pendingPayments = paymentQueries.getPending.all();
    
    for (const payment of pendingPayments) {
      const operation = await checkPaymentStatus(payment.orderId);
      
      if (operation) {
        paymentQueries.updateStatus.run({
          orderId: payment.orderId,
          status: 'success',
          paidAt: operation.datetime,
          actualAmount: operation.amount,
          sender: operation.title || 'Аноним'
        });
        console.log(`✅ Платеж подтвержден: ${payment.orderId} - ${operation.amount} ₽`);
      }
    }
  } catch (error) {
    console.error('❌ Ошибка проверки платежей:', error.message);
  }
}, 10000);

// Создание платежа с валидацией
app.post('/api/create-payment', [
  body('amount')
    .isFloat({ min: 1, max: 100000 })
    .withMessage('Сумма должна быть от 1 до 100000 рублей'),
  body('message')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Сообщение не должно превышать 500 символов')
    .trim()
    .escape()
], (req, res) => {
  // Проверка валидации
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Ошибка валидации', 
      details: errors.array() 
    });
  }

  try {
    const { amount, message = '' } = req.body;
    const commission = amount * 0.03;
    const totalAmount = amount + commission;
    
    // Генерируем уникальный ID заказа
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Сохраняем в БД
    paymentQueries.create.run({
      orderId,
      amount: parseFloat(amount),
      commission: parseFloat(commission.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      message,
      status: 'pending'
    });
    
    console.log('📝 Создан платеж:', orderId, `${amount} ₽ + ${commission.toFixed(2)} ₽ комиссия = ${totalAmount.toFixed(2)} ₽`);
    
    res.json({ 
      success: true, 
      orderId,
      amount,
      totalAmount,
      receiver: process.env.YOOMONEY_RECEIVER
    });
  } catch (error) {
    console.error('Ошибка при создании платежа:', error);
    res.status(500).json({ error: 'Ошибка при создании платежа' });
  }
});

// Получение всех платежей
app.get('/api/payments', (req, res) => {
  try {
    const allPayments = paymentQueries.getAll.all();
    res.json(allPayments);
  } catch (error) {
    console.error('Ошибка получения платежей:', error);
    res.status(500).json({ error: 'Ошибка получения платежей' });
  }
});

// Проверка конкретного платежа
app.get('/api/check-payment/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const payment = paymentQueries.getByOrderId.get(orderId);
    
    if (!payment) {
      return res.status(404).json({ error: 'Платеж не найден' });
    }
    
    // Если платеж еще pending, проверяем его статус
    if (payment.status === 'pending') {
      const operation = await checkPaymentStatus(orderId);
      
      if (operation) {
        paymentQueries.updateStatus.run({
          orderId,
          status: 'success',
          paidAt: operation.datetime,
          actualAmount: operation.amount,
          sender: operation.title || 'Аноним'
        });
        
        // Получаем обновленный платеж
        const updatedPayment = paymentQueries.getByOrderId.get(orderId);
        return res.json(updatedPayment);
      }
    }
    
    res.json(payment);
  } catch (error) {
    console.error('Ошибка проверки платежа:', error);
    res.status(500).json({ error: 'Ошибка проверки платежа' });
  }
});

// Проверка истории операций
app.get('/api/check-payment', async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  
  try {
    const params = new URLSearchParams();
    params.append('records', '30');
    
    const response = await axios.post(
      'https://yoomoney.ru/api/operation-history',
      params,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка при проверке платежа:', error.response?.data || error.message);
    res.status(500).json({ error: 'Ошибка при проверке платежа' });
  }
});

// Тестовый эндпоинт для проверки токена
app.get('/api/test-token', async (req, res) => {
  if (!accessToken) {
    return res.json({ error: 'Токен не установлен. Пройдите авторизацию: /oauth/authorize' });
  }
  
  try {
    console.log('🔑 Тестирование токена...');
    
    const params = new URLSearchParams();
    
    const response = await axios.post(
      'https://yoomoney.ru/api/account-info',
      params,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    console.log('✅ Токен работает!');
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('❌ Ошибка токена:', error.response?.status, error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Ошибка токена',
      status: error.response?.status,
      details: error.response?.data || error.message
    });
  }
});

// Получение информации о счете
app.get('/api/account-info', async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  
  try {
    const response = await axios.post(
      'https://yoomoney.ru/api/account-info',
      new URLSearchParams(),
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Ошибка при получении информации:', error.response?.data || error.message);
    res.status(500).json({ error: 'Ошибка при получении информации' });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
