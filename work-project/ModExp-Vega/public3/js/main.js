/**
 * --- CONFIGURATION ---
 */
const APP_CONFIG = {
    DEFAULT_POLLING_MS: 1000 * 10,
    API_BASE: '/api/v1/ios',
    LAYOUT_PADDING: 0,
    ICONS: {
        exitFullscreen:
            '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>',
        enterFullscreen:
            '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    },
    // Карта станів для зображень (src картинок у папці img/)
    IMAGE_MAP: {
        sensor_01: { 0: 'off.svg', 1: 'on.svg' },
        engine_main: { 0: 'stop.png', 1: 'run.gif', 2: 'error.png' },
        default: { 2: 'default_off.png', 1: 'default_on.png' },
    },
}

class SchemaModule {
    /**
     * @param {string} selector - CSS селектор головного контейнера (наприклад, '#mainWidget')
     */
    constructor(selector) {
        this.root = document.querySelector(selector)
        if (!this.root) {
            console.error(`Container ${selector} not found`)
            return
        }

        // Унікальний ключ для збереження налаштувань саме цього модуля
        this.storageKey = `schema_settings_${selector.replace(/[^a-zA-Z0-9]/g, '_')}`

        this.state = {
            // isOnline: true,
            connectionState: null,
            lastSuccessTime: Date.now(),
            currentInterval: APP_CONFIG.DEFAULT_POLLING_MS,
            pollingTimer: null,
            bgImage: null,
            idenMap: new Map(), // Карта для миттєвого доступу iden -> [DOM nodes]
            lastParams: new Map(), //Остані отримані реальні дані
            tooltip: {
                iden: null,
                interval: null,
                hideTimeout: null,
            },
        }

        // Всі пошуки обмежені елементом this.root для модульності
        this.dom = {
            mainWidget: this.root,
            unitSelect: this.root.querySelector('#select-unit'),
            fragmentSelect: this.root.querySelector('#select-fragment'),
            modeSelect: this.root.querySelector('#modeSelect'),
            bgLayer: this.root.querySelector('#layer-bg-fragment'),
            nodesLayer: this.root.querySelector('.layer-nodes'),
            container: this.root.querySelector('#bodyShemaContainer'),
            scene: this.root.querySelector('#scene'),
            clock: this.root.querySelector('#clock'),
            clockPeriodTag: this.root.querySelector('.period-tag'),
            fsBtn: this.root.querySelector('#toggleFullscreenSchema'),
            statusBlock: this.root.querySelector('.status-block'),
            statusText: this.root.querySelector('.status-text'),
        }

        this.init()
    }

    init() {
        this.applySavedSettings()
        this.initListeners()
        this.initWatchdog()

        const unitId = this.dom.unitSelect?.value
        const fragmentName = this.dom.fragmentSelect?.value

        if (!unitId || !fragmentName) {
            this.updateStatus('waiting')
        } else {
            this.loadFragment()
        }
    }

    /**
     * Відновлює Unit, Fragment та Mode з LocalStorage
     */
    applySavedSettings() {
        const saved = JSON.parse(localStorage.getItem(this.storageKey) || '{}')
        if (saved.unit && this.dom.unitSelect) this.dom.unitSelect.value = saved.unit
        if (saved.fragment && this.dom.fragmentSelect)
            this.dom.fragmentSelect.value = saved.fragment
        if (saved.mode && this.dom.modeSelect) this.dom.modeSelect.value = saved.mode
    }

    /**
     * Зберігає Unit, Fragment та Mode в LocalStorage
     */
    saveSettings() {
        const settings = {
            unit: this.dom.unitSelect?.value,
            fragment: this.dom.fragmentSelect?.value,
            mode: this.dom.modeSelect?.value,
        }
        localStorage.setItem(this.storageKey, JSON.stringify(settings))
    }

    initListeners() {
        // Fullscreen Logic
        if (this.dom.fsBtn) {
            this.dom.fsBtn.onclick = (event) => {
                event.preventDefault()
                if (!document.fullscreenElement) {
                    this.dom.mainWidget.requestFullscreen().catch((err) => console.error(err))
                } else {
                    document.exitFullscreen()
                }
            }
        }

        document.addEventListener('fullscreenchange', () => {
            const isFs = !!document.fullscreenElement
            const svg = this.dom.fsBtn?.querySelector('svg')
            if (svg) {
                svg.innerHTML = isFs
                    ? APP_CONFIG.ICONS.exitFullscreen
                    : APP_CONFIG.ICONS.enterFullscreen
            }
        })

        // Controls Change
        ;[this.dom.unitSelect, this.dom.fragmentSelect, this.dom.modeSelect].forEach((el) => {
            if (el) {
                el.addEventListener('change', () => {
                    this.saveSettings()
                    this.loadFragment()
                })
            }
        })

        // Використовуємо ResizeObserver для стеження за контейнером
        const resizeObserver = new ResizeObserver(() => {
            // requestAnimationFrame забезпечує плавне виконання без "дьоргання"
            requestAnimationFrame(() => this.handleResize())
        })

        // Починаємо стежити за головним контейнером схеми
        if (this.dom.container) {
            resizeObserver.observe(this.dom.container)
        }

        // Мета-дані при наведенні для дебагу (раз на секунду)
        this.dom.nodesLayer.addEventListener('mousemove', (event) => {
            const node = event.target.closest('.schema-node')
            if (node) {
                const now = Date.now()
                if (now - (node._lastLog || 0) > 1000) {
                    // console.log('Node Meta:', node._meta)
                    console.log(JSON.stringify(node._meta, null, 2))
                    node._lastLog = now
                }
            }
        })

        // tooltip
        this.dom.nodesLayer.addEventListener('mouseover', (e) => {
            const node = e.target.closest('.schema-node')
            if (!node || !this.tooltipEl) return

            const iden = node.dataset.iden.split(',')[0] // Беремо перший ID
            this.state.tooltip.iden = iden
            const liveData = this.state.lastParams?.get(iden) // Отримуємо дані з кешу

            const meta = node._meta
            const params = Array.isArray(meta.params?.param)
                ? meta.params.param
                : [meta.params?.param].filter(Boolean)
            const firstParam = params[0] || {}

            // Наповнюємо даними
            this.tooltipEl.innerHTML = `
                <div class="tooltip-line">
                    <span class="tooltip-key">Ідентифікатор:</span>
                    <span class="tooltip-val">${node.dataset.iden || '---'}</span>
                </div>
                <div class="tooltip-line">
                    <span class="tooltip-key">Масив:</span>
                    <span class="tooltip-val">${firstParam?.mas || '---'}</span>
                </div>
                <div class="tooltip-line">
                    <span class="tooltip-key">Номер:</span>
                    <span class="tooltip-val">${firstParam?.nom || '---'}</span>
                </div>
                <div class="tooltip-line">
                    <span class="tooltip-key">Назва:</span>
                    <span class="tooltip-val">${meta?.info?.text || '---'}</span>
                </div>
                <div class="tooltip-line">
                    <span class="tooltip-key">Значення:</span>
                    <span class="tooltip-val live-value">${liveData?.valuetext || '---'}</span>
                </div>
                <div class="tooltip-line">
                    <span class="tooltip-key">Значення (A):</span>
                    <span class="tooltip-val raw-value">${liveData?.value || '---'}</span>
                </div>
            `

            this.tooltipEl.style.display = 'block'
            this.positionGlobalTooltip(node)
        })

        this.dom.nodesLayer.addEventListener('mouseout', (e) => {
            if (e.target.closest('.schema-node') && this.tooltipEl) {
                this.tooltipEl.style.display = 'none'
                this.state.tooltip.iden = null
            }
        })
    }

    //
    positionGlobalTooltip(node) {
        const tooltip = this.tooltipEl
        const scene = this.dom.scene

        // Позиція вузла відносно сцени в % (як ми їх і задавали)
        const nodeLeft = parseFloat(node.style.left)
        const nodeTop = parseFloat(node.style.top)

        // Розміри в пікселях для корекції виходу за межі
        const tW = (tooltip.offsetWidth / scene.offsetWidth) * 100
        const tH = (tooltip.offsetHeight / scene.offsetHeight) * 100

        let x = nodeLeft
        let y = nodeTop - tH - 2 // Трохи вище вузла

        // ПЕРЕВІРКА МЕЖ (в процентах 0-100)

        // Верхня межа
        if (y < 0) {
            y = nodeTop + 5 // Якщо зверху немає місця, кидаємо під вузол
        }

        // Ліва межа
        if (x < 0) x = 2

        // Права межа
        if (x + tW > 100) {
            x = 100 - tW - 2
        }

        tooltip.style.left = `${x}%`
        tooltip.style.top = `${y}%`
    }

    //
    updateTooltipContent() {
        if (!this.tooltipEl || this.tooltipEl.style.display === 'none') return

        const iden = this.state.tooltip.iden
        const liveData = this.state.lastParams?.get(iden)

        const valueEl = this.tooltipEl.querySelector('.live-value')
        if (valueEl) {
            valueEl.textContent = liveData?.valuetext || '--'
        }

        const rawValueEl = this.tooltipEl.querySelector('.raw-value')
        if (rawValueEl) {
            rawValueEl.textContent = liveData?.value || ''
        }
    }

    /**
     * WATCHDOG: Перевіряє актуальність даних відносно поточного інтервалу
     */
    initWatchdog() {
        setInterval(() => {
            if (this.state.connectionState === 'waiting') return

            // Ліміт: 1 повних цикли опитування + запас 2 секунди
            const dynamicTimeout = this.state.currentInterval * 1 + 2000
            const timeSinceLastData = Date.now() - this.state.lastSuccessTime

            if (timeSinceLastData > dynamicTimeout) {
                this.updateStatus(false)
            }
        }, 1000)
    }

    async loadFragment() {
        const unitId = this.dom.unitSelect?.value
        const fragmentName = this.dom.fragmentSelect?.value

        if (!unitId || !fragmentName) return

        if (this.state.pollingTimer) clearTimeout(this.state.pollingTimer)

        try {
            const xmlName = fragmentName.substring(0, fragmentName.lastIndexOf('.')) + '.xml'
            const response = await fetch(
                `${APP_CONFIG.API_BASE}/fragment/xml/${unitId}?fileName=${xmlName}`,
            )

            if (!response.ok) throw new Error(`API Error: ${response.status}`)
            const config = await response.json()

            // 1. Рендер вузлів
            this.renderNodes(config)

            // 2. Завантаження фону
            this.dom.bgLayer.innerHTML = ''
            const img = new Image()
            img.className = 'bg-img'
            img.onload = () => {
                this.handleResize()
            }
            img.src = `${APP_CONFIG.API_BASE}/fragment/png/${unitId}?fileName=${fragmentName}`
            this.dom.bgLayer.appendChild(img)
            this.state.bgImage = img

            // 3. Запуск опитування
            this.startPolling()
        } catch (err) {
            console.error('Loading error:', err)
            this.updateStatus(false)
        }
    }

    renderNodes(config) {
        this.dom.nodesLayer.innerHTML = ''
        if (!config?.fragment) return

        this.tooltipEl = document.createElement('div')
        this.tooltipEl.className = 'global-tooltip'
        this.dom.nodesLayer.appendChild(this.tooltipEl)

        //
        const { w: origW, h: origH, dynamic } = config.fragment
        const allowedKeys = ['dtext', 'block', 'hist', 'tablo', 'zont', 'knop', 'knop_kfb']

        Object.entries(dynamic).forEach(([key, val]) => {
            if (!allowedKeys.includes(key)) return

            const items = Array.isArray(val) ? val : [val]

            items.forEach((item) => {
                if (!item.x || !item.y) return
                item._sourceGroup = key

                const node = document.createElement('div')
                node.className = 'schema-node'
                node.dataset.group = key

                // Збір ID параметрів
                const rawParam = item.params?.param
                const paramsArray = Array.isArray(rawParam) ? rawParam : rawParam ? [rawParam] : []
                const idenList = [...new Set(paramsArray.map((p) => p.iden).filter(Boolean))]

                node.dataset.iden = idenList.join(',')
                node._meta = item

                // Розрахунок координат у %
                const x = (parseInt(item.x) / parseInt(origW)) * 100
                const y = (parseInt(item.y) / parseInt(origH)) * 100
                const w = (parseInt(item.w) / parseInt(origW)) * 100
                const h = (parseInt(item.h) / parseInt(origH)) * 100

                // Координати у %
                node.style.left = `${x}%`
                node.style.top = `${y}%`
                node.style.width = `${w}%`
                node.style.height = `${h}%`

                const labelText = paramsArray[0]?.name || ''
                const labelHtml = labelText ? `<span class="node-label">${labelText}</span>` : ''

                // Рендер за типом групи
                if (key === 'dtext') {
                    node.style.width = ''
                    node.innerHTML = `${labelHtml}<span class="node-value">--</span>`
                } else if (key === 'hist') {
                    node.classList.add(
                        'hist-node',
                        item.img?.dir === 'H' ? 'horizontal' : 'vertical',
                    )
                    node.style.setProperty('--p', '0%')
                    node.innerHTML = '<div class="fill-level"></div>'
                } else if (key === 'block') {
                    node.innerHTML = `
                        ${labelHtml}
                        <img class="node-image" style="display:none">
                    `
                } else if (key === 'tablo') {
                    node.innerHTML = `<span class="node-value">${item.img.text?.txt || ''}</span>`
                } else if (key === 'zont') {
                    node.innerHTML = labelHtml
                } else if (key === 'knop') {
                    node.innerHTML = `<span class="node-value">${item.img.text.txt}</span>`
                } else if (key === 'knop_kfb') {
                    node.innerHTML = `<span class="node-value">${item.img.text.txt}</span>`
                }

                this.dom.nodesLayer.appendChild(node)
            })
        })

        this.rebuildIdenMap()
    }

    rebuildIdenMap() {
        this.state.idenMap.clear()
        this.dom.nodesLayer.querySelectorAll('.schema-node').forEach((node) => {
            const ids = (node.dataset.iden || '').split(',').map((s) => s.trim())
            ids.forEach((id) => {
                if (!id || id === 'unknown') return
                if (!this.state.idenMap.has(id)) {
                    this.state.idenMap.set(id, [])
                }
                this.state.idenMap.get(id).push(node)
            })
        })
    }

    async startPolling() {
        const unitId = this.dom.unitSelect?.value
        const ids = Array.from(this.state.idenMap.keys())

        if (!unitId || !ids.length) return

        try {
            const response = await fetch(`${APP_CONFIG.API_BASE}/value/${unitId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            })

            if (response.ok) {
                const data = await response.json()
                this.state.lastSuccessTime = Date.now()
                this.updateStatus(true)

                if (data && data.infoslist && data.infoslist.info && data.infoslist.info[0]) {
                    data.infoslist.info[0].interval = this.state.currentInterval
                }

                this.processData(data)
            } else {
                this.updateStatus(false)
            }
        } catch (e) {
            console.error('Polling error:', e)
            this.updateStatus(false)
        }

        this.state.pollingTimer = setTimeout(() => this.startPolling(), this.state.currentInterval)
    }

    // updateUI
    processData(data) {
        // Зберігаємо всі параметри в Map для швидкого доступу за ID
        this.state.lastParams = new Map((data?.paramslist?.param || []).map((p) => [p.iden, p]))

        // Оновлення серверної інформації
        const info = data?.infoslist?.info?.[0]
        if (info) {
            if (this.dom.clock) this.dom.clock.innerText = info.datetime
            if (info.interval) {
                const newInterval = parseInt(info.interval)
                this.state.currentInterval = newInterval
                if (this.dom.clockPeriodTag) {
                    this.dom.clockPeriodTag.innerText = `${newInterval / 1000}с`
                }
            }
        }

        // Оновлення параметрів
        const params = data?.paramslist?.param || []
        params.forEach((item) => {
            const targetNodes = this.state.idenMap.get(item.iden)
            if (!targetNodes) return

            targetNodes.forEach((node) => {
                const group = node.dataset.group
                if (group === 'dtext') {
                    this.syncText(node.querySelector('.node-value'), item.valuetext)
                } else if (group === 'hist') {
                    this.syncHist(node, item.value)
                } else if (group === 'block') {
                    this.syncImage(node, item.iden, item.value)
                } else if (group === 'knop') {
                    this.syncText(node.querySelector('.node-value'), item.valuetext)
                }
            })
        })

        // Оновлюємо tooltip
        this.updateTooltipContent()
    }

    updateStatus(state) {
        if (this.state.connectionState === state) return
        this.state.connectionState = state
        const { statusBlock: sb, statusText: st } = this.dom

        sb?.classList.remove('is-offline', 'is-waiting')

        if (state === 'waiting') {
            sb?.classList.add('is-waiting')
            if (st) st.textContent = 'Оберіть фрагмент...'
        } else if (state === true) {
            if (st) st.textContent = 'Online'
        } else {
            sb?.classList.add('is-offline')
            if (st) st.textContent = 'Offline'
        }
        // this.dom.nodesLayer
        //     .querySelectorAll('.schema-node')
        //     .forEach((n) => n.classList.toggle('is-online', state === true))
    }

    syncText(el, val) {
        if (!el || el.innerText === String(val)) return
        el.innerText = val

        el.style.color = '#fbbf24'
        // el.classList.add('updated')
        setTimeout(() => {
            el.style.color = ''
            // el.classList.remove('updated')
        }, 500)
    }

    syncHist(node, val) {
        const fill = node.querySelector('.fill-level')
        if (!fill || !node._meta?.img) return

        const { pred_n: min = 0, pred_v: max = 100 } = node._meta.img
        const currentVal = parseFloat(val || 0)
        const percent = Math.min(Math.max(((currentVal - min) / (max - min)) * 100, 0), 100)

        node.style.setProperty('--p', `${percent}%`)
    }

    syncImage(node, iden, val) {
        const img = node.querySelector('.node-image')
        if (!img) return

        const config = APP_CONFIG.IMAGE_MAP[iden] || APP_CONFIG.IMAGE_MAP['default']
        const imageName = config[String(val)]

        if (imageName) {
            const newPath = `img/${imageName}`
            if (img.getAttribute('src') !== newPath) {
                img.src = newPath
                img.style.display = 'block'
            }
        } else {
            img.style.display = 'none'
            img.removeAttribute('src')
        }
    }

    handleResize() {
        const img = this.state.bgImage
        if (!img || !img.complete) return

        const mode = this.dom.modeSelect?.value || 'auto'
        const { naturalWidth: origW, naturalHeight: origH } = img
        const { offsetWidth: viewW, offsetHeight: viewH } = this.dom.container
        const imgRatio = origW / origH
        const viewRatio = viewW / viewH

        this.dom.scene.style.cssText = 'aspect-ratio: auto; width: auto; height: auto;'

        if (mode === 'stretch') {
            this.dom.scene.style.width = '100%'
            this.dom.scene.style.height = '100%'
        } else if (mode === 'original') {
            const scale = Math.min(
                (viewW - APP_CONFIG.LAYOUT_PADDING) / origW,
                (viewH - APP_CONFIG.LAYOUT_PADDING) / origH,
            )
            this.dom.scene.style.width = `${origW * scale}px`
            this.dom.scene.style.height = `${origH * scale}px`
        } else {
            // Auto (Fit) mode
            this.dom.scene.style.aspectRatio = imgRatio
            if (viewRatio > imgRatio) {
                this.dom.scene.style.height = '100%'
                // this.dom.scene.style.width = `${viewH * imgRatio}px`
            } else {
                this.dom.scene.style.width = '100%'
                // this.dom.scene.style.height = `${viewW / imgRatio}px`
            }
        }
    }
}

// Ініціалізація після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    // Створюємо екземпляр для віджета
    window.schemaApp = new SchemaModule('#mainWidget')
})
