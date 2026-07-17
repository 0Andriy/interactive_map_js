export class AuthSchema {
    /**
     * Валідація даних при реєстрації користувача (Аналог RegisterDto)
     */
    static validateRegister(data) {
        const { login, email, password, firstName, lastName, middleName, autoLogin, rememberMe } =
            data || {}

        if (!login || login.trim().length < 3) throw new Error('VALIDATION_INVALID_LOGIN')
        if (!email || !email.includes('@')) throw new Error('VALIDATION_INVALID_EMAIL')
        if (!password || password.length < 6) throw new Error('VALIDATION_WEAK_PASSWORD')

        // ПІБ обов'язкові для корпоративних бізнес-додатків
        if (!firstName || firstName.trim().length === 0)
            throw new Error('VALIDATION_FIRST_NAME_REQUIRED')
        if (!lastName || lastName.trim().length === 0)
            throw new Error('VALIDATION_LAST_NAME_REQUIRED')

        return {
            login: login.trim(),
            email: email.trim(),
            password: password,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            middleName: middleName ? middleName.trim() : null,

            // ЗАХИСТ: Примусово приводимо до boolean. Якщо поля немає, буде false.
            autoLogin: !!autoLogin,
            rememberMe: !!rememberMe,
        }
    }

    /**
     * Валідація даних при вході (Аналог LoginDto)
     */
    static validateLogin(data) {
        // Приймаємо обидва варіанти (remember або rememberMe) для зворотної сумісності
        const { login, password, rememberMe, authType, appId } = data || {}

        if (!login || !password) {
            throw new Error('VALIDATION_CREDENTIALS_REQUIRED')
        }

        // Об'єднуємо їх: якщо передано хоча б один як true, то результат буде true.
        // Оператор !! примусово перетворює будь-яке значення (undefined, null, 1, 0) на чистий Boolean (true/false)
        const finalRememberMe = !!(rememberMe ?? false)

        return {
            login: login.trim(),
            password: password,
            rememberMe: finalRememberMe,
            authType: authType || 'DATABASE',
            appId: appId || null,
        }
    }
}
