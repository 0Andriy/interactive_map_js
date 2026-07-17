import config from '../../../config/config.js'
import { asyncLocalStorage } from '../../../common/utils/context.js'

/**
 * Модуль: External API WebSocket Manager
 * Опис: Реалізує схему "Smart Polling". Групує запити від різних клієнтів
 * за параметрами API, робить мінімальну кількість запитів та розсилає дані.
 */

/**
 * Налаштування WebSocket сервера для модуля IOS
 * @param {Object} io - Екземпляр Socket.io або кастомний сервер сокетів
 * @param {Object} apiService - Бізнес-сервіс IosService
 * @param {Object} authGuard - AuthGuard
 * @param {Object|null} logger - Системний логгер додатка
 */
export function setupExternalApiSocket(io, apiService, authGuard = null, logger = null) {
    // Створюємо окремий namespace
    const nsp = io.of('/ios')

    // Інтервал опитування в мс
    const POLLING_INTERVAL = 1000 * 2
    let pollingTimeoutId = null
    let isPollingActive = false // захист від race condition

    // --- ЄДИНЕ ДЖЕРЕЛО ПРАВДИ ДЛЯ ВСІХ ДАНИХ КІМНАТ ---
    // rooms: roomName => { blockId, fragmentName, ids, cleanupTimer, cache, lastInfos }
    const rooms = new Map()

    // --- ДОПОМІЖНА ФУНКЦІЯ ОЧИЩЕННЯ ---
    // /**
    //  * Планує очищення кімнати, якщо вона порожня.
    //  * @param {string} roomName - Назва кімнати
    //  * @param {number} maxRemainingUsers - Максимум користувачів (0 для leave, 1 для disconnect)
    //  * @param {number} delayMs - Затримка перед очищенням у мілісекундах (за замовчуванням 10000)
    //  */
    // const scheduleRoomCleanup = (roomName, maxRemainingUsers = 0, delayMs = 10000) => {
    //     const roomData = rooms.get(roomName)
    //     if (!roomData || roomData.cleanupTimer) return

    //     const room = nsp.adapter.rooms.get(roomName)
    //     const currentSize = room ? room.size : 0

    //     if (currentSize <= maxRemainingUsers) {
    //         const delayInSeconds = Math.round(delayMs / 1000)
    //         logger?.debug?.(
    //             `[WSS] Кімната ${roomName} порожня. Плануємо очищення через ${delayInSeconds}с...`,
    //         )

    //         roomData.cleanupTimer = setTimeout(() => {
    //             const activeRoom = nsp.adapter.rooms.get(roomName)

    //             if (!activeRoom || activeRoom.size === 0) {
    //                 // Одночасно видаляються конфіги, таймер, cache та lastInfos цієї кімнати!
    //                 rooms.delete(roomName)
    //                 logger?.info?.(`[WSS] Кімнату ${roomName} та весь її кеш успішно видалено.`)
    //             } else {
    //                 logger?.debug?.(`[WSS] Очищення скасовано: кімната ${roomName} знову активна.`)
    //                 roomData.cleanupTimer = null
    //             }
    //         }, delayMs)
    //     }
    // }

    /**
     * Планує очищення кімнати, якщо вона порожня.
     * @param {string} roomName - Назва кімнати
     * @param {number} delayMs - Затримка перед очищенням у мілісекундах (за замовчуванням 10000)
     */
    const scheduleRoomCleanup = (roomName, isDisconnecting = false, delayMs = 10000) => {
        const roomData = rooms.get(roomName)
        if (!roomData) return

        // Отримуємо реальну кількість сокетів у кімнаті
        const room = nsp.adapter.rooms.get(roomName)
        let currentSize = room ? room.size : 0

        // Якщо сокет ще в кімнаті, але відключається — віртуально віднімаємо його
        if (isDisconnecting && currentSize > 0) {
            currentSize -= 1
        }

        // Якщо в кімнаті хтось є — очищення не потрібне.
        // Якщо там є старий таймер від попереднього виходу, скидаємо його, бо кімната "жива".
        if (currentSize > 0) {
            if (roomData.cleanupTimer) {
                clearTimeout(roomData.cleanupTimer)
                roomData.cleanupTimer = null

                logger?.debug?.(
                    `[WSS] Очищення скасовано: кімната ${roomName} знову активна (${currentSize} юзерів).`,
                )
            }

            return
        }

        // Якщо кімната порожня і таймер вже запущений — нічого не робимо, нехай цокає далі.
        if (roomData.cleanupTimer) return

        // Якщо кімната порожня і таймера немає — плануємо видалення
        const delayInSeconds = Math.round(delayMs / 1000)
        logger?.debug?.(
            `[WSS] Кімната ${roomName} порожня. Плануємо очищення через ${delayInSeconds}с...`,
        )

        roomData.cleanupTimer = setTimeout(() => {
            const activeRoom = nsp.adapter.rooms.get(roomName)
            const finalSize = activeRoom ? activeRoom.size : 0

            if (finalSize === 0) {
                rooms.delete(roomName)
                logger?.info?.(`[WSS] Кімнату ${roomName} та весь її кеш успішно видалено.`)
            } else {
                logger?.debug?.(
                    `[WSS] Очищення скасовано на фінальній перевірці: кімната ${roomName} активна.`,
                )
                roomData.cleanupTimer = null
            }
        }, delayMs)
    }

    // Ініціація першого пулінгу, якщо кімнат не було, а зараз з'явилася перша підписка
    const checkAndTriggerPolling = () => {
        // Запускаємо тільки якщо є кімнати І пулінг ще НЕ активний
        if (rooms.size > 0 && !pollingTimeoutId && !isPollingActive) {
            logger?.info?.('[WSS] Виявлено першу активну кімнату. Запуск конвеєра пулінгу...')

            // Запуск циклу
            startPolling()
        }
    }

    // Зупиняємо рекурсію і скидаємо дані
    const stopPollingTimer = () => {
        if (pollingTimeoutId) {
            clearTimeout(pollingTimeoutId)
            pollingTimeoutId = null
        }
    }

    // Допоміжна утиліта для парсингу масивів
    const ensureArray = (raw) => (raw ? (Array.isArray(raw) ? raw : [raw]) : [])

    /**
     * РЕКУРСИВНИЙ АСИНХРОННИЙ ПУЛІНГ ЗОВНІШНЬОГО API
     */
    const startPolling = async () => {
        // 1. Позначили, що процес пішов
        isPollingActive = true

        try {
            // console.log(0, 'Polling active')

            // 2. Якщо кімнат немає — скидаємо прапорець, чистимо таймер і зупиняємо рекурсію
            if (rooms.size === 0) {
                logger?.info?.('[WSS] Немає активних кімнат. Зупинка пулінгу.')

                stopPollingTimer()

                // 2. Скинули прапорець при ранньому виході
                isPollingActive = false
                return
            }

            // 1. Групуємо унікальні ідентифікатори датчиків по енергоблоках (blockId),
            // щоб не робити дублюючі HTTP запити на однакові параметри
            const groups = new Map()

            for (const room of rooms.values()) {
                // Ключ групування: "blockId:fragmentName"
                const groupKey = `${room.blockId}`

                if (!groups.has(groupKey)) {
                    groups.set(groupKey, {
                        blockId: room.blockId,
                        fragmentName: room.fragmentName,
                        ids: new Set(),
                        blockIdsArray: new Set(),
                    })
                }

                const currentGroup = groups.get(groupKey)
                room.ids.forEach((id) => currentGroup.ids.add(id))
                room.blockIdsArray.forEach((item) => currentGroup.blockIdsArray.add(item))
            }

            // 2. Паралельно виконуємо запити до API для кожної групи блоків
            const fetchPromises = Array.from(groups.values()).map(async (group) => {
                try {
                    const uniqueIds = Array.from(group.ids)
                    const bodyPayload = Array.from(group.blockIdsArray)

                    const requests = [
                        uniqueIds.length > 0
                            ? apiService.getValue(group.blockId, uniqueIds)
                            : Promise.resolve(null),
                        bodyPayload.length > 0
                            ? apiService.getDiscretParamsState(group.blockId, bodyPayload)
                            : Promise.resolve(null),
                    ]

                    const [valueResponse, discretResponse] = await Promise.all(requests)

                    // Розкидаємо отримані дані по тих кімнатах, які належать цьому blockId
                    for (const [roomName, room] of rooms.entries()) {
                        if (String(room.blockId) !== String(group.blockId)) continue

                        // --- ОБРОБКА VALUE RESPONSE (Стандартні параметри) ---
                        if (valueResponse) {
                            // Зберігаємо стандартний infoslist у кеш кімнати
                            if (valueResponse.infoslist) {
                                room.cache.set('meta:std_infoslist', valueResponse.infoslist)
                            }

                            const standardParams = ensureArray(valueResponse?.paramslist?.param)
                            standardParams.forEach((item) => {
                                if (item && item.iden) {
                                    room.cache.set(`std:${item.iden}`, { ...item })
                                }
                            })
                        }

                        // --- ОБРОБКА DISCRET RESPONSE (Специфічні дані) ---
                        if (discretResponse) {
                            // Зберігаємо дискретний infoslist у кеш кімнати
                            if (discretResponse.infoslist) {
                                room.cache.set('meta:dsc_infoslist', discretResponse.infoslist)
                            }

                            // Формуємо blockData індивідуально для кімнати
                            const rawAlgors = ensureArray(discretResponse?.algorslist?.algor)

                            rawAlgors.forEach((algorItem) => {
                                // Якщо немає навіть першого ідентифікатора — пропускаємо
                                if (!algorItem.iden1) return

                                // 1. Збираємо всі ідентифікатори
                                // Якщо треба пропускати порожні: ['iden1', 'iden2'].join(',') -> "iden1,iden2"
                                const idParts = [algorItem.iden1]
                                if (algorItem.iden2) idParts.push(algorItem.iden2)
                                if (algorItem.iden3) idParts.push(algorItem.iden3)

                                let reconstructedIden = idParts.join(',')

                                // 2. Якщо є тип, додаємо його через дорівнює "="
                                if (algorItem.type) {
                                    reconstructedIden += `=${algorItem.type}`
                                }

                                // Тепер ключ буде виглядати як "dsc:iden1,iden2=S" або "dsc:iden1=S"
                                room.cache.set(`dsc:${reconstructedIden}`, {
                                    iden: reconstructedIden,
                                    iden1: algorItem.iden1,
                                    type: algorItem.type,
                                    state: algorItem.state,
                                })
                            })
                        }
                    }
                } catch (fetchErr) {
                    logger?.error?.(
                        `[WSS] Помилка фетчу для блоку ${group.blockId}: ${fetchErr.message}`,
                    )
                }
            })

            // Чекаємо завершення всіх запитів до API
            await Promise.all(fetchPromises)

            // Розсилаємо дані в кожну кімнату
            for (const [roomName, room] of rooms.entries()) {
                // 1. Збираємо стандартні параметри
                const standardData = room.ids
                    .map((id) => room.cache.get(`std:${id}`))
                    .filter(Boolean)

                // 2. Збираємо дискретні параметри (алгоритми)
                const roomBlockIds =
                    room.blockIdsArray instanceof Set
                        ? Array.from(room.blockIdsArray)
                        : ensureArray(room.blockIdsArray)

                const filteredAlgors = roomBlockIds
                    .map((id) => {
                        // 1. Спробуємо отримати дані за повним ключем (наприклад, "dsc:iden1,iden2=S")
                        let cachedData = room.cache.get(`dsc:${id}`)

                        // 2. Якщо повернуло undefined ТА у ключі є знак "="
                        if (!cachedData && id.includes('=')) {
                            // Відрізаємо тип, залишаючи тільки ідентифікатори (наприклад, "iden1,iden2")
                            const baseId = id.split('=')[0]

                            // Робимо повторний запит без типу
                            cachedData = room.cache.get(`dsc:${baseId}`)
                        }

                        return cachedData
                    })
                    .filter(Boolean)

                // 3. Дістаємо збережені infoslist з кешу (або підставляємо дефолтні значення)
                const cachedStdInfoslist = room.cache.get('meta:std_infoslist') || {}
                const cachedDscInfoslist = room.cache.get('meta:dsc_infoslist') || { info: [] }

                // 4. Публікуємо подію
                nsp.to(roomName).emit('fragment-data-update', {
                    paramslist: {
                        param: standardData,
                    },
                    infoslist: cachedStdInfoslist,
                    blockData: {
                        algorslist: {
                            algor: filteredAlgors,
                        },
                        infoslist: cachedDscInfoslist,
                    },
                    meta: {
                        refreshInterval: POLLING_INTERVAL,
                    },
                })
            }
        } catch (err) {
            logger?.error?.(`[WSS External API] Помилка пулінгу: ${err.message}`)
        } finally {
            // Рекурсивний виклик гарантує, що наступний пулінг почнеться строго через n сек ПІСЛЯ завершення попереднього запиту

            // 3. Перед плануванням нового таймера очищаємо старий (обов'язково)
            stopPollingTimer()

            // ВИПРАВЛЕНО: Керуйте рекурсією через бізнес-прапорець (наприклад, стан системи),
            // або перевіряйте наявність кімнат перед наступним кроком.
            if (rooms.size > 0) {
                // Якщо кімнати є — плануємо наступний такт через заданий інтервал
                pollingTimeoutId = setTimeout(startPolling, POLLING_INTERVAL)
            } else {
                // Кімнат немає — повністю гасимо активність пулінгу
                isPollingActive = false
                logger?.info?.('[WSS] Кімнат немає. Конвеєр повністю зупинено.')
            }
        }
    }

    // --- ІНТЕГРАЦІЯ БЕЗПЕКИ ЧЕРЕЗ АВТЕНТИФІКАЦІЮ MIDDLEWARE ---
    if (authGuard?.authenticateWebSocket) {
        nsp.use(async (ctx, next) => {
            try {
                const req = ctx.req

                // // 1. Безпечно парсимо куки з заголовків (для Web клієнтів)
                // if (!req.cookies && req.headers.cookie) {
                //     req.cookies = Object.fromEntries(
                //         req.headers.cookie.split('; ').map((pair) => {
                //             const [key, ...val] = pair.split('=')
                //             return [key.trim(), val.join('=')]
                //         }),
                //     )
                // }

                // ------------------    Пропуск по ip
                const clientIp =
                    req.socket.remoteAddress ||
                    req.headers['x-forwarded-for']?.split(',')[0]?.trim()

                const allowedIpsArray = process.env.NAEK_IP ? process.env.NAEK_IP.split(',') : []
                const isIpAllowed = req.isIpBypassed || allowedIpsArray.includes(clientIp)

                // Генерує 5 випадкових символів
                const randomStr = Math.random().toString(36).substring(2, 7)
                const authUserIp = {
                    login: `NAEK_${randomStr}`,
                    name: 'NAEK',
                }

                if (isIpAllowed) {
                    ctx.user = authUserIp
                    ctx.socket.user = authUserIp
                    return next()
                }

                // --------------------------------

                // Отримуємо назву бази даних
                const queryDbName = config?.oracleDB?.primaryDatabaseName || null

                // 2. ІНІЦІАЛІЗУЄМО АСИНХРОННИЙ КОНТЕКСТ ДЛЯ ХЕНДШЕЙКУ СОКЕТА
                // Передаємо dbName у сховище. Тепер getContext() всередині цього блоку поверне правильні дані
                return asyncLocalStorage.run({ dbName: queryDbName }, async () => {
                    // Викликаємо гвард. Він під капотом викличе userRepository.findUserByLogin
                    // І репозиторій успішно зчитає dbName через getContext()!
                    const authenticatedUser = await authGuard.authenticateWebSocket(req)

                    if (authenticatedUser) {
                        ctx.user = authenticatedUser
                        ctx.socket.user = authenticatedUser
                        return next()
                    }

                    logger?.warn?.(
                        `[WSS] Відхилено неавторизоване підключення сокету: ${ctx.socket?.id}`,
                    )
                    return next(new Error('Authentication error: Unauthorized'))
                })
            } catch (err) {
                // Логуємо реальну помилку, щоб вона не ховалася за загальним "Unauthorized"
                logger?.error?.(`[WSS Auth Middleware] Помилка: ${err.message}`)
                return next(new Error('Authentication error: Internal Server Error'))
            }
        })
    }

    // --- ОБРОБКА З'ЄДНАННЯ КЛІЄНТІВ ---
    nsp.on('connection', (socket) => {
        logger?.info?.(
            `[WSS] Нове захищене з'єднання: ${socket.id} (Користувач: ${socket.user?.login || 'Unknown'})`,
        )

        // --- ПОДІЯ: ВХІД В КІМНАТУ ---
        socket.on('join-api-room', ({ blockId, fragmentName, ids, blockIdsArray }) => {
            if (!blockId || !fragmentName || !Array.isArray(ids)) {
                logger?.warn?.(`[WSS] Invalid join attempt from ${socket.id}`)
                return
            }

            const roomName = `ios:${blockId}:${fragmentName}`

            // Дані кімнати
            let roomData = rooms.get(roomName)

            if (!roomData) {
                // Створюємо кімнату з ПОВНИМ набором її власних даних
                roomData = {
                    blockId,
                    fragmentName,
                    ids,
                    blockIdsArray,
                    cleanupTimer: null,
                    cache: new Map(), // ТУТ зберігаються id => payload конкретно цієї кімнати
                    // // Для відповіді
                    // blockData: {
                    //     algorslist: { algor: [] },
                    //     infoslist: { info: [] },
                    // },
                    // infoslist: {}, // для valueResponse
                }

                rooms.set(roomName, roomData)
            }

            // Якщо кімната чекала на видалення — скасовуємо таймер
            if (roomData.cleanupTimer) {
                clearTimeout(roomData.cleanupTimer)
                roomData.cleanupTimer = null
                logger?.debug?.(`[WSS] Очищення скасовано для кімнати ${roomName}`)
            }

            // Оновлюємо конфіг, якщо він змінився
            roomData.blockId = blockId
            roomData.fragmentName = fragmentName
            roomData.ids = ids
            roomData.blockIdsArray = blockIdsArray

            // Клієнт може бути підписаний на кілька кімнат одночасно
            socket.join(roomName)

            // Миттєво віддаємо клієнту дані з ЛОКАЛЬНОГО кешу цієї кімнати (якщо вони вже були закешовані раніше)
            // 1. Збираємо стандартні параметри
            const standardData = roomData.ids
                .map((id) => roomData.cache.get(`std:${id}`))
                .filter(Boolean)

            // 2. Збираємо дискретні параметри (алгоритми)
            const roomBlockIds =
                roomData.blockIdsArray instanceof Set
                    ? Array.from(roomData.blockIdsArray)
                    : ensureArray(roomData.blockIdsArray)

            const filteredAlgors = roomBlockIds
                .map((id) => roomData.cache.get(`dsc:${id}`))
                .filter(Boolean)

            // 3. Дістаємо збережені infoslist з кешу (або підставляємо дефолтні значення)
            const cachedStdInfoslist = roomData.cache.get('meta:std_infoslist') || {}
            const cachedDscInfoslist = roomData.cache.get('meta:dsc_infoslist') || { info: [] }

            // 4. Публікуємо подію
            nsp.to(roomName).emit('fragment-data-update', {
                paramslist: {
                    param: standardData,
                },
                infoslist: cachedStdInfoslist,
                blockData: {
                    algorslist: {
                        algor: filteredAlgors,
                    },
                    infoslist: cachedDscInfoslist,
                },
                meta: {
                    refreshInterval: POLLING_INTERVAL,
                },
            })

            logger?.debug?.(`[WSS] Сокет ${socket.id} успішно увійшов у кімнату ${roomName}`)
            checkAndTriggerPolling()
        })

        // --- ПОДІЯ: САМОСТІЙНИЙ ВИХІД З КІМНАТИ ---
        socket.on('leave-api-room', ({ blockId, fragmentName }) => {
            if (!blockId || !fragmentName) {
                logger?.warn?.(`[WSS] Invalid leave attempt from ${socket.id}`)
                return
            }

            const roomName = `ios:${blockId}:${fragmentName}`

            // 1. Клієнт залишає кімнату
            socket.leave(roomName)
            logger?.info?.(`[WSS] Socket ${socket.id} left room ${roomName}`)

            //
            scheduleRoomCleanup(roomName)
        })

        // --- ПОДІЯ: РОЗРИВ З'ЄДНАННЯ ---
        // Вихід з кімнати або розрив з'єднання (disconnecting / close)
        socket.on('disconnecting', () => {
            // Перевіряємо кожну кімнату, де був сокет
            socket.rooms.forEach((roomName) => {
                // Пропускаємо власну кімнату сокета (вона завжди дорівнює socket.id)
                if (roomName === socket.id) return

                // Оскільки сокет ще всередині кімнати, викликаємо очищення таймаутом,
                // але передаємо команду перевірити кімнату ВЖЕ ПІСЛЯ завершення поточного синхронного циклу,
                // коли гарантовано видалить цей сокет з адаптера.
                setImmediate(() => {
                    scheduleRoomCleanup(roomName)
                })
            })
        })

        // socket.on('disconnect', () => {
        //     logger?.info?.(`[WSS] Client disconnected: ${socket.id}`)
        // })
    })

    // //
    // setInterval(() => {
    //     const totalOnline = nsp.sockets.size
    //     const nspRooms = nsp.adapter.rooms
    //     console.log(123, totalOnline, nspRooms, rooms, `[${new Date().toISOString()}]`)
    // }, 1000 * 10)
}
