// import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron';
// import path from 'path';
// import { config } from './config.js';
// import { store } from './store.js';

// let tray = null;
// const windows = {};

// // Перевірка на один екземпляр
// if (!config.allowMulti && !app.requestSingleInstanceLock()) {
//   app.quit();
// }

// // Функція розрахунку позицій
// function getPosition(pos, width, height) {
//   const { width: scrW, height: scrH } = screen.getPrimaryDisplay().workAreaSize;
//   const map = {
//     'top-right':    { x: scrW - width, y: 0 },
//     'bottom-right': { x: scrW - width, y: scrH - height },
//     'center':       { x: (scrW - width) / 2, y: (scrH - height) / 2 }
//   };
//   return map[pos] || map['center'];
// }

// // Універсальне створення вікон
// function createWin(name, opts = {}) {
//   if (windows[name]) return windows[name].focus();

//   const saved = store.get(`win-${name}`) || {};
//   const win = new BrowserWindow({
//     width: opts.w || saved.w || 800,
//     height: opts.h || saved.h || 600,
//     x: opts.x ?? saved.x,
//     y: opts.y ?? saved.y,
//     frame: opts.frame ?? true,
//     transparent: opts.transparent ?? false,
//     alwaysOnTop: opts.sticky ?? false,
//     skipTaskbar: opts.isWidget ?? false,
//     webPreferences: {
//       preload: path.join(config.root, 'preload.js'),
//       contextIsolation: true,
//       sandbox: true
//     }
//   });

//   // Завантаження: або URL, або локальний файл
//   if (config.siteUrl.startsWith('http')) {
//     win.loadURL(`${config.siteUrl}${opts.path || ''}`);
//   } else {
//     win.loadFile(path.join(config.root, opts.file || 'index.html'));
//   }

//   win.on('close', () => {
//     store.set(`win-${name}`, win.getBounds());
//     delete windows[name];
//   });

//   windows[name] = win;
//   return win;
// }

// // Системний трей
// function createTray() {
//   const icon = nativeImage.createEmpty(); // Або шлях до вашої .png
//   tray = new Tray(icon);
//   const contextMenu = Menu.buildFromTemplate([
//     { label: 'Показати головне', click: () => createWin('main') },
//     { label: 'Відкрити чат', click: () => ipcMain.emit('action', {}, { type: 'open-chat' }) },
//     { type: 'separator' },
//     { label: 'Вихід', click: () => { app.isQuitting = true; app.quit(); } }
//   ]);
//   tray.setToolTip('Мій Electron Додаток');
//   tray.setContextMenu(contextMenu);
// }

// app.whenReady().then(() => {
//   createTray();
//   createWin('main');

//   // Автозапуск
//   if (app.isPackaged) {
//     app.setLoginItemSettings({ openAtLogin: store.get('autoStart') || false });
//   }

//   // Обробка команд від сайту (IPC)
//   ipcMain.on('action', (event, data) => {
//     switch (data.type) {
//       case 'open-chat':
//         const coords = getPosition('bottom-right', 350, 500);
//         createWin('chat', { 
//           file: 'chat.html', w: 350, h: 500, 
//           x: coords.x, y: coords.y, 
//           frame: false, transparent: true, sticky: true, isWidget: true 
//         });
//         break;
//       case 'set-autostart':
//         store.set('autoStart', data.state);
//         if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: data.state });
//         break;
//       case 'pin':
//         const focus = BrowserWindow.getFocusedWindow();
//         if (focus) focus.setAlwaysOnTop(data.state);
//         break;
//       case 'close':
//         if (windows[data.name]) windows[data.name].close();
//         break;
//     }
//   });
// });


















import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { store } from './store.js';
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const windows = {};
let tray = null;

if (!config.allowMulti && !app.requestSingleInstanceLock()) app.quit();

// createCustomWindow 
function createWin(name, opts = {}) {
 // Якщо вікно з такою назвою вже є — просто фокусуємо його
  if (windows[name]) {
    windows[name].focus();
    return windows[name];
  }

  const saved = store.get(`win-${name}`) || {};
  const win = new BrowserWindow({
    width: opts.w || saved.width || 800,
    height: opts.h || saved.height || 600,
    x: opts.x ?? saved.x,
    y: opts.y ?? saved.y,
    frame: opts.frame ?? true,                  // ПРИБИРАЄМО РАМКУ (кнопки закрити/згорнути)
    transparent: opts.transparent ?? false,     // Дозволяє прозорість (якщо сайт підтримує)
    alwaysOnTop: opts.sticky ?? false,          // Завжди поверх інших вікон
    skipTaskbar: opts.isWidget ?? false,        // Не показувати іконку в панелі задач (опціонально)
    resizable: false,                           // Забороняємо змінювати розмір мишкою
    show: true,                                 // Чи показувати вікно
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Обов'язково для безпеки
      nodeIntegration: false,    // ЗАБОРОНЕНО для зовнішніх сайтів
      contextIsolation: true,     // ОБОВ'ЯЗКОВО для безпеки
      sandbox: true               // Додатковий шар захисту
    }
  });

  if (config.siteUrl.startsWith('http')) {
    win.loadURL(`${config.siteUrl}${opts.path || ''}`);
  } else {
    win.loadFile(path.join(__dirname, opts.file || 'index.html'));
  }

  win.on('close', () => {
    store.set(`win-${name}`, win.getBounds());
    delete windows[name];
  });

  windows[name] = win;
  return win;
}

function getPos(pos, w, h) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const map = {
    'bottom-right': { x: sw - w - 20, y: sh - h - 20 },
    'top-left': { x: 20, y: 20 }
  };
  return map[pos] || { x: (sw-w)/2, y: (sh-h)/2 };
}

app.whenReady().then(() => {
  createWin('main');
  
  // Трей (використовуйте будь-яку іконку icon.png 32x32 у корені)
  const iconPath = path.join(__dirname, 'icon.png');
  tray = new Tray(fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Відкрити головне', click: () => createWin('main') },
    { type: 'separator' },
    { label: 'Вихід', click: () => { app.isQuitting = true; app.quit(); } }
  ]));

  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: store.get('autoStart') || false });

  ipcMain.on('action', (event, data) => {
    switch (data.type) {
      case 'open-chat':
        const p = getPos('bottom-right', 320, 450);
        createWin('chat', { file: 'chat.html', w: 320, h: 450, x: p.x, y: p.y, frame: false, transparent: true, sticky: true, isWidget: true });
        break;
      case 'set-autostart':
        store.set('autoStart', data.state);
        if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: data.state });
        break;
      case 'close':
        if (windows[data.name]) windows[data.name].close();
        break;
      case 'broadcast': // Передача даних між вікнами
        Object.values(windows).forEach(w => w.webContents.send('from-main', data.payload));
        break;
    }
  });

  // Приклад відправки даних з Main кожні 10 сек
  setInterval(() => {
    if (windows['main']) windows['main'].webContents.send('from-main', { msg: 'Системне оновлення', time: new Date().toLocaleTimeString() });
  }, 10000);
});
