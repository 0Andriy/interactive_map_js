import express from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import Redis from 'ioredis';
import cookieParser from 'cookie-parser';

const app = express();
app.use(express.json());
app.use(cookieParser());

const API_URL = 'https://yourdomain.com';

// 1. Ініціалізація Redis
const redisClient = new Redis('redis://localhost:6379');

app.use(session({
  store: new RedisStore({ client: redisClient, prefix: 'sess:' }),
  secret: 'super-secret-key-of-your-website',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true, // В продакшені обов'язково true (HTTPS)
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 // 1 день
  }
}));

// Об'єкт у пам'яті сервера для блокування паралельних запитів на оновлення токена
const refreshLocks = new Map();

// ---- МІДЛВАРА АВТОРИЗАЦІЇ ТА ЗАХИСТУ ВІД RACE CONDITION ----
async function checkAuth(req, res, next) {
  if (!req.session?.apiTokens || !req.session?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = req.session.userId;
  let { accessToken, refreshToken, expiresAt } = req.session.apiTokens;

  // Якщо access_token ще живий — просто пропускаємо запит далі
  if (Date.now() < expiresAt) {
    req.accessToken = accessToken;
    return next();
  }

  // ---- ВИРІШЕННЯ RACE CONDITION (Блокування паралельних рефрешів) ----
  if (refreshLocks.has(userId)) {
    // Якщо цей користувач вже оновлює токен в іншому запиті, чекаємо на завершення
    await refreshLocks.get(userId);
    // Беремо вже оновлений токен з сесії (яка змінилася під час очікування)
    req.accessToken = req.session.apiTokens.accessToken;
    return next();
  }

  // Створюємо Promise-замок для поточного користувача
  let resolveLock;
  const lockPromise = new Promise((resolve) => { resolveLock = resolve; });
  refreshLocks.set(userId, lockPromise);

  try {
    // Запит до REST API для оновлення токенів
    const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!refreshResponse.ok) throw new Error('Refresh token invalid');

    const newTokens = await refreshResponse.json();

    // Оновлюємо дані в сесії Express
    req.session.apiTokens = {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresAt: Date.now() + 15 * 60 * 1000 // +15 хвилин
    };

    req.accessToken = newTokens.accessToken;
    
    // Зберігаємо сесію в Redis примусово перед тим, як відпустити інші запити
    await new Promise((resolve) => req.session.save(resolve));

    next();
  } catch (err) {
    // Якщо рефреш не вдався — знищуємо сесію
    req.session.destroy();
    res.status(401).json({ error: 'Session expired' });
  } finally {
    // Знімаємо замок і видаляємо його з пам'яті
    resolveLock();
    refreshLocks.delete(userId);
  }
}

// ---- РУЧКА ЛОГІНУ + ЗАХИСТ ВІД ОДНОЧАСНИХ СЕСІЙ ----
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. Автентифікація на REST API
    const apiResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!apiResponse.ok) return res.status(401).json({ error: 'Invalid credentials' });
    
    const data = await apiResponse.json(); // Очікуємо токени та ID користувача від API
    const userId = data.user.id;

    // ---- КЛЮЧОВИЙ МОМЕНТ: Захист від паралельних пристроїв ----
    // Шукаємо в Redis, чи є у цього користувача вже активна сесія
    const userSessionKey = `user_sess:${userId}`;
    const oldSessionId = await redisClient.get(userSessionKey);

    if (oldSessionId) {
      // Якщо стара сесія існує — видаляємо її з Redis.
      // Користувача на старому пристрої автоматично розлогінить при наступному запиті.
      await redisClient.del(`sess:${oldSessionId}`);
    }

    // 2. Створюємо нову сесію на сайті
    req.session.userId = userId;
    req.session.apiTokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + 15 * 60 * 1000
    };

    // Примусово зберігаємо сесію, щоб отримати її ID
    await new Promise((resolve) => req.session.save(resolve));

    // 3. Зв'язуємо ID користувача з новим ID сесії в Redis
    await redisClient.set(userSessionKey, req.sessionID, 'EX', 60 * 60 * 24);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- МЕХАНІЗМ ПОВНОГО LOGOUT ----
app.post('/logout', checkAuth, async (req, res) => {
  const userId = req.session.userId;
  const refreshToken = req.session.apiTokens.refreshToken;

  try {
    // 1. Повідомляємо REST API, щоб воно анулювало Refresh Token у себе в базі
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
  } catch (err) {
    console.error('API logout failed, continuing local logout...');
  }

  // 2. Видаляємо зв'язку "користувач-сесія" з Redis
  await redisClient.del(`user_sess:${userId}`);

  // 3. Знищуємо сесію Express (видаляються куки та запис `sess:ID` з Redis)
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not log out' });
    res.clearCookie('connect.sid'); // Видаляємо куку сесії з браузера
    res.json({ success: true });
  });
});

// ---- ПРИКЛАД ЗАХИЩЕНОЇ РУЧКИ ДЛЯ SSR АБО АПІ ----
app.get('/dashboard-data', checkAuth, async (req, res) => {
  const response = await fetch(`${API_URL}/dashboard`, {
    headers: { 'Authorization': `Bearer ${req.accessToken}` }
  });
  const data = await response.json();
  res.json(data);
});

app.listen(3000, () => console.log('BFF Server running on port 3000'));
