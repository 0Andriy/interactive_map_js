import express from 'express';
import cookieParser from 'cookie-parser';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
app.use(cookieParser());

const API_URL = 'https://yourdomain.com'; // Адреса вашого REST API

// ---- 1. ПРОКСІ ДЛЯ КЛІЄНТСЬКИХ ЗАПИТІВ (AJAX / Fetch) ----
// Усі запити з браузера на /api/* автоматично полетять на REST API
app.use('/api', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // видаляємо префікс /api перед відправкою на REST API
  },
  on: {
    proxyReq: (proxyReq, req, res) => {
      // Дістаємо JWT з захищених кук сайту
      const accessToken = req.cookies?.access_token;
      if (accessToken) {
        // Додаємо його у заголовок для REST API
        proxyReq.setHeader('Authorization', `Bearer ${accessToken}`);
      }
    }
  }
}));

// ---- 2. РЕНДЕРИНГ СТОРІНОК НА СЕРВЕРІ (SSR) ----
app.get('/dashboard', async (req, res) => {
  const accessToken = req.cookies?.access_token;

  if (!accessToken) {
    return res.redirect('/login');
  }

  try {
    // Робимо прямий запит до REST API з сервера сайту
    const response = await fetch(`${API_URL}/users/profile`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (response.status === 401) {
      // Тут логіка оновлення токену через Refresh (див. пункт 4)
      return res.redirect('/login');
    }

    const userData = await response.json();

    // Рендеримо HTML (наприклад, через EJS, Pug або React SSR)
    res.render('dashboard', { user: userData });
  } catch (error) {
    res.status(500).send('Помилка сервера сайту');
  }
});

app.listen(3000, () => console.log('Сайт запущено на порту 3000'));
