import { createReadStream, createWriteStream, existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

// --- НАЛАШТУВАННЯ ---
const CACHE_ROOT = path.resolve('./cache_storage/ios')
const MAX_JSON_RAM_SIZE = 1 * 1024 * 1024 // 1MB (файли менше цього розміру зберігаються в RAM)
const MAX_DISK_CACHE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB (загальний ліміт папки кешу на диску)
const MAX_DIR_DEPTH = 5 // Максимальна вкладеність папок

// Структури для керування кешем у пам'яті
const ramCache = new Map() // Метадані кешу (ключ -> інформація про файл/дані)
const timers = new Map() // Таймери для TTL (видалення після закінчення часу)

// --- ДОПОМІЖНІ ФУНКЦІЇ ---

/**
 * Рекурсивно сортує ключі об'єкта.
 * Це гарантує, що {a:1, b:2} та {b:2, a:1} дадуть однаковий JSON-рядок і однаковий хеш.
 */
const sortObject = (obj) => {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj
    return Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
            acc[key] = sortObject(obj[key])
            return acc
        }, {})
}

/**
 * Генерує унікальний ключ (хеш) для запиту на основі URL, Query-параметрів та Body.
 * getCacheContext
 */
const generateCacheKey = (req) => {
    const urlPath = req.path.replace(/^\/|\/$/g, '') || 'root'

    // Сортуємо query та body, щоб зміна порядку полів не змінювала хеш
    const payload = {
        query: sortObject(req.query),
        body: sortObject(req.body),
    }

    const hash = crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex')

    return {
        key: `${urlPath}:${hash}`, // Унікальний ID для Map
        hash, // Короткий хеш для імені файлу
        urlPath, // Шлях для структури папок
    }
}

/**
 * Очищує ім'я файлу від заборонених символів.
 */
