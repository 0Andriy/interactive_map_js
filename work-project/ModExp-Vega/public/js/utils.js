/**
 * ============================================================================
 * ТЕМА 1: КОНТРОЛЬ ЧАСТОТИ ВИКЛИКІВ (ПРОДУКТИВНІСТЬ)
 * ============================================================================
 */

/**
 * REQUEST ANIMATION FRAME THROTTLE (rafThrottle)
 * Обмежує виклик функції частотою оновлення екрана (зазвичай 60Hz/120Hz).
 *
 * КОЛИ ВИКОРИСТОВУВАТИ:
 * - Для плавних візуальних змін у DOM (анімації, рух миші, ResizeObserver для Canvas/SVG).
 * - Коли функція виконує легкі CSS/DOM маніпуляції, які мають миттєво відображатися.
 *
 * ПЕРЕВАГИ: Синхронізовано з графічним рушієм браузера. Немає штучних затримок (0 мс).
 *
 * @param {Function} fn - Функція, яку треба оптимізувати
 * @returns {Function} - Оптимізована функція з методом .cancel()
 */
export function rafThrottle(fn) {
    let animationFrameId = null

    const throttled = function (...args) {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId)
        }

        animationFrameId = requestAnimationFrame(() => {
            fn.apply(this, args)
            animationFrameId = null
        })
    }

    // Метод для ручного скасування (запобігає витоку пам'яті при видаленні елемента)
    throttled.cancel = () => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId)
            animationFrameId = null
        }
    }

    return throttled
}

/**
 * DEBOUNCE (Усунення брязкоту)
 * Відкладає виклик функції доти, доки з моменту останнього виклику не мине вказаний час.
 *
 * КОЛИ ВИКОРИСТОВУВАТИ:
 * - "Важкий" resize: якщо при зміні розміру екрана треба робити Fetch-запити або повністю перемальовувати складні графіки.
 * - Живий пошук (швидке введення тексту в <input>). Чекаємо, поки користувач додрукує, і лише тоді відправляємо запит.
 * - Валідація форм на льоту.
 *
 * ПЕРЕВАГИ: Функція виконається рівно ОДИН раз — в самому кінці серії швидких подій.
 *
 * @param {Function} fn - Функція, яку треба виконати
 * @param {number} delay - Затримка в мілісекундах
 * @returns {Function} - Оптимізована функція з методом .cancel()
 */
export function debounce(fn, delay = 200) {
    let timeoutId = null

    const debounced = function (...args) {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }

        timeoutId = setTimeout(() => {
            fn.apply(this, args)
            timeoutId = null
        }, delay)
    }

    // Метод для очищення таймера
    debounced.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
        }
    }

    return debounced
}

/**
 * CLASSIC THROTTLE (Обмежувач частоти)
 * Гарантує, що функція буде викликатися НЕ ЧАСТІШЕ ніж один раз на вказаний проміжок часу (наприклад, раз на 300 мс).
 *
 * КОЛИ ВИКОРИСТОВУВАТИ:
 * - Нескінченний скрол (Infinite Scroll) або відстеження прокрутки сторінки (window.onscroll), коли треба перевіряти координати, але не кожні 2 мілісекунди.
 * - Спам-кліки по кнопках (відправка форми, лайки).
 * - Відстеження переміщення курсора (mousemove), якщо логіка всередині важка для rAF.
 *
 * ПЕРЕВАГИ: На відміну від Debounce, функція НЕ чекає повної зупинки дій, а стабільно виконується в процесі з фіксованим інтервалом.
 *
 * @param {Function} fn - Функція, яку треба обмежити
 * @param {number} limit - Інтервал у мілісекундах
 * @returns {Function} - Оптимізована функція
 */
export function throttle(fn, limit = 200) {
    let inThrottle = false

    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args)

            inThrottle = true
            setTimeout(() => {
                inThrottle = false
            }, limit)
        }
    }
}

/**
 * ============================================================================
 * ТЕМА 2: МЕРЕЖА ТА АСИНХРОННІСТЬ (ASYNC/FETCH)
 * ============================================================================
 */

/**
 * DELAY (Асинхронна пауза)
 * Робить штучну паузу в асинхронному коді.
 * КОЛИ: Для тестів лоадерів, або при повторних спробах запиту (retry) до сервера.
 */
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * FETCH WITH TIMEOUT
 * Робить звичайний fetch, але обриває запит, якщо сервер не відповідає за вказаний час.
 * КОЛИ: Захист додатку від "завислих" запитів на слабкому мобільному інтернеті.
 *
 * @param {string} url
 * @param {Object} options
 * @param {number} timeout - Максимальний час очікування в мс (дефолт 8000)
 */
export async function fetchWithTimeout(url, options = {}, timeout = 8000) {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        })
        clearTimeout(id)
        return response
    } catch (error) {
        clearTimeout(id)
        throw error // Поверне DOMException з іменем 'AbortError' у разі таймауту
    }
}

