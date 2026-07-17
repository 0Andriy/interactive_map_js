import express from 'express'

/**
 * Допоміжна функція для рендерингу сторінок через Layout.
 * Оскільки стандартний EJS не підтримує блоки автоматично,
 * ми рендеримо контент сторінки, а потім вставляємо його в макет.
 */
const renderWithLayout = (req, res, view, locals = {}) => {
    // Забороняємо браузеру кешувати цей SSR HTML
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')

    //
    // Формуємо протокол (враховуємо проксі, наприклад, Heroku/Nginx)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol
    // Формуємо хост вашого сервера
    const host = req.get('host')

    const myServerUrl = `${protocol}://${host}`

    // `pages/${view}`
    res.render(view, locals, (err, html) => {
        if (err) {
            console.error('Помилка рендерингу:', err)
            return res.status(500).send('Помилка генерації сторінки')
        }
        // Передаємо відрендерений HTML сторінки в змінну 'body' для layout.ejs
        res.render('layout', {
            ...locals,
            // myServerUrl: myServerUrl, // Передаємо повний базовий URL нашого сервера
            body: html,
        })
    })
}

//
const getCurrentUserContext = (req) => {
    // console.log(111111, req.user, req)

    const user = req?.user || req?.context?.user

    const data = {
        name: user?.name || 'Anonymous',
        login: user?.login || null,
        email: '',
        avatar: null,
    }

    return data
}