const sanitizeFilename = (name) => {
    if (!name) return null

    try {
        // Декодуємо URL-кодування (напр. %D1%80%D0%BE -> ро)
        const decoded = decodeURIComponent(name)
        // Прибираємо символи, які заборонені у файлових системах
        return decoded.replace(/[/\\?%*:|"<>]/g, '-')
    } catch {
        // Прибираємо символи, які заборонені у файлових системах
        return name.replace(/[/\\?%*:|"<>]/g, '-')
    }
}

// /**
//  * Рекурсивно збирає всі файли у вкладених папках для контролю ліміту диска.
//  */
// const getAllFilesRecursive = async (dirPath) => {
//     let results = []
//     const list = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => [])

//     for (const entry of list) {
//         const fullPath = path.join(dirPath, entry.name)
//         if (entry.isDirectory()) {
//             results = results.concat(await getAllFilesRecursive(fullPath))
//         } else {
//             const stat = await fs.stat(fullPath)
//             results.push({ path: fullPath, size: stat.size, atime: stat.atimeMs })
//         }
//     }
//     return results
// }

// /**
//  * Видаляє порожні папки рекурсивно вгору до кореня кешу.
//  */
// const cleanEmptyDirs = async (dirPath) => {
//     // !!!!!!! ОБОВ'ЯЗКОВО
//     if (dirPath === CACHE_ROOT || !dirPath.startsWith(CACHE_ROOT)) return

//     try {
//         const files = await fs.readdir(dirPath)
//         if (files.length === 0) {
//             await fs.rmdir(dirPath)
//             await cleanEmptyDirs(path.dirname(dirPath))
//         }
//     } catch (error) {}
// }

// /**
//  * Контролює об'єм кешу на диску. Якщо ліміт перевищено,
//  * видаляє файли, до яких зверталися найдавніше (LRU).
//  */
// const enforceDiskLimits = async () => {
//     try {
//         const allFiles = await getAllFilesRecursive(CACHE_ROOT)
//         let currentSize = allFiles.reduce((acc, f) => acc + f.size, 0)

//         if (currentSize > MAX_DISK_CACHE_SIZE) {
//             allFiles.sort((a, b) => a.atime - b.atime)
//             for (const file of allFiles) {
//                 if (currentSize <= MAX_DISK_CACHE_SIZE * 0.8) break
//                 await fs.unlink(file.path).catch(() => {})
//                 currentSize -= file.size
//                 await cleanEmptyDirs(path.dirname(file.path))
//             }
//         }
//     } catch (err) {
//         console.error('[Cache] Помилка лімітів диска:', err)
//     }
// }

/**
 * Видаляє запис із пам'яті та файл із диска.
 */
const removeCacheRecord = async (key, filePath = null) => {
    ramCache.delete(key)

    if (timers.has(key)) {
        clearTimeout(timers.get(key))
        timers.delete(key)
    }

    if (filePath && existsSync(filePath)) {
        await fs.unlink(filePath).catch(() => {})
    }
}

/**
 * Слідкує за тим, щоб папка кешу не перевищувала ліміт (напр. 5GB).
 * Видаляє найстаріші файли (LRU), до яких давно не зверталися.
 */
const enforceDiskLimits = async () => {
    try {
        const folders = await fs.readdir(CACHE_ROOT)
        let allFiles = []

        for (const folder of folders) {
            const folderPath = path.join(CACHE_ROOT, folder)
            const stats = await fs.stat(folderPath)
            if (stats.isDirectory()) {
                const files = await fs.readdir(folderPath)
                for (const file of files) {
                    const filePath = path.join(folderPath, file)
                    const fStat = await fs.stat(filePath)
                    allFiles.push({ path: filePath, size: fStat.size, atime: fStat.atimeMs })
                }
            }
        }

        let currentTotalSize = allFiles.reduce((acc, f) => acc + f.size, 0)
        if (currentTotalSize <= MAX_DISK_CACHE_SIZE) return

        if (currentTotalSize > MAX_DISK_CACHE_SIZE) {
            // Сортуємо за часом останнього доступу (найстаріші на початку)
            allFiles.sort((a, b) => a.atime - b.atime)

            for (const file of allFiles) {
                if (currentTotalSize <= MAX_DISK_CACHE_SIZE * 0.8) break // Очищаємо до 80% ліміту
                await fs.unlink(file.path).catch(() => {})
                currentTotalSize -= file.size
            }
        }
    } catch (error) {
        // Папка може бути ще не створена
    }
}

// --- ОСНОВНИЙ MIDDLEWARE ---

export const smartCache =
    (ttl = 300) =>
    async (req, res, next) => {
        if (!['GET', 'POST'].includes(req.method)) return next()

        // const segments = req.path.split('/').filter(Boolean).slice(0, MAX_DIR_DEPTH)
        // const urlPath = segments.length > 0 ? path.join(...segments) : 'root'
        // const folderPath = path.join(CACHE_ROOT, urlPath)

        const { key, hash, urlPath } = generateCacheKey(req)
        const folderPath = path.join(CACHE_ROOT, urlPath)
        const cached = ramCache.get(key)

        // 1. ПЕРЕВІРКА КЕШУ (HIT)
        if (cached) {
            res.set({
                'X-Cache': 'HIT',
                'Content-Type': cached.type,
                ETag: hash,
                'Cache-Control': `public, max-age=${ttl}`,
            })

            if (cached.filename) {
                const enc = encodeURIComponent(cached.filename)
                res.set(
                    'Content-Disposition',
                    `attachment; filename="${enc}"; filename*=UTF-8''${enc}`,
                )
            }

            // Віддаємо з RAM
            if (cached.store === 'ram') {
                return res.send(cached.data)
            }

            // Віддаємо з Диска
            if (existsSync(cached.path)) {
                // Оновлюємо час доступу для логіки LRU (що файл "свіжий")
                fs.utimes(cached.path, new Date(), new Date()).catch(() => {})
                return createReadStream(cached.path).pipe(res)
            } else {
                // Якщо файл фізично видалено — чистимо запис у пам'яті
                removeCacheRecord(key, null)
            }
        }

        // 2. ЛОГІКА ЗАПИСУ (MISS) - Перехоплення відповіді для запису
        const originalSend = res.send.bind(res)
        const originalWrite = res.write.bind(res)
        const originalEnd = res.end.bind(res)

        let writeStream = null
        let diskPath = null

        // Функція для перевірки успішних статусів (200-299)
        const isSuccessStatus = (code) => code >= 200 && code < 300

        /**
         * Встановлює таймер видалення кешу після TTL
         */
        const startExpirationTimer = (key, filePath, ttlSeconds) => {
            // Якщо для цього ключа вже є таймер — видаляємо його (оновлення кешу)
            if (timers.has(key)) clearTimeout(timers.get(key))

            const timeout = setTimeout(() => {
                removeCacheRecord(key, filePath)
            }, ttlSeconds * 1000)

            timers.set(key, timeout)
        }

        /**
         * Ініціалізація стріму для запису великих файлів на диск
         */
        const initDiskWrite = async () => {
            if (!isSuccessStatus(res.statusCode)) return

            if (writeStream || res.headersSent) return

            const type = res.get('Content-Type') || 'application/octet-stream'
            const disposition = res.get('Content-Disposition')
            const filenameFromHeader = disposition?.match(/filename="?([^";]+)"?/)?.[1]
            const filenameFromQuery = req.query.fileName || req.query.filename

            const rawFilename = filenameFromHeader || filenameFromQuery
            const safeName = sanitizeFilename(rawFilename)

            await fs.mkdir(folderPath, { recursive: true })
            diskPath = path.join(folderPath, safeName || `${hash}.cache`)
            writeStream = createWriteStream(diskPath)

            ramCache.set(key, {
                store: 'disk',
                path: diskPath,
                type,
                filename: safeName,
            })

            startExpirationTimer(key, diskPath, ttl)

            // Перевіряємо ліміт диска після кожного нового файлу
            enforceDiskLimits()
        }

        // Перехоплюємо стандартний send (для JSON та невеликих відповідей)
        res.send = async (body) => {
            // Якщо це помилка — одразу віддаємо оригінальний send, не чіпаючи нічого іншого
            if (!isSuccessStatus(res.statusCode)) {
                return originalSend(body)
            }

            if (!res.get('X-Cache') && isSuccessStatus(res.statusCode)) {
                const type = res.get('Content-Type') || 'application/json'
                const isJson = type.includes('application/json')

                res.set({
                    'X-Cache': 'MISS',
                    ETag: hash,
                })

                if (body && body.length <= MAX_JSON_RAM_SIZE && isJson) {
                    ramCache.set(key, {
                        store: 'ram',
                        data: body,
                        type,
                        filename: null,
                    })

                    startExpirationTimer(key, diskPath, ttl)
                } else {
                    await initDiskWrite()
                    writeStream.write(body)
                    // writeStream.end()
                }
            }
            return originalSend(body)
        }

        // Перехоплюємо низькорівневий write (для стрімів та великих файлів)
        res.write = (chunk, encoding, cb) => {
            // Якщо це помилка — одразу віддаємо оригінальний метод, не чіпаючи нічого іншого
            if (!isSuccessStatus(res.statusCode)) {
                return originalWrite(chunk, encoding, cb)
            }

            if (!res.get('X-Cache') && isSuccessStatus(res.statusCode)) {
                res.set({
                    'X-Cache': 'MISS',
                    ETag: hash,
                })

                initDiskWrite().then(() => {
                    if (writeStream) writeStream.write(chunk, encoding)
                })
            } else if (writeStream) {
                writeStream.write(chunk, encoding)
            }
            return originalWrite(chunk, encoding, cb)
        }

        // Завершуємо запис у файл при завершенні відповіді
        res.end = (chunk, encoding, cb) => {
            if (chunk && writeStream) writeStream.write(chunk, encoding)
            if (writeStream) writeStream.end()
            return originalEnd(chunk, encoding, cb)
        }

        next()
    }

/**
 * Повне очищення всього кешу (зазвичай при старті сервера)
 */
export const clearDiskCache = async () => {
    ramCache.clear()
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
    await fs.rm(CACHE_ROOT, { recursive: true, force: true }).catch(() => {})
    await fs.mkdir(CACHE_ROOT, { recursive: true }).catch(() => {})
}