/**
 * FETCH WITH RETRY (Розумні повторні запити)
 * Якщо запит до сервера впав (наприклад, моргнув інтернет), функція автоматично
 * повторить спробу кілька разів із наростаючою затримкою.
 * КОЛИ: Для критично важливих даних (завантаження конфігурації схеми, статусів).
 *
 * @param {string} url
 * @param {Object} options
 * @param {number} retries - Кількість спроб (дефолт 3)
 * @param {number} delayTime - Початкова затримка між спробами в мс (дефолт 1000)
 */
export async function fetchWithRetry(url, options = {}, retries = 3, delayTime = 1000) {
    try {
        const response = await fetch(url, options)
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
        return response
    } catch (error) {
        if (retries <= 1) throw error
        console.warn(
            `Запит впав. Повторна спроба через ${delayTime}мс... Залишилось спроб: ${retries - 1}`,
        )
        // Штучна пауза перед наступним запитом
        await new Promise((resolve) => setTimeout(resolve, delayTime))
        // Рекурсивно викликаємо з меншою кількістю спроб та подвоєною затримкою (Exponential backoff)
        return fetchWithRetry(url, options, retries - 1, delayTime * 2)
    }
}

/**
 * ============================================================================
 * ТЕМА 3: ДОПОМІЖНІ UI-УТИЛІТИ (DOM / UX)
 * ============================================================================
 */

/**
 * SECURE COPY TO CLIPBOARD
 * Безпечно копіює текст у буфер обміну. Працює у старих і нових браузерах.
 * КОЛИ: Кнопки "Скопіювати токен/лінк/ідентифікатор" в інтерфейсі.
 */
export async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return true
    } else {
        // Фоллбек для старих браузерів або HTTP-оточення
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        try {
            document.execCommand('copy')
            textArea.remove()
            return true
        } catch (error) {
            textArea.remove()
            return false
        }
    }
}

/**
 * CREATING INTERSECTION OBSERVER (Lazy Loading / Анімації появи)
 * Створює швидке відстеження появи елемента на екрані з можливістю одноразового спрацьовування.
 * КОЛИ: Lazy-loading зображень (з once: true), запуск анімації блоку при скролі, підвантаження даних.
 *
 * @param {HTMLElement} element - Елемент, за яким стежимо
 * @param {Function} callback - Що зробити, коли елемент з'явився (приймає entry та функцію unobserve)
 * @param {Object} options - Налаштування відступу (rootMargin, threshold) + прапорець `once`
 * @param {boolean} options.once - Якщо true, припинить стеження після першого появи (дефолт: false)
 * @returns {Function} - Функція для ручного скасування стеження (disconnect)
 */
export function observeVisibility(element, callback, options = {}) {
    // Витягуємо нашу кастомну опцію once, а решту (root, rootMargin, threshold) передаємо в API
    const { once = false, ...observerOptions } = options

    // 1. Створюємо екземпляр обсервера
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            // isIntersecting стає true, коли елемент зайшов у зону видимості (в екрані)
            // і false, коли елемент повністю вийшов за межі екрана
            if (entry.isIntersecting) {
                // Викликаємо колбек і передаємо туди entry, а також функцію для ручного зняття трекеру
                callback(entry, () => observer.unobserve(element))

                // Якщо активовано режим "одноразово" — одразу знімаємо стеження з цього елемента
                if (once) {
                    observer.unobserve(element)
                }
            } else {
                // Якщо елемент вийшов з екрана, теж викликаємо колбек (корисно для розумних пауз)
                // Але тільки якщо once = false, бо для lazy load подія виходу не потрібна
                if (!once) {
                    callback(entry)
                }
            }
        })
    }, options) // Передаємо конфігурацію (відступи, чутливість)

    // 2. Наказуємо обсерверу почати стеження за конкретним HTML-елементом
    observer.observe(element)

    // 3. Повертаємо функцію відписки, щоб уникнути витоку пам'яті
    return () => observer.disconnect()
}

/**
 * ============================================================================
 * ТЕМА 4: РОБОТА З ДАНИМИ (DATA UTILS)
 * ============================================================================
 */

/**
 * DEEP CLONE (Глибоке клонування об'єктів та масивів)
 * Створює 100% чисту копію об'єкта без збереження посилань на оригінал.
 * КОЛИ: Коли треба змінити дані, але не можна мутувати оригінальний стейт.
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj

    // Використовуємо супер-сучасний вбудований метод, якщо він є в браузері
    if (typeof structuredClone === 'function') {
        return structuredClone(obj)
    }

    // Надійний швидкий фоллбек (не копіює методи-функції, але ідеальний для JSON-структур)
    return JSON.parse(JSON.stringify(obj))
}

/**
 * GENERATE UNIQUE ID
 * Генерує швидкий випадковий ID без підключення важких бібліотек типу UUID.
 * КОЛИ: Треба додати унікальний `key` для рендерингу списку або унікальний id для тегу <input>.
 */
