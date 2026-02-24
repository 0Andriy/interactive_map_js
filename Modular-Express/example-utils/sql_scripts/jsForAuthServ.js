import oracledb from 'oracledb'
import crypto from 'crypto'

// Налаштування драйвера
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT
oracledb.autoCommit = true

/**
 * Утиліта для хешування токена (SHA-256)
 */
const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Генерація безпечного випадкового токена
 */
const generateToken = () => {
    return crypto.randomBytes(40).toString('hex')
}

/**
 * 1. СТВОРЕННЯ НОВОЇ СЕСІЇ (LOGIN)
 * Викликається при першому вході користувача. Створює новий family_id.
 */
export async function createSession(
    connection,
    { userId, deviceInfo, ipAddress, fingerprint, authLevel = 0 },
) {
    const refreshToken = generateToken()
    const tokenHash = hashToken(refreshToken)
    const familyId = crypto.randomBytes(16) // Генеруємо унікальний ланцюжок
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // Термін дії 7 днів

    const sql = `
        INSERT INTO user_sessions (
            user_id, token_hash, family_id, expires_at,
            device_info, ip_address, device_fingerprint, auth_level
        ) VALUES (
            :userId, :tokenHash, :familyId, :expiresAt,
            :deviceInfo, :ipAddress, :fingerprint, :authLevel
        ) RETURNING id INTO :id`

    const result = await connection.execute(sql, {
        userId: userId,
        tokenHash: tokenHash,
        familyId: familyId,
        expiresAt: expiresAt,
        deviceInfo: deviceInfo,
        ipAddress: ipAddress,
        fingerprint: fingerprint,
        authLevel: authLevel,
        id: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT },
    })

    return {
        refreshToken,
        sessionId: result.outBinds.id[0].toString('hex'),
        expiresAt,
    }
}

/**
 * 2. РОТАЦІЯ ТОКЕНА (REFRESH) + LEEWAY TIME 30s
 * Викликається, коли Access Token прострочився.
 */
export async function refreshSession(connection, { oldToken, deviceInfo, ipAddress, fingerprint }) {
    const oldHash = hashToken(oldToken)

    // Отримуємо дані сесії
    const findSql = `
        SELECT id, user_id, family_id, used_at, revoked_at, expires_at, refresh_count, auth_level
        FROM user_sessions
        WHERE token_hash = :oldHash`

    const res = await connection.execute(findSql, { oldHash })
    const session = res.rows[0]

    if (!session) {
        throw new Error('SESSION_NOT_FOUND')
    }

    // Перевірка 1: Чи не відкликана сесія примусово?
    if (session.REVOKED_AT) {
        throw new Error('SESSION_REVOKED')
    }

    // Перевірка 2: Чи не закінчився термін дії?
    if (new Date() > session.EXPIRES_AT) {
        throw new Error('SESSION_EXPIRED')
    }

    // Перевірка 3: ЗАХИСТ ВІД REUSE ATTACK + LEEWAY TIME (30 сек)
    if (session.USED_AT) {
        const usedAtTime = new Date(session.USED_AT).getTime()
        const nowTime = new Date().getTime()
        const diffSeconds = (nowTime - usedAtTime) / 1000

        if (diffSeconds > 30) {
            // КРИТИЧНО: Токен використано давно. Це атака. Блокуємо весь ланцюжок.
            await connection.execute(
                `UPDATE user_sessions
                 SET revoked_at = CURRENT_TIMESTAMP
                 WHERE family_id = :familyId AND revoked_at IS NULL`,
                { familyId: session.FAMILY_ID },
            )
            throw new Error('REUSE_ATTACK_DETECTED')
        } else {
            // Мережевий лаг: Клієнт шле запит повторно, бо не отримав відповідь.
            // Повертаємо помилку "спробуйте ще раз" або дістаємо останній токен з цієї сім'ї.
            throw new Error('RETRY_TOO_FAST_WAIT_FOR_RESPONSE')
        }
    }

    // Оновлюємо статус старого токена як використаний
    await connection.execute(
        `UPDATE user_sessions SET used_at = CURRENT_TIMESTAMP WHERE id = :id`,
        { id: session.ID },
    )

    // Створюємо новий токен у тому ж ланцюжку (family_id)
    const newToken = generateToken()
    const newExpiresAt = new Date()
    newExpiresAt.setDate(newExpiresAt.getDate() + 7)

    const insertSql = `
        INSERT INTO user_sessions (
            user_id, token_hash, family_id, expires_at,
            device_info, ip_address, device_fingerprint,
            auth_level, refresh_count
        ) VALUES (
            :userId, :tokenHash, :familyId, :expiresAt,
            :deviceInfo, :ipAddress, :fingerprint,
            :authLevel, :refreshCount
        )`

    await connection.execute(insertSql, {
        userId: session.USER_ID,
        tokenHash: hashToken(newToken),
        familyId: session.FAMILY_ID,
        expiresAt: newExpiresAt,
        deviceInfo: deviceInfo,
        ipAddress: ipAddress,
        fingerprint: fingerprint,
        authLevel: session.AUTH_LEVEL,
        refreshCount: session.REFRESH_COUNT + 1,
    })

    return {
        refreshToken: newToken,
        expiresAt: newExpiresAt,
    }
}

