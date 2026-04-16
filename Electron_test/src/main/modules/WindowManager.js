import { BrowserWindow, ipcMain } from 'electron'
import { config } from '../../config/Config.js'
import path from 'node:path'
import fs from 'node:fs'

class WindowManager {
    constructor() {
        /**
         * Створюємо дочірній логер спеціально для вікон.
         */
        this.logger = config.logger?.child?.({ component: 'WINDOW_MGR' }) ?? config.logger

        /**
         * Реєстратура вікон (Registry).
         * Ключ — це унікальне ім'я (рядок, наприклад 'main').
         * Значення — це сам об'єкт BrowserWindow.
         */
        this.windows = new Map()

        // Активуємо слухачів команд з нашого сайту (UI)
        this._setupIpcHandlers()

        this.logger?.debug?.('WindowManager успішно ініціалізовано')
    }

    /**
     * Реєстрація каналів зв'язку (IPC).
     * Кожен метод приймає об'єкт з даними (data).
     */
    _setupIpcHandlers() {
        // CREATE / FOCUS
        ipcMain.handle('window:open', async (event, data = {}) => {
            this.logger?.debug?.('IPC: Запит на відкриття вікна', { name: data.name })
            this.open(data)
            return { success: true }
        })

        // READ (Exists)
        ipcMain.handle('window:exists', (event, data = {}) => {
            const result = this.exists(data)
            this.logger?.debug?.(`Результат перевірки вікна "${data.name}": ${result}`)
            return result
        })

        // DELETE (Close)
        ipcMain.on('window:close', (event, data = {}) => {
            this.logger?.debug?.('Отримано IPC запит на закриття вікна', { name: data.name })
            this.close(data)
        })

        ipcMain.on('window:send-to', (event, { target, channel, data }) => {
            const targetWin = this.get({ name: target })

            if (targetWin) {
                this.logger?.debug?.(
                    `Пересилка повідомлення: з [${event.sender.id}] до [${target}]`,
                )
                targetWin.webContents.send(channel, data)
            } else {
                this.logger?.warn?.(`Неможливо переслати: вікно "${target}" не знайдено`)
            }
        })

        // Динамічне керування властивостями вікна з UI
        ipcMain.on('window:set-property', (event, { name, property, value }) => {
            const win = this.get({ name })
            if (win && typeof win[property] === 'function') {
                win[property](value)
            }
        })

        // Передача подій миші для будь-якого вікна
        ipcMain.on('window:track-mouse', (event, { name, enable }) => {
            const win = this.get({ name })
            if (!win) return
            if (enable) {
                win.on('mouse-enter', () => win.webContents.send('window:mouse-state', true))
                win.on('mouse-leave', () => win.webContents.send('window:mouse-state', false))
            }
        })
    }

    /**
     * МЕТОД ПОШУКУ (GET)
     * Це серце менеджера. Він шукає вікно в Map і перевіряє його стан.
     * @param {Object} data - об'єкт з полем name
     * @returns {BrowserWindow|null} - повертає вікно або null
     */
    get(data = {}) {
        const name = data?.name

        // Якщо ім'я не передано — шукати нема чого
        if (!name) {
            return null
        }

        // Шукаємо об'єкт вікна в нашій реєстратурі (Map)
        const win = this.windows.get(name)

        /**
         * ПЕРЕВІРКА СТАНУ:
         * 1. Чи взагалі є такий запис у Map? (win)
         * 2. Чи вікно ще "живе"? (!win.isDestroyed())
         * Якщо користувач закрив вікно, об'єкт може ще бути в Map,
         * але він уже недійсний.
         */
        if (win && !win.isDestroyed()) {
            return win
        }

        /**
         * ЧИСТКА:
         * Якщо вікно знайдено, але воно вже "мертве" (знищене ОС),
         * ми видаляємо цей недійсний запис з нашої реєстратури.
         */
        if (win) {
            this.windows.delete(name)
        }

        return null
    }

