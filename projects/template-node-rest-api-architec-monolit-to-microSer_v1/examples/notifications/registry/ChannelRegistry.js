// notifications/registry/ChannelRegistry.js

/**
 * Реєстр каналів повідомлень
 * @type {Map<string, () => BaseNotifier>}
 */
const channelMap = new Map()

/**
 * Реєструє канал.
 * @param {string} name - Назва (наприклад, 'email')
 * @param {() => BaseNotifier} factoryFn - Фабрика, яка повертає інстанс каналу
 */
export function registerChannel(name, factoryFn) {
    channelMap.set(name, factoryFn)
}

/**
 * Отримує конкретний канал
 * @param {string} name
 * @returns {BaseNotifier}
 */
export function getChannel(name) {
    const factory = channelMap.get(name)
    if (!factory) throw new Error(`Unknown channel: ${name}`)
    return factory()
}

/**
 * Отримує всі канали
 * @returns {Object<string, BaseNotifier>}
 */
export function getAllChannels() {
    const result = {}
    for (const [name, factory] of channelMap.entries()) {
        result[name] = factory()
    }
    return result
}