/**
 * 3. ВІДКЛИКАННЯ (LOGOUT)
 */
export async function logout(connection, token) {
    const sql = `
        UPDATE user_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE token_hash = :tokenHash AND revoked_at IS NULL`

    await connection.execute(sql, { tokenHash: hashToken(token) })
}

/**
 * 4. ВІДКЛИКАННЯ ВСІХ СЕСІЙ КОРИСТУВАЧА
 * Корисно при зміні пароля або кнопці "Вийти на всіх пристроях".
 */
export async function revokeAllUserSessions(connection, userId) {
    const sql = `
        UPDATE user_sessions
        SET revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = :userId AND revoked_at IS NULL`

    await connection.execute(sql, { userId })
}

/**
 * 5. ПЕРЕВІРКА АКТИВНОСТІ (ДЛЯ MIDDLEWARE)
 * Перевіряє, чи жива сесія за хешем токена.
 */
export async function validateSession(connection, token) {
    const sql = `
        SELECT user_id, auth_level, expires_at
        FROM user_sessions
        WHERE token_hash = :tokenHash
          AND revoked_at IS NULL
          AND used_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP`

    const res = await connection.execute(sql, { tokenHash: hashToken(token) })
    return res.rows[0] || null
}

/**
 * 6. ОНОВЛЕННЯ РІВНЯ MFA (Step-up Authentication)
 * Викликається після того, як користувач ввів код 2FA.
 */
export async function upgradeSessionMfa(connection, token, level = 1) {
    const sql = `
        UPDATE user_sessions
        SET auth_level = :level,
            mfa_verified_at = CURRENT_TIMESTAMP
        WHERE token_hash = :tokenHash
          AND revoked_at IS NULL`

    await connection.execute(sql, {
        level: level,
        tokenHash: hashToken(token),
    })
}

/**
 * 7. ОТРИМАННЯ СПИСКУ АКТИВНИХ ПРИСТРОЇВ
 * Для кабінету користувача.
 */
export async function getActiveDevices(connection, userId) {
    const sql = `
        SELECT id, device_info, ip_address, last_activity, created_at
        FROM user_sessions
        WHERE user_id = :userId
          AND revoked_at IS NULL
          AND used_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY last_activity DESC`

    const res = await connection.execute(sql, { userId })
    return res.rows
}

// // --------------------
// import oracledb from 'oracledb'
// import crypto from 'crypto'
// import * as jose from 'jose'

