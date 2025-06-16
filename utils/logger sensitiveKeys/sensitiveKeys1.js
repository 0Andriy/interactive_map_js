// constants/sensitiveKeys.js

/**
 * Регулярні вирази для ідентифікації чутливих ключів у логах.
 * Важливо: Будьте дуже обережні з регулярними виразами,
 * щоб уникнути ненавмисного маскування нечутливих даних.
 */
export const SENSITIVE_KEY_PATTERNS = [
    // Паролі: охоплює 'password', 'Password', 'passw0rd', 'password_old', 'new_password' тощо.
    /passw(o?o?r?|0)d(_?(old|new|current))?/i,

    // Токени авторизації: 'token', 'accessToken', 'refreshToken', 'authToken', 'jwt'
    /(access|refresh|auth)?token/i,
    /jwt/i,

    // Ключі API/секрети: 'apiKey', 'privateKey', 'clientSecret', 'secret'
    /(api|private|client)?key/i,
    /secret/i,

    // Персональні дані/ідентифікатори: 'ssn', 'socialSecurityNumber', 'creditCard', 'cvv', 'pin'
    /ssn/i,
    /socialsecuritynumber/i,
    /creditcard(number)?/i,
    /cvv/i,
    /pin/i,

    // Ідентифікатори сесій/коди
    /sessionid/i,
    /code/i, // Може бути дуже загальним, використовуйте обережно
    /otp/i, // One-Time Password
]
