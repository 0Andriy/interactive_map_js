import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import * as readline from 'readline'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const taskId = 1713929
const fileId = 2223485
const HOST = `https://172.16.211.161:3000`
const TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJQT1JUQUwiLCJzdWIiOiJNVUxJQVJBViIsImF1ZCI6IkFQUFMiLCJ0YWJfbm8iOjEzMDkzLCJsb2dpbiI6Ik1VTElBUkFWIiwicm9sZXMiOlsicG9ydGFsIl0sImRiTmFtZSI6IlRFU1QiLCJpc011bHRpTG9nb24iOmZhbHNlLCJpYXQiOjE3NzAzNzU1NjQsImV4cCI6MTc3MDM3ODU2NH0.bdGej6ZZTMK6DjWgR_Ef9gAGQKIMeijEwOWxOZUHkzc'

const CONFIG = {
    url: `${HOST}/api/v1/portal/tasks/${taskId}/files/${fileId}/range`,
    token: TOKEN,
    testChunkSize: 1024 * 1024, // 1MB для перевірки меж
    downloadDir: './ignore-nodemoon', // Папка для завантаження
    defaultName: 'downloaded_asset.bin',
}

/**
 * Парсить заголовок Content-Disposition для отримання імені файлу
 */
function getFilenameFromHeaders(headers, defaultName) {
    const disposition = headers.get('content-disposition')
    if (disposition && disposition.includes('filename=')) {
        // Витягуємо текст між filename=" і наступною "
        const match = disposition.match(/filename="?([^"]+)"?/)
        if (match && match[1]) return decodeURIComponent(match[1])
    }
    return defaultName
}

/**
 * Форматує байти у "людський" вигляд (КБ, МБ, ГБ)
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * Форматує секунди у вигляд: "1d 04:20:15", "05:12" або "00:07"
 */
function formatTime(seconds) {
    if (seconds === null || seconds === Infinity || isNaN(seconds)) return '--:--'
    if (seconds < 0) seconds = 0

    const days = Math.floor(seconds / (24 * 3600))
    const hours = Math.floor((seconds % (24 * 3600)) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    const parts = []

    // Додаємо дні, якщо вони є
    if (days > 0) {
        parts.push(`${days}d`)
    }

    // Додаємо години: якщо є дні, то години обов'язкові (наприклад, 1d 00h)
    if (days > 0 || hours > 0) {
        parts.push(hours.toString().padStart(2, '0'))
    }

    // Хвилини та секунди є завжди
    parts.push(minutes.toString().padStart(2, '0'))
    parts.push(secs.toString().padStart(2, '0'))

    // Якщо є дні, формат буде "1d 12:30:05", якщо немає — "12:30:05" або "30:05"
    const timeString =
        parts.length > 3 ? `${parts[0]} ${parts.slice(1).join(':')}` : parts.join(':')

    return timeString
}

/**
 * @param {string} url - URL сервера
 * @param {Object} options - Додаткові налаштування (headers, method, etc.)
 * @param {Function} onProgress - Коллбек (percent) => {}
 */
async function downloadFileWithProgress(url, options = {}, onProgress = null) {
    try {
        const startTime = performance.now()
        const response = await fetch(url, options)

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

        // Отримуємо заголовки
        const headers = response.headers
        const totalSize = parseInt(headers.get('Content-Length'), 10)
        const etag = headers.get('ETag')

        // 1. Парсинг назви файлу (UTF-8 / RFC 6266)
        const disposition = headers.get('Content-Disposition')
        let filename = 'file.bin'
        if (disposition) {
            // Пріоритет на filename* (UTF-8)
            const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
            if (utf8Match) {
                filename = decodeURIComponent(utf8Match[1])
            } else {
                // Fallback на звичайний filename
                const asciiMatch = disposition.match(/filename="?([^";]+)"?/i)
                if (asciiMatch) filename = asciiMatch[1]
            }
        }

        // 2. Читання потоку для прогресу
        const reader = response.body.getReader()
        let loaded = 0
        const chunks = []

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            chunks.push(value)
            loaded += value.length

            if (onProgress) {
                const currentTime = performance.now()
                const duration = (currentTime - startTime) / 1000 // у секундах
                const bps = loaded / duration // байт за секунду

                const percent = totalSize ? Math.round((loaded / totalSize) * 100) : 0
                const remainingBytes = totalSize - loaded
                const eta = totalSize && bps > 0 ? Math.round(remainingBytes / bps) : null

                onProgress({
                    raw: {
                        percent,
                        loaded,
                        total: totalSize,
                        speed: bps,
                        eta,
                        filename,
                    },
                    // Додаємо вже відформатовані рядки для зручності
                    formatted: {
                        percent: `${percent}%`,
                        loaded: formatBytes(loaded),
                        total: formatBytes(totalSize),
                        speed: `${formatBytes(bps)}/s`,
                        eta: formatTime(eta),
                    },
                })
            }
        }

        const blob = new Blob(chunks)

        // 3. Валідація хешу (RFC 9530 або старий Digest)
        const contentDigest = headers.get('Content-Digest') // Новий: sha-256=:base64:
        const oldDigest = headers.get('Digest') // Старий: sha-256=hex
        let serverHashBase64 = null

        if (contentDigest?.includes('sha-256=')) {
            serverHashBase64 = contentDigest.match(/:([^:]+):/)?.[1]
        } else if (oldDigest?.includes('sha-256=')) {
            const hex = oldDigest.split('sha-256=')[1]
            // Конвертуємо hex у base64 для порівняння
            serverHashBase64 = btoa(
                hex
                    .match(/\w{2}/g)
                    .map((a) => String.fromCharCode(parseInt(a, 16)))
                    .join(''),
            )
        }

        // 4. Перевірка цілісності (Integrity Check)
        if (serverHashBase64) {
            const arrayBuffer = await blob.arrayBuffer()
            const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuffer)
            const clientHashBase64 = btoa(String.fromCharCode(...new Uint8Array(hashBuf)))

            if (serverHashBase64 === clientHashBase64) {
                console.log('✅ Integrity: OK')
            } else {
                console.warn('❌ Integrity: FAIL')
            }
        }

        // // 5. Створюємо посилання для завантаження
        // const downloadUrl = window.URL.createObjectURL(blob)
        // const link = document.createElement('a')
        // link.href = downloadUrl
        // link.download = filename
        // link.style.display = 'none'

        // document.body.appendChild(link)
        // link.click()

        // // Очищення
        // link.remove()
        // document.body.removeChild(link)
        // window.URL.revokeObjectURL(downloadUrl)

        return { filename, size: totalSize, etag }
    } catch (error) {
        console.error('Download failed:', error)
    }
}

