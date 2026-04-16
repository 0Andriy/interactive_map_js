import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
    // !------------------ Відправка даних (UI -> Main)
    // createWindow: (config) => ipcRenderer.send('window:create', config),
    // updateTray: (menu) => ipcRenderer.send('tray:update-menu', menu),
    // setTrayIcon: (iconName) => ipcRenderer.send('tray:set-icon', iconName),

    // !------------------ Отримання даних (Main -> UI)
    onTrayClick: (callbackFn) => ipcRenderer.on('tray:clicked', (event, id) => callbackFn(id)),

    // !-----------------------------------------------
    // Відправка (одностороння)
    // UI -> Main (відправка команд)
    send: (channel, data) => ipcRenderer.send(channel, data),

    // Виклик (двостороння, повертає Promise)
    // UI -> Main (запити з відповіддю)
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),

    // Отримання подій з Main процесу
    // Main -> UI (слухач подій)
    // ВАЖЛИВО: Очищуємо event, щоб не передавати sender на фронт
    receive: (channel, callbackFn) => {
        ipcRenderer.on(channel, (event, ...args) => {
            return callbackFn(...args)
        })
    },

    // !--------------------------------------------------------------------------------

    // Слухач подій (з трею або системи)
    on: (channel, callbackFn) => {
        ipcRenderer.on(channel, (event, ...args) => {
            return callbackFn(...args)
        })
    },

    // Вікна: CRUD через об'єкти
    openWindow: (data) => ipcRenderer.invoke('window:open', data),
    closeWindow: (data) => ipcRenderer.send('window:close', data),
    checkWindow: (data) => ipcRenderer.invoke('window:exists', data),
    // Відправка повідомлення іншому вікну
    // Приклад: sendTo('notification', 'update-text', 'Привіт!')
    sendTo: (target, channel, data) =>
        ipcRenderer.send('window:send-to', { target, channel, data }),
    setProperty: (data) => ipcRenderer.send('window:set-property', data),
    trackMouse: (data) => ipcRenderer.send('window:track-mouse', data),
    onMouseState: (callback) => ipcRenderer.on('window:mouse-state', (e, state) => callback(state)),

    // Трей: CRUD через об'єкти
    createTray: (data) => ipcRenderer.invoke('tray:create', data),
    updateTrayMenu: (data) => ipcRenderer.send('tray:set-menu', data),
    updateTrayIcon: (data) => ipcRenderer.send('tray:set-icon', data),
    destroyTray: () => ipcRenderer.invoke('tray:destroy'),

    // Керування додатком
    quitApp: () => ipcRenderer.send('app:quit'),
    getAppInfo: () => ipcRenderer.invoke('app:get-info'),
})