//
export default function createWebRoutes({ authModule, iosModule }) {
    const router = express.Router()
    // Посилання на Guard для веб сторінок
    const guard = authModule.guard

    // <------------------------------------------------------------------>

    // Login
    router.get('/login', guard.clearSessionOnLoginOpen, async (req, res) => {
        // РЕНДЕРИМО СТОРІНКУ
        renderWithLayout(req, res, 'pages/login', {
            title: 'Аутентифікація користувача',
            //
            showHeader: false,
            showLeftSidebar: false,
            showRightSidebar: false,
            showFooter: false,
        })
    })

    // Головна сторінка
    router.get('/', guard.authenticatePages, async (req, res) => {
        // Рендеремо сторінку
        renderWithLayout(req, res, 'pages/home', {
            title: 'Головна',
            //
            showHeader: true,
            user: getCurrentUserContext(req),
            //
            showLeftSidebar: true,
            showRightSidebar: false,
            showFooter: false,
        })
    })

    // (IOS-Fragments (VEGA))

    router.get('/fragments', guard.authenticatePages, async (req, res) => {
        const units = [
            { id: 1, name: 'Блок №1' },
            { id: 2, name: 'Блок №2' },
        ]

        // const fragments = [
        //     { id: 'gvp.png', label: 'Живлення власних потреб', unitIds: [1, 2] },
        //     {
        //         id: 'vru.png',
        //         label: 'Відкрита розподільча установка 330кВ, 750кВ',
        //         unitIds: [1, 2],
        //     },
        //     { id: 'h00n.png', label: 'Другий контур', unitIds: [1] },
        //     { id: 'то.png', label: 'Турбіне відділення', unitIds: [1] },
        //     { id: 'ро.png', label: 'Реакторне відділення', unitIds: [1, 2] },
        //     { id: 'h00r.png', label: 'Реакторне відділення n', unitIds: [1, 2] },
        //     { id: 'ya00m.png', label: 'Петлі', unitIds: [1, 2] },
        //     { id: 'пд_уд.png', label: 'Вузький діапазон', unitIds: [1, 2] },
        //     { id: 'кфб_з.png', label: 'Охолодження активної зони', unitIds: [1, 2] },
        //     { id: 'dТ_ТВС.png', label: 'Температурні перепади на ТВЗ', unitIds: [1, 2] },
        // ]

        // * Для списку
        // 1. Робемо паралельні запити та зберігаємо зв'язок з unit.id
        const fragmentsPromises = units.map(async (unit) => {
            try {
                const response = await iosModule.service.getFragmentsList(unit.id)
                // Беремо масив фрагментів з отриманої структури JSON
                const list = response?.fragmentslist?.fragment || []

                // Повертаємо фрагменти, маркуючи кожен поточним unitId
                return list.map((f) => ({ ...f, currentUnitId: unit.id }))
            } catch (error) {
                console.error(`Помилка завантаження для unit ${unit.id}:`, error)
                return [] // повертаємо порожній масив у разі помилки, щоб не ламати весь процес
            }
        })

        // 2. Чекаємо на завантаження всіх блоків
        const allResults = await Promise.all(fragmentsPromises)
        const flatFragments = allResults.flat() // Масив масивів в масив один (розпаковка)

        // 3. Групуємо фрагменти за допомогою Map та поля iden
        const fragmentsMap = new Map()

        flatFragments.forEach((item) => {
            const key = item.iden

            if (fragmentsMap.has(key)) {
                // Якщо такий фрагмент уже є, додаємо новий unitId в масив (якщо його там немає)
                const existing = fragmentsMap.get(key)
                if (!existing.unitIds.includes(item.currentUnitId)) {
                    existing.unitIds.push(item.currentUnitId)
                }
            } else {
                // Створюємо новий елемент у структурі
                fragmentsMap.set(key, {
                    id: item.iden, // або item.id, якщо він є в об'єкті
                    name: item.name,
                    label: `${item.iden} - ${item.name}`,
                    unitIds: [item.currentUnitId],
                })
            }
        })

        // 4. Фінальний масив для вашого рендерингу
        const fragments = Array.from(fragmentsMap.values())

        // * Для дерева
        // 1. Головна функція для збору та обробки дерев з усіх юнітів
        async function buildTechnicalTree(units) {
            // Робемо паралельні запити для кожного unit.id
            const treePromises = units.map(async (unit) => {
                try {
                    const response = await iosModule.service.getFragmentsTree(unit.id)
                    const rootBranch = response?.fragmentstree?.branch || []

                    // Перетворюємо початкове дерево цього юніта у потрібний формат
                    return transformAndMarkTree(rootBranch, unit.id)
                } catch (error) {
                    console.error(`Помилка завантаження дерева для unit ${unit.id}:`, error)
                    return [] // У разі помилки повертаємо порожнє дерево, щоб продовжити роботу
                }
            })

            // Чекаємо на завантаження усіх дерев
            const allTrees = await Promise.all(treePromises)

            // Об'єднуємо масив окремих дерев в одне спільне дерево
            const finalTree = mergeForest(allTrees)

            return finalTree
        }

        // 2. Рекурсивна функція для первинної трансформації ключів та маркування unitId
        function transformAndMarkTree(branch, unitId) {
            // 1. Нормалізація: перетворюємо одиночний об'єкт на масив з одним елементом
            const branchArray = Array.isArray(branch) ? branch : branch ? [branch] : []

            if (branchArray.length === 0) return []

            return branchArray.map((node) => {
                const result = {}

                // Визначаємо id та label залежно від того, вузол це чи кінцевий фрагмент
                if (node.nodeiden) {
                    result.id = node.nodeiden
                    result.label = `${node.nodeiden} - ${node.nodename || ''}`
                } else if (node.fragmentiden) {
                    result.id = node.fragmentiden
                    result.label = `${node.fragmentiden} - ${node.fragmentname || ''}`
                } else {
                    result.id = 'unknown'
                    result.label = 'Невідомий вузол'
                }

                // Додаємо dataset з масивом поточного unitId
                result.dataset = {
                    unitIds: [unitId],
                }

                // Рекурсивно обробляємо вкладені гілки branch -> children
                if (node.branch) {
                    result.children = transformAndMarkTree(node.branch, unitId)
                }

                return result
            })
        }

        // 3. Рекурсивна функція для злиття (мержу) кількох дерев в одне без дублікатів id
        function mergeForest(forest) {
            const mergedMap = new Map()

            // Перебираємо кожне дерево з лісу
            forest.forEach((tree) => {
                tree.forEach((node) => {
                    if (mergedMap.has(node.id)) {
                        // Якщо такий id вже існує у дереві, об'єднуємо дані
                        const existingNode = mergedMap.get(node.id)

                        // Об'єднуємо масиви unitIds, виключаючи дублікати
                        node.dataset.unitIds.forEach((id) => {
                            if (!existingNode.dataset.unitIds.includes(id)) {
                                existingNode.dataset.unitIds.push(id)
                            }
                        })

                        // Якщо у обох вузлів є діти, рекурсивно об'єднуємо їх теж
                        if (node.children || existingNode.children) {
                            const childrenForest = [
                                existingNode.children || [],
                                node.children || [],
                            ]
                            existingNode.children = mergeForest(childrenForest)
                        }
                    } else {
                        // Якщо id унікальний, глибоко копіюємо вузол, щоб не псувати початкові дані
                        const nodeCopy = {
                            ...node,
                            dataset: { unitIds: [...node.dataset.unitIds] },
                        }
                        if (node.children) {
                            nodeCopy.children = mergeForest([node.children])
                        }
                        mergedMap.set(node.id, nodeCopy)
                    }
                })
            })

            // Повертаємо результат у вигляді масиву об'єктів для Tree компонента
            return Array.from(mergedMap.values())
        }

        /**
         * Функція фільтрації дерева
         * @param {Array} nodes - масив вузлів дерева
         * @param {Function} predicate - умова фільтрації (повертає true/false)
         */
        function filterTree(nodes, targetIds) {
            return nodes
                .map((node) => {
                    // Перевіряємо, чи підходить сам поточний елемент
                    const matchesCondition = targetIds.includes(node.id)

                    // Якщо сам елемент ПІДХОДИТЬ, ми повертаємо його копію з УСІМА оригінальними дітьми
                    if (matchesCondition) {
                        return { ...node }
                    }

                    // Якщо сам елемент НЕ підходить, ми рекурсивно шукаємо потрібні ID серед його дітей
                    const filteredChildren = node.children
                        ? filterTree(node.children, targetIds)
                        : []

                    // Якщо хоч один з нащадків підійшов, залишаємо цього батька, але лише з відфільтрованими дітьми
                    if (filteredChildren.length > 0) {
                        return {
                            ...node,
                            children: filteredChildren,
                        }
                    }

                    return null
                })
                .filter(Boolean) // Видаляємо пусті елементи (null)
        }

        let fragmentsTree = await buildTechnicalTree(units)

        // ! Для НАЕК щоб не показувати все а лише їх гілку
        // // fragmentsTree = fragmentsTree.filter((item) => item.id === 'НАЕК')
        // fragmentsTree = filterTree(fragmentsTree, ['НАЕК', 'ПАМС'])

        // Рендеремо сторінку
        renderWithLayout(req, res, 'pages/fragments', {
            title: 'Фрагменти',
            //
            showHeader: true,
            user: getCurrentUserContext(req),
            //
            showLeftSidebar: true,
            showRightSidebar: false,
            showFooter: false,
            //
            units: units,
            fragments: fragments,
            fragmentsTree: fragmentsTree,
        })
    })

    //
    return router
}