// // Налаштування
// oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT
// oracledb.autoCommit = true

// const SECRET = new TextEncoder().encode(
//     process.env.JWT_SECRET || 'your-super-secret-key-32-chars-min',
// )

// /**
//  * Хешування для зберігання в БД (щоб навіть при витоку бази не можна було підробити токен)
//  */
// const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

// /**
//  * 1. СТВОРЕННЯ СЕСІЇ (LOGIN)
//  */
// export async function createSession(
//     connection,
//     { userId, deviceInfo, ipAddress, fingerprint, authLevel = 0 },
// ) {
//     const sessionId = crypto.randomBytes(16) // RAW(16) для Oracle
//     const familyId = crypto.randomBytes(16)
//     const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 днів

//     // Генеримо Refresh Token через JOSE
//     const refreshToken = await new jose.SignJWT({ typ: 'Refresh' })
//         .setProtectedHeader({ alg: 'HS256' })
//         .setJti(sessionId.toString('hex')) // Вшиваємо ID сесії
//         .setSubject(userId.toString())
//         .setIssuedAt()
//         .setExpirationTime('7d')
//         .sign(SECRET)

//     const sql = `
//         INSERT INTO user_sessions (
//             id, user_id, token_hash, family_id, expires_at,
//             device_info, ip_address, device_fingerprint, auth_level
//         ) VALUES (
//             :id, :userId, :tokenHash, :familyId, :expiresAt,
//             :deviceInfo, :ipAddress, :fingerprint, :authLevel
//         )`

//     await connection.execute(sql, {
//         id: sessionId,
//         userId: userId,
//         tokenHash: hashToken(refreshToken),
//         familyId: familyId,
//         expiresAt: expiresAt,
//         deviceInfo: deviceInfo,
//         ipAddress: ipAddress,
//         fingerprint: fingerprint,
//         authLevel: authLevel,
//     })

//     return { refreshToken, expiresAt }
// }

// /**
//  * 2. РОТАЦІЯ ТОКЕНА (REFRESH) + LEEWAY TIME 30s
//  */
// export async function refreshSession(connection, { oldToken, deviceInfo, ipAddress, fingerprint }) {
//     let payload
//     try {
//         // JOSE перевіряє підпис та термін дії автоматично
//         const { payload: decoded } = await jose.jwtVerify(oldToken, SECRET)
//         payload = decoded
//     } catch (err) {
//         throw new Error('INVALID_OR_EXPIRED_TOKEN_SIGNATURE')
//     }

//     const oldHash = hashToken(oldToken)
//     const sessionId = Buffer.from(payload.jti, 'hex')

//     // Отримуємо сесію з БД
//     const findSql = `
//         SELECT id, user_id, family_id, used_at, revoked_at, expires_at, refresh_count, auth_level
//         FROM user_sessions
//         WHERE id = :sessionId AND token_hash = :oldHash`

//     const res = await connection.execute(findSql, { sessionId, oldHash })
//     const session = res.rows[0]

//     if (!session) throw new Error('SESSION_NOT_FOUND')
//     if (session.REVOKED_AT) throw new Error('SESSION_REVOKED')

//     // ПЕРЕВІРКА REUSE + LEEWAY (30 сек)
//     if (session.USED_AT) {
//         const diffSeconds = (new Date() - new Date(session.USED_AT)) / 1000
//         if (diffSeconds > 30) {
//             // Атака: анулюємо всю сім'ю
//             await connection.execute(
//                 `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
//                  WHERE family_id = :familyId AND revoked_at IS NULL`,
//                 { familyId: session.FAMILY_ID },
//             )
//             throw new Error('REUSE_ATTACK_DETECTED')
//         }
//         throw new Error('RETRY_TOO_FAST')
//     }

//     // Позначаємо стару сесію як використану
//     await connection.execute(
//         `UPDATE user_sessions SET used_at = CURRENT_TIMESTAMP WHERE id = :sessionId`,
//         { sessionId },
//     )

