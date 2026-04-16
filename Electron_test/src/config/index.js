import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import dotenv from 'dotenv'
import log from 'electron-log'

// Ініціалізація .env (шукає в корені проєкту)
dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 1. Стан середовища
export const IS_DEV = !app.isPackaged

// 2. Кореневі шляхи
// В dev: корінь проєкту. В prod: папка з ресурсами (.asar або поруч з exe)
export const ROOT_PATH = IS_DEV ? path.join(__dirname, '../../') : process.resourcesPath

export const PATHS = {
    UI: path.join(ROOT_PATH, 'src/ui'),
    ASSETS: path.join(ROOT_PATH, 'assets'),
    PRELOAD: path.join(ROOT_PATH, 'src/preload/index.js'),
    LOGS: app.getPath('logs'),
}

// 3. Налаштування логера
log.transports.file.level = IS_DEV ? 'debug' : 'info'
log.transports.console.level = IS_DEV ? 'debug' : false
export const logger = log.scope('MAIN')

// 4. Критичні дані з ENV або дефолти
export const ENV = {
    API_URL: process.env.API_URL || 'https://api.myapp.com',
    DEBUG_MODE: process.env.DEBUG === 'true',
    VERSION: app.getVersion(),
}

// 5. Константи вікна
export const WINDOW_CONFIG = {
    MAIN: {
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'Modern Electron App',
    },
}
