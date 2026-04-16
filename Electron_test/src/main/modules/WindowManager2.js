import { BrowserWindow, ipcMain, screen, nativeTheme } from 'electron'
import { config } from '../../config/Config.js'
import path from 'node:path'
import fs from 'node:fs'

/**
 * WindowStateService: Керує збереженням координат та розмірів вікон на диску.
 */
class WindowStateService {
    static getPath(name) {
        // Шлях до файлу налаштувань конкретного вікна
        const userDataPath = config.paths?.userData || './'
        return path.join(userDataPath, `window-state-${name}.json`)
    }

    static load(name, defaults) {
        try {
            const data = fs.readFileSync(this.getPath(name), 'utf8')
            const state = JSON.parse(data)
            // Перевірка, чи вікно не опинилося за межами екрану (наприклад, після відключення монітора)
            const { x, y, width, height } = state
            const isVisible = screen.getAllDisplays().some((display) => {
                const b = display.bounds
                return (
                    x >= b.x &&
                    y >= b.y &&
                    x + width <= b.x + b.width &&
                    y + height <= b.y + b.height
                )
            })
            return isVisible ? state : defaults
        } catch {
            return defaults
        }
    }

    static save(name, win) {
        try {
            if (!win || win.isDestroyed()) return
            const bounds = win.getBounds()
            fs.writeFileSync(this.getPath(name), JSON.stringify(bounds))
        } catch (err) {
            console.error(`Failed to save window state for ${name}`, err)
        }
    }
}

/**
 * Допоміжний клас для завантаження контенту (SOLID: SRP)
 */
class WindowLoader {
    static async load(win, source, logger) {
        const { type, value } = source || {}

        try {
            // 1. Дистанційний URL
            if (type === 'url' || value?.startsWith?.('http')) {
                await win.loadURL(value)
                return
            }

            // 2. Сирий HTML код
            if (type === 'html') {
                await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(value)}`)
                return
            }

            // 3. Локальний файл (за замовчуванням)
            const fileName = value || 'index.html'
            const filePath = path.join(config.paths.ui, fileName)

            if (fs.existsSync(filePath)) {
                await win.loadFile(filePath)
            } else {
                throw new Error(`File not found: ${filePath}`)
            }
        } catch (error) {
            logger?.error?.('Window content load failed', { error: error.message })
            win.loadURL(`data:text/html,<h1>Load Error</h1><p>${error.message}</p>`)
        }
    }
}

/**
 * WindowLoader: Безпечне завантаження контенту з валідацією протоколів.
 */
class WindowLoader {
    static async load(win, source, logger) {
        if (!source || typeof source !== 'object') {
            source = { type: 'file', value: 'index.html' }
        }

        const { type, value } = source

        try {
            if (type === 'url') {
                // ЗАХИСТ: Дозволяємо лише http/https для зовнішніх посилань
                if (typeof value !== 'string' || !value.startsWith('http')) {
                    throw new Error('Insecure protocol for URL type')
                }
                await win.loadURL(value)
            } else if (type === 'html') {
                if (typeof value !== 'string') throw new Error('HTML content must be a string')
                await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(value)}`)
            } else {
                // За замовчуванням — локальний файл
                const fileName = typeof value === 'string' ? value : 'index.html'
                const filePath = path.join(config.paths.ui, fileName)

                if (fs.existsSync(filePath)) {
                    await win.loadFile(filePath)
                } else {
                    throw new Error(`Local file not found: ${filePath}`)
                }
            }
        } catch (error) {
            logger?.error?.('WindowLoader Error:', { message: error.message, source })
            win.loadURL(`data:text/html,<body style="background:#1a1a1a;color:#ff5555;font-family:sans-serif;padding:20px">
                <h2>Window Load Error</h2><p>${error.message}</p></body>`)
        }
    }
}

/**
 * WindowManager: Центральний хаб керування вікнами.
 */
class WindowManager {
    static #instance = null
    #windows = new Map()
    #logger = config.logger?.child?.({ component: 'WINDOW_MGR' }) ?? config.logger

