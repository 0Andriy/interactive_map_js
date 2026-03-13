import regedit from 'regedit'
import { ipcMain, app } from 'electron'
import { promisify } from 'util'

// Вказуємо шлях до VBS-скриптів всередині node_modules
const vbsDirectory = path.join(
    app.getAppPath().replace('app.asar', 'app.asar.unpacked'),
    'node_modules/regedit/vbs',
)
regedit.setExternalVBSLocation(vbsDirectory)

// "build": {
//   "asarUnpack": [
//     "**/node_modules/regedit/vbs/*"
//   ]
// }

const reg = {
    list: promisify(regedit.list),
    putValue: promisify(regedit.putValue),
    createKey: promisify(regedit.createKey),
    deleteKey: promisify(regedit.deleteKey),
}

// Функція для запису (повертає Promise для зручності)
export async function updateRegistry(key, values) {
    return new Promise((resolve, reject) => {
        regedit.putValue({ [key]: values }, (err) => {
            if (err) reject(err)
            else resolve()
        })
    })
}

// 1. Читання (Read)
ipcMain.handle('reg:read', async (e, path) => {
    const result = await reg.list([path])
    return result[path]
})

// 2. Запис/Оновлення (Create/Update)
// ipcMain.handle('reg:write', async (e, path, name, type, value) => {
//     return await reg.putValue({
//         [path]: {
//             [name]: { value, type }, // типи: 'REG_SZ', 'REG_DWORD' тощо
//         },
//     })
// })

ipcMain.handle('registry:write', async (event, { path, keyName, type, value }) => {
    try {
        await reg.putValue({
            [path]: {
                [keyName]: { value, type }, // наприклад: 'REG_SZ', 'REG_DWORD'
            },
        })
        return { success: true }
    } catch (err) {
        return { success: false, error: err.message }
    }
})

// 3. Видалення значення (Delete Value)
ipcMain.handle('reg:deleteValue', async (e, path, name) => {
    // regedit видаляє значення, якщо передати його без поля value
    return await reg.putValue({
        [path]: { [name]: { delete: true } },
    })
})

//
ipcMain.handle('app:setAutostart', (e, shouldStart) => {
    app.setLoginItemSettings({
        openAtLogin: shouldStart,
        path: app.getPath('exe'), // шлях до вашого .exe
    })
    return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('app:getAutostartStatus', () => {
    // Метод повертає об'єкт, де поле openAtLogin вказує на статус
    const settings = app.getLoginItemSettings()
    return settings.openAtLogin
})

// Керування автозапуском з динамічними аргументами
ipcMain.handle('app:toggle-autostart', (event, { enable, args = [] }) => {
    app.setLoginItemSettings({
        openAtLogin: enable,
        path: app.getPath('exe'),
        args: args, // передаємо масив аргументів, наприклад ['--hidden', '--minimized']
    })
    return app.getLoginItemSettings().openAtLogin
})

//
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit() // Закриваємо другий екземпляр
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Якщо користувач намагається запустити ще раз — фокусуємо головне вікно
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
        }
    })

    app.whenReady().then(createWindow)
}

// preload
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
    read: (path) => ipcRenderer.invoke('reg:read', path),
    write: (path, name, type, val) => ipcRenderer.invoke('reg:write', path, name, type, val),
    getAutostartStatus: () => ipcRenderer.invoke('app:getAutostartStatus'),
    setAutostart: (settings) => ipcRenderer.invoke('app:toggle-autostart', settings),
    isSingleInstance: () => !app.requestSingleInstanceLock(), // для інформації

    // File System
    readDir: (path) => ipcRenderer.invoke('fs:readDir', path),
    readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
    writeFile: (path, content) => ipcRenderer.invoke('fs:writeFile', path, content),
    delete: (path) => ipcRenderer.invoke('fs:delete', path),
    reveal: (path) => ipcRenderer.invoke('fs:openInExplorer', path),

    // Діалоги
    selectDir: () => ipcRenderer.invoke('dialog:openDir'),
    selectFile: () => ipcRenderer.invoke('dialog:openFile'),

    // Глибоке сканування
    readAllFiles: (path) => ipcRenderer.invoke('fs:readAllNested', path),

    // Динамічне сканування
    smartScan: (dirPath, options) => ipcRenderer.invoke('fs:smartScan', { dirPath, options }),
    // Стандартні діалоги
    selectDir: () => ipcRenderer.invoke('dialog:openDir'),
})

