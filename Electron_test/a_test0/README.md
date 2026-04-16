my-electron-app/
├── 📂 src/
│   ├── 📂 main/            # Логіка основного процесу
│   │   ├── main.js         # Точка входу
│   │   ├── config.js       # Налаштування (.env)
│   │   ├── store.js        # Робота з файлом налаштувань
│   │   └── tray.js         # Налаштування системного трея
│   ├── 📂 preload/         # Скрипти-мітки (Bridge)
│   │   └── index.js        # contextBridge.exposeInMainWorld
│   └── 📂 renderer/        # Весь ваш фронтенд (HTML/CSS/JS)
│       ├── 📂 common/      # Спільні стилі та скрипти
│       ├── index.html      # Головне вікно
│       └── chat.html       # Вікно чату
├── 📂 resources/           # Статичні файли (іконки, картинки)
│   └── icon.png
├── .env.development        # Налаштування для розробки
├── .env.production         # Налаштування для білду
├── package.json
└── README.md



<!--  -->

const getRootPath = () => {
  if (app.isPackaged) {
    // Шлях до папки з .exe після встановлення
    return path.dirname(app.getPath('exe'));
  } else {
    // Шлях відносно файлу, де лежить цей код
    // Якщо цей файл у папці /src, піднімаємось на рівень вище (..), щоб знайти корінь
    return path.resolve(__dirname, '..'); 
  }
};

const root = getRootPath();
console.log('Точний шлях до кореня проєкту:', root);



