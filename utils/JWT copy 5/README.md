# JwtManager (версія з JOSE)

Універсальний керівник JWT-токенами з підтримкою HS/RS/ES, JWKS, кешування ключів, валідації та Singleton-підходу.

## 🔧 Можливості

-   ✅ Підтримка `HS256`, `RS256`, `ES256`
-   ✅ Симетричні та асиметричні ключі
-   ✅ Джерела ключів: env, file, db, jwks
-   ✅ Кешування ключів із TTL
-   ✅ Автоматичне оновлення ключів
-   ✅ Підтримка kid
-   ✅ Валідація payload
-   ✅ Singleton інстанс

## 📦 Приклад використання

```js
import JwtManager from './JwtManager.js'

const jwtManager = JwtManager.getInstance({
    tokenTypes: {
        access: {
            algorithm: 'RS256',
            keySource: 'file',
            privateKeyPath: './keys/rsa_private.pem',
            publicKeyPath: './keys/rsa_public.pem',
            expiresIn: 15 * 60, // 15 хв
            generateJti: true,
        },
    },
})

const payload = { userId: 123, role: 'admin' }

const token = await jwtManager.sign(payload, 'access')
const decoded = await jwtManager.verify(token, 'access')

console.log(decoded)
```

.
├── JwtManager.js
├── example.env
├── scripts/
│ └── genKeys.js
├── keys/
│ ├── rsa_private.pem
│ └── rsa_public.pem
└── README.md
