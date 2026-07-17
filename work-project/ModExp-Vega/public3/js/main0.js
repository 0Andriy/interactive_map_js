/**
 * --- CONFIGURATION & STATE ---
 */
const APP_CONFIG = {
    DEFAULT_POLLING_MS: 5000, // Значення за замовчуванням
    LAYOUT_PADDING: 0,
    API_BASE: '/api/v1/ios',
    ICONS: {
        exit: '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>',
        enter: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    },
}

const state = {
    pollingTimer: null,
    currentInterval: APP_CONFIG.DEFAULT_POLLING_MS,
    bgImage: null,
}

/**
 * --- UTILITIES ---
 */
const Utils = {
    getElements: () => ({
        unitSelect: document.querySelector('#select-unit'),
        fragmentSelect: document.querySelector('#select-fragment'),
        modeSelect: document.querySelector('#modeSelect'),
        bgLayer: document.querySelector('#layer-bg-fragment'),
        nodesLayer: document.querySelector('.layer-nodes'),
        container: document.querySelector('#bodyShemaContainer'),
        scene: document.querySelector('#scene'),
        clock: document.getElementById('clock'),
        clockPeriodTag: document.querySelector('.period-tag'),
        fsBtn: document.querySelector('button.fullscreen-btn'),
        mainWidget: document.querySelector('#mainWidget'),
    }),
}

/**
 * --- SERVICE: API ---
 */
const SchemaAPI = {
    async fetchFragment(unitId, fileName) {
        const response = await fetch(
            `${APP_CONFIG.API_BASE}/fragment/xml/${unitId}?fileName=${fileName}`,
        )
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`)
        }
        return response.json()
    },

    async fetchValues(unitId, idenList) {
        try {
            const response = await fetch(`${APP_CONFIG.API_BASE}/value/${unitId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: idenList }),
            })
            return response.ok ? response.json() : null
        } catch (e) {
            console.error('Fetch values error:', e)
            return null
        }
    },
}

/**
 * --- COMPONENT: LAYOUT ENGINE ---
 */
const LayoutEngine = {
    adjust(img, container, scene, mode = 'original') {
        if (!img.complete || img.naturalWidth === 0) return

        const { naturalWidth: origW, naturalHeight: origH } = img
        const { offsetWidth: viewW, offsetHeight: viewH } = container
        const imgRatio = origW / origH
        const viewRatio = viewW / viewH

        scene.style.cssText = 'aspect-ratio: auto; width: auto; height: auto;'

        if (mode === 'stretch') {
            scene.style.width = '100%'
            scene.style.height = '100%'
        } else if (mode === 'original') {
            const scale = Math.min(
                (viewW - APP_CONFIG.LAYOUT_PADDING) / origW,
                (viewH - APP_CONFIG.LAYOUT_PADDING) / origH,
            )
            scene.style.width = `${origW * scale}px`
            scene.style.height = `${origH * scale}px`
        } else {
            scene.style.aspectRatio = imgRatio
            if (viewRatio > imgRatio) {
                scene.style.height = '100%'
            } else {
                scene.style.width = '100%'
            }
        }
    },
}

/**
 * --- COMPONENT: RENDERER ---
 */
