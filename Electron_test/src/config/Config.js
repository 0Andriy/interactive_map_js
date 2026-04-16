import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { app, screen } from 'electron'
import dotenv from 'dotenv'
// import winston from 'winston'

class Config {
    constructor() {
        // Singleton
        if (Config.instance) {
            return Config.instance
        }
        Config.instance = this

        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        dotenv.config()

        // 1. Стан середовища
        this.isDev = !app.isPackaged
        this.root = this.isDev ? path.resolve(__dirname, '../../') : process.resourcesPath

        // 2. Ініціалізація підсистем
        this._initAppInfo()
        this._initOSInfo()
        this._initPaths()
        this._initLogger()
        this._initEnv()
    }

    // Критичні дані про сам додаток
    _initAppInfo() {
        this.app = {
            name: app.getName(),
            version: app.getVersion(),
            electronVersion: process.versions.electron,
            chromeVersion: process.versions.chrome,
            nodeVersion: process.versions.node,
            locale: app.getLocale(),
            isReady: app.isReady(),
            userDataPath: app.getPath('userData'),
        }
    }

    // Дані про операційну систему
    _initOSInfo() {
        this.os = {
            platform: process.platform, // 'win32', 'darwin', 'linux'
            release: os.release(),
            arch: os.arch(),
            totalMem: (os.totalmem() / 1024 ** 3).toFixed(2) + ' GB',
            freeMem: (os.freemem() / 1024 ** 3).toFixed(2) + ' GB',
            cpuCores: os.cpus().length,
            hostname: os.hostname(),
            isWindows: process.platform === 'win32',
            isMac: process.platform === 'darwin',
            isLinux: process.platform === 'linux',
        }
    }

    _initPaths() {
        this.paths = {
            root: this.root,
            ui: path.join(this.root, 'src/ui'),
            assets: path.join(this.root, 'assets'),
            preload: path.join(this.root, 'src/preload/index.js'),
            logs: path.join(app.getPath('userData'), 'logs'),
            temp: app.getPath('temp'),
        }
    }

    _initLogger() {
        this.logger = {
            colors: {
                info: '\x1b[32m', // Зелений
                warn: '\x1b[33m', // Жовтий
                error: '\x1b[31m', // Червоний
                reset: '\x1b[0m', // Скидання
            },
            format: (level) => {
                const time = new Date().toISOString()
                return `${time} [${this.logger.colors[level]}${level.toUpperCase()}${this.logger.colors.reset}]:`
            },

            info: (...args) => console.log(this.logger.format('info'), ...args),
            warn: (...args) => console.warn(this.logger.format('warn'), ...args),
            error: (...args) => console.error(this.logger.format('error'), ...args),
            debug: (...args) => console.debug(`${new Date().toISOString()} [DEBUG]:`, ...args),
        }

        // this.logger = winston.createLogger({
        //     level: this.isDev ? 'debug' : 'info',
        //     format: winston.format.combine(
        //         winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        //         winston.format.errors({ stack: true }),
        //         winston.format.json(),
        //     ),
        //     transports: [
        //         new winston.transports.File({
        //             filename: path.join(this.paths.logs, 'error.log'),
        //             level: 'error',
        //         }),
        //         new winston.transports.File({
        //             filename: path.join(this.paths.logs, 'combined.log'),
        //         }),
        //     ],
        // })

        // if (this.isDev) {
        //     this.logger.add(
        //         new winston.transports.Console({
        //             format: winston.format.combine(
        //                 winston.format.colorize(),
        //                 winston.format.printf(({ timestamp, level, message, stack }) => {
        //                     return `[${timestamp}] ${level}: ${stack || message}`
        //                 }),
        //             ),
        //         }),
        //     )
        // }
    }

    _initEnv() {
        this.env = {
            apiUrl: process.env.API_URL || 'https://api.default.com',
            debug: process.env.DEBUG === 'true',
            port: process.env.PORT || 3000,
        }
    }

    // Метод для отримання поточної геометрії екрану (корисно для WindowManager)
    getDisplayMetrics() {
        const primaryDisplay = screen.getPrimaryDisplay()
        return primaryDisplay.workAreaSize
    }
}

export const config = new Config()