//     // Створюємо нову сесію в тому ж ланцюжку
//     return createSessionInFamily(connection, session)
// }

// /**
//  * Допоміжна функція для створення наступного ланки в ланцюжку
//  */
// async function createSessionInFamily(connection, oldSession) {
//     const newSessionId = crypto.randomBytes(16)
//     const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

//     const refreshToken = await new jose.SignJWT({ typ: 'Refresh' })
//         .setProtectedHeader({ alg: 'HS256' })
//         .setJti(newSessionId.toString('hex'))
//         .setSubject(oldSession.USER_ID.toString())
//         .setExpirationTime('7d')
//         .sign(SECRET)

//     const sql = `
//         INSERT INTO user_sessions (
//             id, user_id, token_hash, family_id, expires_at,
//             auth_level, refresh_count
//         ) VALUES (
//             :id, :userId, :tokenHash, :familyId, :expiresAt,
//             :authLevel, :refreshCount
//         )`

//     await connection.execute(sql, {
//         id: newSessionId,
//         userId: oldSession.USER_ID,
//         tokenHash: hashToken(refreshToken),
//         familyId: oldSession.FAMILY_ID,
//         expiresAt: expiresAt,
//         authLevel: oldSession.AUTH_LEVEL,
//         refreshCount: oldSession.REFRESH_COUNT + 1,
//     })

//     return { refreshToken, expiresAt }
// }

// /**
//  * 3. LOGOUT
//  */
// export async function logout(connection, token) {
//     let payload
//     try {
//         const { payload: decoded } = await jose.jwtVerify(token, SECRET)
//         payload = decoded
//     } catch (e) {
//         return
//     }

//     await connection.execute(
//         `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
//          WHERE id = :id AND revoked_at IS NULL`,
//         { id: Buffer.from(payload.jti, 'hex') },
//     )
// }

// /**
//  * 4. UPGRADE MFA
//  */
// export async function upgradeMfa(connection, token) {
//     const { payload } = await jose.jwtVerify(token, SECRET)
//     await connection.execute(
//         `UPDATE user_sessions SET auth_level = 1, mfa_verified_at = CURRENT_TIMESTAMP
//          WHERE id = :id`,
//         { id: Buffer.from(payload.jti, 'hex') },
//     )
// }

// // --------------------------------------
// /**
//  * ГЕНЕРАЦІЯ ACCESS TOKEN
//  * Короткотривалий токен для авторизації запитів (без звернення до БД при кожному запиті)
//  */
// async function generateAccessToken(userId, sessionId, authLevel) {
//     return await new jose.SignJWT({
//             typ: 'Access',
//             auth_level: authLevel // Передаємо рівень довіри прямо в токен
//         })
//         .setProtectedHeader({ alg: 'HS256' })
//         .setSubject(userId.toString())
//         .setJti(sessionId.toString('hex')) // Зв'язуємо з ID сесії в БД
//         .setIssuedAt()
//         .setExpirationTime('15m') // Короткий час життя
//         .sign(SECRET);
// }

// /**
//  * ФУНКЦІЯ ПІДГОТОВКИ ПОВНОЇ ВІДПОВІДІ (Token Pair)
//  */
// async function generateTokenPair(connection, sessionData) {
//     const { userId, sessionId, authLevel, familyId, refreshCount, deviceInfo, ipAddress, fingerprint } = sessionData;

//     // 1. Генеруємо Refresh Token (довготривалий)
//     const refreshToken = await new jose.SignJWT({ typ: 'Refresh' })
//         .setProtectedHeader({ alg: 'HS256' })
//         .setJti(sessionId.toString('hex'))
//         .setSubject(userId.toString())
//         .setExpirationTime('7d')
//         .sign(SECRET);

//     // 2. Генеруємо Access Token (короткотривалий)
//     const accessToken = await generateAccessToken(userId, sessionId, authLevel);

