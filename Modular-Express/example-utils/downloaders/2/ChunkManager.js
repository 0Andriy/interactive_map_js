import fsp from 'fs/promises'
import { Buffer } from 'buffer'

export class ChunkManager {
    constructor(config, logger) {
        this.config = config // url, dest, headers, concurrency, retries, signal
        this.logger = logger
    }

    async downloadSegment(chunk, attempt = 1) {
        const partPath = `${this.config.dest}.part${chunk.index}`

        try {
            // Перевірка чи вже завантажено (для Resume)
            const stats = await fsp.stat(partPath).catch(() => null)
            if (stats && stats.size === chunk.end - chunk.start + 1) {
                return
            }

            const headers = this.config.getHeaders ? await this.config.getHeaders() : {}
            const response = await fetch(this.config.url, {
                headers: { ...headers, Range: `bytes=${chunk.start}-${chunk.end}` },
                signal: this.config.signal,
            })

            if (!response.ok) throw new Error(`HTTP ${response.status}`)

            const arrayBuffer = await response.arrayBuffer()
            await fsp.writeFile(partPath, Buffer.from(arrayBuffer))
        } catch (error) {
            if (error.name === 'AbortError') throw error

            if (attempt <= this.config.maxRetries) {
                const delay = Math.pow(2, attempt) * 1000 // Експоненціальний бек-офф
                this.logger?.warn?.(`Ретрай чанка ${chunk.index}`, {
                    attempt,
                    nextIn: `${delay}ms`,
                })
                await new Promise((r) => setTimeout(r, delay))
                return this.downloadSegment(chunk, attempt + 1)
            }
            throw error
        }
    }
}