const SchemaRenderer = {
    /**
     * Оновлює глобальний статус системи
     * @param {boolean} isOnline - true для Online, false для Offline
     */
    setSystemStatus(isOnline) {
        const statusBlock = document.querySelector('.status-block')
        const statusText = statusBlock.querySelector('.status-text')

        if (isOnline) {
            statusBlock.classList.remove('is-offline')
            statusText.textContent = 'Online'
        } else {
            statusBlock.classList.add('is-offline')
            statusText.textContent = 'Offline'
        }
    },

    renderNodes(config, scene) {
        const dynamicLayer = scene.querySelector('.layer-nodes')
        if (dynamicLayer) dynamicLayer.innerHTML = ''

        const svgLayer = scene.querySelector('.layer-svg')
        if (svgLayer) svgLayer.innerHTML = ''

        if (!config?.fragment) return

        const { w: origW, h: origH, dynamic, static } = config.fragment

        // 1. Вказуємо ТІЛЬКИ ТІ ключі, які ми хочемо відмалювати
        const allowedKeys = ['dtext', 'block', 'hist', 'tablo' /*'knop', 'tablo', 'knop_kfb'*/]
        // 2. Збір та фільтрація
        const items = Object.entries(dynamic).flatMap(([key, val]) => {
            console.log(key, !allowedKeys.includes(key))

            // Якщо ключа немає в списку дозволених — ігноруємо всю групу
            if (!allowedKeys.includes(key)) return []

            // Перетворюємо вміст у масив (якщо це об'єкт {})
            const rawItems = Array.isArray(val) ? val : val && typeof val === 'object' ? [val] : []

            // Додаємо назву ключа як мітку
            return rawItems.map((item) => ({
                ...item,
                _sourceGroup: key,
            }))
        })

        items.forEach((item) => {
            // Перевірка, чи це взагалі валідний елемент для малювання
            if (!item.x || !item.y) return

            const node = document.createElement('div')
            node.className = 'schema-node'
            // Принадлежність до групи (з якої частини відпоіді була взята)
            const group = item._sourceGroup
            node.dataset.group = group

            // --- УНІФІКАЦІЯ ПАРАМЕТРІВ (Об'єкт -> Масив) ---
            const rawParam = item.params?.param
            const paramsArray = Array.isArray(rawParam) ? rawParam : rawParam ? [rawParam] : []

            // Безпечний доступ до iden (це унікальний ідентифікатор елементи)
            // на сторінці може бути декілька різних його представлень
            const iden = paramsArray[0]?.iden || 'unknown'
            node.setAttribute('data-iden', iden)
            node._meta = item

            // Розрахунок координат у %
            const x = (parseInt(item.x) / parseInt(origW)) * 100
            const y = (parseInt(item.y) / parseInt(origH)) * 100
            const w = (parseInt(item.w) / parseInt(origW)) * 100
            const h = (parseInt(item.h) / parseInt(origH)) * 100

            node.style.left = `${x}%`
            node.style.top = `${y}%`

            // Логіка для Гістограми (Шкали)
            if (group === 'dtext') {
                const label = item.params?.param?.name || ''
                node.innerHTML = `
                    ${label ? `<span class="node-label">${label}</span>` : ''}
                    <span class="node-value"></span>
                `
            } else if (group === 'hist' /*|| item.img?.type === 'O'*/) {
                node.style.width = `${w}%`
                node.style.height = `${h}%`

                node.classList.add('hist-node')
                const isHorizontal = item.img.dir === 'H'
                node.classList.add(isHorizontal ? 'horizontal' : 'vertical')

                // Встановлюємо початкове значення 0% через CSS-змінну
                node.style.setProperty('--p', '0%')
                node.innerHTML = '<div class="fill-level"></div>'
            } else if (group === 'block') {
                node.style.width = `${w}%`
                node.style.height = `${h}%`

                // Блок (текст + контейнер для майбутніх картинок)
                const label = item.params?.param?.name || ''
                node.innerHTML = `
                    ${label ? `<span class="node-label">${label}</span>` : ''}
                    <img class="node-image" style="display: none;" />
                `
            } else if (group === 'tablo') {
                node.style.width = `${w}%`
                node.style.height = `${h}%`
                Object.assign(node.style, {
                    width: `${w}%`,
                    height: `${h}%`,
                    border: '0.15cqmin solid var(--accent)',
                })

                // Блок (текст + контейнер для майбутніх картинок)
                const label = item.params?.param?.name || ''

                node.innerHTML = `
                    ${label ? `<span class="node-label">${label}</span>` : ''}
                `
            } else {
                // ЛОГІКА ЗАГЛУШКИ (якщо тип не розпізнано)
                node.classList.add('node-placeholder')
                node.innerHTML = `
                    <div class="placeholder-box">!</div>
                    <small style="font-size: 0.5cqmin;; display:block">Unknown node</small>
                `
            }

            dynamicLayer.appendChild(node)
        })
    },

    updateUI(data) {
        // 1. Оновлення годинника з серверного часу
        const info = data?.infoslist?.info
        if (Array.isArray(info) && info.length > 0) {
            const el = Utils.getElements()
            if (el.clock) el.clock.innerText = info[0].datetime

            // Оновлення інтервалу опитування, якщо він прийшов від сервера
            const interval = info[0].interval
            if (interval) {
                state.currentInterval = parseInt(interval)
                if (el.clockPeriodTag) {
                    el.clockPeriodTag.innerHTML = `${interval / 1000}c`
                }
            }
        }

        // 2. Оновлення значень датчиків
        const params = data?.paramslist?.param
        if (!Array.isArray(params)) return

        // 1. Допоміжна функція для оновлення тексту (щоб не дублювати код)
        const updateText = (el, text) => {
            if (!el) return

            const newValue = String(text)
            if (el.innerText === newValue) return

            el.innerText = text
            el.style.color = '#fbbf24'
            el.classList.add('updated')
            setTimeout(() => {
                el.style.color = ''
                el.classList.remove('updated')
            }, 500)
        }

        params.forEach((item) => {
            // Знаходимо Всі копії цього датчика на екрані
            const nodes = document.querySelectorAll(`[data-iden="${item.iden}"]`)
            if (!nodes) return

            nodes.forEach((node) => {
                const group = node.dataset.group // Отримуємо групу (dtext, hist, tablo...)
                const meta = node._meta

                // 2. Специфічна логіка залежно від ГРУПИ
                switch (group) {
                    case 'dtext':
                        // Оновлюємо текстове значення датчика
                        updateText(node.querySelector('.node-value'), item.valuetext)
                        break

                    case 'hist':
                        const fillEl = node.querySelector('.fill-level')
                        if (fillEl && node._meta?.img) {
                            const { pred_n: min = 0, pred_v: max = 100 } = node._meta.img
                            const val = parseFloat(item.value || 0)
                            let percent = ((val - min) / (max - min)) * 100
                            percent = Math.min(Math.max(percent, 0), 100)

                            node.style.setProperty('--p', `${percent}%`)
                        }
                        break

                    case 'block':
                        // Текст (якщо є)
                        updateText(node.querySelector('.node-value'), item.value)

                        // 2. Логіка картинок
                        const imgEl = node.querySelector('.node-image')
                        if (imgEl) {
                            const iden = item.iden
                            const val = String(item.value)

                            // Описуємо стани для різних IDEN
                            // Це можна винести в окремий конфіг-файл
                            const imageMap = {
                                sensor_01: { 0: ['off.svg'], 1: ['on.svg', 'warning.svg'] },
                                engine_main: { 0: ['stop.png'], 1: ['run.gif'], 2: ['error.png'] },
                                default: { 2: ['default_off.png'], 1: ['default_on.png'] },
                            }

                            // Отримуємо список картинок для поточного стану (або дефолтний)
                            const config = imageMap[iden] || imageMap['default']
                            const imageName = config[val]

                            // Оновлюємо вміст контейнера картинками
                            // (Можна оптимізувати, щоб не перемальовувати щосекунди, якщо значення не змінилось)
                            if (imageName) {
                                const newSrc = `img/${imageName}`
                                // Оновлюємо src тільки якщо він змінився, щоб не було блимання
                                if (imgEl.getAttribute('src') !== newSrc) {
                                    imgEl.src = newSrc
                                    imgEl.style.display = 'block' // Показуємо картинку, коли з'явився src
                                    // Запам'ятовуємо стан
                                    node._lastValue = val
                                }
                            }
                        }

                        break

                    default:
                        // Логіка для всіх інших груп, якщо потрібно
                        break
                }
            })
        })
    },
}

