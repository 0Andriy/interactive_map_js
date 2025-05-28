function profiler(fn) {
    return function (...args) {
        const start = performance.now() // Початок вимірювання часу
        const result = fn(...args)
        const end = performance.now() // Кінець вимірювання часу
        console.log(`Функція ${fn.name} виконалась за ${(end - start).toFixed(3)} мс`)
        return result
    }
}

// Приклад використання:

function slowFunction() {
    for (let i = 0; i < 1e3; i++) {} // Імітація навантаження
    return 'Готово'
}

const profiledSlowFunction = profiler(slowFunction)
console.log(profiledSlowFunction())
