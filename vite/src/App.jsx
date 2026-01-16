import { useState, useEffect } from 'react'
import { Moon, Sun, Wallet, CreditCard, RefreshCw, Pause, Send, MessageSquare, Info, Clock, CheckCircle, XCircle } from 'lucide-react'

function App() {
  const [darkTheme, setDarkTheme] = useState(true)
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [donations, setDonations] = useState([])
  const [accountInfo, setAccountInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(null)

  const commission = amount ? parseFloat(amount) * 0.03 : 0
  const total = amount ? parseFloat(amount) + commission : 0

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved) setDarkTheme(saved === 'dark')
  }, [])

  const toggleTheme = () => {
    const newTheme = !darkTheme
    setDarkTheme(newTheme)
    localStorage.setItem('theme', newTheme ? 'dark' : 'light')
  }

  const loadAccountInfo = async () => {
    try {
      const res = await fetch('/api/account-info')
      const data = await res.json()
      setAccountInfo(data)
    } catch (err) {
      setAccountInfo({ error: err.message })
    }
  }

  const loadDonations = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/payments')
      const data = await res.json()
      setDonations(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Ошибка загрузки:', err)
    }
    setLoading(false)
  }

  const startAutoRefresh = () => {
    loadDonations()
    if (!autoRefresh) {
      const interval = setInterval(loadDonations, 5000)
      setAutoRefresh(interval)
    }
  }

  const stopAutoRefresh = () => {
    if (autoRefresh) {
      clearInterval(autoRefresh)
      setAutoRefresh(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amount), totalAmount: total, message })
      })
      const data = await res.json()
      
      if (data.error) {
        alert('Ошибка: ' + data.error)
        return
      }

      const form = document.createElement('form')
      form.method = 'POST'
      form.action = 'https://yoomoney.ru/quickpay/confirm'
      
      Object.entries({
        receiver: data.receiver,
        label: data.orderId,
        'quickpay-form': 'button',
        sum: total.toFixed(2)
      }).forEach(([key, value]) => {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = key
        input.value = value
        form.appendChild(input)
      })
      
      document.body.appendChild(form)
      form.submit()
    } catch (err) {
      alert('Ошибка: ' + err.message)
    }
  }

  return (
    <div className={`min-h-screen p-6 transition-colors duration-300 ${
      darkTheme 
        ? 'bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900' 
        : 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500'
    }`}>
      <div className="max-w-2xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <Wallet className="w-10 h-10 text-white" />
          <h1 className="text-4xl font-bold text-white">Поддержать донатом</h1>
          <button 
            onClick={toggleTheme}
            className="p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur transition-all hover:scale-110"
          >
            {darkTheme ? <Sun className="w-5 h-5 text-yellow-300" /> : <Moon className="w-5 h-5 text-white" />}
          </button>
        </div>

        {/* Навигация */}
        <div className="flex gap-3 mb-6 justify-center">
          <a 
            href="/top.html"
            className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white py-3 px-6 rounded-xl transition-all flex items-center gap-2 shadow-lg"
          >
            🏆 Топ донатеров
          </a>
        </div>

        {/* Форма доната */}
        <div className={`rounded-2xl p-6 mb-6 backdrop-blur-sm shadow-2xl ${
          darkTheme ? 'bg-slate-800/80' : 'bg-white/90'
        }`}>
          <h2 className={`text-xl font-semibold mb-5 flex items-center gap-2 ${
            darkTheme ? 'text-purple-400' : 'text-purple-600'
          }`}>
            <Send className="w-5 h-5" />
            Отправить донат
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={`block mb-2 font-medium flex items-center gap-2 ${
                darkTheme ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <CreditCard className="w-4 h-4" />
                Сумма доната (₽)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                step="0.01"
                required
                placeholder="100"
                className={`w-full p-4 rounded-xl border-2 outline-none transition-all ${
                  darkTheme 
                    ? 'bg-slate-700 border-slate-600 text-white focus:border-purple-500' 
                    : 'bg-white border-gray-200 text-gray-900 focus:border-purple-500'
                }`}
              />
            </div>

            {amount > 0 && (
              <div className={`rounded-xl p-4 border-2 ${
                darkTheme ? 'bg-slate-700/50 border-purple-500/50' : 'bg-purple-50 border-purple-200'
              }`}>
                <div className={`py-1 ${darkTheme ? 'text-gray-300' : 'text-gray-700'}`}>
                  Сумма доната: <span className="font-semibold">{parseFloat(amount).toFixed(2)} ₽</span>
                </div>
                <div className={`py-1 ${darkTheme ? 'text-gray-300' : 'text-gray-700'}`}>
                  Комиссия (3%): <span className="font-semibold">{commission.toFixed(2)} ₽</span>
                </div>
                <div className={`pt-3 mt-2 border-t font-bold text-lg ${
                  darkTheme ? 'border-purple-500/50 text-purple-400' : 'border-purple-200 text-purple-600'
                }`}>
                  К оплате: {total.toFixed(2)} ₽
                </div>
              </div>
            )}

            <div>
              <label className={`block mb-2 font-medium flex items-center gap-2 ${
                darkTheme ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <MessageSquare className="w-4 h-4" />
                Сообщение (необязательно)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ваше сообщение..."
                rows={3}
                className={`w-full p-4 rounded-xl border-2 outline-none transition-all resize-none ${
                  darkTheme 
                    ? 'bg-slate-700 border-slate-600 text-white focus:border-purple-500' 
                    : 'bg-white border-gray-200 text-gray-900 focus:border-purple-500'
                }`}
              />
            </div>

            <button 
              type="submit"
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-500/25"
            >
              <CreditCard className="w-5 h-5" />
              Отправить донат
            </button>
          </form>
        </div>

        {/* Информация о счёте */}
        <div className={`rounded-2xl p-6 mb-6 backdrop-blur-sm shadow-2xl ${
          darkTheme ? 'bg-slate-800/80' : 'bg-white/90'
        }`}>
          <h2 className={`text-xl font-semibold mb-5 flex items-center gap-2 ${
            darkTheme ? 'text-purple-400' : 'text-purple-600'
          }`}>
            <Info className="w-5 h-5" />
            Информация о счете
          </h2>
          
          {accountInfo ? (
            accountInfo.error ? (
              <div className="bg-red-500/20 text-red-400 p-4 rounded-xl">{accountInfo.error}</div>
            ) : (
              <div className={`space-y-3 ${darkTheme ? 'text-gray-300' : 'text-gray-700'}`}>
                <div className={`py-3 border-b ${darkTheme ? 'border-slate-700' : 'border-gray-200'}`}>
                  <span className="text-gray-500">Номер счета:</span>{' '}
                  <span className="font-semibold">{accountInfo.account || 'Не указан'}</span>
                </div>
                <div className="py-3">
                  <span className="text-gray-500">Баланс:</span>{' '}
                  <span className="font-semibold text-green-500">{accountInfo.balance || '0'} ₽</span>
                </div>
              </div>
            )
          ) : (
            <button 
              onClick={loadAccountInfo}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-3 px-6 rounded-xl transition-all flex items-center gap-2"
            >
              <Info className="w-4 h-4" />
              Загрузить информацию
            </button>
          )}
        </div>

        {/* Последние донаты */}
        <div className={`rounded-2xl p-6 backdrop-blur-sm shadow-2xl ${
          darkTheme ? 'bg-slate-800/80' : 'bg-white/90'
        }`}>
          <h2 className={`text-xl font-semibold mb-5 flex items-center gap-2 ${
            darkTheme ? 'text-purple-400' : 'text-purple-600'
          }`}>
            <Clock className="w-5 h-5" />
            Последние донаты
          </h2>
          
          <div className="flex gap-3 mb-5 flex-wrap">
            <button 
              onClick={startAutoRefresh}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-3 px-5 rounded-xl transition-all flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              Загрузить донаты
            </button>
            <button 
              onClick={stopAutoRefresh}
              className={`py-3 px-5 rounded-xl transition-all flex items-center gap-2 ${
                darkTheme 
                  ? 'bg-slate-700 hover:bg-slate-600 text-gray-300' 
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              <Pause className="w-4 h-4" />
              Остановить
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 text-purple-500 animate-spin mx-auto" />
              <p className="text-gray-500 mt-2">Загрузка...</p>
            </div>
          ) : donations.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Нажми "Загрузить донаты" для просмотра</p>
          ) : (
            <div className="space-y-4">
              {donations.map((d, i) => (
                <div 
                  key={d.orderId || i}
                  className={`p-4 rounded-xl border-l-4 ${
                    d.status === 'success' 
                      ? `border-green-500 ${darkTheme ? 'bg-green-900/20' : 'bg-green-50'}` 
                      : `border-red-500 ${darkTheme ? 'bg-red-900/20' : 'bg-red-50'}`
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-xl font-bold ${darkTheme ? 'text-purple-400' : 'text-purple-600'}`}>
                      {d.amount} ₽
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${
                      d.status === 'success' 
                        ? 'bg-green-500/20 text-green-500' 
                        : 'bg-red-500/20 text-red-500'
                    }`}>
                      {d.status === 'success' 
                        ? <><CheckCircle className="w-4 h-4" /> Оплачен</> 
                        : <><XCircle className="w-4 h-4" /> Не оплачен</>
                      }
                    </span>
                  </div>
                  
                  {d.totalAmount && (
                    <p className="text-sm text-gray-500 mb-1">
                      С комиссией: {d.totalAmount} ₽ (комиссия {d.commission} ₽)
                    </p>
                  )}
                  {d.sender && <p className={darkTheme ? 'text-gray-300' : 'text-gray-700'}>От: {d.sender}</p>}
                  {d.message && (
                    <p className={`italic my-2 p-3 rounded-lg ${darkTheme ? 'bg-slate-700/50 text-gray-300' : 'bg-white text-gray-600'}`}>
                      "{d.message}"
                    </p>
                  )}
                  <p className="text-sm text-gray-500">
                    Создан: {new Date(d.createdAt).toLocaleString('ru-RU')}
                  </p>
                  {d.paidAt && (
                    <p className="text-sm text-gray-500">
                      Оплачен: {new Date(d.paidAt).toLocaleString('ru-RU')}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">ID: {d.orderId}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
