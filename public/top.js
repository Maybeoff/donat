// Загрузка топа донатеров
async function loadTopDonors() {
    try {
        const response = await fetch('/api/top-donors');
        const data = await response.json();
        
        const container = document.getElementById('top-donors');
        
        if (data.error) {
            container.innerHTML = `<div class="error">${data.error}</div>`;
            return;
        }
        
        const donors = Array.isArray(data) ? data : [];
        
        if (donors.length === 0) {
            container.innerHTML = '<p>Донатов пока нет</p>';
            return;
        }
        
        const topHtml = donors.map((donor, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const rankClass = index < 3 ? 'top-rank' : '';
            
            return `
                <div class="donor-item ${rankClass}">
                    <div class="donor-rank">${medal}</div>
                    <div class="donor-info">
                        <div class="donor-name">${donor.sender || 'Аноним'}</div>
                        <div class="donor-stats">
                            <span>Донатов: ${donor.count}</span>
                            <span class="donor-amount">${donor.total.toFixed(2)} ₽</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = topHtml;
    } catch (error) {
        document.getElementById('top-donors').innerHTML = `
            <div class="error">Ошибка загрузки: ${error.message}</div>
        `;
    }
}

// Загрузка при открытии страницы
loadTopDonors();

// Автообновление каждые 30 секунд
setInterval(loadTopDonors, 30000);
