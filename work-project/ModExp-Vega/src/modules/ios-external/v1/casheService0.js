import { createReadStream, createWriteStream, existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const CACHE_ROOT = path.resolve('./cache_storage')
const MAX_JSON_RAM_SIZE = 1 * 1024 * 1024 // 1MB для RAM

const ramCache = new Map()
const timers = new Map() // Для керування TTL

/**
 * Очищення файлів та пам'яті за TTL
 */
const setExpiration = (key, filePath, ttlSeconds) => {
    // Якщо для цього ключа вже є таймер — видаляємо його (оновлення кешу)
    if (timers.has(key)) clearTimeout(timers.get(key))

    const timeout = setTimeout(async () => {
        ramCache.delete(key)
        timers.delete(key)
        try {
            if (filePath && existsSync(filePath)) {
                await fs.unlink(filePath)
            }
        } catch (e) {
            console.error(`[Cache] Помилка видалення файлу: ${e.message}`)
        }
    }, ttlSeconds * 1000)

    timers.set(key, timeout)
}

/**
 * Санітизація імені файлу (видалення спецсимволів)
 */
const sanitizeFilename = (name) => {
    if (!name) return null
    // Декодуємо URL-кодування (напр. %D1%80%D0%BE -> ро)
    const decoded = decodeURIComponent(name)
    // Прибираємо символи, які заборонені у файлових системах
    return decoded.replace(/[/\\?%*:|"<>]/g, '-')
}

export const clearDiskCache = async () => {
    await fs.rm(CACHE_ROOT, { recursive: true, force: true }).catch(() => {})
    await fs.mkdir(CACHE_ROOT, { recursive: true }).catch(() => {})
}

const getCacheContext = (req) => {
    const urlPath = req.path.replace(/^\/|\/$/g, '') || 'root'
    const payload = JSON.stringify({ query: req.query, body: req.body })
    const hash = crypto.createHash('md5').update(payload).digest('hex')
    const folderPath = path.join(CACHE_ROOT, urlPath)

    return {
        key: `${urlPath}:${hash}`,
        hash,
        folderPath,
        urlPath,
    }
}

export const smartCache =
    (ttl = 300) =>
    async (req, res, next) => {
        if (!['GET', 'POST'].includes(req.method)) return next()

        const { key, hash, folderPath } = getCacheContext(req)
        const cached = ramCache.get(key)

        // 1. Перевірка кешу (HIT)
        if (cached) {
            try {
                if (cached.store === 'disk') await fs.access(cached.path)

                res.set('Content-Type', cached.type)
                if (cached.filename && !cached.type.includes('application/json')) {
                    const encodedName = encodeURIComponent(cached.filename)
                    res.set(
                        'Content-Disposition',
                        `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
                    )
                }
                res.set('X-Cache', 'HIT')

                if (cached.store === 'ram') return res.send(cached.data)
                return createReadStream(cached.path).pipe(res)
            } catch {
                ramCache.delete(key) // Файл зник або помилка — видаляємо запис
            }
        }

        // 2. Логіка запису (MISS)
        const originalSend = res.send.bind(res)
        res.send = async (body) => {
            const type = res.get('Content-Type') || 'application/json'
            const isJson = type.includes('application/json')

            // Визначаємо ім'я файлу (Пріоритет: Header -> Query -> Hash)
            const disposition = res.get('Content-Disposition')
            const filenameFromHeader = disposition?.match(/filename="?([^";]+)"?/)?.[1]
            const filenameFromQuery = req.query.fileName || req.query.filename

            const rawFilename = filenameFromHeader || filenameFromQuery
            const safeFilename = sanitizeFilename(rawFilename)

            try {
                if (isJson && body.length <= MAX_JSON_RAM_SIZE) {
                    // Збереження в RAM
                    ramCache.set(key, { store: 'ram', data: body, type, filename: safeFilename })
                    setExpiration(key, null, ttl)
                } else {
                    // Збереження на ДИСК
                    const finalFileName = safeFilename || `${hash}.cache`
                    const filePath = path.join(folderPath, finalFileName)

                    await fs.mkdir(folderPath, { recursive: true })
                    const writeStream = createWriteStream(filePath)

                    // Якщо body вже Buffer або String, пишемо його
                    writeStream.write(body)
                    writeStream.end()

                    ramCache.set(key, {
                        store: 'disk',
                        path: filePath,
                        type,
                        filename: safeFilename,
                    })
                    setExpiration(key, filePath, ttl)
                }
                res.set('X-Cache', 'MISS')
            } catch (err) {
                console.error('[Cache Middleware Error]', err)
            }

            return originalSend(body)
        }

        next()
    }
