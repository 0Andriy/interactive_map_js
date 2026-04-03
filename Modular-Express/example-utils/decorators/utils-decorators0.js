/**
 * @file Decorators.js
 * Набір декораторів для звичайних функцій (Higher-Order Functions).
 */

// --- ДЕКОРАТОРИ КОНТРОЛЮ ВИКЛИКІВ ---

/**
 * Відкладає виконання функції до тих пір, поки не мине заданий час з моменту останнього виклику.
 * 
 * @param {Function} func - Функція, яку треба обгорнути.
 * @param {number} delay - Затримка в мілісекундах.
 * @returns {Function} Декорована функція.
 * 
 * @example
 * const logInput = (e) => console.log(e.target.value);
 * const debouncedLog = debounce(logInput, 300);
 * // input.addEventListener('input', debouncedLog);
 */
export function debounce(func, delay) {
    let timeout;

    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

/**
 * Обмежує частоту викликів функції.
 * Гарантує, що функція буде викликатися не частіше одного разу на заданий проміжок часу.
 * 
 * @param {Function} func - Функція, яку треба обгорнути.
 * @param {number} ms - Інтервал у мілісекундах.
 * @returns {Function} Декорована функція.
 * 
 * @example
 * const onScroll = () => console.log('Scroll position:', window.scrollY);
 * const throttledScroll = throttle(onScroll, 100);
 * // window.addEventListener('scroll', throttledScroll);
 */
export function throttle(func, ms) {
    let isWaiting = false;
    let lastArgs = null;
    let lastThis = null;

    return function wrapper(...args) {
        if (isWaiting) {
            lastArgs = args;
            lastThis = this;
            return;
        }

        func.apply(this, args);
        isWaiting = true;

        setTimeout(() => {
            isWaiting = false;
            if (lastArgs) {
                wrapper.apply(lastThis, lastArgs);
                lastArgs = lastThis = null;
            }
        }, ms);
    };
}

/**
 * Відловлює помилки в синхронних та асинхронних функціях.
 * 
 * @param {Function} func - Оригінальна функція.
 * @param {Function} errorHandler - Функція, що виконається при помилці (приймає помилку та аргументи).
 * @returns {Function} Декорована функція.
 */
export function catchError(func, errorHandler) {
    return function (...args) {
        try {
            const result = func.apply(this, args);

            // Асинхронний шлях
            if (result instanceof Promise || (result?.then && typeof result.then === 'function')) {
                return result.catch((err) => {
                    return errorHandler?.(err, ...args);
                });
            }

            // Синхронний шлях
            return result;
        } catch (err) {
            // Помилка в синхронному коді
            return errorHandler?.(err, ...args);
        }
    };
}

/**
 * Гарантує, що функція виконається лише один раз. 
 * Наступні виклики повертатимуть результат першого виклику.
 * 
 * @param {Function} func - Функція, яку треба обгорнути.
 * @returns {Function} Декорована функція.
 * 
 * @example
 * const initializeApp = once(() => {
 *   console.log("Конфігурація завантажена");
 *   return { status: "ok" };
 * });
 * initializeApp(); // Логує
 * initializeApp(); // Просто повертає { status: "ok" }
 */
export function once(func) {
    let ran = false;
    let result;

    return function (...args) {
        if (ran) return result;
        result = func.apply(this, args);
        ran = true;
        return result;
    };
}

// --- ДЕКОРАТОРИ ОПТИМІЗАЦІЇ ТА ЛОГУВАННЯ ---

/**
 * Кешує результати виконання функції на основі її аргументів.
 * Кешує результати, включаючи Promise. 
 * Запобігає дублюванню мережевих запитів (Request Collapsing).
 * Використовує JSON.stringify для створення ключів кешу.
 * 
 * @param {Function} func - Функція для кешування.
 * @param {Object} [options={}] - Налаштування кешу.
 * @param {number} [options.maxAge] - Час життя кешу в мс.
 * 
 * @example
 * const heavyCalc = (n) => { 
 *   console.log('Рахую...'); 
 *   return n * n; 
 * };
 * const memoCalc = memoize(heavyCalc);
 * memoCalc(5); // Рахую... 25
 * memoCalc(5); // 25 (з кешу)
 */
export function memoize(func, { maxAge, sortArgs = false, keyGenerator = null } = {}) {
    const cache = new Map();

    /**
     * @helper
     * Глибоке сортування об'єктів та масивів для створення стабільного ключа кешу.
     */
    function normalize(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(normalize);
        return Object.keys(obj)
            .sort()
            .reduce((result, key) => {
                result[key] = normalize(obj[key]);
                return result;
            }, {});
    }

    /**
     * Створює стабільний ключ для URL, ігноруючи порядок Query-параметрів.
     * @example
     * const key = getQueryKey("https://api.com", { page: 1, sort: "asc" });
     */
    const getQueryKey = (url, params = {}) => {
        const searchParams = new URLSearchParams(params);
        searchParams.sort(); // Ключовий момент: сортуємо параметри за абеткою
        return `${url}?${searchParams.toString()}`;
    };

    const memoized = function (...args) {
        // Якщо увімкнено sortArgs, ми нормалізуємо аргументи перед JSON.stringify
        const processedArgs = sortArgs ? normalize(args) : args;
        const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(processedArgs);

        if (cache.has(key)) {
            const entry = cache.get(key);
            if (!maxAge || (Date.now() - entry.timestamp < maxAge)) {
                return entry.value;
            }
            cache.delete(key);
        }

        const result = func.apply(this, args);
        cache.set(key, { value: result, timestamp: Date.now() });

        // Якщо це Promise, видаляємо з кешу при помилці, щоб дозволити повтор
        if (result instanceof Promise || (result?.then && typeof result.then === 'function')) {
            result.catch(() => cache.delete(key));
        }

        return result;
    };

    // Додаємо метод для ручного очищення кешу
    memoized.clear = () => cache.clear();
    
    return memoized;
}

/**
 * Детально логує виклики функції, використовуючи кастомний логер (наприклад, Winston) або стандартну консоль.
 * 
 * @param {Function} func - Функція для логування.
 * @param {Object} [logger=console] - Об'єкт логера, що має методи info, error (наприклад, winston instance).
 * @returns {Function} Декорована функція.
 * 
 * @example
 * // З використанням Winston
 * import winston from 'winston';
 * const myLogger = winston.createLogger({...});
 * const loggedSum = log(sum, myLogger);
 * 
 * // З використанням стандартної консолі
 * const loggedSum = log(sum); 
 */
export function log(func, logger = console) {
    return function (...args) {
        const functionName = func?.name ?? "anonymous";
        const start = performance.now();

        // Безпечне групування (якщо підтримується, наприклад в браузері)
        logger?.group?.(`[Log] Виклик: ${functionName}`);
        
        // Використовуємо .info, .log або пусту функцію, якщо логера немає
        const logMethod = logger?.info?.bind(logger) ?? logger?.log?.bind(logger) ?? (() => {});

        logMethod(`Виклик ${functionName}`, { arguments: args });

        try {
            const result = func.apply(this, args);

            // ПЕРЕВІРКА НА ПРОМІС (Асинхронність)
            if (result instanceof Promise || (result && typeof result.then === 'function')) {
                return result
                    .then((asyncResult) => {
                        const duration = (performance.now() - start).toFixed(3);
                        logMethod(`Результат (Async) ${functionName}:`, { 
                            result: asyncResult, 
                            duration: `${duration}ms` 
                        });
                        return asyncResult;
                    })
                    .catch((error) => {
                        errorMethod(`Помилка (Async) ${functionName}:`, { 
                            message: error?.message, 
                            stack: error?.stack 
                        });
                        throw error;
                    })
                    .finally(() => {
                        logger?.groupEnd?.();
                    });
            }

            const duration = (performance.now() - start).toFixed(3);
            
            logMethod(`Результат (Sync) ${functionName}`, { 
                result, 
                duration: `${duration}ms` 
            });

            return result;
        } catch (error) {
            // Безпечний виклик error або log
            const errorMethod = logger?.error?.bind(logger) ?? logMethod;
            errorMethod(`Помилка (Sync) в ${functionName}`, { 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        } finally {
            logger?.groupEnd?.();
        }
    };
}


// --- ДЕКОРАТОРИ АСИНХРОННОСТІ ---

/**
 * Додає затримку перед кожним виконанням функції.
 * 
 * @param {Function} func - Функція, яку треба відкласти.
 * @param {number} ms - Час "сну" в мілісекундах.
 * @returns {Function} Асинхронна декорована функція.
 * 
 * @example
 * const sayHi = () => console.log("Привіт!");
 * const delayedHi = sleep(sayHi, 2000);
 * delayedHi(); // Привіт з'явиться через 2 секунди
 */
export function sleep(func, ms) {
    return async function (...args) {
        await new Promise(resolve => setTimeout(resolve, ms));
        return func.apply(this, args);
    };
}

/**
 * Повторює виконання асинхронної функції у разі помилки.
 * 
 * @param {Function} func - Асинхронна функція.
 * @param {number} attempts - Кількість спроб (за замовчуванням 3).
 * @param {number} delay - Затримка між спробами у мс (за замовчуванням 1000).
 * @returns {Function} Декорована функція з механізмом повтору.
 * 
 * @example
 * const fetchData = async () => {  може впасти }
 * const stableFetch = retry(fetchData, 5, 2000)
 * stableFetch()
 */
export function retry(func, attempts = 3, delay = 1000, logger = console) {
    return async function (...args) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await func.apply(this, args);
            } catch (err) {
                if (i === attempts - 1) throw err;
                logger?.warn(`[Retry] Спроба ${i + 1} для ${func.name || 'анонімної функції'} не вдалася. Повтор через ${delay}мс...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    };
}

// --- ДЕКОРАТОРИ ВАЛІДАЦІЇ ---

/**
 * Валідує аргументи функції перед її виконанням.
 * 
 * @param {Function} func - Функція, яку валідуємо.
 * @param {...Function} validators - Функції-валідатори, що приймають (значення, індекс).
 * @returns {Function} Декорована функція.
 * 
 * @example
 * const isNumber = (v, i) => { if(typeof v !== 'number') throw new Error(`Arg ${i} must be number`); };
 * const sum = (a, b) => a + b;
 * const validatedSum = validateArgs(sum, isNumber, isNumber);
 * validatedSum(10, "20"); // Викине помилку
 */
export function validateArgs(func, ...validators) {
    return function (...args) {
        validators.forEach((validator, index) => {
            if (typeof validator === 'function') {
                validator(args[index], index);
            }
        });
        return func.apply(this, args);
    };
}





/**
 * @file Validators.js
 * Колекція валідаторів для використання з декоратором validateArgs.
 */

/**
 * Перевіряє, чи аргумент не є порожнім (null, undefined або порожній рядок).
 * @param {*} v - Значення.
 * @param {number} i - Індекс аргументу.
 * @throws {Error} Якщо значення порожнє.
 */
export const isRequired = (v, i) => {
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
        throw new Error(`Аргумент №${i} є обов'язковим та не може бути порожнім.`);
    }
};

/**
 * Перевіряє, чи є аргумент числом.
 */
export const isNumber = (v, i) => {
    if (typeof v !== 'number' || isNaN(v)) {
        throw new Error(`Аргумент №${i} має бути числом.`);
    }
};

/**
 * Валідує мінімальне значення для числа.
 * @param {number} minValue 
 */
export const min = (minValue) => (v, i) => {
    isNumber(v, i);
    if (v < minValue) throw new Error(`Аргумент №${i} (${v}) має бути не менше ${minValue}.`);
};

/**
 * Валідує максимальне значення для числа.
 * @param {number} maxValue 
 */
export const max = (maxValue) => (v, i) => {
    isNumber(v, i);
    if (v > maxValue) throw new Error(`Аргумент №${i} (${v}) має бути не більше ${maxValue}.`);
};

/**
 * Перевіряє формат Email за допомогою регулярного виразу.
 */
export const isEmail = (v, i) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof v !== 'string' || !emailRegex.test(v)) {
        throw new Error(`Аргумент №${i} ("${v}") не є коректним Email.`);
    }
};

/**
 * Перевіряє довжину рядка.
 * @param {number} minLen 
 * @param {number} maxLen 
 */
export const length = (minLen, maxLen) => (v, i) => {
    if (typeof v !== 'string') throw new Error(`Аргумент №${i} має бути рядком.`);
    if (v.length < minLen || v.length > maxLen) {
        throw new Error(`Довжина аргументу №${i} має бути від ${minLen} до ${maxLen} символів.`);
    }
};

/**
 * Перевіряє, чи значення входить до списку дозволених.
 * @param {Array} allowedValues 
 */
export const oneOf = (allowedValues) => (v, i) => {
    if (!allowedValues.includes(v)) {
        throw new Error(`Аргумент №${i} ("${v}") має бути одним із: ${allowedValues.join(', ')}.`);
    }
};

/**
 * Валідує дату (чи є рядок валідною датою).
 */
export const isDate = (v, i) => {
    const date = new Date(v);
    if (isNaN(date.getTime())) {
        throw new Error(`Аргумент №${i} ("${v}") не є валідною датою.`);
    }
};

// --- КОМБІНОВАНИЙ ПРИКЛАД ВИКОРИСТАННЯ ---

/*
import { validateArgs } from './Decorators.js';
import { isEmail, min, isRequired, oneOf } from './Validators.js';

const registerUser = validateArgs(
    (email, age, role) => {
        console.log(`Реєструємо ${email}, вік: ${age}, роль: ${role}`);
    },
    isEmail,             // для email
    min(18),             // для age
    oneOf(['admin', 'user']) // для role
);

try {
    registerUser("bad-email", 15, "guest");
} catch (e) {
    console.error(e.message); // Виведе першу помилку валідації
}
*/