import { ipcMain } from 'electron'
import { windowManager } from '../modules/WindowManager.js'
import { updateTray, setTrayIcon } from '../modules/tray.js'

export function setupIpc() {
    // Створення нового вікна з фронта
    ipcMain.on('window:create', (event, { name, url, settings }) => {
        windowManager.create(name, { url, ...settings })
    })

    // Оновлення меню трею
    ipcMain.on('tray:update-menu', (event, template) => {
        // Тут можна додати логіку мапінгу кліків, щоб вони повертали подію в UI
        updateTray(template)
    })

    // Зміна іконки
    ipcMain.on('tray:set-icon', (event, iconName) => {
        // Наприклад, вибираємо зі статичних файлів
        const iconPath = `assets/icons/${iconName}.png`
        setTrayIcon(iconPath)
    })

    // Повне закриття додатка (Exit)
    ipcMain.on('app:quit', () => {
        this.logger?.info?.('Отримано запит на повне завершення додатка через IPC')
        app.quit()
    })

    // Отримання інформації про систему для фронта
    ipcMain.handle('app:get-info', () => {
        return {
            version: config.app.version,
            os: config.os.platform,
            isDev: config.isDev,
            activeWindows: Array.from(this.windows.keys()),
        }
    })
}
