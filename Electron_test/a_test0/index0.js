import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initTray } from './modules/tray.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 600,
        webPreferences: {
            // Шлях до вашого preload-скрипта
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: path.join(__dirname, '../../assets/icon.png'),
    })

    // Завантажуємо UI (якщо розробка — можна вказати URL локального сервера сайту)
    mainWindow.loadFile(path.join(__dirname, '../ui/index.html'))
}

app.whenReady().then(() => {
    createWindow()

    // Ініціалізуємо трей і передаємо вікно, якщо треба ним керувати (показувати/ховати)
    initTray(mainWindow)

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
