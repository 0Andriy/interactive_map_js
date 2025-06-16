// constants/sensitiveKeys.js

// Можна використовувати масив для чутливих ключів, які точно відомі
export const EXACT_SENSITIVE_KEYS = [
    'creditCard',
    'creditCardNumber',
    'ssn',
    'socialSecurityNumber',
    'privateKey',
    'apiKey',
    'authToken',
    'accessToken',
    'refreshToken',
    'cvv',
    'pin',
    'securityCode',
    'secret', // Додайте інші точні ключі
]

// Регулярні вирази для чутливих ключів, які відповідають шаблонам
export const SENSITIVE_KEY_PATTERNS = [
    /passw(o?o?r?|0)d(_?(old|new))?/i, // Matches: password, Password, passw0rd, password_old, new_password etc. (case-insensitive)
    /token/i, // Matches: token, myToken, TokenValue etc.
    /jwt/i, // Matches: jwt, myJwt, JwtToken
    /key/i, // Matches: key, someKey, publicKey (може бути обережно з цим, щоб не замаскувати потрібні "key" слова)
    /secret/i, // Matches: secret, clientSecret
    /code/i, // Matches: code, authCode (також обережно)
]

// Об'єднаний список, який буде використовуватися функцією санітаризації
// Це необов'язково експортувати, його можна використовувати всередині функції.
// Наприклад, функція може приймати обидва масиви як аргументи або об'єднувати їх.
