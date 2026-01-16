// Загрузка информации об авторизации
async function loadAuthInfo() {
    try {
        const response = await fetch('/api/auth-status');
        const data = await response.json();
        
        const authInfo = document.getElementById('auth-info');
        
        if (data.authorized) {
            authInfo.innerHTML = `
                <div class="info-item">
                    <strong>Статус:</strong> 
                    <span style="color: #4caf50;">✅ Авторизован</span>
                </div>
                <div class="info-item">
                    <strong>Токен:</strong> 
                    <code style="font-size: 0.85em; word-break: break-all;">${data.token}</code>
                </div>
                <div class="info-item" style="color: #666; font-size: 0.9em;">
                    Токен действителен до перезапуска сервера
                </div>
            `;
        } else {
            authInfo.innerHTML = `
                <div class="info-item">
                    <strong>Статус:</strong> 
                    <span style="color: #f44336;">❌ Не авторизован</span>
                </div>
                <div class="info-item" style="color: #666;">
                    Для работы с донатами необходима авторизация через YooMoney
                </div>
            `;
        }
    } catch (error) {
        document.getElementById('auth-info').innerHTML = `
            <div class="error">Ошибка загрузки: ${error.message}</div>
        `;
    }
}

// Загрузка статистики
async function loadStats() {
    try {
        const response = await fetch('/api/payments');
        const payments = await response.json();
        
        const total = payments.length;
        const success = payments.filter(p => p.status === 'success').length;
        const pending = payments.filter(p => p.status === 'pending').length;
        
        const totalAmount = payments
            .filter(p => p.status === 'success')
            .reduce((sum, p) => sum + p.amount, 0);
        
        const statsDiv = document.getElementById('stats');
        statsDiv.innerHTML = `
            <div class="info-item">
                <strong>Всего платежей:</strong> ${total}
            </div>
            <div class="info-item">
                <strong>Оплачено:</strong> <span style="color: #4caf50;">${success}</span>
            </div>
            <div class="info-item">
                <strong>Ожидают оплаты:</strong> <span style="color: #f44336;">${pending}</span>
            </div>
            <div class="info-item">
                <strong>Сумма оплаченных:</strong> <span style="color: #667eea; font-size: 1.2em;">${totalAmount.toFixed(2)} ₽</span>
            </div>
        `;
    } catch (error) {
        document.getElementById('stats').innerHTML = `
            <div class="error">Ошибка загрузки: ${error.message}</div>
        `;
    }
}

// Авторизация
function authorize() {
    window.location.href = '/oauth/authorize';
}

// Удаление токена
async function revokeToken() {
    if (!confirm('Вы уверены, что хотите удалить токен? Проверка донатов перестанет работать.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/revoke-token', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            alert('✅ Токен удален');
            loadAuthInfo();
        } else {
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        alert('❌ Ошибка: ' + error.message);
    }
}

// Очистка платежей
async function clearPayments() {
    if (!confirm('Вы уверены, что хотите удалить все платежи? Это действие нельзя отменить.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/clear-payments', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            alert('✅ Все платежи удалены');
            loadStats();
        } else {
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        alert('❌ Ошибка: ' + error.message);
    }
}

// Загрузка списка донатов
async function loadDonations() {
    const container = document.getElementById('donations');
    container.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        const response = await fetch('/api/payments');
        const payments = await response.json();
        
        if (payments.length === 0) {
            container.innerHTML = '<p>Донатов пока нет</p>';
            return;
        }
        
        const donations = payments.map(payment => {
            const statusBadge = payment.status === 'success' 
                ? '<span class="status-success">✅ Оплачен</span>' 
                : '<span class="status-failed">❌ Не оплачен</span>';
            
            return `
                <div class="donation-item ${payment.status}">
                    <div class="donation-header">
                        <strong>${payment.amount} ₽</strong>
                        ${statusBadge}
                    </div>
                    ${payment.totalAmount ? `<div class="commission-info">Оплачено с комиссией: ${payment.totalAmount} ₽ (комиссия ${payment.commission} ₽)</div>` : ''}
                    ${payment.sender ? `<div>От: ${payment.sender}</div>` : ''}
                    ${payment.message ? `<div class="donation-message">"${payment.message}"</div>` : ''}
                    <small>Создан: ${new Date(payment.createdAt).toLocaleString('ru-RU')}</small>
                    ${payment.paidAt ? `<br><small>Оплачен: ${new Date(payment.paidAt).toLocaleString('ru-RU')}</small>` : ''}
                    <div class="donation-id">ID: ${payment.orderId}</div>
                    <button onclick="deletePayment('${payment.orderId}')" style="background: #f44336; margin-top: 10px; padding: 6px 12px; font-size: 0.85em;">🗑️ Удалить</button>
                </div>
            `;
        }).join('');
        
        container.innerHTML = donations;
    } catch (error) {
        container.innerHTML = `<div class="error">Ошибка загрузки: ${error.message}</div>`;
    }
}

// Автообновление списка донатов каждые 5 секунд
let autoRefreshInterval = null;

function startAutoRefresh() {
    if (autoRefreshInterval) return;
    loadDonations();
    autoRefreshInterval = setInterval(loadDonations, 5000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Удаление конкретного платежа
async function deletePayment(orderId) {
    if (!confirm(`Удалить платеж ${orderId}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/payment/${orderId}`, { method: 'DELETE' });
        const data = await response.json();
        
        if (data.success) {
            alert('✅ Платеж удален');
            loadDonations();
            loadStats();
        } else {
            alert('❌ Ошибка: ' + data.error);
        }
    } catch (error) {
        alert('❌ Ошибка: ' + error.message);
    }
}

// Загрузка данных при открытии страницы
loadAuthInfo();
loadStats();
loadDonations();
startAutoRefresh();