export function generateId(prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).substring(2, 9)}-${Date.now().toString(36)}`
}

/**
 * ESCAPE HTML
 * Захищає додаток від XSS-атак (впровадження шкідливого коду через інпути).
 * Перетворює символи типу < та > на безпечні сутності.
 * КОЛИ: Коли ви вставляєте текст від користувача в HTML через `.innerHTML`.
 */
export function escapeHtml(string) {
    const matchHtmlRegExp = /["'&<>]/
    const str = '' + string
    const match = matchHtmlRegExp.exec(str)

    if (!match) return str

    let escape
    let html = ''
    let index = 0
    let lastIndex = 0

    for (index = match.index; index < str.length; index++) {
        switch (str.charCodeAt(index)) {
            case 34:
                escape = '&quot;'
                break // "
            case 38:
                escape = '&amp;'
                break // &
            case 39:
                escape = '&#39;'
                break // '
            case 60:
                escape = '&lt;'
                break // <
            case 62:
                escape = '&gt;'
                break // >
            default:
                continue
        }

        if (lastIndex !== index) html += str.substring(lastIndex, index)
        lastIndex = index + 1
        html += escape
    }

    return lastIndex !== index ? html + str.substring(lastIndex, index) : html
}

/**
 * ============================================================================
 * ТЕМА 5: РОБОТА З ДАТАМИ ТА ЧАСОМ НА ОСНОВІ МАСОК
 * ============================================================================
 */

/**
 * Внутрішня утиліта для додавання провідних нулів (наприклад, 9 -> "09")
 */
const padZero = (num, targetLength = 2) => String(num).padStart(targetLength, '0')

/**
 * FORMAT DATE BY MASK
 * Форматує об'єкт Date (або таймстамп) у рядок відповідно до вказаної маски.
 *
 * ПІДТРИМУВАНІ ТОКЕНИ:
 * YYYY - Рік (4 цифри)   | MM   - Місяць (01-12)     | DD   - День місяця (01-31)
 * HH   - Години (00-23)  | mm   - Хвилини (00-59)    | ss   - Секунди (00-59)
 * SSS  - Мілісекунди (000-999)
 *
 * @param {Date|number|string} date - Дата для форматування
 * @param {string} mask - Маска (наприклад: "YYYY.MM.DD HH:mm:ss.SSS")
 * @returns {string} - Відформатований рядок
 */
export function formatDate(date, mask = 'YYYY.MM.DD HH:mm:ss') {
    const d = new Date(date)
    if (isNaN(d.getTime())) return '' // Якщо дата валідна, продовжуємо, інакше порожній рядок

    const replacements = {
        YYYY: d.getFullYear(),
        MM: padZero(d.getMonth() + 1),
        DD: padZero(d.getDate()),
        HH: padZero(d.getHours()),
        mm: padZero(d.getMinutes()),
        ss: padZero(d.getSeconds()),
        SSS: padZero(d.getMilliseconds(), 3),
    }

    // Замінюємо токени з маски на реальні значення
    return mask.replace(/YYYY|MM|DD|HH|mm|ss|SSS/g, (match) => replacements[match])
}

/**
 * PARSE DATE BY MASK
 * Перетворює рядок із датою назад в об'єкт Date, спираючись на структуру маски.
 * КОЛИ: Коли з сервера чи інпуту приходить специфічний рядок, і JS-івський `new Date()` не може його розпарсити.
 *
 * @param {string} dateString - Рядок з датою (наприклад: "2026.05.27 14:30:00")
 * @param {string} mask - Маска, за якою написаний цей рядок (наприклад: "YYYY.MM.DD HH:mm:ss")
 * @returns {Date|null} - Об'єкт Date або null, якщо формат порушено
 */
export function parseDate(dateString, mask) {
    if (!dateString || !mask || dateString.length !== mask.length) return null

    // Шукаємо позиції токенів у масці
    const yearIndex = mask.indexOf('YYYY')
    const monthIndex = mask.indexOf('MM')
    const dayIndex = mask.indexOf('DD')
    const hourIndex = mask.indexOf('HH')
    const minuteIndex = mask.indexOf('mm')
    const secondIndex = mask.indexOf('ss')
    const msIndex = mask.indexOf('SSS')

    // Витягуємо підрядки на основі знайдених індексів
    const year =
        yearIndex !== -1 ? parseInt(dateString.substr(yearIndex, 4), 10) : new Date().getFullYear()
    const month = monthIndex !== -1 ? parseInt(dateString.substr(monthIndex, 2), 10) - 1 : 0
    const day = dayIndex !== -1 ? parseInt(dateString.substr(dayIndex, 2), 10) : 1
    const hour = hourIndex !== -1 ? parseInt(dateString.substr(hourIndex, 2), 10) : 0
    const minute = minuteIndex !== -1 ? parseInt(dateString.substr(minuteIndex, 2), 10) : 0
    const second = secondIndex !== -1 ? parseInt(dateString.substr(secondIndex, 2), 10) : 0
    const ms = msIndex !== -1 ? parseInt(dateString.substr(msIndex, 3), 10) : 0

    const parsedDate = new Date(year, month, day, hour, minute, second, ms)

    return isNaN(parsedDate.getTime()) ? null : parsedDate
}

export class TimeHandler {
    constructor() {
        // Стандартна маска (mm - хвилини, SS - секунди, SSS - мілісекунди)
        this.defaultFormat = 'DD.MM.YYYY HH:mm:ss'

        // Карта відповідності токенів для парсингу (значення - регулярний вираз та функція очищення)
        this.parseTokens = {
            YYYY: { pattern: '\\d{4}', action: (d, v) => d.setFullYear(parseInt(v, 10)) },
            MM: { pattern: '\\d{2}', action: (d, v) => d.setMonth(parseInt(v, 10) - 1) },
            DD: { pattern: '\\d{2}', action: (d, v) => d.setDate(parseInt(v, 10)) },
            HH: { pattern: '\\d{2}', action: (d, v) => d.setHours(parseInt(v, 10)) },
            mm: { pattern: '\\d{2}', action: (d, v) => d.setMinutes(parseInt(v, 10)) },
            ss: { pattern: '\\d{2}', action: (d, v) => d.setSeconds(parseInt(v, 10)) },
            SSS: { pattern: '\\d{3}', action: (d, v) => d.setMilliseconds(parseInt(v, 10)) },
        }
    }

    /**
     * Додає провідні нулі
     */
    padZero(num, targetLength = 2) {
        return String(num).padStart(targetLength, '0')
    }

    /**
     * Форматує дату у рядок за маскою
     */
    format(date, mask = this.defaultFormat) {
        const d = new Date(date)
        if (isNaN(d.getTime())) return ''

        const map = {
            YYYY: d.getFullYear(),
            MM: this.padZero(d.getMonth() + 1),
            DD: this.padZero(d.getDate()),
            HH: this.padZero(d.getHours()),
            mm: this.padZero(d.getMinutes()),
            ss: this.padZero(d.getSeconds()),
            SSS: this.padZero(d.getMilliseconds(), 3),
        }

        // Безпечна заміна без збереження стану regex
        return mask.replace(/YYYY|MM|DD|HH|mm|ss|SSS/g, (match) => map[match])
    }

    /**
     * Парсить рядок у Date на основі маски
     */
    parse(dateString, mask = this.defaultFormat) {
        if (!dateString || !mask) return null

        // Екрануємо символи маски, які є службовими в Regex (наприклад ., -, /)
        let escapedMask = mask.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')

        // Знаходимо порядок токенів у масці
        const tokensInMask = []
        const tokenRegex = /YYYY|MM|DD|HH|mm|ss|SSS/g
        let match

        while ((match = tokenRegex.exec(mask)) !== null) {
            tokensInMask.push({ token: match[0], index: match.index })
        }

        // Створюємо динамічний регулярний вираз для зчитування значень
        let regexStr = escapedMask
        tokensInMask.forEach(({ token }) => {
            regexStr = regexStr.replace(token, `(${this.parseTokens[token].pattern})`)
        })

        const matcher = new RegExp(`^${regexStr}$`)
        const values = dateString.match(matcher)

        // Якщо рядок не відповідає структурі маски
        if (!values) return null

        // Створюємо базову дату (чистий день)
        const resultDate = new Date()
        resultDate.setHours(0, 0, 0, 0)

        // Застосовуємо знайдені частини до об'єкта Date
        tokensInMask.forEach(({ token }, index) => {
            const val = values[index + 1] // index + 1, бо values[0] - це весь рядок
            this.parseTokens[token].action(resultDate, val)
        })

        return isNaN(resultDate.getTime()) ? null : resultDate
    }
}

/**
 * ============================================================================
 * ТЕМА 6: ПРОДВИНУТИЙ МОНІТОРИНГ ТА КЕРУВАННЯ ПАМ'ЯТТЮ
 * ============================================================================
 */

/**
 * MEMOIZE (Кешування результатів функцій)
 * Зберігає результати виконання "важких" функцій. Якщо функція викликається
 * з тими самими аргументами, результат береться з кешу, а не рахується заново.
 * КОЛИ: Математичні перерахунки координат для SVG/Canvas схем, важкі калькуляції.
 */
export function memoize(fn) {
    const cache = new Map()

    return function (...args) {
        const key = JSON.stringify(args)

        if (cache.has(key)) {
            return cache.get(key)
        }

        const result = fn.apply(this, args)

        cache.set(key, result)

        return result
    }
}

/**
 * MEMOIZE WITH TTL (Декоратор кешування з часом життя)
 * Обгортка для функцій, яка кешує результат їхнього виконання на вказаний час (TTL).
 * Унікальність кешу вираховується автоматично на основі переданих аргументів.
 *
 * КОЛИ ВИКОРИСТОВУВАТИ:
 * - Для асинхронних запитів даних (API), які змінюються не дуже часто (наприклад, статуси пристроїв раз на 5-10с).
 * - Для важких математичних розрахунків, які треба оновлювати за інтервалом, а не при кожному рендері.
 *
 * @param {Function} fn - Функція, яку треба обгорнути (підтримує як звичайні, так і async функції)
 * @param {number} ttl - Час життя кешу в мілісекундах (за замовчуванням null - вічний хеш, 10000 мс / 10 секунд)
 * @returns {Function} - Обгорнута функція з методами .clearCache() та .deleteFromCache()
 */
export function memoizeWithTTL(fn, ttl = null) {
    // Внутрішнє сховище кешу для цієї конкретної функції
    const cache = new Map()

    // Сховище для таймаутів самоочищення
    const timeouts = new Map()

    /**
     * Рекурсивно сортує ключі об'єкта за алфавітом.
     * Гарантує, що {a:1, b:2} та {b:2, a:1} повернуть однаковий JSON-рядок.
     */
    function stabilize(value) {
        if (value === null || typeof value !== 'object') {
            return value
        }

        // Якщо це масив, сортуємо кожен його елемент
        if (Array.isArray(value)) {
            return value.map(stabilize)
        }

        // Якщо це об'єкт, дістаємо ключі, сортуємо їх і збираємо новий об'єкт
        return Object.keys(value)
            .sort()
            .reduce((result, key) => {
                result[key] = stabilize(value[key])
                return result
            }, {})
    }

    /**
     * Очищає конкретний запис у кеші та його таймер.
     */
    function removeKey(key) {
        cache.delete(key)

        if (timeouts.has(key)) {
            clearTimeout(timeouts.get(key))
            timeouts.delete(key)
        }
    }

    //
    const memoized = function (...args) {
        // Генеруємо унікальний ключ на основі аргументів функції
        const key = JSON.stringify(args.map(stabilize))
        const now = Date.now()

        // Перевіряємо наявність у кеші
        if (cache.has(key)) {
            const { value, expiresAt } = cache.get(key)

            // Перевірка TTL потрібна лише якщо expiresAt існує (не null)
            // Якщо час життя кешу ще не вичерпано — миттєво повертаємо результат
            if (expiresAt === null || now < expiresAt) {
                return value
            }

            // Якщо застарів — видаляємо
            cache.delete(key)
        }

        // Викликаємо оригінальну функцію та отримуємо результат
        const result = fn.apply(this, args)

        // Розраховуємо час видалення
        // Якщо ttl не передано (null), то й expiresAt буде null (вічний кеш)
        const expiresAt = ttl !== null ? now + ttl : null

        // Якщо функція асинхронна (повертає Promise), ми маємо обробити випадок її падіння
        if (result instanceof Promise) {
            // Кешуємо сам проміс, щоб паралельні однакові запити не створювали нових реквестів
            cache.set(key, { value: result, expiresAt })

            // Якщо проміс впав (помилка мережі), видаляємо його з кешу, щоб наступна спроба була чесною
            result.catch(() => {
                cache.delete(key)

                if (timeouts.has(key)) {
                    clearTimeout(timeouts.get(key))
                    timeouts.delete(key)
                }
            })
        } else {
            // Для звичайних синхронних функцій просто зберігаємо результат
            cache.set(key, { value: result, expiresAt })
        }

        // 2. АВТОМАТИЧНЕ САМООЧИЩЕННЯ З ПАМ'ЯТІ (якщо задано TTL)
        if (ttl !== null && ttl > 0) {
            if (timeouts.has(key)) clearTimeout(timeouts.get(key))

            const timeoutId = setTimeout(() => {
                cache.delete(key)
                timeouts.delete(key)
            }, ttl)

            timeoutId.unref?.() // Дозволяє Node.js коректно завершити процес при стопі сервера
            timeouts.set(key, timeoutId)
        }

        return result
    }

    // Додатковий метод: Повністю очистити кеш цієї функції
    memoized.clearCache = () => {
        cache.clear()
        timeouts.forEach((timeoutId) => clearTimeout(timeoutId))
        timeouts.clear()
    }

    // Додатковий метод: Видалити з кешу конкретний виклик за аргументами
    memoized.deleteFromCache = (...args) => {
        const key = JSON.stringify(args.map(stabilize))

        if (timeouts.has(key)) {
            clearTimeout(timeouts.get(key))
            timeouts.delete(key)
        }

        return cache.delete(key)
    }

    return memoized
}

/**
 * ============================================================================
 * ТЕМА 8: UX ТА ФОРМАТУВАННЯ ДАНИХ (UI HELPERS)
 * ============================================================================
 */

/**
 * FORMAT NUMBER (Красиве розділення тисяч)
 * Перетворює сирі числа типу 1250000.50 на зручні для читання: "1 250 000,5"
 * КОЛИ: Виведення великої кількості датчиків, лічильників, фінансових або технічних показників.
 */
export function formatNumber(number, decimals = 2) {
    if (number === null || number === undefined || isNaN(number)) return '0'
    return new Intl.NumberFormat('uk-UA', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    }).format(number)
}

/**
 * BYTES TO HUMAN READABLE (Розмір файлів)
 * Перетворює байти на Кб, Мб, Гб, Тб, Пб, Еб, Зб, Йб.
 * КОЛИ: Завантаження логів, схем, зображень, коли треба показати користувачу вагу файлу.
 */
export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes'

    // Обробка від'ємних чисел
    const isNegative = bytes < 0
    const absBytes = Math.abs(bytes)

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

    // Визначаємо індекс юніта, але обмежуємо його довжиною масиву
    const i = Math.min(Math.floor(Math.log(absBytes) / Math.log(k)), sizes.length - 1)

    // Форматуємо число та додаємо мінус, якщо воно було від'ємним
    const formattedValue = parseFloat((absBytes / Math.pow(k, i)).toFixed(dm))
    const sign = isNegative ? '-' : ''

    return `${sign}${formattedValue} ${sizes[i]}`
}

/**
 * ============================================================================
 * ТЕМА 9: РОЗУМНЕ КЕШУВАННЯ ТА РОБОТА ЗІ СХОВИЩЕМ (STORAGE & TTL CACHE)
 * ============================================================================
 */

/**
 * STORAGE MANAGER (Безпечна обгортка над LocalStorage / SessionStorage)
 * Автоматично перетворює об'єкти/масиви в JSON і назад. Захищає від збоїв,
 * якщо користувач вимкнув cookies або пам'ять браузера забита під зав'язку.
 */
export const storage = {
    /**
     * Зберегти дані в LocalStorage
     * @param {string} key - Ключ
     * @param {*} value - Будь-які дані (об'єкт, рядок, число, масив)
     */
    set(key, value) {
        try {
            const serializedValue = JSON.stringify(value)
            localStorage.setItem(key, serializedValue)
            return true
        } catch (error) {
            console.error(`Помилка запису в localStorage [${key}]:`, error)
            return false // Повертає false, наприклад, якщо пам'ять переповнена (QuotaExceededError)
        }
    },

    /**
     * Отримати дані з LocalStorage
     * @param {string} key - Ключ
     * @param {*} defaultValue - Що повернути, якщо ключа немає або сталася помилка
     */
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key)
            if (item === null) return defaultValue
            return JSON.parse(item)
        } catch (error) {
            console.error(`Помилка читання з localStorage [${key}]:`, error)
            return defaultValue
        }
    },

    /** Видалити конкретний ключ */
    remove(key) {
        try {
            localStorage.removeItem(key)
        } catch (error) {
            console.error(error)
        }
    },

    /** Повністю очистити LocalStorage додатка */
    clear() {
        try {
            localStorage.clear()
        } catch (error) {
            console.error(error)
        }
    },

    // Аналогічні методи для тимчасового сховища сесії (живе, поки відкрита вкладка)
    session: {
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value))
            } catch (error) {
                console.error(error)
            }
        },

        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key)
                return item ? JSON.parse(item) : defaultValue
            } catch (error) {
                return defaultValue
            }
        },

        remove(key) {
            try {
                localStorage.removeItem(key)
            } catch (error) {}
        },
    },
}

/**
 * CACHE MANAGER WITH TTL (Кеш у пам'яті з обмеженням часу життя даних)
 * Дозволяє тимчасово зберігати дані (наприклад, відповіді від API) у пам'яті.
 * Після завершення часу TTL (в мілісекундах) дані автоматично вважаються застарілими.
 * КОЛИ: Захист від повторних частих запитів до сервера (наприклад, раз на 10с для оновлення статусів схем).
 */
class TTLMemoryCache {
    constructor() {
        this.cache = new Map()
    }

    /**
     * Записати дані в кеш
     * @param {string} key - Унікальний ключ запиту/даних
     * @param {*} value - Дані для збереження
     * @param {number} ttl - Час життя в мілісекундах (наприклад, 5000 — це 5 секунд)
     */
    set(key, value, ttl = 60000) {
        const expiresAt = Date.now() + ttl
        this.cache.set(key, { value, expiresAt })
    }

    /**
     * Отримати дані з кешу
     * @param {string} key - Ключ
     * @returns {*|null} - Повертає дані, або null якщо вони застаріли чи їх немає
     */
    get(key) {
        const cached = this.cache.get(key)
        if (!cached) return null

        // Перевіряємо, чи не вичерпано час життя (TTL)
        if (Date.now() > cached.expiresAt) {
            this.cache.delete(key) // Видаляємо застаріле сміття з пам'яті
            return null
        }

        return cached.value
    }

    /** Видалити конкретний запис */
    delete(key) {
        this.cache.delete(key)
    }

    /** Повністю очистити оперативний кеш */
    clear() {
        this.cache.clear()
    }
}

// Експортуємо готовий єдиний екземпляр (Синглтон) для всього додатка
export const memoryCache = new TTLMemoryCache()

/**
 * ============================================================================
 * ТЕМА 10: КЕРУВАННЯ СТАНУ ТА ГЛИБОКЕ ПОРІВНЯННЯ
 * ============================================================================
 */

/**
 * DEEP EQUAL (Глибоке порівняння об'єктів та масивів)
 * Порівнює два об'єкти/масиви по значеннях, а не за посиланнями у пам'яті.
 * КОЛИ: Ви отримали нові статуси датчиків з сервера і хочете перевірити, чи міняти
 * щось в DOM, чи дані абсолютно ідентичні попереднім (захист від зайвих рендерів).
 */
export function deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true

    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
        return false
    }

    const keys1 = Object.keys(obj1)
    const keys2 = Object.keys(obj2)

    if (keys1.length !== keys2.length) return false

    for (const key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
            return false
        }
    }

    return true
}

/**
 * ============================================================================
 * ТЕМА 11: ОПТИМІЗАЦІЯ ОНОВЛЕННЯ ДАНИХ (BATCHING)
 * ============================================================================
 */

/**
 * BATCH TASK RUNNER (Пакетне виконання мікротасок)
 * Збирає купу дрібних оновлень (наприклад, зміна статусів 50 датчиків за 1 мілісекунду)
 * і виконує їх ОДНИМ пакетом наприкінці поточного циклу подій (Event Loop).
 * КОЛИ: Захист DOM від "смерті", якщо WebSocket або сервер засипає додаток сотнями логів на секунду.
 */
export function createBatcher(callback) {
    let queue = []
    let isPending = false

    return function (task) {
        queue.push(task)

        if (!isPending) {
            isPending = true

            // Відкладаємо виконання у мікротаску, щоб дочекатися завершення поточної пачки даних
            queueMicrotask(() => {
                callback(queue)
                queue = []
                isPending = false
            })
        }
    }
}

/**
 * ============================================================================
 * ТЕМА 12: КУКИ ТА БЕЗПЕКА (COOKIE MANAGEMENT)
 * ============================================================================
 */

/**
 * SECURE COOKIE MANAGER
 * Безпечна робота з куками (включаючи захист SameSite та Secure для HTTPS).
 * КОЛИ: Збереження JWT-токенів сесії або налаштувань, які мають читатися і на бекенді.
 */
export const cookies = {
    set(name, value, days = 7) {
        let expires = ''
        if (days) {
            const date = new Date()
            date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
            expires = '; expires=' + date.toUTCString()
        }
        // Захищає від CSRF-атак за допомогою SameSite=Strict
        const isSecure = window.location.protocol === 'https:' ? '; Secure' : ''
        document.cookie = `${name}=${encodeURIComponent(value || '')}${expires}; path=/; SameSite=Strict${isSecure}`
    },

    get(name) {
        const nameEQ = name + '='
        const ca = document.cookie.split(';')
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i]
            while (c.charAt(0) === ' ') c = c.substring(1, c.length)
            if (c.indexOf(nameEQ) === 0)
                return decodeURIComponent(c.substring(nameEQ.length, c.length))
        }
        return null
    },

    remove(name) {
        document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Strict'
    },
}

/**
 * ============================================================================
 * ТЕМА 13: РОБОТА З ТЕКСТОМ ТА UI (TEXT HELPERS)
 * ============================================================================
 */

/**
 * (Розумне обрізання тексту)
 * Обрізає занадто довгий рядок і додає три крапки.
 * КОЛИ: Довгі назви блоків чи фрагментів схеми у селектах або заголовках, які не вміщаються на мобільному екрані.
 */
export function truncate(str, maxLength = 30) {
    if (!str || str.length <= maxLength) return str
    return str.slice(0, maxLength - 3) + '...'
}

/**
 * ============================================================================
 * ТЕМА 14: КЕРУВАННЯ ПОВНОЕКРАННИМ РЕЖИМОМ (FULLSCREEN API)
 * ============================================================================
 */

/**
 * TOGGLE FULLSCREEN (Кросбраузерне розгортання елемента на весь екран)
 * Автоматично враховує особливості старих та нових браузерів (Safari, Chrome, Firefox).
 * КОЛИ: Для вашої кнопки `id="toggleFullscreenSchema"`. Передавайте туди весь віджет `.schema-widget`.
 *
 * @param {HTMLElement} element - Елемент, який треба розгорнути (напр. контейнер схеми)
 * @returns {Promise<boolean>} - Повертає true, якщо режим увімкнено, та false, якщо вимкнено
 */
export async function toggleFullscreenElement(element) {
    if (
        !document.fullscreenElement &&
        !document.mozFullScreenElement &&
        !document.webkitFullscreenElement &&
        !document.msFullscreenElement
    ) {
        // Вмикаємо повноекранний режим для конкретного елемента
        if (element.requestFullscreen) {
            await element.requestFullscreen()
        } else if (element.mozRequestFullScreen) {
            /* Firefox */
            await element.mozRequestFullScreen()
        } else if (element.webkitRequestFullscreen) {
            /* Chrome, Safari & Opera */
            await element.webkitRequestFullscreen()
        } else if (element.msRequestFullscreen) {
            /* IE/Edge */
            await element.msRequestFullscreen()
        }
        return true
    } else {
        // Виходимо з повноекранного режиму глобально для всього документа
        if (document.exitFullscreen) {
            await document.exitFullscreen()
        } else if (document.mozCancelFullScreen) {
            await document.mozCancelFullScreen()
        } else if (document.webkitExitFullscreen) {
            await document.webkitExitFullscreen()
        } else if (document.msExitFullscreen) {
            await document.msExitFullscreen()
        }
        return false
    }
}

/**
 * ============================================================================
 * ТЕМА 15: СИНХРОНІЗАЦІЯ ВКЛАДОК ТА ПОДІЙ (CROSS-TAB INTERFACES)
 * ============================================================================
 */

/**
 * ON TAB VISIBILITY CHANGE (Розумна пауза при згортанні вкладки)
 * Викликає колбек, коли користувач перемикається на іншу вкладку в браузері або згортає вікно.
 * КОЛИ: Зупинка таймерів годинника, WebSocket-потоків чи інтервалів оновлення схеми, коли додаток не бачать.
 */
export function onTabVisibilityChange(onHidden, onVisible) {
    const handleVisibility = () => {
        if (document.hidden) {
            if (typeof onHidden === 'function') onHidden()
        } else {
            if (typeof onVisible === 'function') onVisible()
        }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    // Повертаємо функцію відписки для очищення пам'яті
    return () => document.removeEventListener('visibilitychange', handleVisibility)
}

/**
 * ============================================================================
 * ТЕМА 16: БЕЗПЕЧНИЙ ОБМІН ДАНИМИ МІЖ ВКЛАДКАМИ (CROSS-TAB + RACE PROTECTION)
 * ============================================================================
 */

/**
 * CROSS-TAB BROADCASTER
 * Дозволяє надсилати повідомлення та дані між різними вкладками вашого сайту в реальному часі.
 *
 * @param {string} channelName - Назва каналу зв'язку (наприклад: 'schema_sync')
 * @param {Function} onMessageCallback - Функція, яка спрацює, коли інша вкладка надішле дані
 * @returns {Object} - Об'єкт з методами post та disconnect
 */
export function createTabBroadcaster(channelName, onMessageCallback) {
    if (!window.BroadcastChannel) {
        console.warn(
            'BroadcastChannel не підтримується цим браузером. Обмін між вкладками вимкнено.',
        )
        return { post: () => {}, disconnect: () => {} }
    }

    const channel = new BroadcastChannel(channelName)

    channel.onmessage = (event) => {
        if (typeof onMessageCallback === 'function') {
            onMessageCallback(event.data)
        }
    }

    return {
        /** Надіслати дані всім іншим вкладкам */
        post(data) {
            try {
                channel.postMessage(data)
            } catch (error) {
                console.error('Помилка надсилання повідомлення між вкладками:', error)
            }
        },
        /** Закрити канал (викликати при деструкції віджета) */
        disconnect() {
            channel.close()
        },
    }
}

/**
 * MUTEX RUNNER (Захист від Race Condition між вкладками)
 * Гарантує, що певний асинхронний код (наприклад, читання-запис у сховище)
 * виконуватиметься СИНХРОННО між усіма вкладками. Жодна інша вкладка не зможе
 * виконати цей шматок коду, доки поточна вкладка не завершить роботу.
 *
 * @param {string} lockName - Унікальне ім'я "замка" (наприклад: 'db_write_lock')
 * @param {Function} asyncTask - Асинхронна функція, яку треба захистити від гонитви
 * @returns {Promise<*>} - Повертає результат виконання вашої asyncTask
 */
export async function runWithMutex(lockName, asyncTask) {
    if (!navigator.locks) {
        // Фоллбек, якщо браузер древній (просто виконуємо задачу без захисту)
        return await asyncTask()
    }

    // Запитуємо у браузера ексклюзивний доступ до замка
    return navigator.locks.request(lockName, async (lock) => {
        if (!lock) {
            throw new Error(`Не вдалося отримати замок для: ${lockName}`)
        }
        // Замок успішно захоплено нашою вкладкою!
        // Виконуємо задачу. Всі інші вкладки, які викличуть цей метод з цим самим lockName,
        // будуть заблоковані браузером на рівні операційної системи, доки цей Promise не закриється.
        try {
            return await asyncTask()
        } catch (error) {
            throw error
        }
        // Після виходу з цієї анонімної функції замок автоматично звільняється браузером
    })
}

// Генерація випадкового цисла в діапазоні і точністю
const getRandomFloatInRange = (min, max, decimals = 2) => {
    // Захист від переплутаних min та max
    const realMin = Math.min(min, max)
    const realMax = Math.max(min, max)

    // Генерація випадкового дробового числа у діапазоні
    const randomNum = Math.random() * (realMax - realMin) + realMin

    // Округлення до потрібної кількості знаків (повертає число, а не рядок)
    return Number(randomNum.toFixed(decimals))
}
