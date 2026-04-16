// import fs from 'fs';
// import path from 'path';
// import { app } from 'electron';

// const filePath = path.join(app.getPath('userData'), 'user-settings.json');

// const load = () => {
//   try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
//   catch { return {}; }
// };

// export const store = {
//   get: (key) => load()[key],
//   set: (key, val) => {
//     const data = load();
//     data[key] = val;
//     fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
//   }
// };









import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const filePath = path.join(app.getPath('userData'), 'user-settings.json');

// Стандартні налаштування
const defaults = {
  width: 1000,
  height: 700,
  x: undefined,
  y: undefined,
  autoStart: false,
  isPinned: false
};

export const store = {
  get(key) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data[key] !== undefined ? data[key] : defaults[key];
    } catch {
      return defaults[key];
    }
  },

  set(key, value) {
    try {
      let data = {};
      if (fs.existsSync(filePath)) {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      data[key] = value;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Помилка запису налаштувань:', e);
    }
  }
};