//     // 3. Записуємо/Оновлюємо сесію в Oracle (як у попередніх кроках)
//     // ... тут виконується ваш INSERT або UPDATE ...

//     return {
//         accessToken,
//         refreshToken,
//         expiresIn: 900, // 15 хвилин у секундах
//         tokenType: 'Bearer'
//     };
// }

// // Приклад Middleware для Express
// import * as jose from 'jose'
// import { isBlacklisted } from './blacklistService.js'

// export async function authenticateRequest(req, res, next) {
//     const authHeader = req.headers.authorization
//     if (!authHeader?.startsWith('Bearer ')) return res.status(401).send('No token')

//     const token = authHeader.split(' ')[1]

//     try {
//         const { payload } = await jose.jwtVerify(token, SECRET)

//         // 1. ПЕРЕВІРКА В REDIS (Blacklist)
//         // jti — це унікальний ID нашої сесії з Oracle
//         const blacklisted = await isBlacklisted(payload.jti)
//         if (blacklisted) {
//             return res.status(401).json({ error: 'TOKEN_REVOKED' })
//         }

//         req.user = {
//             id: payload.sub,
//             sessionId: payload.jti,
//             authLevel: payload.auth_level,
//         }

//         next()
//     } catch (err) {
//         return res.status(401).json({ error: 'INVALID_TOKEN' })
//     }
// }

// import { createClient } from 'redis'

// const redisClient = createClient({ url: 'redis://localhost:6379' })
// redisClient.on('error', (err) => console.error('Redis Error', err))
// await redisClient.connect()

// /**
//  * ДОДАВАННЯ ТОКЕНА В ЧОРНИЙ СПИСОК
//  * @param {string} jti - ID сесії з токена
//  * @param {number} ttlSeconds - скільки ще житиме Access токен (зазвичай 900 сек)
//  */
// export async function addToBlacklist(jti, ttlSeconds) {
//     if (ttlSeconds <= 0) return
//     // Ключ у форматі bl_jti:ID_СЕСІЇ
//     await redisClient.set(`bl:${jti}`, 'revoked', {
//         EX: ttlSeconds,
//     })
// }

// /**
//  * ПЕРЕВІРКА, ЧИ ТОКЕН АНУЛЬОВАНО
//  */
// export async function isBlacklisted(jti) {
//     const result = await redisClient.get(`bl:${jti}`)
//     return result !== null
// }

// export async function fullLogout(connection, accessToken) {
//     try {
//         const { payload } = await jose.jwtVerify(accessToken, SECRET)
//         const jti = payload.jti
//         const remainingTime = Math.max(0, payload.exp - Math.floor(Date.now() / 1000))

//         // 1. Додаємо в Redis, щоб миттєво анулювати Access Token
//         await addToBlacklist(jti, remainingTime)

//         // 2. Оновлюємо Oracle, щоб анулювати Refresh Token (ланцюжок)
//         await connection.execute(
//             `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = :id`,
//             { id: Buffer.from(jti, 'hex') },
//         )

//         return true
//     } catch (e) {
//         return false
//     }
// }

// // ---------------------------------- USERS ---------------------------------------------------------

// import oracledb from 'oracledb'
// import crypto from 'crypto'
// import { addToBlacklist } from './blacklistService.js' // Імпорт вашого сервісу Redis

// oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT
// oracledb.autoCommit = true

// /**
//  * 1. РЕЄСТРАЦІЯ КОРИСТУВАЧА
//  */
// export async function createUser(connection, { email, passwordHash, maxSessions = 5 }) {
//     const sql = `
//         INSERT INTO users (
//             email,
//             password_hash,
//             max_sessions,
//             status,
//             active_sessions_count,
//             token_valid_after
//         ) VALUES (
//             :email,
//             :passwordHash,
//             :maxSessions,
//             'ACTIVE',
//             0,
//             CURRENT_TIMESTAMP
//         ) RETURNING id INTO :id`

