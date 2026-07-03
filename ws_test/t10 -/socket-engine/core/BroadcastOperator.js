/**
 * Максимально повний аналог BroadcastOperator із Socket.IO.
 * Реалізує патерни Fluent API та Mediator для побудови складних ланцюжків розсилки (Builder).
 */
export class BroadcastOperator {
    /**
     * @param {object} adapter - Адаптер простору імен (напр. InMemoryAdapter).
     * @param {Set<string>} [rooms] - Початковий набір цільових кімнат.
     * @param {Set<string>} [exceptRooms] - Початковий набір виключених кімнат.
     * @param {object} [flags] - Опціональні прапорці розсилки.
     */
    constructor(adapter, rooms = new Set(), exceptRooms = new Set(), flags = {}) {
        /** @protected */
        this.adapter = adapter

        // ЗАХИСТ: гарантуємо, що кімнати завжди є екземплярами Set
        /** @protected @type {Set<string>} */
        this.rooms = rooms instanceof Set ? rooms : new Set()

        /** @protected @type {Set<string>} */
        this.exceptRooms = exceptRooms instanceof Set ? exceptRooms : new Set()

        /** @protected @type {object} */
        this.flags = flags && typeof flags === 'object' ? flags : {}
    }

    /**
     * Додає цільову кімнату для розсилки. Підтримує Chaining: .to('r1').to('r2')
     * @param {string} room - Назва кімнати.
     * @returns {this}
     */
    to(room) {
        if (typeof room === 'string' && room) {
            this.rooms.add(room)
        }
        return this
    }

    /**
     * Синонім методу .to()
     * @param {string} room - Назва кімнати.
     * @returns {this}
     */
    in(room) {
        return this.to(room)
    }

    /**
     * Виключає кімнату з поточної розсилки.
     * @param {string} room - Назва кімнати для виключення.
     * @returns {this}
     */
    except(room) {
        if (typeof room === 'string' && room) {
            this.exceptRooms.add(room)
        }
        return this
    }

    /**
     * Вказує ID відправника, якого потрібно виключити з розсилки (Концепт socket.broadcast).
     * @param {string} socketId - Унікальний ідентифікатор сокета-відправника.
     * @returns {this}
     */
    broadcast(socketId) {
        if (typeof socketId === 'string' && socketId) {
            this.flags.sender = socketId
        }
        return this
    }

    /**
     * Встановлює таймаут для очікування відповіді від підписників.
     * Перетворює фінальний .emit() на Promise.
     * @param {number} ms - Час таймауту в мілісекундах.
     * @returns {this}
     */
    timeout(ms) {
        if (typeof ms === 'number' && ms >= 0) {
            this.flags.timeout = ms
        }
        return this
    }

    /**
     * Прапорець "local": розсилка відбудеться ТІЛЬКИ на поточному сервері Node.js
     * (ігнорує Redis, якщо підключено RedisAdapter).
     * @returns {this}
     */
    get local() {
        this.flags.local = true
        return this
    }

    /**
     * Прапорець "volatile": дозволяє ігнорувати доставку пакета при переповненні буфера.
     * @returns {this}
     */
    get volatile() {
        this.flags.volatile = true
        return this
    }

    /**
     * Прапорець "compressed": вмикає стиснення даних перед відправкою.
     * @returns {this}
     */
    get compressed() {
        this.flags.compressed = true
        return this
    }

    /**
     * Прапорець "binary": вказує, що передані дані є бінарними (Buffer, ArrayBuffer).
     * @returns {this}
     */
    get binary() {
        this.flags.binary = true
        return this
    }

    /**
     * Фінальний метод ланцюжка. Якщо виставлено флаг timeout, повертає Promise,
     * інакше запускає асинхронний бродкаст у фоні та миттєво повертає true.
     * @param {string} event - Назва події.
     * @param {...any} args - Аргументи події.
     * @returns {boolean|Promise<any[]>}
     */
    emit(event, ...args) {
        // ЗАХИСТ: Перевірка типу події та наявності адаптера
        if (typeof event !== 'string' || !event || !this.adapter) {
            return false
        }

        const packet = {
            rooms: this.rooms,
            except: this.exceptRooms,
            flags: this.flags,
        }

        // Сценарій А: Активовано таймаут очікування відповіді (.timeout(1000).emit())
        if (typeof this.flags.timeout === 'number') {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(
                        new Error(
                            `[BroadcastOperator] Emit Timeout: від підписників події "${event}" немає відповіді протягом ${packet.flags.timeout}ms`,
                        ),
                    )
                }, packet.flags.timeout)

                // Створюємо головний ACK-коллбек для збору відповідей від адаптера
                const ackCallback = (responses) => {
                    clearTimeout(timer)
                    resolve(responses)
                }

                // Запускаємо асинхронний бродкаст адаптера.
                // Передаємо ackCallback останнім елементом в масиві аргументів.
                this.adapter.broadcast(packet, event, [...args, ackCallback]).catch((error) => {
                    clearTimeout(timer)
                    reject(error)
                })
            })
        }

        // Сценарій Б: Звичайний асинхронний бродкаст без таймауту.
        // Запускаємо його у фоні (fire-and-forget), щоб не блокувати головний потік сервера,
        // і миттєво повертаємо true за специфікацією Socket.io.
        this.adapter.broadcast(packet, event, args).catch((error) => {
            // Перехоплюємо критичні помилки самого адаптера (наприклад, обрив зв'язку з Redis),
            // щоб вони не повалили весь процес Node.js
            if (this.adapter.nsp && typeof this.adapter.nsp._handleError === 'function') {
                this.adapter.nsp._handleError(event, error)
            }
        })

        return true
    }

    /**
     * Фінальний метод ланцюжка. Повертає готовий "зліпок" налаштувань.
     * @param {string} event - Назва події.
     * @param {any[]} args - Аргументи події.
     * @returns {object} Об'єкт інструкції розсилки (Блупрінт).
     */
    createInstruction(event, args) {
        return {
            event,
            args,
            rooms: this.rooms,
            except: this.exceptRooms,
            flags: this.flags,
        }
    }
}
