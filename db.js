const Database = require('better-sqlite3');
const path = require('path');

// Создаем/открываем базу данных
const db = new Database(path.join(__dirname, 'donat.db'));

// Создаем таблицы
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    commission REAL NOT NULL,
    totalAmount REAL NOT NULL,
    message TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed')),
    sender TEXT DEFAULT '',
    paidAt TEXT,
    actualAmount REAL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_orderId ON payments(orderId);
  CREATE INDEX IF NOT EXISTS idx_status ON payments(status);
  CREATE INDEX IF NOT EXISTS idx_createdAt ON payments(createdAt);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

console.log('✅ База данных SQLite инициализирована');

// Функции для работы с платежами
const paymentQueries = {
  // Создать платеж
  create: db.prepare(`
    INSERT INTO payments (orderId, amount, commission, totalAmount, message, status)
    VALUES (@orderId, @amount, @commission, @totalAmount, @message, @status)
  `),

  // Получить все платежи
  getAll: db.prepare(`
    SELECT * FROM payments ORDER BY createdAt DESC
  `),

  // Получить платеж по orderId
  getByOrderId: db.prepare(`
    SELECT * FROM payments WHERE orderId = ?
  `),

  // Получить pending платежи
  getPending: db.prepare(`
    SELECT * FROM payments WHERE status = 'pending'
  `),

  // Обновить статус платежа
  updateStatus: db.prepare(`
    UPDATE payments 
    SET status = @status, paidAt = @paidAt, actualAmount = @actualAmount, sender = @sender
    WHERE orderId = @orderId
  `),

  // Удалить платеж
  delete: db.prepare(`
    DELETE FROM payments WHERE orderId = ?
  `),

  // Очистить все платежи
  deleteAll: db.prepare(`
    DELETE FROM payments
  `),

  // Получить статистику
  getStats: db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as totalAmount
    FROM payments
  `)
};

// Функции для работы с настройками
const settingsQueries = {
  get: db.prepare(`SELECT value FROM settings WHERE key = ?`),
  set: db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
};

module.exports = {
  db,
  paymentQueries,
  settingsQueries
};
