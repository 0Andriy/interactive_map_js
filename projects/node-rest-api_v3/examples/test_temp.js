// const secret = new TextEncoder().encode(
//     'your-secret-key-that-is-at-least-32-bytes-long', // Секретний ключ для HS256 має бути щонайменше 32 байти
// )

// console.log(secret)

// <=======================================================>
// 1. Отримуємо поточний Unix-час у мілісекундах
const currentTimeMillis = Date.now();

// 2. Переводимо поточний час у секунди
const currentUnixTimeSeconds = Math.floor(currentTimeMillis / 1000);

// 3. Визначаємо тривалість, на яку потрібно відняти (у секундах)
// Наприклад:
const durationInSeconds = 3600; // 1 година
// const durationInSeconds = 24 * 3600; // 1 день
// const durationInSeconds = 60; // 1 хвилина

// 4. Розраховуємо час у минулому
const pastUnixTimeSeconds = currentUnixTimeSeconds - durationInSeconds;

console.log(`Поточний час (мс): ${currentTimeMillis}`);
console.log(`Поточний Unix-час (с): ${currentUnixTimeSeconds}`);
console.log(`Тривалість віднімання (с): ${durationInSeconds}`);
console.log(`Час у минулому (Unix-час, с): ${pastUnixTimeSeconds}`);

// Щоб перевірити, можна перетворити назад у читабельний формат
console.log(`Час у минулому (Date об'єкт): ${new Date(pastUnixTimeSeconds * 1000).toLocaleString()}`);

// <=======================================================>
import * as jose from 'jose'

async function signTokenWithCustomFields() {
    const secret = new TextEncoder().encode('your-secret-key-that-is-at-least-32-bytes-long')

    const payload = {
        userId: 'some-unique-user-id',
        username: 'alice.smith',
        roles: ['user', 'editor'],
        tenantId: 'org-456', // Приватне поле
        customFlag: true, // Ще одне приватне поле
    }

    const jwt = await new jose.SignJWT(payload)
        .setProtectedHeader({
            alg: 'HS256',
            typ: 'JWT',
            kid: 'my-app-signing-key', // Кастомний Key ID
        })
        .setIssuedAt()
        .setExpirationTime('1h')
        .setAudience('api-service')
        .setIssuer('auth-server')
        .setSubject('alice.smith') // Використання поля Subject
        .setJti(jose.uuid()) // Унікальний ID токена
        .sign(secret)

    console.log('JWT with Custom Fields:', jwt)
    return jwt
}

signTokenWithCustomFields()