//
import fs from 'fs/promises'
import path from 'path'
import { ipcMain, shell } from 'electron'

// Прочитати вміст папки (список файлів)
ipcMain.handle('fs:readDir', async (e, dirPath) => {
    const files = await fs.readdir(dirPath, { withFileTypes: true })
    return files.map((f) => ({ name: f.name, isDirectory: f.isDirectory() }))
})

// Прочитати файл (текст)
ipcMain.handle('fs:readFile', async (e, filePath) => {
    return await fs.readFile(filePath, 'utf-8')
})

// Записати/Створити файл
ipcMain.handle('fs:writeFile', async (e, filePath, content) => {
    await fs.writeFile(filePath, content, 'utf-8')
    return true
})

// Видалити файл або папку
ipcMain.handle('fs:delete', async (e, targetPath) => {
    await fs.rm(targetPath, { recursive: true, force: true })
    return true
})

// Відкрити папку у Провіднику (дуже корисно для користувачів)
ipcMain.handle('fs:openInExplorer', (e, targetPath) => {
    shell.showItemInFolder(targetPath)
})

// Виклик вікна вибору папки
ipcMain.handle('dialog:openDir', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
    })
    return canceled ? null : filePaths[0]
})

// Виклик вікна вибору файлу (з фільтром)
ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Configs', extensions: ['json', 'txt'] }],
    })
    return canceled ? null : filePaths[0]
})

async function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = await fs.readdir(dirPath, { withFileTypes: true })

    for (const file of files) {
        const fullPath = path.join(dirPath, file.name)
        if (file.isDirectory()) {
            // Якщо це папка — заходимо всередину (рекурсія)
            await getAllFiles(fullPath, arrayOfFiles)
        } else {
            // Якщо це файл — додаємо до списку
            arrayOfFiles.push({
                name: file.name,
                path: fullPath,
                size: (await fs.stat(fullPath)).size,
            })
        }
    }
    return arrayOfFiles
}

ipcMain.handle('fs:readAllNested', async (e, dirPath) => {
    try {
        return await getAllFiles(dirPath)
    } catch (err) {
        return { error: err.message }
    }
})

// Рекурсивна функція з підтримкою фільтрів та глибини
async function scanDirectory(dirPath, options, currentDepth = 0) {
    const { extensions = [], maxDepth = 5, includeStats = false } = options
    let results = []

    // Зупиняємося, якщо досягли ліміту глибини
    if (currentDepth > maxDepth) return results

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true })

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)

            if (entry.isDirectory()) {
                // Рекурсія для папок
                const subDirFiles = await scanDirectory(fullPath, options, currentDepth + 1)
                results = results.concat(subDirFiles)
            } else {
                // Перевірка розширення
                const fileExt = path.extname(entry.name).toLowerCase().replace('.', '')
                if (extensions.length === 0 || extensions.includes(fileExt)) {
                    const fileData = { name: entry.name, path: fullPath }

                    if (includeStats) {
                        const stats = await fs.stat(fullPath)
                        fileData.size = stats.size
                        fileData.mtime = stats.mtime
                    }
                    results.push(fileData)
                }
            }
        }
    } catch (err) {
        // Ігноруємо помилки доступу (EPERM) для системних папок
        console.warn(`Пропущено (немає доступу): ${dirPath}`)
    }

    return results
}

ipcMain.handle('fs:smartScan', async (event, { dirPath, options }) => {
    return await scanDirectory(dirPath, options)
})