// ----------
// const data = downloadFileWithProgress(
//     CONFIG.url,
//     {
//         headers: {
//             Authorization: `Bearer ${CONFIG.token}`,
//         },
//     },
//     (stats) => {
//         // const mbLoaded = (stats.loaded / (1024 * 1024)).toFixed(2)
//         // const mbSpeed = (stats.speed / (1024 * 1024)).toFixed(2)

//         // console.log(
//         //     `Завантаження ${stats.filename}: ${stats.percent}% ` +
//         //         `(${mbLoaded} MB) | Швидкість: ${mbSpeed} MB/s | ETA: ${stats.eta}s`,
//         // )

//         const { percent, loaded, total, speed, eta } = stats.formatted

//         let lastPercent = -1
//         if (lastPercent != percent) {
//             lastPercent = percent

//             // Формуємо рядок прогресу
//             // \r - на початок, \x1b[K - стерти старе
//             const message = `\r\x1b[K🚀 Прогрес: [${percent}] | ${loaded} / ${total} | Швидкість: ${speed} | Залишилось: ${eta}`

//             // \r повертає курсор на початок, щоб переписати рядок
//             process.stdout.write(`${message}`)
//         }
//     },
// )

// console.log(data)

// -------------------------------------------------------------------------------
async function runTest() {
    try {
        // 1. Отримуємо повний файл
        const fullRes = await fetch(CONFIG.url, {
            headers: {
                Authorization: `Bearer ${CONFIG.token}`,
            },
        })

        if (!fullRes.ok) throw new Error(`Сервер відповів помилкою: ${fullRes.status}`)

        const fullArrayBuffer = await fullRes.arrayBuffer()
        const fullBuffer = Buffer.from(fullArrayBuffer)

        // 2. Отримуємо фрагмент (наприклад, з 500 по 1000 байт)
        const start = 5000
        const end = 10000
        const rangeRes = await fetch(CONFIG.url, {
            headers: {
                Authorization: `Bearer ${CONFIG.token}`,
                Range: `bytes=${start}-${end}`,
            },
        })

        if (!rangeRes.ok) throw new Error(`Сервер відповів помилкою: ${rangeRes.status}`)

        const rangeResArrayBuffer = await rangeRes.arrayBuffer()
        const rangeBuffer = Buffer.from(rangeResArrayBuffer)

        // 3. Порівнюємо
        const originalSlice = fullBuffer.slice(start, end + 1)

        if (originalSlice.equals(rangeBuffer)) {
            console.log('✅ Range працює коректно: байти збігаються')
        } else {
            console.error('❌ Помилка: дані в Range відрізняються від оригіналу')
            console.log('Очікувано:', originalSlice.length, 'байт')
            console.log('Отримано:', rangeBuffer.length, 'байт')
        }
    } catch (err) {
        console.error('\n💥 Помилка:', err.message)
    }
}

runTest()