/**
 * --- CORE APP LOGIC ---
 */
const App = {
    async init() {
        const el = Utils.getElements()

        // Повноекранний режим
        if (el.fsBtn) {
            el.fsBtn.onclick = () => {
                if (!document.fullscreenElement) el.mainWidget.requestFullscreen()
                else document.exitFullscreen()
            }
            document.onfullscreenchange = () => {
                const svg = el.fsBtn.querySelector('svg')
                if (svg)
                    svg.innerHTML = document.fullscreenElement
                        ? APP_CONFIG.ICONS.exit
                        : APP_CONFIG.ICONS.enter
            }
        }

        // Обробники подій
        ;[el.unitSelect, el.fragmentSelect, el.modeSelect].forEach((s) => {
            if (s) s.onchange = () => this.loadFragment()
        })

        window.onresize = () => this.handleResize()

        // Перший запуск
        this.loadFragment()

        //
        const dynamicLayer = el.nodesLayer
        dynamicLayer.addEventListener('mousemove', (event) => {
            const target = event.target.closest('.schema-node')

            if (target) {
                const now = Date.now()
                const lastLog = target._lastLogTime || 0

                // Перевіряємо, чи минуло більше 1000 мс (1 секунда)
                if (now - lastLog >= 1000) {
                    const meta = target._meta
                    console.log(JSON.stringify(meta, null, 2))

                    // Оновлюємо мітку часу для цього конкретного елемента
                    target._lastLogTime = now
                }
            }
        })
    },

    async loadFragment() {
        const el = Utils.getElements()
        const unitId = el.unitSelect.value
        const fragmentName = el.fragmentSelect.value

        if (!unitId || !fragmentName) return

        // Очищення попереднього циклу
        if (state.pollingTimer) clearTimeout(state.pollingTimer)

        try {
            const xmlName = fragmentName.substring(0, fragmentName.lastIndexOf('.')) + '.xml'
            const config = await SchemaAPI.fetchFragment(unitId, xmlName)

            SchemaRenderer.renderNodes(config, el.scene)

            el.bgLayer.innerHTML = ''
            const img = new Image()
            img.classList.add('bg-img')
            img.onload = () => LayoutEngine.adjust(img, el.container, el.scene, el.modeSelect.value)
            img.src = `${APP_CONFIG.API_BASE}/fragment/png/${unitId}?fileName=${fragmentName}`
            el.bgLayer.appendChild(img)
            state.bgImage = img

            // Запуск циклу опитування
            this.startPolling()
        } catch (err) {
            console.error('Initialization Error:', err)
        }
    },

    async startPolling() {
        const el = Utils.getElements()
        const nodes = document.querySelectorAll('.schema-node')
        if (!nodes.length) return

        const ids = Array.from(nodes)
            .map((node) => {
                // Спробуємо дістати iden безпечно
                const iden = node.dataset.iden

                if (!iden) {
                    // Якщо iden немає, виводимо вузол у консоль для діагностики
                    const group = node.dataset.group || 'unknown group'

                    console.group(`⚠️ Помилка: Елемент без ID у групі [${group}]`)
                    console.warn('DOM Node:', node)
                    console.warn('Metadata (_meta):', node._meta)
                    console.groupEnd()

                    // Можна повернути null або 'unknown', щоб відфільтрувати пізніше
                    return null
                }

                return iden
            })
            .filter((id) => id !== null)

        const data = await SchemaAPI.fetchValues(el.unitSelect.value, ids)

        if (data) {
            if (data && data.infoslist && data.infoslist.info && data.infoslist.info[0]) {
                data.infoslist.info[0].interval = state.currentInterval
            }
            SchemaRenderer.updateUI(data)
        }

        // Рекурсивний виклик через setTimeout дозволяє динамічно змінювати інтервал
        state.pollingTimer = setTimeout(() => this.startPolling(), state.currentInterval)
    },

    handleResize() {
        const el = Utils.getElements()
        if (state.bgImage) {
            LayoutEngine.adjust(state.bgImage, el.container, el.scene, el.modeSelect.value)
        }
    },
}

// Запуск
document.addEventListener('DOMContentLoaded', () => App.init())
