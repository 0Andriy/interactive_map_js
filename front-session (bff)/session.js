import express from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const app = express();

// 1. Налаштовуємо Redis для збереження сесій на сервері сайту
const redisClient = createClient({ url: 'redis://localhost:6379' });
await redisClient.connect();

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: 'super-secret-key-of-your-website', // Ключ для шифрування ID сесії
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true, // JS в браузері не має доступу
    secure: true,   // Тільки через HTTPS
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 // 1 день тривалість сесії сайту
  }
}));

// 2. Маршрут Логіну
app.post('/login', async (req, res) => {
  // Робимо запит до REST API для перевірки пароля
  const apiResponse = await fetch('https://yourdomain.com', { /* ... */ });
  const tokens = await apiResponse.json(); // Отримуємо access_token та refresh_token

  if (apiResponse.ok) {
    // ЗБЕРІГАЄМО ТОКЕНИ В СЕСІЮ НА СЕРВЕРІ (Браузер їх не бачить)
    req.session.apiTokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + 15 * 60 * 1000 // припустимо, 15 хвилин життя access токена
    };

    return res.redirect('/dashboard');
  }
  res.send('Логін невірний');
});

// 3. Мідлвара для захисту ручок сайту та автоматичного рефрешу
async function checkAuth(req, res, next) {
  if (!req.session?.apiTokens) {
    return res.redirect('/login');
  }

  let { accessToken, refreshToken, expiresAt } = req.session.apiTokens;

  // Якщо access_token в сесії закінчився — оновлюємо його на рівні сервера
  if (Date.now() >= expiresAt) {
    try {
      const refreshResponse = await fetch('https://yourdomain.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      const newTokens = await refreshResponse.json();
      
      // Перезаписуємо дані в сесії сервера
      req.session.apiTokens = {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresAt: Date.now() + 15 * 60 * 1000
      };
      
      accessToken = newTokens.accessToken;
    } catch (err) {
      req.session.destroy(); // Якщо рефреш збіг — видаляємо сесію
      return res.redirect('/login');
    }
  }

  req.accessToken = accessToken; // Передаємо валідний токен далі в ручку
  next();
}

// 4. Приклад використання на ручці сайту
app.get('/dashboard', checkAuth, async (req, res) => {
  // Робимо запит до API, використовуючи токен з req.accessToken
  const response = await fetch('https://yourdomain.com', {
    headers: { 'Authorization': `Bearer ${req.accessToken}` }
  });
  const data = await response.json();
  res.render('dashboard', { user: data });
});