    constructor() {
        if (WindowManager.#instance) return WindowManager.#instance
        WindowManager.#instance = this

        this._setupIpcHandlers()
        this.#logger?.debug?.('WindowManager v2.0 (Security & Focus Management) ready')
    }

    _setupIpcHandlers() {
        // Відкриття вікна (Handle для отримання статусу)
        ipcMain.handle('window:open', async (e, data) => {
            // ЗАХИСТ: Валідація вхідних даних
            if (!data || typeof data !== 'object') return { error: 'Invalid data format' }
            return await this.open(data)
        })

        ipcMain.on('window:close', (e, { name }) => {
            if (typeof name === 'string') this.close(name)
        })

        ipcMain.on('window:show', (e, { name }) => {
            const win = this.get(name)
            if (win) win.show()
        })

        ipcMain.on('window:hide', (e, { name }) => {
            const win = this.get(name)
            if (win) win.hide()
        })

        // Покращена пересилка повідомлень
        ipcMain.on('window:send-to', (e, { target, channel, data }) => {
            if (typeof target === 'string' && typeof channel === 'string') {
                this.sendTo(target, channel, data)
            }
        })

        ipcMain.on('window:set-property', (e, { name, property, value }) =>
            this.setProperty(name, property, value),
        )
    }

    async open(data = {}) {
        const {
            name = 'main',
            options = {},
            source = {},
            rememberState = true,
            parentName = null,
            modal = false,
            focusDimming = true, // Нова фіча: затінення неактивних вікон
        } = data

        // Перевірка існуючого
        const existingWin = this.get(name)
        if (existingWin) {
            if (options.show !== false) {
                existingWin.show()
                existingWin.focus()
            }
            return { status: 'restored' }
        }

        // Позиціонування
        const defaultBounds = { width: options.width || 1024, height: options.height || 768 }
        const bounds = rememberState ? WindowStateService.load(name, defaultBounds) : defaultBounds

        // Визначення батьківського вікна для Modal режиму
        const parent = parentName ? this.get(parentName) : null

        const win = new BrowserWindow({
            ...options,
            ...bounds,
            parent: parent || undefined,
            modal: modal && !!parent, // Modal працює лише якщо є parent
            show: false, // Завжди створюємо прихованим для плавності
            backgroundColor:
                options.backgroundColor ||
                (nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff'),
            webPreferences: {
                preload: config.paths.preload,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true, // Посилена безпека
                spellcheck: false,
                ...options.webPreferences,
            },
        })

        // ЗАХИСТ: Блокування несанкціонованої навігації (запобігання XSS-переходам)
        win.webContents.on('will-navigate', (event, url) => {
            const isExternalUrl = source.type === 'url' && url.startsWith(source.value)
            if (!isExternalUrl && url !== 'about:blank') {
                this.#logger?.warn?.(
                    `Blocked unauthorized navigation in window "${name}" to: ${url}`,
                )
                event.preventDefault()
            }
        })

        // Менеджер фокусу та прозорості (UI Improvement)
        if (focusDimming) {
            win.on('blur', () => {
                if (!win.isDestroyed()) win.setOpacity(0.85)
            })
            win.on('focus', () => {
                if (!win.isDestroyed()) win.setOpacity(1.0)
            })
        }

        // Збереження стану та очищення
        win.on('close', () => {
            if (rememberState) WindowStateService.save(name, win)
        })

        win.on('closed', () => {
            this.#windows.delete(name)
            this.#logger?.debug?.(`Registry cleared for: ${name}`)
        })

        // Реєстрація
        win.name = name
        this.#windows.set(name, win)

        // Елегантне відображення після завантаження
        win.once('ready-to-show', () => {
            if (options.show !== false) {
                win.show()
                if (options.maximize) win.maximize()
            }
        })

        await WindowLoader.load(win, source, this.#logger)
        return { status: 'created', name }
    }

    get(name) {
        if (typeof name !== 'string') return null
        const win = this.#windows.get(name)
        return win && !win.isDestroyed() ? win : null
    }

    exists(name) {
        return !!this.get(name)
    }

    close(name) {
        const win = this.get(name)
        if (win) win.close()
    }

    sendTo(targetName, channel, data) {
        const win = this.get(targetName)
        if (win) {
            win.webContents.send(channel, data)
        } else {
            this.#logger?.warn?.(`Cannot send to "${targetName}": Window not found`)
        }
    }

    setProperty(name, property, value) {
        const win = this.get(name)
        if (win && typeof win[property] === 'function') {
            win[property](value)
        }
    }

    closeAll() {
        this.#windows.forEach((win) => {
            if (!win.isDestroyed()) win.close()
        })
        this.#windows.clear()
    }
}

export const windowManager = new WindowManager()
