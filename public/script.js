// Проверка авторизации при загрузке
async function checkAuth() {
    try {
        const response = await fetch('/api/auth-status');
        const data = await response.json();
        
        const authStatus = document.getElementById('auth-status');
        
        if (data.authorized) {
            authStatus.innerHTML = `
                <div style="color: #4caf50;">
                    ✅ Авторизован<br>
                    <small>Токен: ${data.token}</small>
                </div>
            `;
        } else {
            authStatus.innerHTML = `
                <div style="color: #f44336;">
                    ❌ Не авторизован<br>
                    <button onclick="window.location.href='/oauth/authorize'">Авторизоваться через YooMoney</button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
    }
}

// Проверяем авторизацию при загрузке страницы
checkAuth();

// Расчет суммы с комиссией
function calculateTotal() {
    const amountInput = document.getElementById('amount');
    const totalDisplay = document.getElementById('total-amount');
    
    const amount = parseFloat(amountInput.value) || 0;
    const commission = amount * 0.03; // 3% комиссия
    const total = amount + commission;
    
    if (amount > 0) {
        totalDisplay.innerHTML = `
            <div class="total-info">
                <div>Сумма доната: <strong>${amount.toFixed(2)} ₽</strong></div>
                <div>Комиссия сервиса (3%): <strong>${commission.toFixed(2)} ₽</strong></div>
                <div class="total-line">К оплате: <strong>${total.toFixed(2)} ₽</strong></div>
            </div>
        `;
    } else {
        totalDisplay.innerHTML = '';
    }
}

// Обработка формы доната
document.getElementById('donation-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const amount = parseFloat(document.getElementById('amount').value);
    const message = document.getElementById('message').value;
    
    // Рассчитываем сумму с комиссией
    const commission = amount * 0.03;
    const totalAmount = amount + commission;
    
    try {
        // Сначала регистрируем платеж на нашем сервере
        const response = await fetch('/api/create-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                amount: amount,
                totalAmount: totalAmount,
                message 
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert('Ошибка: ' + data.error);
            return;
        }
        
        // Создаем и отправляем форму на YooMoney с суммой включая комиссию
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'https://yoomoney.ru/quickpay/confirm';
        
        const fields = {
            receiver: data.receiver,
            label: data.orderId,
            'quickpay-form': 'button',
            sum: totalAmount.toFixed(2)
        };
        
        for (const [key, value] of Object.entries(fields)) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = value;
            form.appendChild(input);
        }
        
        document.body.appendChild(form);
        form.submit();
        
    } catch (error) {
        alert('Ошибка при создании платежа: ' + error.message);
    }
});

async function loadAccountInfo() {
    const container = document.getElementById('account-info');
    container.innerHTML = '<div class="loading">Загрузка...</div>';
    
    try {
        const response = await fetch('/api/account-info');
        const data = await response.json();
        
        if (data.error) {
            container.innerHTML = `<div class="error">${data.error}</div>`;
            return;
        }
        
        container.innerHTML = `
            <div class="info-item"><strong>Номер счета:</strong> ${data.account || 'Не указан'}</div>
            <div class="info-item"><strong>Баланс:</strong> ${data.balance || '0'} ₽</div>
        `;
    } catch (error) {
        container.innerHTML = `<div class="error">Ошибка загрузки: ${error.message}</div>`;
    }
}

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
    autoRefreshInterval = setInterval(loadDonations, 5000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}
