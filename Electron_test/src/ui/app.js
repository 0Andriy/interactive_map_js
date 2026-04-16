// *Tray

const logElement = document.getElementById('log')
const addLog = (msg) => {
    logElement.innerHTML += `<div>> ${msg}</div>`
    logElement.scrollTop = logElement.scrollHeight
}

// 1. Створення трею
document.getElementById('btn-create').onclick = async () => {
    const res = await window.electronAPI.invoke('tray:create', {
        tooltip: 'Мій Додаток',
        icon: 'https://cdn-icons-png.flaticon.com/512/6597/6597982.png',
        menu: [{ id: 'test', label: 'Тест' }],
    })
    addLog(`Трей: ${res.status}`)
}

// 2. Оновлення меню (з різними цілями targetWindow)
document.getElementById('btn-update').onclick = () => {
    window.electronAPI.send('tray:set-menu', [
        {
            id: 'user',
            label: 'Профіль',
            iconSource: 'user-icon.png',
            iconSize: 24, // Зробимо цю іконку трохи більшою
        },
        {
            label: 'Налаштування',
            submenu: [
                {
                    id: 'theme',
                    label: 'Темна тема',
                    iconSource: 'moon.png',
                    iconSize: 16, // А цю — стандартною або меншою
                },
            ],
        },
        { id: 'alert-all', label: 'Сповістити всіх' },
        { id: 'only-main', label: 'Тільки для Головного', targetWindow: 'main' },
        {
            label: 'Керування вікнами',
            iconSource: 'https://cdn-icons-png.flaticon.com',
            submenu: [
                { id: 'show-main', label: 'Головне вікно', targetWindow: 'main' },
                { id: 'show-settings', label: 'Налаштування', targetWindow: 'settings' },
            ],
        },
        { type: 'separator' },
        {
            label: 'Профіль користувача',
            iconSource: 'https://cdn-icons-png.flaticon.com',
            submenu: [
                { id: 'view-profile', label: 'Переглянути профіль' },
                {
                    label: 'Налаштування безпеки',
                    iconSource: 'https://cdn-icons-png.flaticon.com',
                    submenu: [
                        {
                            id: 'change-pass',
                            label: 'Змінити пароль',
                            iconSource: 'https://cdn-icons-png.flaticon.com',
                        },
                        { id: '2fa-enable', label: 'Увімкнути 2FA' },
                        {
                            label: 'Додатково',
                            submenu: [
                                { id: 'log-sessions', label: 'Активні сесії' },
                                {
                                    id: 'clear-cache',
                                    label: 'Очистити кеш',
                                    targetWindow: 'settings',
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        { type: 'separator' },
        {
            label: 'Статус сервера',
            submenu: [
                {
                    id: 'srv-eu',
                    label: 'Європа (Online)',
                    iconSource: 'https://cdn-icons-png.flaticon.com',
                },
                {
                    id: 'srv-us',
                    label: 'США (Offline)',
                    iconSource: 'https://cdn-icons-png.flaticon.com',
                },
            ],
        },
        { type: 'separator' },
        {
            id: 'close-app',
            label: 'Вийти з додатку',
            // ВИКОРИСТОВУЄМО ІКОНКУ ДВЕРЕЙ (Exit)
            // iconSource: 'https://cdn-icons-png.flaticon.com/512/3094/3094700.png',
            iconSource: 'home.png',
        },
    ])
    addLog('Меню оновлено. Перевірте системний трей!')
}

// 3. Динамічна зміна іконки
document.getElementById('btn-icon').onclick = () => {
    const newIconUrl =
        'data:image/png;base64,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'
    const customSize = 32 // Передаємо бажаний розмір (наш менеджер зробить resize з якістю 'best')

    window.electronAPI.send('tray:set-icon', {
        source: newIconUrl,
        size: customSize,
    })
    addLog('Запит на зміну іконки на "Галочку"')
}

// 4. Видалення
document.getElementById('btn-destroy').onclick = async () => {
    await window.electronAPI.invoke('tray:destroy')
    addLog('Трей видалено успішно.')
}

// СЛУХАЄМО ПОДІЇ З ТРЕЮ
window.electronAPI.receive('tray:clicked', (id) => {
    addLog(`КЛІК У ТРЕЇ: ID = ${id}`)
    if (id === 'close-app') alert('Ви натиснули вихід!')
})
