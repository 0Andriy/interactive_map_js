// src/core/di-container.js
class DiContainer {
    constructor() {
        this.dependencies = new Map()
    }

    // Реєстрація вже готового значення (наприклад, конфігурації чи логера)
    registerValue(key, value) {
        this.dependencies.set(key, value)
    }

    // Реєстрація класу як синглтона. Екземпляр створиться автоматично.
    registerClass(key, ClassRef, dependencyKeys = []) {
        // Спочатку дістаємо з контейнера всі залежності, які потрібні цьому класу
        const injectedDeps = {}
        for (const depKey of dependencyKeys) {
            injectedDeps[depKey] = this.resolve(depKey)
        }

        // Створюємо ОДИН екземпляр класу, передаючи йому об'єкт із залежностями
        const instance = new ClassRef(injectedDeps)
        this.dependencies.set(key, instance)
    }

    // Отримання залежності за ключем
    resolve(key) {
        if (!this.dependencies.has(key)) {
            throw new Error(`[DI Error]: Залежність "${key}" не знайдена в контейнері!`)
        }
        return this.dependencies.get(key)
    }
}

export const container = new DiContainer()
