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
    const POLLING_INTERVAL = 1000 * 4
    let pollingTimeoutId = null

    // rooms: roomName => { config, cleanupTimer, cache, lastInfos }
    const rooms = new Map()

    // // !-----------------------------------------
    // // roomConfigs: roomName => { blockId, fragmentName, ids }
    // const roomConfigs = new Map()

    // // Мапа для зберігання таймерів видалення
    // const cleanupTimers = new Map()

    // // globalCache: id => payload
    // let globalCache = new Map()

    // // blockId => infoslist_object
    // let lastInfos = new Map()

    // /**
    //  * Очищення кешу від застарілих ID параметрів, які більше ніхто не дивиться
    //  * @private
    //  */
    // const cleanCache = (activeIds) => {
    //     const activeIdsSet = new Set(activeIds)
    //     for (const id of globalCache.keys()) {
    //         if (!activeIdsSet.has(id)) {
    //             globalCache.delete(id)
    //         }
    //     }
    // }

    // /**
    //  * РЕКУРСИВНИЙ АСИНХРОННИЙ ПУЛІНГ ЗОВНІШНЬОГО API
    //  */
    // const startPolling = async () => {
    //     try {
    //         // 2. Якщо кімнат немає — скидаємо прапорець, чистимо таймер і зупиняємо рекурсію
    //         if (roomConfigs.size === 0) {
    //             logger?.info?.('[WSS] Немає активних кімнат. Зупинка пулінгу.')
    //             isPollingActive = false

    //             if (pollingTimeoutId) {
    //                 clearTimeout(pollingTimeoutId)
    //                 pollingTimeoutId = null
    //             }

    //             if (globalCache.size > 0) globalCache.clear()
    //             return
    //         }

    //         // 1. Групуємо унікальні ідентифікатори датчиків по енергоблоках (blockId),
    //         // щоб не робити дублюючі HTTP запити на однакові параметри
    //         const groups = new Map()
    //         const allActiveIds = []

    //         for (const { blockId, fragmentName, ids, fullIdens } of roomConfigs.values()) {
    //             // Ключ групування: "blockId:fragmentName"
    //             const groupKey = `${blockId}`

    //             if (!groups.has(groupKey)) {
    //                 groups.set(groupKey, {
    //                     blockId,
    //                     fragmentName,
    //                     ids: new Set(),
    //                     fullIdens: new Set(),
    //                 })
    //             }

    //             const currentGroup = groups.get(groupKey)

    //             if (Array.isArray(ids)) {
    //                 ids.forEach((id) => {
    //                     currentGroup.ids.add(id)
    //                     allActiveIds.push(id)
    //                 })
    //             }

    //             if (Array.isArray(fullIdens)) {
    //                 fullIdens.forEach((fIden) => currentGroup.fullIdens.add(fIden))
    //             }
    //         }

    //         // Helper для безпечного парсингу стандартних параметрів з getValue
    //         const extractStandardParams = (response) => {
    //             const rawParams = response?.paramslist?.param
    //             return Array.isArray(rawParams) ? rawParams : rawParams ? [rawParams] : []
    //         }

    //         // 2. Паралельне виконання запитів для кожної групи
    //         const fetchPromises = Array.from(groups.values()).map(async (group) => {
    //             try {
    //                 const uniqueIds = Array.from(group.ids)
    //                 const bodyPayload = Array.from(group.fullIdens)

    //                 const requests = []

    //                 if (uniqueIds.length > 0) {
    //                     requests.push(apiService.getValue(group.blockId, uniqueIds))
    //                 } else {
    //                     requests.push(Promise.resolve(null))
    //                 }

    //                 if (bodyPayload.length > 0) {
    //                     requests.push(apiService.getDiscretParamsState(group.blockId, bodyPayload))
    //                 } else {
    //                     requests.push(Promise.resolve(null))
    //                 }

    //                 // // Звертаємося до IosService
    //                 // const rawResponse = await apiService.getValue(group.blockId, uniqueIds)

    //                 // // Нормалізація: якщо там "" або undefined, робимо порожній масив []
    //                 // const rawParams = rawResponse?.paramslist?.param
    //                 // const params = Array.isArray(rawParams) ? rawParams : []
    //                 // //
    //                 // const infos = rawResponse?.infoslist

    //                 const [valueResponse, discretResponse] = await Promise.all(requests)
    //                 // Зберігаємо серверний час
    //                 const infos = valueResponse?.infoslist || discretResponse?.infoslist

    //                 // Зберігаємо інфо для цього блоку
    //                 if (infos) {
    //                     lastInfos.set(group.blockId, infos)
    //                 }

    //                 // if (Array.isArray(params)) {
    //                 //     params.forEach((item) => {
    //                 //         if (item.iden) {
    //                 //             // Зберігаємо дані + додаємо час з infoslist до кожного елемента (опціонально)
    //                 //             globalCache.set(item.iden, {
    //                 //                 ...item,
    //                 //             })
    //                 //         }
    //                 //     })
    //                 // }

    //                 // // if (data && typeof data === 'object') {
    //                 // //     Object.entries(data).forEach(([id, payload]) => {
    //                 // //         globalCache.set(id, payload)
    //                 // //     })
    //                 // // }

    //                 // А) Записуємо стандартні параметри з getValue
    //                 const standardParams = extractStandardParams(valueResponse)
    //                 standardParams.forEach((item) => {
    //                     if (item && item.iden) {
    //                         globalCache.set(`std:${item.iden}`, {
    //                             ...item,
    //                         })
    //                     }
    //                 })

    //                 // Б) Обробляємо специфічний формат з getDiscretParamsState
    //                 const rawAlgors = discretResponse?.algorslist?.algor
    //                 const algors = Array.isArray(rawAlgors)
    //                     ? rawAlgors
    //                     : rawAlgors
    //                       ? [rawAlgors]
    //                       : []

    //                 algors.forEach((algorItem) => {
    //                     if (!algorItem.iden1) return

    //                     // 1. ВІДНОВЛЮЄМО ПОВНИЙ IDEN (як він був у DOM: Iden1[,Iden2[,Iden3]][=ALG])
    //                     const idParts = [algorItem.iden1]
    //                     if (algorItem.iden2) idParts.push(algorItem.iden2)
    //                     if (algorItem.iden3) idParts.push(algorItem.iden3)

    //                     let reconstructedIden = idParts.join(',')

    //                     // 2. ЗАПИСУЄМО В КЕШ ЗА ОРИГІНАЛЬНИМ ПОВНИМ КЛЮЧЕМ
    //                     // Важливо: записуємо state у item.value та item.status, як ви просили
    //                     globalCache.set(`dsc:${reconstructedIden}`, {
    //                         iden: reconstructedIden,
    //                         type: algorItem.type,
    //                         state: algorItem.state,
    //                     })
    //                 })
    //             } catch (fetchErr) {
    //                 logger?.error?.(
    //                     `[WSS] Fetch error for block ${group.blockId}: ${fetchErr.message}`,
    //                 )
    //             }
    //         })

    //         await Promise.all(fetchPromises)

    //         // 3. Розсилаємо свіжі дані конкретно в кожну кімнату відповідно до її підписки
    //         for (const [roomName, config] of roomConfigs.entries()) {
    //             // Збираємо стандартні параметри по чистим ids
    //             const standardData = (config.ids || [])
    //                 .map((id) => globalCache.get(`std:${id}`))
    //                 .filter((val) => val !== undefined && val !== null)

    //             // Збираємо дискретні параметри по повним fullIdens
    //             const discretData = (config.fullIdens || [])
    //                 .map((fIden) => globalCache.get(`dsc:${fIden}`))
    //                 .filter((val) => val !== undefined && val !== null)

    //             // Відправляємо дані, тільки якщо є хоча б один знайдений параметр
    //             // if (roomData.length > 0) {
    //             nsp.to(roomName).emit('fragment-data-update', {
    //                 paramslist: {
    //                     param: standardData,
    //                 },
    //                 discretslist: {
    //                     param: discretData,
    //                 },
    //                 infoslist: lastInfos.get(config.blockId) || {},
    //                 meta: {
    //                     refreshInterval: POLLING_INTERVAL,
    //                 },
    //             })
    //             // }
    //         }

    //         // Чистимо кеш від параметрів, підписки на які вже видалено
    //         const allPrefixedActiveIds = [
    //             ...allActiveIds.map((id) => `std:${id}`),
    //             ...allActiveIds.map((id) => `dsc:${id}`),
    //         ]
    //         cleanCache(allPrefixedActiveIds)
    //     } catch (err) {
    //         logger?.error?.(`[WSS External API] Polling Error: ${err.message}`)
    //     } finally {
    //         // Рекурсивний виклик гарантує, що наступний пулінг почнеться строго через n сек ПІСЛЯ завершення попереднього запиту

    //         // 3. Перед плануванням нового таймера очищаємо старий (про всяк випадок)
    //         if (pollingTimeoutId) clearTimeout(pollingTimeoutId)

    //         // Плануємо наступний крок тільки якщо пулінг досі має бути активним
    //         if (isPollingActive || pollingTimeoutId !== null) {
    //             pollingTimeoutId = setTimeout(startPolling, POLLING_INTERVAL)
    //         }
    //     }
    // }

    // // // Запуск циклу
    // // startPolling()

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
            `[WSS] Нове захищене з'єднання: ${socket.id} (Користувач: ${socket.user?.userLogin || 'Unknown'})`,
        )

        // Ініціація першого пулінгу, якщо кімнат не було, а зараз з'явилася перша підписка
        const checkAndTriggerPolling = () => {
            // Запускаємо тільки якщо є кімнати І пулінг ще НЕ активний
            if (roomConfigs.size > 0 && !pollingTimeoutId) {
                logger?.info?.('[WSS] Виявлено першу активну кімнату. Запуск конвеєра пулінгу...')
                startPolling()
            }
        }

        // Клієнт підписується на конкретний мнемосхему/фрагмент
        socket.on('join-api-room', ({ blockId, fragmentName, ids, blockIdsArray }) => {
            if (!blockId || !fragmentName || !Array.isArray(ids)) {
                logger?.warn?.(`[WSS] Invalid join attempt from ${socket.id}`)
                return
            }

            const roomName = `ios:${blockId}:${fragmentName}`

            // Дані кімнати
            const room = rooms.get(roomName)

            // Якщо кімната планувалася на видалення, скасовуємо таймер руйнування сесії пулінгу
            if (cleanupTimers.has(roomName)) {
                clearTimeout(cleanupTimers.get(roomName))
                cleanupTimers.delete(roomName)
                logger?.debug?.(
                    `[WSS] Очищення скасовано. Перевикористовуємо пулінг для кімнати ${roomName}`,
                )
            }

            // Клієнт може бути підписаний на кілька кімнат одночасно
            socket.join(roomName)

            // Зберігаємо/оновлюємо конфігурацію опитування для цієї кімнати
            roomConfigs.set(roomName, {
                blockId,
                fragmentName,
                ids,
                fullIdens,
            })

            // Миттєво віддаємо клієнту дані з кешу, щоб він не чекав 2 секунди попереднього пулінгу (якщо вони є)
            const immediateData = ids
                .map((id) => globalCache.get(id))
                .filter((val) => val !== undefined && val !== null)

            if (immediateData.length > 0) {
                socket.emit('fragment-data-update', {
                    paramslist: {
                        param: immediateData,
                    },
                    infoslist: lastInfos.get(blockId) || {},
                    meta: {
                        refreshInterval: POLLING_INTERVAL,
                    },
                })
            }

            logger?.debug?.(`[WSS] Сокет ${socket.id} успішно увійшов у кімнату ${roomName}`)
            checkAndTriggerPolling()
        })

        // Клієнт самостійно відписується від фрагмента
        socket.on('leave-api-room', ({ blockId, fragmentName }) => {
            if (!blockId || !fragmentName) {
                logger?.warn?.(`[WSS] Invalid leave attempt from ${socket.id}`)
                return
            }

            const roomName = `ios:${blockId}:${fragmentName}`

            // 1. Клієнт залишає кімнату в Socket.IO
            socket.leave(roomName)
            logger?.info?.(`[WSS] Socket ${socket.id} left room ${roomName}`)

            // 2. Перевіряємо, чи залишився хтось у цій кімнаті
            const room = nsp.adapter.rooms.get(roomName)
            const hasRemainingUsers = room && room.size > 0

            // 3. Якщо кімната порожня, плануємо її повне очищення
            if (!hasRemainingUsers && roomConfigs.has(roomName)) {
                // Уникаємо дублювання таймерів
                if (!cleanupTimers.has(roomName)) {
                    logger?.debug?.(`[WSS] Room ${roomName} is empty. Scheduling cleanup...`)

                    const timer = setTimeout(() => {
                        // Подвійна перевірка перед видаленням (на випадок, якщо хтось зайшов в останню секунду)
                        const currentRoom = nsp.adapter.rooms.get(roomName)
                        if (!currentRoom || currentRoom.size === 0) {
                            roomConfigs.delete(roomName)
                            cleanupTimers.delete(roomName)
                            logger?.info?.(
                                `[WSS] Room ${roomName} successfully cleaned up (polling stopped).`,
                            )
                        }
                    }, 1000 * 10) // секунд затримки перед зупинкою опитування (можна налаштувати)

                    cleanupTimers.set(roomName, timer)
                }
            }
        })

        // Вихід з кімнати або розрив з'єднання (disconnecting / close)
        socket.on('disconnecting', () => {
            // Перевіряємо кожну кімнату, де був сокет
            socket.rooms.forEach((roomName) => {
                // Пропускаємо власну кімнату сокета (вона завжди дорівнює socket.id)
                if (roomName === socket.id) return

                const room = nsp.adapter.rooms.get(roomName)

                // Якщо в кімнаті був лише 1 учасник (цей сокет), і ми її моніторили
                if (room && room.size <= 1 && roomConfigs.has(roomName)) {
                    // roomConfigs.delete(roomName)
                    // logger?.debug?.(`[WSS] Room ${roomName} is empty. Polling stopped.`)

                    // Якщо для цієї кімнати вже заплановано видалення — ігноруємо
                    if (cleanupTimers.has(roomName)) return

                    logger?.debug?.(
                        `[WSS] Last client disconnecting from ${roomName}. Scheduling cleanup...`,
                    )

                    // Встановлюємо затримку (наприклад, 10 секунд)
                    const timer = setTimeout(() => {
                        // ПЕРЕВІРКА: чи не зайшов хтось у кімнату за цей час?
                        const currentRoom = nsp.adapter.rooms.get(roomName)

                        if (!currentRoom || currentRoom.size === 0) {
                            const config = roomConfigs.get(roomName)

                            roomConfigs.delete(roomName)
                            cleanupTimers.delete(roomName)

                            logger?.info?.(
                                `[WSS] Room ${roomName} cleanup finished. Polling stopped.`,
                            )
                        } else {
                            logger?.debug?.(
                                `[WSS] Cleanup cancelled: Room ${roomName} is active again.`,
                            )
                            cleanupTimers.delete(roomName)
                        }
                    }, 1000 * 10) // 10 секунд "пільгового" періоду

                    cleanupTimers.set(roomName, timer)
                }
            })
        })

        // socket.on('disconnect', () => {
        //     logger?.info?.(`[WSS] Client disconnected: ${socket.id}`)
        // })
    })

    // setInterval(() => {
    //     const totalOnline = nsp.sockets.size // або метод вашого Server.js
    //     const rooms = nsp.adapter.rooms
    //     console.log(123, totalOnline, roomConfigs, rooms)
    // }, 1000 * 10)
}
