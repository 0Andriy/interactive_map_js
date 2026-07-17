// middleware/auth.js
export async function checkAndRefreshAuth(req, res, next) {
  let accessToken = req.cookies?.access_token;
  const refreshToken = req.cookies?.refresh_token;

  if (!accessToken && !refreshToken) {
    return res.redirect('/login');
  }

  // 1. Функція для перевірки, чи токен прострочений (можна розпарсити JWT без перевірки підпису)
  const isTokenExpired = (token) => {
    if (!token) return true;
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.exp * 1000 < Date.now(); // Порівнюємо з поточним часом
  };

  // 2. Якщо access-токен застарів, але є refresh-токен — оновлюємо
  if (isTokenExpired(accessToken) && refreshToken) {
    try {
      const response = await fetch('https://yourdomain.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (!response.ok) throw new Error('Refresh failed');

      const data = await response.json();
      
      // Оновлюємо куки новими токенами
      res.cookie('access_token', data.accessToken, { httpOnly: true, secure: true, sameSite: 'Lax' });
      res.cookie('refresh_token', data.refreshToken, { httpOnly: true, secure: true, sameSite: 'Lax' });

      // Записуємо новий токен в об'єкт запиту, щоб ручки нижче могли його використати
      req.accessToken = data.accessToken;
      return next();
    } catch (err) {
      // Якщо рефреш не вдався (наприклад, refresh токен теж згнить) — на логін
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
      return res.redirect('/login');
    }
  }

  // 3. Якщо токен ще живий, просто передаємо його далі
  req.accessToken = accessToken;
  next();
}


// 
import { checkAndRefreshAuth } from './middleware/auth.js';

// Захищаємо окремі SSR ручки
app.get('/dashboard', checkAndRefreshAuth, async (req, res) => {
  // Токен гарантовано свіжий і лежить в req.accessToken
  const response = await fetch(`.../profile`, {
    headers: { 'Authorization': `Bearer ${req.accessToken}` }
  });
  const data = await response.json();
  res.render('dashboard', { user: data });
});

app.get('/settings', checkAndRefreshAuth, async (req, res) => {
  // Тут логіка для налаштувань, токен знову свіжий
});


// 
app.use('/api', createProxyMiddleware({
  target: 'https://yourdomain.com',
  changeOrigin: true,
  on: {
    proxyRes: async (proxyRes, req, res) => {
      // Якщо API відповіло 401, а у користувача є refresh_token
      if (proxyRes.statusCode === 401 && req.cookies?.refresh_token) {
        
        // 1. Прямо звідси робимо запит на REST API для оновлення токенів
        const refreshResponse = await fetch('https://yourdomain.com/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: req.cookies.refresh_token })
        });

        if (refreshResponse.ok) {
          const tokens = await refreshResponse.json();

          // 2. Сетаємо нові куки в браузер
          res.cookie('access_token', tokens.accessToken, { httpOnly: true, secure: true });
          res.cookie('refresh_token', tokens.refreshToken, { httpOnly: true, secure: true });

          // 3. Повторюємо оригінальний запит користувача з новим токеном
          const originalUrl = 'https://yourdomain.com' + req.url;
          const retryResponse = await fetch(originalUrl, {
            method: req.method,
            headers: {
              ...req.headers,
              'Authorization': `Bearer ${tokens.accessToken}`
            },
            body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
          });

          // Віддаємо результат повторного запиту клієнту
          res.status(retryResponse.status);
          return retryResponse.body.pipe(res);
        }
      }
    }
  }
}));