    /**
     * МЕТОД ПЕРЕВІРКИ (EXISTS)
     * Використовує метод get(), щоб дізнатися, чи є вікно.
     * @param {Object} data - { name }
     * @returns {boolean} - true якщо вікно є і воно "живе"
     */
    exists(data = {}) {
        // Викликаємо пошук
        const instance = this.get({ name: data?.name })

        // Перетворюємо результат у булеве значення:
        // Якщо instance — це об'єкт вікна, поверне true.
        // Якщо instance — це null, поверне false.
        return !!instance
    }

    /**
     * МЕТОД ВІДКРИТТЯ (OPEN)
     * Створює нове вікно або виводить наперед існуюче.
     * @param {Object} data - { name, options }
     */
    open(data = {}) {
        const { name = 'main', options = {}, source = {} } = data

        // Спочатку перевіряємо: можливо таке вікно вже відкрите?
        const existingWin = this.get({ name })

        if (existingWin) {
            this.logger?.debug?.(`Вікно "${name}" вже є в пам'яті. Активуємо.`)
            existingWin.show() // Показуємо (якщо було приховане)
            existingWin.focus() // Даємо фокус
            return existingWin
        }

        /**
         * Створення нового інстансу вікна.
         * Поєднуємо дефолтні налаштування з тими, що прийшли в options.
         */
        const win = new BrowserWindow({
            title: config.app?.name || 'Electron App',
            width: options.width || 1000,
            height: options.height || 700,
            ...options,
            webPreferences: {
                ...options.webPreferences,
                preload: config.paths.preload,
                contextIsolation: true, // Обов'язково true для безпеки сайту
                nodeIntegration: false, // Обов'язково false
                sandbox: false,
            },
        })

        /**
         * ВАЖЛИВО: Ми вручну додаємо властивість .name об'єкту вікна.
         * Це потрібно, щоб наш TrayManager міг знайти вікно за іменем
         * при розсилці подій (broadcast).
         */
        win.name = name

        // Реєструємо вікно в нашому Map
        this.windows.set(name, win)

        // --- Універсальна логіка завантаження контенту ---
        this._loadContent(win, source, options.file)

        // Коли вікно закривається — видаляємо його з реєстратури
        win.on('closed', () => {
            this.windows.delete(name)
            this.logger?.debug?.(`Вікно "${name}" остаточно закрите користувачем.`)
        })

        this.logger?.info?.(`Створено нове вікно під назвою: "${name}"`)
        return win
    }

    _loadContent(win, source, fallbackFile) {
        const { type, value } = source

        // 1. Пріоритет: Дистанційний URL (Твій сайт)
        if (type === 'url' || (value && value.startsWith('http'))) {
            win.loadURL(value).catch((err) => {
                this.logger?.error?.(`Помилка URL: ${value}`, { err: err.message })
                win.loadURL(
                    `data:text/html,<h1>Помилка завантаження сайту</h1><p>${err.message}</p>`,
                )
            })
            return
        }

        // 2. HTML рядок (Динамічне вікно)
        if (type === 'html') {
            win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(value)}`)
            return
        }

        // 3. Локальний файл (Тести або офлайн режим)
        const fileName = value || fallbackFile || 'index.html'
        const filePath = path.join(config.paths.ui, fileName)

        if (fs.existsSync(filePath)) {
            win.loadFile(filePath)
        } else {
            this.logger?.error?.(`Файл не знайдено: ${filePath}`)
            win.loadURL(`data:text/html,<h1>Файл ${fileName} не знайдено</h1>`)
        }
    }

    /**
     * МЕТОД ЗАКРИТТЯ (CLOSE)
     * @param {Object} data - { name }
     */
    close(data = {}) {
        const win = this.get({ name: data?.name })
        if (win) {
            this.logger?.debug?.(`Закриваємо вікно "${data.name}" програмно.`)
            win.close()
        }
    }

    /**
     * Закрити всі вікна (наприклад, при виході)
     */
    closeAll() {
        this.logger?.info?.('Закриття всіх активних вікон')
        this.windows.forEach((win) => {
            if (!win.isDestroyed()) win.close()
        })
        this.windows.clear()
    }
}

export const windowManager = new WindowManager()
