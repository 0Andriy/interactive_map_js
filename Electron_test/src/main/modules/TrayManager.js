import { Tray, Menu, nativeImage, ipcMain, net, BrowserWindow } from 'electron'
import { config } from '../../config/Config.js'
import path from 'node:path'
import fs from 'node:fs'

class TrayManager {
    constructor() {
        // Singleton
        if (TrayManager.instance) {
            return TrayManager.instance
        }
        TrayManager.instance = this

        /**
         * Створюємо дочірній логер через метод .child() логера з Config.
         * Використовуємо Optional Chaining для максимальної безпеки.
         */
        this.logger = config.logger?.child?.({ component: 'TRAY' }) ?? config.logger

        this.tray = null

        // Визначаємо базовий розмір іконок для поточної ОС
        // macOS (darwin) зазвичай використовує 22x22, Windows/Linux — 18x18 або 20x20
        this.defaultIconSize = process.platform === 'darwin' ? 22 : 18

        this.logger?.debug?.('TrayManager інстанційовано. Очікування реєстрації IPC.')

        // Реєструємо обробники IPC відразу при створенні менеджера
        this._setupIpcHandlers()
    }

    /**
     * Реєстрація IPC-обробників для CRUD операцій для керування треєм з Renderer процесу (UI).
     */
    _setupIpcHandlers() {
        // CREATE: Створення трею (або оновлення, якщо він вже є)
        ipcMain.handle('tray:create', async (event, data) => {
            this.logger?.info?.('IPC: Запит на створення трею', { data })
            return await this.create(data)
        })

        // READ/UPDATE: Зміна іконки
        ipcMain.on('tray:set-icon', async (event, data) => {
            this.logger?.debug?.('IPC: Запит на зміну іконки', {
                source: typeof data?.source === 'string' ? data.source.substring(0, 50) : 'binary',
                size: data?.size,
            })
            await this.setIcon(data)
        })

        // READ/UPDATE: Зміна меню
        ipcMain.on('tray:set-menu', async (event, data) => {
            this.logger?.debug?.('IPC: Запит на оновлення меню', {
                itemsCount: Array.isArray(data) ? data.length : data?.template?.length,
            })
            await this.setMenu(data)
        })

        // DELETE: Видалення трею
        ipcMain.handle('tray:destroy', () => {
            this.logger?.info?.('IPC: Запит на видалення трею')
            this.destroy()
            return { success: true }
        })
    }

    /**
     * Створення або повне оновлення трею
     * @param {Object} data - { icon, tooltip, menu, size }
     */
    async create(data = {}) {
        // Якщо трей вже існує, ми не створюємо новий, а оновлюємо існуючий (Idempotency)
        if (this.tray) {
            this.logger?.warn?.('Трей вже існує. Виконується синхронізація параметрів.')
            await this.update(data)
            return { status: 'updated' }
        }

        try {
            const iconSource = data.icon
            const img = await this._resolveImage(iconSource)
            const size = data.size || this.defaultIconSize

            this.tray = new Tray(img.resize({ width: size, height: size, quality: 'best' }))

            const tooltip = data.tooltip || config.app?.name || 'Electron App'
            this.tray.setToolTip(tooltip)

            if (data.menu) {
                await this.setMenu(data.menu)
            }

            this.logger?.info?.('Трей успішно створено та візуалізовано')
            return { status: 'created' }
        } catch (error) {
            this.logger?.error?.('Помилка при створенні трею', { error: error?.message })
            return { status: 'error', message: error?.message }
        }
    }

    /**
     * Універсальний метод оновлення стану
     */
    async update(data = {}) {
        if (!this.tray) return

        if (data.icon || data.size) {
            await this.setIcon({ source: data.icon, size: data.size })
        }

        if (data.menu) {
            await this.setMenu(data.menu)
        }

        if (data.tooltip) {
            this.tray.setToolTip(data.tooltip)
            this.logger?.debug?.('Оновлено Tooltip трею')
        }
    }

    /**
     * Оновлення головної іконки
     * @param {Object} data - { source, size }
     */
    async setIcon(data = {}) {
        if (!this.tray) {
            // this.logger?.error?.('Неможливо встановити іконку: трей не ініціалізовано')
            // return

            this.logger?.warn?.('Спроба оновити іконку неіснуючого трею. Автоматичне створення...')
            return await this.create({ icon: data.source, size: data.size })
        }

        try {
            const img = await this._resolveImage(data.source)
            const size = data.size || this.defaultIconSize

            this.tray.setImage(
                img.resize({
                    width: size,
                    height: size,
                    quality: 'best',
                }),
            )

            this.logger?.debug?.('Іконку трею успішно оновлено', { size })
        } catch (error) {
            this.logger?.error?.('Помилка методу setIcon', { error: error?.message })
        }
    }

