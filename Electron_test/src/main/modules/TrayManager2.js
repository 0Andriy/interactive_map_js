import { Tray, Menu, nativeImage, ipcMain, net, BrowserWindow, nativeTheme } from 'electron'
import { config } from '../../config/Config.js'
import path from 'node:path'
import fs from 'node:fs'

/**
 * Сервіс для роботи з графічними ресурсами
 */
export class ImageResolver {
    static async resolve(source, logger = null) {
        if (!source) {
            logger?.debug?.('ImageService: Source is empty, returning empty image')
            return nativeImage.createEmpty()
        }

        try {
            // 1. Base64 / Data URL
            if (typeof source === 'string' && source.startsWith('data:image')) {
                return nativeImage.createFromDataURL(source)
            }

            // 2. Remote URL
            if (typeof source === 'string' && source.startsWith('http')) {
                logger?.debug?.(`ImageService: Fetching remote URL: ${source.substring(0, 50)}...`)
                const response = await net.fetch(source)
                if (!response.ok) throw new Error(`HTTP ${response.status}`)

                const buffer = await response.arrayBuffer()
                return nativeImage.createFromBuffer(Buffer.from(buffer))
            }

            // 3. Local File
            let fullPath = source
            if (typeof source === 'string' && !path.isAbsolute(source)) {
                fullPath = path.join(config.paths?.assets || '', source)
            }

            if (typeof fullPath === 'string' && fs.existsSync(fullPath)) {
                const img = nativeImage.createFromPath(fullPath)

                // macOS: Якщо файл має 'Template' у назві, Electron автоматично адаптує колір
                if (process.platform === 'darwin' && fullPath.includes('Template')) {
                    img.setTemplateImage(true)
                }

                return img
            } else {
                logger?.warn?.('ImageService: File not found', { path: fullPath })
            }
        } catch (error) {
            logger?.error?.('ImageService: Error resolving image', {
                source: typeof source === 'string' ? source.substring(0, 50) : 'binary',
                error: error.message,
            })
        }

        return nativeImage.createEmpty()
    }

    static resize(img, size) {
        return img.resize({
            width: size,
            height: size,
            quality: 'best',
        })
    }
}

/**
 * TrayManager: Керування системним треєм, меню та подіями.
 */
class TrayManager {
    static #instance = null
    #tray = null
    #logger = config.logger?.child?.({ component: 'TRAY' }) ?? config.logger
    #defaultSize = process.platform === 'darwin' ? 22 : 18

    // Стан для автоматичного оновлення при зміні теми
    #lastIconSource = null
    #lastIconSize = null
    #lastMenuData = null

