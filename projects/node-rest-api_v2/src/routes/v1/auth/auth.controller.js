import config from '../../../config/config.js'
import * as authServise from './auth.servise.js'

/**
Обробка запиту на реєстрацію.
    1. Валідація даних
    2. Отримання даних з запиту
    3. Перевірка, чи існує вже користувач з таким email або username
    4. Хешування пароля перед збереженням
    5. Збереження даних користувача у базі
    6. Створення JWT токена
    7. Повернення відповіді з повідомленням та токеном
*/
export async function signup(req, res, next) {
    try {
        // 1. Валідація даних
        // 2. Отримання даних з запиту
        const { username, password } = req.body

        if (!username || !password) {
            return res.status(422).json({ message: 'Заповніть всі поля' })
        }

        // 3. Перевірка, чи існує вже користувач з таким email або username
        const user = await authServise.signup(username, password)

        if (!user) {
            return res.status(409).json({ message: 'User already exists' })
        }

        // 4. Хешування пароля перед збереженням

        // 5. Збереження даних користувача у базі

        // 6. Створення JWT токена

        const { userData, accessToken, refreshToken } = ['1', '2', '3']

        // 7. Повернення відповіді з повідомленням та токеном
        return res
            .status(201)
            .cookie(
                config.tokenConfig.accessToken.cookie.name,
                accessToken,
                config.tokenConfig.accessToken.cookie.options,
            )
            .cookie(
                config.tokenConfig.refreshToken.cookie.name,
                refreshToken,
                config.tokenConfig.refreshToken.cookie.options,
            )
            .json({
                message: `User registered successfuly`,
                user: userData,
                accessToken: accessToken,
                refreshToken: refreshToken,
            })
    } catch (error) {
        // Пересилаємо (перенаправляємо, перекидаємо) помилку в наступний обробник middleware
        next(error)
    }
}

/**
Обробка запиту на логін.
    1. Валідація даних (email, password)
    2. Отримання даних з запиту
    3. Перевірка, чи існує користувач з таким email
    4. Перевірка правильності пароля за допомогою bcrypt
    5. Генерація JWT токена
    6. Повернення відповіді з токеном та інформацією про користувача
*/
export async function login(req, res, next) {
    try {
        // 1. Валідація даних
        // 2. Отримання даних з запиту
        const { username, password } = req.body

        if (!username || !password) {
            return res
                .status(422)
                .json({ message: 'Please fill all fields (username and password)' })
        }

        // 3. Перевірка, чи існує вже користувач з таким email або username
        const user = null

        if (!user) {
            return res.status(401).json({ message: 'Login or password is invalid' })
        }

        // 4. Хешування пароля перед збереженням

        // 5. Збереження даних користувача у базі

        // 6. Створення JWT токена

        const { userData, accessToken, refreshToken } = ['1', '2', '3']

        // 7. Повернення відповіді з повідомленням та токеном
        return res
            .status(200)
            .cookie(
                config.tokenConfig.accessToken.cookie.name,
                accessToken,
                config.tokenConfig.accessToken.cookie.options,
            )
            .cookie(
                config.tokenConfig.refreshToken.cookie.name,
                refreshToken,
                config.tokenConfig.refreshToken.cookie.options,
            )
            .json({
                message: `User registered successfuly`,
                user: userData,
                accessToken: accessToken,
                refreshToken: refreshToken,
            })
    } catch (error) {
        // Пересилаємо (перенаправляємо, перекидаємо) помилку в наступний обробник middleware
        next(error)
    }
}

/**
Обробка запиту на вихід (logout).
    1. Перевірка наявності токена в тілі запиту
    2. Якщо токен є, позначити його як невалидний в системі (наприклад, через чорний список або зберігання списку відключених токенів)
    3. Повернення відповіді про успішний вихід
*/

export async function logout(req, res, next) {
    try {
        // 1. Отримання даних з запиту
        const { refreshToken } = req.body

        if (!refreshToken) {
            return res
                .status(422)
                .json({ message: 'Please fill all fields (username and password)' })
        }

        // 2. Якщо токен є, позначити його як невалидний в системі (наприклад, через чорний список або зберігання списку відключених токенів)

        // 3. Повернення відповіді з повідомленням та токеном
        return res
            .status(200)
            .clearCookie(config.tokenConfig.accessToken.cookie.name)
            .clearCookie(config.tokenConfig.refreshToken.cookie.name)
            .json({ message: `Logout successful"` })
    } catch (error) {
        // Пересилаємо (перенаправляємо, перекидаємо) помилку в наступний обробник middleware
        next(error)
    }
}

/**
Обробка запиту на оновлення токена.
    1. Перевірка наявності refresh токена у тілі запиту
    2. Валідація refresh токена (чи він є дійсним і чи не минув термін його дії)
    3. Генерація нового JWT токена на основі refresh токена
    4. Повернення нового токена в відповіді
 */
export async function refreshTokens(req, res, next) {
    try {
        // 1. еревірка наявності refresh токена у тілі запиту
        const { refreshToken } = req.body

        if (!refreshToken) {
            return res.status(401).json({ message: 'Refresh token not found' })
        }

        // 4. Повернення відповіді з повідомленням та токеном
        return res
            .status(200)
            .cookie(
                config.tokenConfig.accessToken.cookie.name,
                accessToken,
                config.tokenConfig.accessToken.cookie.options,
            )
            .cookie(
                config.tokenConfig.refreshToken.cookie.name,
                refreshToken,
                config.tokenConfig.refreshToken.cookie.options,
            )
            .json({
                message: `User registered successfuly`,
                user: userData,
                accessToken: accessToken,
                refreshToken: refreshToken,
            })
    } catch (error) {
        // Пересилаємо (перенаправляємо, перекидаємо) помилку в наступний обробник middleware
        next(error)
    }
}

/**
Обробка запиту на валідацію токена.
    1. Перевірка наявності токена в заголовках запиту
    2. Валідація JWT токена (перевірка його підпису і терміну дії)
    3. Повернення відповіді з результатом валідації (наприклад, успішно або помилка токена)
 */

export async function validateToken(req, res, next) {
    return null
}
