import { app, screen } from 'electron'
import { config } from '../config/Config.js'
import { trayManager } from './modules/TrayManager.js'
import { windowManager } from './modules/WindowManager.js'
import fs from 'node:fs'
import path from 'node:path'

// //* Test Tray
// app.whenReady().then(async () => {
//     // 1. Створюємо головне вікно
//     const mainWin = windowManager.open('main')
//     mainWin.loadFile(config.paths.ui + '/index_tray.html')

//     // ПРИМУСОВО ВІДКРИТИ КОНСОЛЬ ПРИ ЗАПУСКУ
//     mainWin.webContents.openDevTools()

//     // 2. ТЕСТ: Створення трею (CREATE)
//     await trayManager.create({
//         tooltip: 'Мій Додаток: Тест',
//         // Можна передати URL іконки для перевірки мережі
//         icon: 'https://cdn-icons-png.flaticon.com/512/3616/3616049.png',
//     })

//     // 3. ТЕСТ: Встановлення меню (UPDATE)
//     // Один пункт — глобальний, інший — тільки для 'settings'
//     await trayManager.setMenu([
//         { id: 'test-global', label: 'Глобальна дія (Всім)' },
//         { type: 'separator' },
//         { id: 'test-settings', label: 'Дія для Налаштувань', targetWindow: 'settings' },
//         { type: 'separator' },
//         { id: 'exit', label: 'Вихід', click: () => app.quit() },
//     ])

//     // 4. ТЕСТ: Динамічна зміна іконки через 5 секунд (UPDATE)
//     setTimeout(() => {
//         trayManager.setIcon({
//             source: 'data:image/png;base64,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',
//         })
//         config.logger?.info?.('Тест: Іконку змінено на Base64')
//     }, 5000)

//     // 5. ТЕСТ: Видалення через 20 секунд (DELETE)
//     // setTimeout(() => trayManager.destroy(), 20000);
// })

//
// *Test Windows

app.whenReady().then(async () => {
    // --- 1. СТВОРЕННЯ ГОЛОВНОГО ВІКНА ---
    const mainWin = windowManager.open({
        name: 'main',
        source: { type: 'file', value: 'index.html' },
        options: {
            width: 1024,
            height: 768,
            center: true,
        },
    })
    // ТУТ ти вирішуєш, що вантажити:
    // mainWin.loadURL('http://localhost:3000'); // Твій сайт у розробці
    // mainWin.loadFile(path.join(config.paths.ui, 'index.html')) // Поки що локальний тест

    // Коли саме головне вікно закривається — вимикаємо все
    // mainWin.on('closed', () => {
    //     console.log('Головне вікно закрите. Завершення роботи програми...')
    //     app.quit()
    // })

    mainWin.webContents.openDevTools()

    // --- 2. СТВОРЕННЯ ВІКНА СПОВІЩЕНЬ (Notification) ---
    // Отримуємо параметри екрану для розрахунку позиції
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth } = primaryDisplay.workAreaSize

    const notifyWidth = 320
    const notifyHeight = 100
    const padding = 20

    const notifyWin = windowManager.open({
        name: 'notification',
        source: { type: 'file', value: 'notify.html' },
        options: {
            width: notifyWidth,
            height: notifyHeight,
            x: screenWidth - notifyWidth - padding, // Верхній правий кут
            y: padding,
            frame: false, // Без рамки
            alwaysOnTop: true, // Поверх усіх вікон
            resizable: false,
            transparent: true, // Для гарного UI з радіусом
            skipTaskbar: true, // Не показувати в панелі задач
        },
    })
    // notifyWin.loadFile(path.join(config.paths.ui, 'notify.html'))

    // --- 3. ІНІЦІАЛІЗАЦІЯ ТРЕЮ ---
    await trayManager.create({
        tooltip: config.app?.name,
        icon: 'home.png', // береться з assets 'tray-icon.png'
        menu: [
            { id: 'show-main', label: 'Показати головне', targetWindow: 'main' },
            {
                id: 'test-notify',
                label: 'Надіслати тест у сповіщення',
                targetWindow: 'notification',
            },
            { type: 'separator' },
            { id: 'exit', label: 'Вийти з програми', click: () => app.quit() },
        ],
    })

    config.logger?.info?.('Додаток успішно запущено з двома вікнами')
})

// Подія спрацьовує, коли ВСІ вікна закриті
app.on('window-all-closed', () => {
    // На macOS прийнято залишати програму в треї (меню-барі),
    // але якщо ти хочеш повний вихід всюди:
    app.quit()
})
