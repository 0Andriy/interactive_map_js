// import { contextBridge, ipcRenderer } from 'electron';
// contextBridge.exposeInMainWorld('api', {
//   send: (type, data) => ipcRenderer.send('action', { type, ...data })
// });



// import { contextBridge, ipcRenderer } from 'electron';

// contextBridge.exposeInMainWorld('electron', {
//   do: (type, data = {}) => {
//     const safe = ['open-chat', 'set-autostart', 'pin', 'close'];
//     if (safe.includes(type)) ipcRenderer.send('action', { type, ...data });
//   },
//   // Отримання (нове)
//   on: (channel, callback) => {
//     const validChannels = ['update-data', 'notify-msg']; // дозволені канали
//     if (validChannels.includes(channel)) {
//       // Видаляємо старі слухачі, щоб не було дублів
//       ipcRenderer.removeAllListeners(channel);
//       ipcRenderer.on(channel, (event, ...args) => callback(...args));
//     }
//   }
// });



import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  do: (type, data) => ipcRenderer.send('action', { type, ...data }),
  on: (channel, cb) => {
    if (channel === 'from-main') {
      ipcRenderer.removeAllListeners(channel);
      ipcRenderer.on(channel, (s, ...args) => cb(...args));
    }
  }
});