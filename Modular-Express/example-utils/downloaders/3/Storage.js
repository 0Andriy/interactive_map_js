import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * Клас для управління локальним сховищем файлів.
 */
export class FileStorage {
    /**
     * @param {string} directory - Папка для збереження
     * @param {Object} [logger] - Логер
     */
    constructor(directory, logger) {
        this.directory = directory
        this.logger = logger?.child?.({ component: 'Storage' }) || logger

        if (!fs.existsSync(directory)) {
            this.logger?.info?.('Створення директорії сховища', { directory })
            fs.mkdirSync(directory, { recursive: true })
        }
    }

    /**
     * Розраховує SHA256 хеш файлу через стрім
     * Повне хешування файлу (для перевірки готового результату)
     */
    async getFileHash(filePath) {
        this.logger?.debug?.('Початок розрахунку хешу файлу', { filePath })
        const hash = crypto.createHash('sha256')
        await this.updateHashFromFile(filePath, hash)
        this.logger?.debug?.('Хеш розраховано', { filePath, hash: hash })
        return hash.digest('hex')
    }

    /**
     * Оновлення існуючого об'єкта хешу даними з файлу (DRY)
     */
    async updateHashFromFile(filePath, hashObject) {
        if (!fs.existsSync(filePath)) return
        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(filePath)
            stream.on('data', (chunk) => hashObject.update(chunk))
            stream.on('error', (err) => {
                this.logger?.error?.('Помилка при читанні файлу для хешу', {
                    filePath,
                    error: err.message,
                })
                reject(err)
            })
            stream.on('end', resolve)
        })
    }

    /**
     * Отримує статистику файлу
     */
    getFileStats(filePath) {
        const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null
        this.logger?.debug?.('Отримання статистики файлу', {
            filePath,
            exists: !!stats,
            size: stats?.size,
        })
        return stats
    }

    /**
     * Атомарне переміщення тимчасового файлу в фінальний
     */
    moveToFinal(tempPath, finalPath) {
        this.logger?.info?.('Фіналізація файлу: переміщення з tmp', { tempPath, finalPath })
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath)
        fs.renameSync(tempPath, finalPath)
        this.logger?.info?.(`Файл успішно збережено: ${path.basename(finalPath)}`)
    }

    /**
     * Видалення файлу
     */
    cleanup(filePath) {
        if (fs.existsSync(filePath)) {
            this.logger?.warn?.('Видалення файлу (очищення)', { filePath })
            try {
                fs.unlinkSync(filePath)
            } catch (e) {
                this.logger?.error?.('Не вдалося видалити файл', { filePath, error: e.message })
            }
        }
    }
}
