import { createHash } from 'crypto'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { ChunkManager } from './ChunkManager.js'

export class SecureDownloader {
    constructor(options = {}, logger = null) {
        this.options = {
            concurrency: 3,
            chunkSize: 5 * 1024 * 1024,
            maxRetries: 3,
            ...options,
        }

        const context = { file: path.basename(this.options.dest) }
        this.logger = logger?.child ? logger.child(context) : logger
        this.abortController = new AbortController()
    }

    async download() {
        this.logger?.info?.('Початок завантаження', { strategy: 'parallel' })

        try {
            // 1. Отримуємо інфо про файл
            const head = await this._probeServer()
            const totalSize = parseInt(head.headers.get('content-length'), 10)
            const supportsRange = head.headers.get('accept-ranges') === 'bytes'

            await fsp.mkdir(path.dirname(this.options.dest), { recursive: true })

            if (!supportsRange) {
                this.logger?.warn?.('Сервер не підтримує Range, перемикаюсь на стандартний потік')
                return await this._fallbackDownload()
            }

            // 2. Ініціалізуємо менеджер чанків
            const manager = new ChunkManager(
                {
                    ...this.options,
                    signal: this.abortController.signal,
                },
                this.logger,
            )

            const chunks = this._createChunks(totalSize)
            let downloaded = 0

            // 3. Запуск воркерів (паралельність)
            const workers = Array(Math.min(this.options.concurrency, chunks.length))
                .fill(null)
                .map(async () => {
                    while (chunks.length > 0) {
                        const chunk = chunks.shift()
                        await manager.downloadSegment(chunk)
                        downloaded += chunk.end - chunk.start + 1
                        this._report(downloaded, totalSize)
                    }
                })

            await Promise.all(workers)

            // 4. Фіналізація
            return await this._assemble(totalSize, head)
        } catch (error) {
            this.logger?.error?.('Завантаження провалено', { msg: error.message })
            throw error
        }
    }

    _createChunks(total) {
        const chunks = []
        for (let i = 0; i < total; i += this.options.chunkSize) {
            chunks.push({
                start: i,
                end: Math.min(i + this.options.chunkSize - 1, total - 1),
                index: chunks.length,
            })
        }
        return chunks
    }

    async _assemble(totalSize, response) {
        this.logger?.info?.('Збирання частин у фінальний файл')
        const writer = fs.createWriteStream(this.options.dest)

        const partFiles = (await fsp.readdir(path.dirname(this.options.dest)))
            .filter((f) => f.includes(`${path.basename(this.options.dest)}.part`))
            .sort((a, b) => parseInt(a.split('.part')[1]) - parseInt(b.split('.part')[1]))

        for (const file of partFiles) {
            const p = path.join(path.dirname(this.options.dest), file)
            writer.write(await fsp.readFile(p))
            await fsp.unlink(p)
        }

        await new Promise((r) => writer.end(r))
        return await this._verify(response)
    }

    async _verify(response) {
        const expected = (
            response.headers.get('x-sha256') || this.options.expectedHash
        )?.toLowerCase()
        if (expected) {
            this.logger?.info?.('Перевірка хешу...')
            const actual = await this._hash(this.options.dest)
            if (actual !== expected) throw new Error('Hash mismatch')
        }
        this.logger?.info?.('Готово!')
        return this.options.dest
    }

    async _hash(p) {
        const hash = createHash('sha256')
        for await (const chunk of fs.createReadStream(p)) hash.update(chunk)
        return hash.digest('hex')
    }

    async _probeServer() {
        const headers = this.options.getHeaders ? await this.options.getHeaders() : {}
        return fetch(this.options.url, {
            method: 'HEAD',
            headers,
            signal: this.abortController.signal,
        })
    }

    _report(downloaded, total) {
        this.options.onProgress?.({
            percent: ((downloaded / total) * 100).toFixed(2),
            downloaded,
            total,
        })
    }

    stop() {
        this.abortController.abort()
    }
}
