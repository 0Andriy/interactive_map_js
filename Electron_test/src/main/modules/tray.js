import { Tray, Menu, nativeImage } from 'electron'

let tray = null

export function initTray(mainWindow) {
    const icon = nativeImage.createEmpty() // Порожня іконка за замовчуванням
    tray = new Tray(icon)
    updateTray([{ label: 'Завантаження...', enabled: false }])
}

export function updateTray(template) {
    // template — це масив, який прийшов з UI (з вкладеними структурами)
    const contextMenu = Menu.buildFromTemplate(template)
    tray.setContextMenu(contextMenu)
}

// Функція для зміни іконки (може приймати URL, base64 або шлях)
export function setTrayIcon(imagePath) {
    const icon = nativeImage.createFromPath(imagePath)
    tray.setImage(icon.resize({ width: 16, height: 16 }))
}
