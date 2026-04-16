import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = 3000;

// Налаштування шляхів для ES6 модулів
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- ЦЕЙ РЯДОК ПІДКЛЮЧАЄ ПАПКУ PUBLIC ---
app.use(express.static(path.join(__dirname, 'public')));

// Налаштування EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Головна сторінка
app.get('/', (req, res) => {
    const data = {
        title: 'Мій крутий сайт',
        message: 'Привіт! Це динамічний контент з Node.js',
        items: ['Node.js', 'Express', 'EJS', 'ES6']
    };
    res.render('index', data); // Рендеримо index.ejs і передаємо дані
});

app.get('/dashboard', (req, res) => {
    res.render('index', {
        appName: 'MySuperSystem',
        pageTitle: 'Дашборд Користувача',
        mainTitle: 'Аналітика за сьогодні',
        user: {
            name: 'Олександр',
            role: 'DevOps',
            email: 'alex@example.com',
            avatarInitials: 'О'
        },
        showRightSidebar: true,
        rightPanelTitle: 'Налаштування графіків',
        rightPanelContent: '<button>Оновити дані</button>',
        navItems: [
            { text: 'Головна', link: '/', active: true, icon: '<svg>...</svg>' },
            { text: 'Користувачі', link: '/users', active: false, icon: '<svg>...</svg>' }
        ]
    });
});

app.listen(port, () => {
    console.log(`Сервер запущено: http://localhost:${port}`);
});