// // Допоміжна функція (auth.middleware.js) щоб сторінки були не публічними
// export const ensureAuthenticated = (req, res, next) => {
//     // 1. Логіка перевірки (можна адаптувати під Passport.js, JWT або Sessions)
//     const isAuthenticated = req.session?.user || req.cookies?.token || req.isAuthenticated?.()

//     if (isAuthenticated) {
//         return next() // Користувач є — пропускаємо далі
//     }

//     // 2. Обробка для API запитів (fetch/ajax)
//     // Якщо запит іде до /api або має заголовок X-Requested-With
//     if (req.xhr || req.path.startsWith('/api') || req.headers.accept?.includes('json')) {
//         return res.status(401).json({
//             status: 'error',
//             code: 'UNAUTHORIZED',
//             message: 'Сесія завершилася. Будь ласка, увійдіть знову.',
//         })
//     }

//     // 3. Обробка для звичайних переходів у браузері
//     // Зберігаємо URL, на який хотів потрапити користувач, щоб повернути його туди після логіну
//     const returnTo = req.originalUrl
//     res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`)
// }

// // Перевірку ролі
// export const authorize = (role) => {
//     return (req, res, next) => {
//         if (req.session?.user?.role !== role) {
//             return res.status(403).render('pages/error', {
//                 message: 'У вас немає прав доступу до цієї секції',
//             })
//         }
//         next()
//     }
// }