    constructor() {
        if (TrayManager.#instance) return TrayManager.#instance
        TrayManager.#instance = this

        this._setupIpcHandlers()
        this._setupThemeListener()

        this.#logger?.debug?.('TrayManager initialized and IPC registered')
    }

    /**
     * Централізована реєстрація IPC з логуванням (DRY)
     */
    _initIpc() {
        const routes = {
            handle: {
                'tray:create': (event, data) => this.create(data),
                'tray:destroy': (event) => this.destroy(),
            },
            on: {
                'tray:set-icon': (event, data) => this.setIcon(data),
                'tray:set-menu': (event, data) => this.setMenu(data),
            },
        }

        // Реєструємо handlers з автоматичним логуванням
        Object.entries(routes.handle).forEach(([channel, fn]) => {
            ipcMain.handle(channel, async (e, data) => {
                this.#logger?.info?.(`IPC [INVOKE]: ${channel}`, { data: !!data })
                return await fn(data)
            })
        })

        // Реєструємо listeners
        Object.entries(routes.on).forEach(([channel, fn]) => {
            ipcMain.on(channel, async (e, data) => {
                this.#logger?.debug?.(`IPC [SEND]: ${channel}`)
                await fn(data)
            })
        })
    }

    /**
     * Реєстрація всіх IPC каналів для повного контролю з Renderer процесу.
     */
    _setupIpcHandlers() {
        // CREATE / UPDATE
        ipcMain.handle('tray:create', async (event, data) => {
            this.#logger?.info?.('IPC: Запит на створення/оновлення трею', { data: !!data })
            return await this.create(data)
        })

        // UPDATE ICON
        ipcMain.on('tray:set-icon', async (event, data) => {
            this.#logger?.debug?.('IPC: Запит на зміну іконки')
            await this.setIcon(data)
        })

        // UPDATE MENU
        ipcMain.on('tray:set-menu', async (event, data) => {
            this.#logger?.debug?.('IPC: Запит на оновлення меню')
            await this.setMenu(data)
        })

        // WINDOWS BALLOONS
        ipcMain.on('tray:display-balloon', (event, options) => {
            this.displayBalloon(options)
        })

        // DESTROY
        ipcMain.handle('tray:destroy', () => {
            this.#logger?.info?.('IPC: Запит на видалення трею')
            this.destroy()
            return { success: true }
        })
    }

    /**
     * Слухач системної теми (Dark/Light Mode)
     */
    _setupThemeListener() {
        nativeTheme.on('updated', async () => {
            const isDark = nativeTheme.shouldUseDarkColors
            this.#logger?.info?.(`Системна тема змінилася на: ${isDark ? 'Dark' : 'Light'}`)

            // Якщо є збережені дані, перемальовуємо трей
            if (this.#tray) {
                if (this.#lastIconSource) {
                    await this.setIcon({ source: this.#lastIconSource, size: this.#lastIconSize })
                }

                if (this.#lastMenuData) {
                    await this.setMenu(this.#lastMenuData)
                }
            }
        })
    }

    /**
     * Створення або оновлення трею (Idempotent)
     */
    async create(data = {}) {
        // Захист: якщо трей є, оновлюємо існуючий (Idempotency)
        if (this.#tray) {
            this.#logger?.warn?.('Tray already exists, switching to update mode')
            await this.update(data)
            return { status: 'updated' }
        }

        try {
            this.#lastIconSource = data.icon
            this.#lastIconSize = data.size || this.#defaultSize

            const img = await ImageResolver.resolve(this.#lastIconSource, this.#logger)
            const size = this.#lastIconSize || this.#defaultSize

            this.#tray = new Tray(ImageResolver.resize(img, size))

            // Реєструємо нативні слухачі подій відразу після створення об'єкта Tray
            this._bindTrayEvents()

            const tooltip = data.tooltip || config.app?.name || 'Electron App'
            this.#tray.setToolTip(tooltip)

            if (data.menu) {
                await this.setMenu(data.menu)
            }

            // macOS Specific title
            if (process.platform === 'darwin' && data.title) {
                this.#tray.setTitle(data.title)
            }

            this.#logger?.info?.('Tray created successfully')
            return { status: 'created' }
        } catch (error) {
            this.#logger?.error?.('Critical error creating tray', { error: err.message })
            return { status: 'error', message: err.message }
        }
    }

    /**
     * Підписка на всі нативні події Tray та прокидання їх у вікна
     */
    _bindTrayEvents() {
        if (!this.#tray) return

        const trayEvents = [
            'click',
            'right-click',
            'double-click',
            'middle-click',
            'balloon-show',
            'balloon-click',
            'balloon-closed',
            'mouse-enter',
            'mouse-leave',
            'mouse-move',
        ]

        trayEvents.forEach((eventName) => {
            this.#tray.on(eventName, (event, bounds) => {
                this.#logger?.debug?.(`Native Tray Event: ${eventName}`)

                // Передаємо повний набір даних: назву події, координати (bounds) та системні модифікатори
                this._broadcastAction('tray:native-event', {
                    event: eventName,
                    bounds: bounds, // { x, y, width, height }
                    altKey: event?.altKey || false,
                    shiftKey: event?.shiftKey || false,
                    ctrlKey: event?.ctrlKey || false,
                    metaKey: event?.metaKey || false,
                    triggeredByAccelerator: event?.triggeredByAccelerator || false,
                })
            })
        })
    }

    /**
     * Оновлення стану (підтримка часткових оновлень)
     */
    async update(data = {}) {
        if (!this.#tray) {
            return await this.create(data)
        }

        this.#logger?.debug?.('Updating tray state', { keys: Object.keys(data) })

        if (data.icon || data.size) {
            await this.setIcon({ source: data.icon, size: data.size })
        }

        if (data.menu) {
            await this.setMenu(data.menu)
        }

        if (data.tooltip) {
            this.#tray.setToolTip(data.tooltip)
            this.#logger?.debug?.('Оновлено Tooltip трею')
        }

        if (process.platform === 'darwin' && data.title !== undefined) {
            this.#tray.setTitle(data.title)
        }
    }

    /**
     * Оновлення іконки
     */
    async setIcon({ source, size = this.#defaultSize } = {}) {
        if (!this.#tray) {
            this.#logger?.warn?.('Cannot set icon: tray not initialized. Creating now...')
            return this.create({ icon: source, size })
        }

        try {
            this.#lastIconSource = source || this.#lastIconSource
            this.#lastIconSize = size || this.#lastIconSize || this.#defaultSize

            const img = await ImageResolver.resolve(this.#lastIconSource, this.#logger)
            this.#tray.setImage(ImageResolver.resize(img, this.#lastIconSize))

            this.#logger?.debug?.('Icon updated', { source, size })
        } catch (error) {
            this.#logger?.error?.('Помилка методу setIcon', { error: error?.message })
        }
    }

    /**
     * Побудова контекстного меню
     */
    async setMenu(data) {
        if (!this.#tray) {
            this.#logger?.warn?.('Cannot set menu: tray not initialized')
            return this.create({ menu: data })
        }

        try {
            this.#lastMenuData = data // Зберігаємо для оновлення при зміні теми
            const template = Array.isArray(data) ? data : data?.template || []
            const items = await Promise.all(template.map(async (item) => this._buildMenuItem(item)))

            const contextMenu = Menu.buildFromTemplate(preparedItems)
            this.#tray.setContextMenu(contextMenu)

            this.#logger?.info?.('Menu updated', { itemsCount: items.length })
        } catch (err) {
            this.#logger?.error?.('Failed to build menu', { error: err.message })
        }
    }

    /**
     * Рекурсивна побудова елементів з захистом від побічних ефектів
     */
    async _buildMenuItem(item) {
        // Захист: копіюємо об'єкт (Immutability) - processed
        const node = { ...item }

        // Рекурсія для підменю
        if (node.submenu && Array.isArray(node.submenu)) {
            node.submenu = await Promise.all(node.submenu.map((sub) => this._buildMenuItem(sub)))
        }

        // Обробка іконки пункту
        if (node.iconSource) {
            const img = await ImageResolver.resolve(node.iconSource, this.#logger)
            const size = node.iconSize || this.#defaultSize
            node.icon = ImageResolver.resize(img, size)
        }

        // Обробка кліку
        if (node.id && !node.submenu && node.type !== 'separator' && !node.click) {
            node.click = () => {
                this.#logger?.debug?.('Клік по пункту меню', { id: node.id })
                // this._notifyWindows(node.id, node.targetWindow)
                this._broadcastAction('tray:clicked', node.id, node.targetWindow)
            }
        }

        return node
    }

    /**
     * Windows: Відображення спливаючого сповіщення
     */
    displayBalloon(options = {}) {
        if (process.platform === 'win32' && this.#tray) {
            this.#tray.displayBalloon({
                icon: options.icon || '',
                title: options.title || '',
                content: options.content || '',
                iconType: options.iconType || 'info',
                noSound: options.noSound || false,
                largeIcon: options.largeIcon || false,
            })
        }
    }

    /**
     * Відправка події у вікна (всім або конкретному)
     */
    _notifyWindows(actionId, targetId) {
        const windows = BrowserWindow.getAllWindows()
        let sentCount = 0

        windows.forEach((win) => {
            if (win.isDestroyed()) return

            const isTarget = !targetId || win.name === targetId
            if (isTarget) {
                win.webContents.send('tray:clicked', actionId)
                sentCount++
            }
        })

        this.#logger?.debug?.(`Action [${actionId}] broadcasted to ${sentCount} windows`)
    }

    /**
     * Відправка події у вікна (всім або конкретному)
     */
    _broadcastAction(channel, payload, targetWindowName = null) {
        const allWindows = BrowserWindow.getAllWindows()
        let sentCount = 0

        allWindows.forEach((win) => {
            if (win.isDestroyed()) return

            const shouldSend = !targetWindowName || win.name === targetWindowName

            if (shouldSend) {
                win.webContents.send(channel, payload)
                sentCount++
            }
        })

        this.#logger?.debug?.(`Action [${channel}] broadcasted to ${sentCount} windows`, {
            channel,
            payload,
            targetWindowName,
        })
    }

    /**
     * Видалення трею та очищення пам'яті
     */
    destroy() {
        if (this.#tray) {
            this.#tray.destroy()
            this.#tray = null
            this.#logger?.info?.('Tray destroyed and memory cleared')
        }
    }
}

// Singleton експорт
export const trayManager = new TrayManager()
