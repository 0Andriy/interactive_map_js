export class BroadcastOperator {
    constructor(adapter, rooms = new Set(), exceptRooms = new Set(), flags = {}) {
        /** @protected */
        this.adapter = adapter

        // Гарантуємо ізоляцію даних через створення нових Set/Object
        /** @protected @type {Set<string>} */
        this.rooms = new Set(rooms)

        /** @protected @type {Set<string>} */
        this.exceptRooms = new Set(exceptRooms)

        /** @protected @type {object} */
        this.flags = { ...flags }
    }

    /**
     * Додає цільову кімнату для розсилки. Підтримує Chaining.
     * @param {string} room
     * @returns {BroadcastOperator}
     */
    to(room) {
        if (typeof room === 'string' && room) {
            const nextRooms = new Set(this.rooms).add(room)
            return new BroadcastOperator(this.adapter, nextRooms, this.exceptRooms, this.flags)
        }
        return this
    }

    in(room) {
        return this.to(room)
    }

    /**
     * Виключає кімнату з поточної розсилки.
     * @param {string} room
     * @returns {BroadcastOperator}
     */
    except(room) {
        if (typeof room === 'string' && room) {
            const nextExceptRooms = new Set(this.exceptRooms).add(room)
            return new BroadcastOperator(this.adapter, this.rooms, nextExceptRooms, this.flags)
        }
        return this
    }

    /**
     * Вказує ID відправника для виключення.
     * @param {string} socketId
     * @returns {BroadcastOperator}
     */
    broadcast(socketId) {
        if (typeof socketId === 'string' && socketId) {
            const nextFlags = { ...this.flags, sender: socketId }
            return new BroadcastOperator(this.adapter, this.rooms, this.exceptRooms, nextFlags)
        }
        return this
    }

    /**
     * Встановлює таймаут для очікування відповіді від підписників.
     * @param {number} ms
     * @returns {BroadcastOperator}
     */
    timeout(ms) {
        if (typeof ms === 'number' && ms >= 0) {
            const nextFlags = { ...this.flags, timeout: ms }
            return new BroadcastOperator(this.adapter, this.rooms, this.exceptRooms, nextFlags)
        }
        return this
    }

    // Геттери тепер створюють НОВИЙ інстанс оператора, не псуючи попередній
    get local() {
        const nextFlags = { ...this.flags, local: true }
        return new BroadcastOperator(this.adapter, this.rooms, this.exceptRooms, nextFlags)
    }

    get volatile() {
        const nextFlags = { ...this.flags, volatile: true }
        return new BroadcastOperator(this.adapter, this.rooms, this.exceptRooms, nextFlags)
    }

    get compressed() {
        const nextFlags = { ...this.flags, compressed: true }
        return new BroadcastOperator(this.adapter, this.rooms, this.exceptRooms, nextFlags)
    }

    get binary() {
        const nextFlags = { ...this.flags, binary: true }
        return new BroadcastOperator(this.adapter, this.rooms, this.exceptRooms, nextFlags)
    }

    /**
     * Фінальний метод ланцюжка.
     * @param {string} event
     * @param {...any} args
     * @returns {boolean|Promise<any[]>}
     */
    emit(event, ...args) {
        if (typeof event !== 'string' || !event || !this.adapter) {
            return false
        }

        const packet = {
            rooms: this.rooms,
            except: this.exceptRooms,
            flags: this.flags,
        }

        // Сценарій А: Активовано таймаут очікування відповіді
        if (typeof this.flags.timeout === 'number') {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(
                        new Error(
                            `[BroadcastOperator] Emit Timeout: від підписників події "${event}" немає відповіді протягом ${packet.flags.timeout}ms`,
                        ),
                    )
                }, packet.flags.timeout)

                const ackCallback = (responses) => {
                    clearTimeout(timer)
                    resolve(responses)
                }

                this.adapter.broadcast(packet, event, [...args, ackCallback]).catch((error) => {
                    clearTimeout(timer)
                    reject(error)
                })
            })
        }

        // Сценарій Б: Звичайний асинхронний бродкаст без таймауту.
        this.adapter.broadcast(packet, event, args).catch((error) => {
            if (this.adapter.nsp && typeof this.adapter.nsp._handleError === 'function') {
                this.adapter.nsp._handleError(event, error)
            } else {
                console.error(
                    `[BroadcastOperator] Помилка адаптера під час події "${event}":`,
                    error,
                )
            }
        })

        return true
    }

    /**
     * Фінальний метод ланцюжка для створення блупрінта інструкції.
     */
    createInstruction(event, args) {
        return {
            event,
            args,
            rooms: new Set(this.rooms),
            except: new Set(this.exceptRooms),
            flags: { ...this.flags },
        }
    }
}