import { app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Універсальний корінь (враховуючи, що файл може бути в папці src)
const root = app.isPackaged 
  ? path.dirname(app.getPath('exe')) 
  : path.resolve(__dirname, '..'); 


<!--  -->



export const config = {
  // ... ваші інші налаштування
  allowMultiInstance: process.env.ALLOW_MULTI === 'true' || false,
};

<!--  -->


import { app, BrowserWindow } from 'electron';
import { config } from './config.js';

// 1. Перевіряємо: чи ми хочемо обмежити запуск?
// Якщо розраховано на один екземпляр (флажок false)
if (!config.allowMultiInstance) {
  const additionalData = { myKey: 'main-instance' };

   // 2. Просимо у системи "замок"
  const gotTheLock = app.requestSingleInstanceLock(additionalData);

  if (!gotTheLock) {
    // 3. Якщо замок ВЖЕ КИМОСЬ ЗАЙНЯТИЙ (gotLock буде false)
    // Якщо замок не отримано, значить програма вже запущена
    console.log("Додаток вже працює. Закриваємо цей екземпляр.");
    app.quit();  // Просто вимикаємо цей другий екземпляр
  } else {
    // 4. (Опціонально) Якщо хтось клікнув на ярлик вдруге, 
    // ми не відкриваємо нове вікно, а просто показуємо старе
    // Якщо хтось намагається запустити другу копію, фокусуємо першу
    app.on('second-instance', (event, commandLine, workingDirectory, additionalData) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}


<!--  -->

const { width, height } = screen.getPrimaryDisplay().workAreaSize;
// Тепер ви знаєте розмір екрана користувача і можете виставити вікно в кут


<!--  -->

import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { config } from './config.js';

// Функція перемикання автозавантаження (можна викликати з сайту)
function setAutoLaunch(enabled) {
  if (!app.isPackaged) return; // Не працює в режимі розробки
  
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe') // Шлях до вашого .exe
  });
}

// Універсальна функція для розрахунку позицій
function getPosition(pos, width, height) {
  const { width: scrW, height: scrH } = screen.getPrimaryDisplay().workAreaSize;
  
  const positions = {
    'top-right':    { x: scrW - width, y: 0 },
    'top-left':     { x: 0, y: 0 },
    'bottom-right': { x: scrW - width, y: scrH - height },
    'bottom-left':  { x: 0, y: scrH - height },
    'center':       { x: Math.floor((scrW - width) / 2), y: Math.floor((scrH - height) / 2) }
  };
  
  return positions[pos] || positions['center'];
}

// Обробка нових команд від сайту
ipcMain.on('window-action', (event, data) => {
  const focusedWin = BrowserWindow.getFocusedWindow();

  switch (data.action) {
    case 'set-autostart': // Увімкнути/вимкнути автозавантаження
      setAutoLaunch(data.state);
      break;

    case 'create-pinned': // Створити вікно в конкретному куті
      const coords = getPosition(data.position, data.w, data.h);
      const newWin = createWin({ 
        width: data.w, 
        height: data.h, 
        x: coords.x, 
        y: coords.y,
        url: data.url 
      });
      newWin.setAlwaysOnTop(data.sticky || false);
      break;

    case 'move': // Перемістити поточне вікно
      if (focusedWin) {
        const newPos = getPosition(data.position, focusedWin.getBounds().width, focusedWin.getBounds().height);
        focusedWin.setPosition(newPos.x, newPos.y, true);
      }
      break;
  }
});



<!--  -->
/* На сторінці чату або сповіщення */
.header-area {
  -webkit-app-region: drag; /* Дозволяє перетягувати вікно за цей елемент */
  height: 40px;
  background: #333;
  cursor: grab;
}

button, input {
  -webkit-app-region: no-drag; /* Кнопки та інпути всередині шапки мають бути клікабельними */
}

body {
  margin: 0;
  padding: 0;
  background: transparent; /* Важливо для transparent: true в Electron */
  overflow: hidden;
}

.widget-container {
  background: rgba(255, 255, 255, 0.95); /* Напівпрозорий фон */
  border-radius: 15px;                  /* Закруглені кути */
  box-shadow: 0 8px 30px rgba(0,0,0,0.3);
  border: 1px solid #ddd;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

<!--  -->
%AppData%
<!--  -->


import { shell, ipcMain } from 'electron';
import { exec, spawn } from 'child_process';
import path from 'path';

// ... всередині ipcMain.on('action', (event, data) => {
switch (data.type) {
  
  // 1. Відкриття посилання в браузері за замовчуванням
  case 'open-link':
    shell.openExternal(data.url);
    break;

  // 2. Відкриття папки (локальної або мережевої)
  case 'open-path':
    // shell.openPath працює з шляхами виду "C:\\Folder" або "\\\\Server\\Share"
    shell.openPath(data.path);
    break;

  // 3. Запуск CMD скрипта (Прив'язаний процес - закриється разом з Electron)
  case 'run-cmd':
    exec(data.command, (error, stdout, stderr) => {
      if (error) console.error(`Помилка: ${error.message}`);
      // Можна відправити результат назад у вікно
      event.reply('from-main', { msg: 'CMD виконано', out: stdout });
    });
    break;

  // 4. Запуск CMD скрипта (Відв'язаний процес - живе сам по собі)
  case 'run-detached':
    const child = spawn(data.command, [], {
      detached: true,         // Відв'язати
      stdio: 'ignore',        // Не чекати на ввід/вивід
      shell: true,            // Використовувати оболонку системи
      windowsHide: false      // Показати або приховати вікно консолі
    });
    child.unref(); // Дозволяє Electron закритися незалежно від дитини
    break;
}


<!--  -->


// Об'єкт для зберігання посилань на важкі процеси (якщо треба їх потім вбити)
const activeProcesses = {};

ipcMain.on('action', (event, data) => {
  switch (data.type) {
    
    // --- 1. РОБОТА З ПОСИЛАННЯМИ ТА ПАПКАМИ ---
    case 'open-link':
      shell.openExternal(data.url); // Відкриє в браузері за замовчуванням
      break;

    case 'open-path':
      // Відкриє папку (C:\Folder) або мережевий шлях (\\Server\Share)
      shell.openPath(data.path).then((err) => {
        if (err) console.error('Помилка відкриття шляху:', err);
      });
      break;

    // --- 2. ПРОСТІ КОМАНДИ (exec) ---
    // Підходить для швидких команд: echo, mkdir, зміна реєстру
    case 'run-simple':
      exec(data.command, (error, stdout, stderr) => {
        event.reply('from-main', { 
          msg: 'Результат команди', 
          out: stdout || stderr, 
          success: !error 
        });
      });
      break;

    // --- 3. ВАЖКІ / ВІДВ'ЯЗАНІ ПРОЦЕСИ (spawn) ---
    // Підходить для запуску інших програм (.exe) або довгих скриптів (.bat)
    case 'run-heavy':
      const processId = data.id || Date.now().toString();
      
      const child = spawn(data.command, data.args || [], {
        cwd: data.cwd || process.cwd(), // Робоча папка
        detached: data.detached || false, // true = живе після закриття Electron
        shell: true,
        windowsHide: data.hidden || false // приховати вікно консолі
      });

      if (data.detached) {
        child.unref(); // "Відпускаємо" процес у вільне плавання
      } else {
        // Якщо процес прив'язаний, стежимо за його виводом
        activeProcesses[processId] = child;

        child.stdout.on('data', (output) => {
          event.reply('from-main', { msg: `Log [${processId}]`, out: output.toString() });
        });

        child.on('exit', (code) => {
          event.reply('from-main', { msg: `Процес ${processId} завершено`, code });
          delete activeProcesses[processId];
        });
      }
      break;

    // Зупинити важкий процес за ID
    case 'kill-process':
      if (activeProcesses[data.id]) {
        activeProcesses[data.id].kill();
        delete activeProcesses[data.id];
      }
      break;
  }
});

<!--  -->


import { Tray, Menu, nativeImage, ipcMain, app } from 'electron';
import path from 'path';

let tray = null;

// Функція оновлення трея
function updateTrayMenu(items = []) {
  if (!tray) {
    // Створюємо трей, якщо його ще немає
    const icon = nativeImage.createFromPath(path.join(config.root, 'resources/icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
  }

  // Перетворюємо масив з сайту у формат меню Electron
  const template = items.map(item => {
    if (item.type === 'separator') return { type: 'separator' };

    return {
      label: item.label,
      // Якщо є іконка (шлях або base64), перетворюємо її в nativeImage
      icon: item.icon ? nativeImage.createFromPath(path.join(config.root, item.icon)).resize({ width: 16 }) : null,
      click: () => {
        // Відправляємо сигнал назад на сайт, що на пункт натиснули
        const mainWin = Object.values(windows)[0]; // Беремо головне вікно
        if (mainWin) mainWin.webContents.send('tray-click', { id: item.id });
      }
    };
  });

  // Завжди додаємо дефолтний вихід в кінці
  template.push({ type: 'separator' });
  template.push({ label: 'Вихід', click: () => app.quit() });

  const contextMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(contextMenu);
}

// Додаємо в IPC
ipcMain.on('action', (event, data) => {
  if (data.type === 'update-tray') {
    updateTrayMenu(data.items);
  }
});

<!--  -->


import { Tray, Menu, nativeImage, ipcMain, app, net } from 'electron';
import path from 'path';

let tray = null;

// Допоміжна функція для створення NativeImage з будь-якого джерела
async function getImage(source) {
  if (!source) return null;

  try {
    // 1. Якщо це Base64
    if (source.startsWith('data:image')) {
      return nativeImage.createFromDataURL(source);
    }

    // 2. Якщо це URL (http/https)
    if (source.startsWith('http')) {
      const response = await net.fetch(source);
      const buffer = await response.arrayBuffer();
      return nativeImage.createFromBuffer(Buffer.from(buffer));
    }

    // 3. Якщо це локальний шлях (відносно кореня або абсолютний)
    const fullPath = path.isAbsolute(source) ? source : path.join(config.root, source);
    return nativeImage.createFromPath(fullPath);
  } catch (e) {
    console.error('Помилка завантаження іконки:', e);
    return null;
  }
}

async function updateTray(data) {
  const { items = [], tooltip, trayIcon } = data;

  // 1. Створення або оновлення основної іконки трея
  if (!tray) {
    const icon = trayIcon ? await getImage(trayIcon) : nativeImage.createEmpty();
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
  } else if (trayIcon) {
    const icon = await getImage(trayIcon);
    tray.setImage(icon.resize({ width: 16, height: 16 }));
  }

  // 2. Встановлення підказки (ToolTip)
  if (tooltip) tray.setToolTip(tooltip);

  // 3. Побудова меню з іконками елементів
  const template = await Promise.all(items.map(async (item) => {
    if (item.type === 'separator') return { type: 'separator' };

    const itemIcon = item.icon ? await getImage(item.icon) : null;

    return {
      label: item.label,
      icon: itemIcon ? itemIcon.resize({ width: 16, height: 16 }) : null,
      click: () => {
        // Відправка події на фронтенд
        const mainWin = Object.values(windows)[0]; // Беремо перше доступне вікно
        if (mainWin) mainWin.webContents.send('tray-click', { id: item.id });
      }
    };
  }));

  template.push({ type: 'separator' }, { label: 'Вихід', click: () => app.quit() });
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

// Додаємо в IPC обробник
ipcMain.on('action', async (event, data) => {
  if (data.type === 'update-tray') {
    await updateTray(data);
  }
});


// Рекурсивна функція для створення структури меню
async function buildMenuTemplate(items) {
  return Promise.all(items.map(async (item) => {
    if (item.type === 'separator') return { type: 'separator' };

    const itemIcon = item.icon ? await getImage(item.icon) : null;
    
    // Створюємо базовий об'єкт пункту
    const menuItem = {
      label: item.label,
      icon: itemIcon ? itemIcon.resize({ width: 16, height: 16 }) : null,
    };

    // Якщо є вкладені елементи — обробляємо їх рекурсивно
    if (item.submenu && Array.isArray(item.submenu)) {
      menuItem.submenu = await buildMenuTemplate(item.submenu);
    } else {
      // Якщо підменю немає — додаємо обробник кліку
      menuItem.click = () => {
        const mainWin = Object.values(windows)[0];
        if (mainWin) mainWin.webContents.send('tray-click', { id: item.id });
      };
    }

    return menuItem;
  }));
}

// Основна функція оновлення трея
async function updateTray(data) {
  const { items = [], tooltip, trayIcon } = data;

  if (!tray) {
    const icon = trayIcon ? await getImage(trayIcon) : nativeImage.createEmpty();
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
  } else if (trayIcon) {
    const icon = await getImage(trayIcon);
    tray.setImage(icon.resize({ width: 16, height: 16 }));
  }

  if (tooltip) tray.setToolTip(tooltip);

  // Будуємо повне дерево меню
  const template = await buildMenuTemplate(items);

  // Додаємо системні пункти в кінець
  template.push({ type: 'separator' }, { label: 'Вихід', click: () => app.quit() });
  
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

<!--  -->

import { app } from 'electron';

// ... у switch (data.type)
case 'set-autostart': {
  const { enabled } = data;
  
  // Працює тільки у зібраному стані (.exe), у розробці ігнорується
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: app.getPath('exe'), // Шлях до вашого виконуваного файлу
      args: ['--autostart']     // Опціонально: прапорець, щоб знати, що запуск був автоматичним
    });
    
    // Зберігаємо вибір користувача у наш store.js, щоб пам'ятати стан
    store.set('autoStartEnabled', enabled);
    
    event.reply('from-main', { msg: 'Статус автозапуску змінено', status: enabled });
  } else {
    console.log('Автозапуск неможливо налаштувати в режимі розробки');
  }
  break;
}

case 'get-autostart-status': {
  // Повертаємо поточний стан системи
  const settings = app.getLoginItemSettings();
  event.reply('from-main', { msg: 'Поточний автозапуск', status: settings.openAtLogin });
  break;
}


<!--  -->

# Download Manager

✅ Що вже реалізовано (Функціонал):
Гнучка архітектура:
ES6 Модулі: Сучасний стандарт JS (import/export).
Environment (.env): Автоматичне перемикання між розробкою (.env.development) та продакшеном.
Store (JSON): Збереження налаштувань, позицій та розмірів вікон у папці %AppData%.
Логіка шляхів: Коректна робота з файлами як у режимі npm start, так і після збірки в .exe.
Керування вікнами:
Multi-window: Створення необмеженої кількості вікон (Головне, Чат, Сповіщення).
Frameless & Transparent: Безрамкові віджети з прозорістю.
Drag & Pin: Можливість перетягувати вікна за будь-який елемент (через CSS) та закріплювати їх поверх усіх вікон.
Single Instance Lock: Заборона запуску декількох копій програми одночасно.
Системна інтеграція:
Динамічний Трей: Меню з необмеженою вкладеністю, іконками (Path, URL, Base64) та ToolTip, що змінюються «на льоту».
Автозапуск: Керування записом у реєстрі Windows прямо з інтерфейсу сайту.
CMD & Shell: Запуск простих команд, важких фонових процесів, відкриття посилань у браузері та мережевих папок.
UAC (Admin): Можливість запитувати права адміністратора для системних дій.
Комунікація (IPC):
Безпечний місток (preload.js), що дозволяє сайту керувати системою, не маючи прямого доступу до Node.js.
Двосторонній зв'язок: Main може «прокидати» дані у будь-яке вікно в реальному часі.
🛠 Що треба додати (Фінальні штрихи):
Auto-Updater: Механізм, щоб програма сама перевіряла наявність нової версії (через GitHub або ваш сервер) і оновлювала свою «оболонку».
Code Signing: Підпис вашого .exe сертифікатом розробника. Без цього Windows показуватиме синє вікно "SmartScreen" (захист від невідомого видавця).
Обробка помилок (Global Catch): Логування помилок у файл, якщо програма «впаде» у користувача, щоб ви могли зрозуміти чому.
Іконка додатку (.ico): Підготовка іконки у форматі 256x256, щоб програма мала гарний вигляд на робочому столі та в панелі керування.
Налаштування Build-скрипта: Створення конфігурації для electron-builder, щоб він автоматично пакував усі папки (src, resources, node_modules) в один інсталятор.
Мультипоточність (Worker Threads) для качу та хешування.

<!--  -->

<!-- downloader.js -->
import { parentPort, workerData } from 'worker_threads';
import axios from 'axios'; // або вбудований fetch
import fs from 'fs';
import path from 'path';

// Функція завантаження одного файлу з відстеженням прогресу
async function downloadFile(url, dest, appId) {
  const writer = fs.createWriteStream(dest);
  const response = await axios({ url, method: 'GET', responseType: 'stream' });
  
  const totalLength = response.headers['content-length'];
  let downloadedLength = 0;

  response.data.on('data', (chunk) => {
    downloadedLength += chunk.length;
    const progress = Math.round((downloadedLength / totalLength) * 100);
    // Відправляємо прогрес у Main, а той — на сайт
    parentPort.postMessage({ type: 'progress', appId, progress });
  });

  return new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Слухаємо команди: "скачай цей список файлів для App_1"
parentPort.on('message', async (task) => {
  if (task.type === 'start-download') {
    for (const file of task.files) {
      await downloadFile(file.url, file.path, task.appId);
    }
    parentPort.postMessage({ type: 'complete', appId: task.appId });
  }
});


<!--  -->


import { parentPort } from 'worker_threads';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Функція для розрахунку SHA-256 хешу файлу
 */
function verifyHash(filePath, expectedHash) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    
    stream.on('end', () => {
      const calculatedHash = hash.digest('hex');
      resolve(calculatedHash.toLowerCase() === expectedHash.toLowerCase());
    });

    stream.on('error', (err) => reject(err));
  });
}

// Додаємо обробку команди перевірки в воркері
parentPort.on('message', async (task) => {
  if (task.type === 'verify-file') {
    try {
      parentPort.postMessage({ type: 'verify-start', file: task.path });
      
      const isValid = await verifyHash(task.path, task.expectedHash);
      
      parentPort.postMessage({ 
        type: 'verify-result', 
        file: task.path, 
        isValid 
      });
    } catch (error) {
      parentPort.postMessage({ type: 'error', msg: error.message });
    }
  }
});


#
ipcMain.on('action', (event, data) => {
  if (data.type === 'check-integrity') {
    const worker = new Worker('./src/main/downloader.js');

    worker.postMessage({
      type: 'verify-file',
      path: data.filePath,
      expectedHash: data.hash // Хеш, який ви отримали від сервера
    });

    worker.on('message', (msg) => {
      if (msg.type === 'verify-result') {
        event.reply('from-main', { 
          msg: msg.isValid ? 'Файл цілий' : 'Файл пошкоджено', 
          isValid: msg.isValid 
        });
        worker.terminate();
      }
    });
  }
});


<!--  -->