//     try {
//         const result = await connection.execute(sql, {
//             email: email,
//             passwordHash: passwordHash,
//             maxSessions: maxSessions,
//             id: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT },
//         })
//         return result.outBinds.id[0]
//     } catch (err) {
//         if (err.message.includes('ORA-00001')) {
//             throw new Error('EMAIL_ALREADY_EXISTS')
//         }
//         throw err
//     }
// }

// /**
//  * 2. КОНТРОЛЬ ЛІМІТУ СЕСІЙ (FIFO РОТАЦІЯ)
//  * Викликається безпосередньо перед створенням нової сесії.
//  */
// export async function handleSessionLimits(connection, userId) {
//     // Блокуємо рядок користувача для запобігання Race Condition
//     const userRes = await connection.execute(
//         `SELECT max_sessions, active_sessions_count FROM users WHERE id = :userId FOR UPDATE`,
//         { userId },
//     )

//     if (userRes.rows.length === 0) throw new Error('USER_NOT_FOUND')
//     const user = userRes.rows[0]

//     // Якщо обмежень немає (NULL), просто збільшуємо лічильник і виходимо
//     if (user.MAX_SESSIONS === null) {
//         await connection.execute(
//             `UPDATE users SET active_sessions_count = active_sessions_count + 1 WHERE id = :userId`,
//             { userId },
//         )
//         return
//     }

//     // Якщо ліміт досягнуто або перевищено
//     if (user.ACTIVE_SESSIONS_COUNT >= user.MAX_SESSIONS) {
//         // Знаходимо найстарішу активну сесію (за датою останньої активності)
//         const oldestRes = await connection.execute(
//             `SELECT id FROM user_sessions
//              WHERE user_id = :userId AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
//              ORDER BY last_activity ASC FETCH FIRST 1 ROWS ONLY`,
//             { userId },
//         )

//         if (oldestRes.rows.length > 0) {
//             const oldestId = oldestRes.rows[0].ID

//             // 1. Анулюємо стару сесію в Oracle
//             await connection.execute(
//                 `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = :id`,
//                 { id: oldestId },
//             )

//             // 2. Додаємо JTI старої сесії в Redis Blacklist для миттєвого блокування Access Token
//             const jti = oldestId.toString('hex')
//             await addToBlacklist(jti, 900) // 15 хвилин (стандартний TTL Access токена)

//             // Лічильник не інкрементуємо, бо ми замінили 1 стару на 1 нову (баланс 0)
//         } else {
//             // Якщо в таблиці сесій менше записів, ніж каже лічильник (розсинхрон)
//             await connection.execute(
//                 `UPDATE users SET active_sessions_count = active_sessions_count + 1 WHERE id = :userId`,
//                 { userId },
//             )
//         }
//     } else {
//         // Якщо місце в ліміті є
//         await connection.execute(
//             `UPDATE users SET active_sessions_count = active_sessions_count + 1 WHERE id = :userId`,
//             { userId },
//         )
//     }
// }

// /**
//  * 3. ГЛОБАЛЬНЕ СКИНУТТЯ СЕСІЙ (FORCE LOGOUT)
//  * Викликається при зміні пароля або за запитом "Вийти всюди".
//  */
// export async function forceGlobalLogout(connection, userId) {
//     // Оновлюємо дату валідності токенів та скидаємо лічильник
//     await connection.execute(
//         `UPDATE users
//          SET token_valid_after = CURRENT_TIMESTAMP,
//              active_sessions_count = 0
//          WHERE id = :userId`,
//         { userId },
//     )

//     // Позначаємо всі існуючі сесії як відкликані в Oracle
//     await connection.execute(
//         `UPDATE user_sessions
//          SET revoked_at = CURRENT_TIMESTAMP
//          WHERE user_id = :userId AND revoked_at IS NULL`,
//         { userId },
//     )

