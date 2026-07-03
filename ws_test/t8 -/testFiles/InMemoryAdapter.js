/**
 * Чиста реалізація InMemoryAdapter за стандартами Socket.IO.
 * Не знає про існування EventBus чи обгортки подій.
 * Оперує виключно унікальними ідентифікаторами підписників (sid) та кімнатами.
 */
export class InMemoryAdapter {
    /**
     * @param {object} nsp - Простір імен (Namespace), якому належить цей адаптер.
     */
    constructor(nsp) {
        /**
         * Посилання на простір імен (Namespace).
         * @protected
         */
        this.nsp = nsp

        /**
         * Мапа зв'язків: Назва кімнати -> Set з унікальними ID підписників (sids).
         * @type {Map<string, Set<string>>}
         * @public
         */
        this.rooms = new Map()

        /**
         * Мапа зв'язків: ID підписника (sid) -> Set назв кімнат, у яких він перебуває.
         * @type {Map<string, Set<string>>}
         * @public
         */
        this.sids = new Map()
    }

    /**
     * Додає підписника (за його унікальним ID) до конкретної кімнати.
     * @param {string} sid - Унікальний ідентифікатор підписника (наприклад, socket.id).
     * @param {string} room - Назва кімнати.
     * @returns {void}
     */
    addAll(sid, room) {
        if (typeof sid !== 'string' || typeof room !== 'string') return

        // 1. Прив'язуємо SID до кімнати
        let roomSet = this.rooms.get(room)
        if (!roomSet) {
            roomSet = new Set()
            this.rooms.set(room, roomSet)
        }
        roomSet.add(sid)

        // 2. Прив'язуємо кімнату до SID
        let callbackRooms = this.sids.get(sid)
        if (!callbackRooms) {
            callbackRooms = new Set()
            this.sids.set(sid, callbackRooms)
        }
        callbackRooms.add(room)
    }

    /**
     * Видаляє підписника з конкретної кімнати.
     * @param {string} sid - Унікальний ідентифікатор підписника.
     * @param {string} room - Назва кімнати.
     * @returns {void}
     */
    del(sid, room) {
        if (typeof sid !== 'string' || typeof room !== 'string') return

        const roomSet = this.rooms.get(room)
        if (roomSet) {
            roomSet.delete(sid)
            if (roomSet.size === 0) this.rooms.delete(room)
        }

        const callbackRooms = this.sids.get(sid)
        if (callbackRooms) {
            callbackRooms.delete(room)
            if (callbackRooms.size === 0) this.sids.delete(sid)
        }
    }

    /**
     * Повністю видаляє підписника з усіх кімнат (наприклад, при дисконекті сокета).
     * @param {string} sid - Унікальний ідентифікатор підписника.
     * @returns {void}
     */
    delAll(sid) {
        if (typeof sid !== 'string') return

        const callbackRooms = this.sids.get(sid)
        if (!callbackRooms) return

        for (const room of callbackRooms) {
            const roomSet = this.rooms.get(room)
            if (roomSet) {
                roomSet.delete(sid)
                if (roomSet.size === 0) this.rooms.delete(room)
            }
        }

        this.sids.delete(sid)
    }

    /**
     * Центральний метод бродкасту. Його єдина задача — відфільтрувати ID підписників (sids)
     * відповідно до правил ланцюжка і передати фінальний набір ID назад у Namespace для відправки.
     * @param {object} packet - Зліпок налаштувань від BroadcastOperator.
     * @param {Set<string>} packet.rooms - Цільові кімнати.
     * @param {Set<string>} packet.except - Кімнати-виключення.
     * @param {object} packet.flags - Прапорці (.local, .sender тощо).
     * @param {string} event - Назва події.
     * @param {any[]} args - Масив аргументів події.
     * @returns {void}
     */
    broadcast(packet, event, args) {
        const { rooms, except, flags } = packet

        /**
         * Набір відфільтрованих унікальних ідентифікаторів (sids), які мають отримати подію.
         * @type {Set<string>}
         */
        const targetSids = new Set()

        // Сценарій 1: Кімнати розсилки явно вказані (.to('room'))
        if (rooms.size > 0) {
            for (const room of rooms) {
                const roomSids = this.rooms.get(room)
                if (!roomSids) continue

                for (const sid of roomSids) {
                    targetSids.add(sid)
                }
            }
        } else {
            // Сценарій 2: Цільових кімнат немає — шлемо ВСІМ активним sids у цьому адаптері
            for (const sid of this.sids.keys()) {
                targetSids.add(sid)
            }
        }

        // Застосовуємо фільтри ВИКЛЮЧЕННЯ (except-кімнати та ігнорування відправника)
        for (const sid of targetSids) {
            // 1. Фільтр відправника (Концепт socket.broadcast — не шлемо сокету, який згенерував подію)
            // У flags.sender тепер очікується рядок socket.id, а не коллбек
            if (flags.sender && flags.sender === sid) {
                targetSids.delete(sid)
                continue
            }

            // 2. Фільтр кімнат-виключень (.except('room'))
            if (except.size > 0) {
                const userRooms = this.sids.get(sid)
                if (userRooms) {
                    const isInExceptRoom = [...userRooms].some((r) => except.has(r))
                    if (isInExceptRoom) {
                        targetSids.delete(sid)
                    }
                }
            }
        }

        // Якщо нікого не залишилось, а у ланцюжку був асинхронний .timeout(),
        // адаптер передає пустий результат у простір імен, щоб закрити Promise
        if (targetSids.size === 0) {
            this._triggerEmptyAck(args)
            return
        }

        // Передаємо відфільтровані сокети назад у Namespace.
        // Саме Namespace знає, де лежать реальні об'єкти сокетів чи їхні EventBus, і виконає доставку.
        if (typeof this.nsp._dispatchBroadcast === 'function') {
            this.nsp._dispatchBroadcast(targetSids, flags, event, args)
        }
    }

    /**
     * Допоміжний метод для закриття ACK порожнім масивом, якщо одержувачів 0.
     * @private
     */
    _triggerEmptyAck(args) {
        const hasAck = typeof args[args.length - 1] === 'function'
        if (hasAck) {
            args[args.length - 1]([])
        }
    }
}