    /**
     * Побудова контекстного меню (підтримка масиву або об'єкта з шаблоном)
     */
    async setMenu(data) {
        const template = Array.isArray(data) ? data : data?.template || []

        if (!this.tray) {
            // this.logger?.error?.('Неможливо встановити меню: трей не ініціалізовано')
            // return

            this.logger?.warn?.('Спроба оновити меню неіснуючого трею. Автоматичне створення...')
            return await this.create({ menu: template })
        }

        try {
            const preparedItems = await Promise.all(
                template.map(async (item) => await this._processMenuItem(item)),
            )

            const contextMenu = Menu.buildFromTemplate(preparedItems)
            this.tray.setContextMenu(contextMenu)

            this.logger?.info?.('Контекстне меню оновлено успішно')
        } catch (error) {
            this.logger?.error?.('Помилка методу setMenu', { error: error?.message })
        }
    }

    /**
     * Рекурсивна обробка пунктів меню
     */
    async _processMenuItem(item) {
        // Копіюємо об'єкт, щоб уникнути побічних ефектів
        const processed = { ...item }

        // Обробка вкладеності (Submenu)
        if (processed.submenu && Array.isArray(processed.submenu)) {
            processed.submenu = await Promise.all(
                processed.submenu.map(async (sub) => await this._processMenuItem(sub)),
            )
        }

        // Обробка іконки пункту меню
        if (processed.iconSource) {
            const img = await this._resolveImage(processed.iconSource)
            // Іконки в меню зазвичай трохи менші або дорівнюють дефолту
            const size = processed.iconSize || this.defaultIconSize

            processed.icon = img.resize({
                width: size,
                height: size,
                quality: 'best',
            })
        }

        // Обробка подій для багатовіконного режиму
        if (processed.id && !processed.submenu && processed.type !== 'separator') {
            processed.click = () => {
                this.logger?.debug?.('Клік по пункту трею', {
                    id: processed.id,
                    target: processed.targetWindow,
                })

                this._broadcastAction(processed.id, processed.targetWindow)
            }
        }

        return processed
    }

    /**
     * Відправка події у вікна (всім або цільовому)
     */
    _broadcastAction(actionId, targetId = null) {
        const allWindows = BrowserWindow.getAllWindows()

        allWindows.forEach((win) => {
            // 1. Перевірка на "живе" вікно
            if (win.isDestroyed()) return

            // 2. Логіка вибору цілі:
            // Якщо targetId порожній -> true (шлемо всім)
            // Якщо targetId є -> перевіряємо збіг імен
            const shouldSend = !targetId || win.name === targetId

            if (shouldSend) {
                this.logger?.debug?.(
                    `Відправка події ${actionId} у вікно: ${win.name || 'unnamed'}`,
                )
                win.webContents.send('tray:clicked', actionId)
            }
        })
    }

    /**
     * Універсальний резолвер зображень (URL, Base64, Шлях)
     */
    async _resolveImage(source) {
        if (!source) return nativeImage.createEmpty()

        try {
            // 1. Data URL (Base64)
            if (typeof source === 'string' && source.startsWith('data:image')) {
                return nativeImage.createFromDataURL(source)
            }

            // Remote URL
            if (typeof source === 'string' && source.startsWith('http')) {
                const response = await net.fetch(source)
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                const buffer = await response.arrayBuffer()
                return nativeImage.createFromBuffer(Buffer.from(buffer))
            }

            // Local File
            let fullPath = source
            if (typeof source === 'string' && !path.isAbsolute(source)) {
                fullPath = path.join(config.paths?.assets || '', source)
            }

            if (typeof fullPath === 'string' && fs.existsSync(fullPath)) {
                return nativeImage.createFromPath(fullPath)
            } else {
                this.logger?.warn?.('Файл зображення не знайдено', { path: fullPath })
            }
        } catch (error) {
            this.logger?.error?.('Помилка резолвінгу зображення', {
                source: typeof source === 'string' ? source.substring(0, 50) : 'binary',
                error: error.message,
            })
        }

        return nativeImage.createEmpty()
    }

    /**
     * Повне видалення трею
     */
    destroy() {
        if (this.tray) {
            this.tray.destroy()
            this.tray = null
            this.logger?.info?.('Системний трей видалено та очищено')
        } else {
            this.logger?.debug?.('Запит на видалення трею ігноровано: трей не існував')
        }
    }
}

// Singleton експорт
export const trayManager = new TrayManager()
