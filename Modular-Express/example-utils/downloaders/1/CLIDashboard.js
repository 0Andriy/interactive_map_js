import readline from 'readline'

/**
 * Клас для візуалізації прогресу декількох завантажень одночасно.
 */
export class CLIDashboard {
    constructor() {
        this.tasks = new Map()
        this.timer = setInterval(() => this.render(), 200) // Оновлення 5 разів на сек
    }

    /**
     * Оновлює дані конкретного завдання
     * @param {string} id - Унікальний ідентифікатор (напр. шлях до файлу)
     * @param {Object} data - Дані прогресу
     */
    update(id, data) {
        this.tasks.set(id, data)
    }

    render() {
        if (this.tasks.size === 0) return

        // Очищаємо термінал та повертаємось вгору
        readline.cursorTo(process.stdout, 0, 0)
        readline.clearScreenDown(process.stdout)

        console.log('=== 📥 MULTI-STREAM DOWNLOAD MANAGER ===\n')

        for (const [id, p] of this.tasks) {
            const barWidth = 20
            const filled = Math.round((p.percent / 100) * barWidth)
            const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled)

            const filename = id.split('/').pop().padEnd(20).substring(0, 20)
            const stats = `${p.percent}% | ${p.downloadedMB}/${p.totalMB} MB | ${p.speedHuman}`

            console.log(`${filename} [${bar}] ${stats}`)
        }

        console.log('\n------------------------------------------')
        console.log('Натисніть Ctrl+C для виходу')
    }

    stop() {
        clearInterval(this.timer)
    }
}