//     // Примітка: Access токени будуть відсіяні Middleware через перевірку token_valid_after
// }

// /**
//  * 4. ОБРОБКА НЕВДАЛОГО ВХОДУ (BRUTE-FORCE PROTECTION)
//  */
// export async function handleFailedLogin(connection, userId) {
//     const maxAttempts = 5
//     const lockoutMinutes = 15

//     await connection.execute(
//         `UPDATE users
//          SET failed_attempts = failed_attempts + 1,
//              lockout_until = CASE
//                 WHEN failed_attempts + 1 >= :maxAttempts
//                 FROM CURRENT_TIMESTAMP + INTERVAL '${lockoutMinutes}' MINUTE
//                 ELSE lockout_until
//              END,
//              status = CASE
//                 WHEN failed_attempts + 1 >= :maxAttempts THEN 'LOCKED'
//                 ELSE status
//              END
//          WHERE id = :userId`,
//         { userId, maxAttempts },
//     )
// }

// /**
//  * 5. СКИДАННЯ ЛІЧИЛЬНИКА ПОМИЛОК (ПРИ УСПІШНОМУ ВХОДІ)
//  */
// export async function resetFailedAttempts(connection, userId) {
//     await connection.execute(
//         `UPDATE users
//          SET failed_attempts = 0,
//              lockout_until = NULL,
//              status = 'ACTIVE'
//          WHERE id = :userId`,
//         { userId },
//     )
// }

// /**
//  * 6. ДЕКРЕМЕНТ ЛІЧИЛЬНИКА СЕСІЙ (LOGOUT)
//  */
// export async function decrementActiveSessions(connection, userId) {
//     await connection.execute(
//         `UPDATE users
//          SET active_sessions_count = CASE
//             WHEN active_sessions_count > 0 THEN active_sessions_count - 1
//             ELSE 0
//          END
//          WHERE id = :userId`,
//         { userId },
//     )
// }

// /**
//  * 7. ПЕРЕВІРКА СТАНУ АКАУНТА ПЕРЕД ВХОДОМ
//  */
// export async function getUserForAuth(connection, email) {
//     const result = await connection.execute(
//         `SELECT id, password_hash, status, lockout_until, token_valid_after
//          FROM users WHERE email = :email`,
//         { email },
//     )

//     if (result.rows.length === 0) return null
//     const user = result.rows[0]

//     // Перевірка на тимчасове блокування
//     if (
//         user.STATUS === 'LOCKED' &&
//         user.LOCKOUT_UNTIL &&
//         new Date() < new Date(user.LOCKOUT_UNTIL)
//     ) {
//         throw new Error('ACCOUNT_TEMPORARILY_LOCKED')
//     }

//     return user
// }

// /**
//  * ОТРИМАННЯ ВСІХ НАЛАШТУВАНЬ
//  */
// export async function getUserSettings(connection, userId) {
//     const sql = `SELECT settings_data FROM user_settings WHERE user_id = :userId`;
//     const res = await connection.execute(sql, { userId });

//     // Oracle повертає JSON як об'єкт або рядок (залежить від версії драйвера)
//     return res.rows[0]?.SETTINGS_DATA || {};
// }

// /**
//  * ОНОВЛЕННЯ ПЕВНОГО НАЛАШТУВАННЯ (Merge)
//  */
// export async function updateUserSettings(connection, userId, newSettings) {
//     // Використовуємо JSON_MERGEPATCH, щоб оновити тільки частину JSON
//     const sql = `
//         UPDATE user_settings
//         SET settings_data = JSON_MERGEPATCH(settings_data, :newSettings),
//             updated_at = CURRENT_TIMESTAMP
//         WHERE user_id = :userId`;

//     await connection.execute(sql, {
//         userId,
//         newSettings: JSON.stringify(newSettings)
//     });
// }
