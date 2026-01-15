require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Хранилище платежей в памяти (пока сервер запущен)
const payments = new Map();

// Хранилище токена в памяти
let accessToken = process.env.YOOMONEY_TOKEN || null;

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
    console.log('✅ Access token получен:', accessToken);
    
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
  accessToken = null;
  console.log('🗑️ Токен удален');
  res.json({ success: true });
});

// Очистка всех платежей
app.post('/api/clear-payments', (req, res) => {
  const count = payments.size;
  payments.clear();
  console.log(`🗑️ Удалено платежей: ${count}`);
  res.json({ success: true, cleared: count });
});

// Удаление конкретного платежа
app.delete('/api/payment/:orderId', (req, res) => {
  const { orderId } = req.params;
  
  if (payments.has(orderId)) {
    payments.delete(orderId);
    console.log(`🗑️ Удален платеж: ${orderId}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'Платеж не найден' });
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
  for (const [orderId, payment] of payments.entries()) {
    if (payment.status === 'pending') {
      const operation = await checkPaymentStatus(orderId);
      
      if (operation) {
        payment.status = 'success';
        payment.paidAt = operation.datetime;
        payment.actualAmount = operation.amount;
        payment.sender = operation.title || 'Аноним';
        console.log(`✅ Платеж подтвержден: ${orderId} - ${operation.amount} ₽`);
      }
    }
  }
}, 10000);

// Создание платежа
app.post('/api/create-payment', (req, res) => {
  try {
    const { amount, totalAmount, message } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Некорректная сумма' });
    }
    
    // Генерируем уникальный ID заказа
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const commission = amount * 0.03;
    
    // Сохраняем информацию о платеже
    payments.set(orderId, {
      orderId,
      amount: parseFloat(amount),
      commission: parseFloat(commission.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      message: message || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    
    console.log('📝 Создан платеж:', orderId, `${amount} ₽ + ${commission.toFixed(2)} ₽ комиссия = ${totalAmount.toFixed(2)} ₽`);
    
    res.json({ 
      success: true, 
      orderId,
      amount,
      totalAmount 
    });
  } catch (error) {
    console.error('Ошибка при создании платежа:', error);
    res.status(500).json({ error: 'Ошибка при создании платежа' });
  }
});

// Получение всех платежей
app.get('/api/payments', (req, res) => {
  const allPayments = Array.from(payments.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(allPayments);
});

// Проверка конкретного платежа
app.get('/api/check-payment/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const payment = payments.get(orderId);
    
    if (!payment) {
      return res.status(404).json({ error: 'Платеж не найден' });
    }
    
    // Если платеж еще pending, проверяем его статус
    if (payment.status === 'pending') {
      const operation = await checkPaymentStatus(orderId);
      
      if (operation) {
        payment.status = 'success';
        payment.paidAt = operation.datetime;
        payment.actualAmount = operation.amount;
        payment.sender = operation.title || 'Аноним';
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
