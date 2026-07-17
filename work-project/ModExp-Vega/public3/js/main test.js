/**
 * --- CONFIGURATION ---
 */
const APP_CONFIG = {
    DEFAULT_POLLING_MS: 5000,
    WATCHDOG_TIMEOUT_MS: 15000,
    API_BASE: '/api/v1/ios',
    LAYOUT_PADDING: 0,
    ICONS: {
        exit: '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>',
        enter: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    },
    // Карта станів для зображень
    IMAGE_MAP: {
        sensor_01: { 0: 'off.svg', 1: 'on.svg' },
        engine_main: { 0: 'stop.png', 1: 'run.gif', 2: 'error.png' },
        default: { 0: 'default_off.png', 1: 'default_on.png' },
    },
}

class SchemaApp {
    constructor() {
        this.state = {
            isOnline: true,
            lastSuccessTime: Date.now(),
            currentInterval: APP_CONFIG.DEFAULT_POLLING_MS,
            pollingTimer: null,
            bgImage: null,
            idenMap: new Map(), // Швидкий доступ iden -> [DOM nodes]
        }

        this.dom = {
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
            statusBlock: document.querySelector('.status-block'),
            statusText: document.querySelector('.status-block .status-text'),
        }

        this.initListeners()
        this.initWatchdog()
        this.loadFragment()
    }

    /** --- INITIALIZATION --- **/

    initListeners() {
        // Повноекранний режим
        if (this.dom.fsBtn) {
            this.dom.fsBtn.onclick = () => {
                if (!document.fullscreenElement) this.dom.mainWidget.requestFullscreen()
                else document.exitFullscreen()
            }
            document.onfullscreenchange = () => {
                const svg = this.dom.fsBtn.querySelector('svg')
                if (svg)
                    svg.innerHTML = document.fullscreenElement
                        ? APP_CONFIG.ICONS.exit
                        : APP_CONFIG.ICONS.enter
            }
        }

        // Зміна фрагментів/режимів
        ;[this.dom.unitSelect, this.dom.fragmentSelect, this.dom.modeSelect].forEach((s) => {
            if (s) s.onchange = () => this.loadFragment()
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

        // Логування метаданих при наведенні (раз на секунду)
        this.dom.nodesLayer.addEventListener('mousemove', (e) => {
            const node = e.target.closest('.schema-node')
            if (node) {
                const now = Date.now()
                if (now - (node._lastLog || 0) > 1000) {
                    console.log('Node Meta:', node._meta)
                    node._lastLog = now
                }
            }
        })
    }

    initWatchdog() {
        setInterval(() => {
            const timeSinceLastData = Date.now() - this.state.lastSuccessTime
            if (timeSinceLastData > APP_CONFIG.WATCHDOG_TIMEOUT_MS) {
                this.updateStatus(false)
            }
        }, 2000)
    }

    /** --- API & LOADING --- **/

    async loadFragment() {
        const unitId = this.dom.unitSelect.value
        const fragmentName = this.dom.fragmentSelect.value
        if (!unitId || !fragmentName) return

        if (this.state.pollingTimer) clearTimeout(this.state.pollingTimer)

        try {
            const xmlName = fragmentName.substring(0, fragmentName.lastIndexOf('.')) + '.xml'

            // 1. Завантаження конфігурації
            const response = await fetch(
                `${APP_CONFIG.API_BASE}/fragment/xml/${unitId}?fileName=${xmlName}`,
            )
            const config = await response.json()

            // 2. Рендер вузлів
            this.renderNodes(config)

            // 3. Завантаження фону
            this.dom.bgLayer.innerHTML = ''
            const img = new Image()
            img.classList.add('bg-img')
            img.onload = () => this.handleResize()
            img.src = `${APP_CONFIG.API_BASE}/fragment/png/${unitId}?fileName=${fragmentName}`
            this.dom.bgLayer.appendChild(img)
            this.state.bgImage = img

            // 4. Запуск опитування
            this.startPolling()
        } catch (err) {
            console.error('Load Fragment Error:', err)
            this.updateStatus(false)
        }
    }

    /** --- RENDERER --- **/

    renderNodes(config) {
        this.dom.nodesLayer.innerHTML = ''
        if (!config?.fragment) return

        const { w: origW, h: origH, dynamic } = config.fragment
        const allowedKeys = ['dtext', 'block', 'hist', 'tablo']

        const items = Object.entries(dynamic).flatMap(([key, val]) => {
            if (!allowedKeys.includes(key)) return []
            const rawItems = Array.isArray(val) ? val : [val]
            return rawItems.map((item) => ({ ...item, _sourceGroup: key }))
        })

        items.forEach((item) => {
            if (!item.x || !item.y) return

            const node = document.createElement('div')
            node.className = 'schema-node'
            node.dataset.group = item._sourceGroup

            // Збір ідентифікаторів (підтримка декількох через кому)
            const rawParam = item.params?.param
            const paramsArray = Array.isArray(rawParam) ? rawParam : rawParam ? [rawParam] : []
            const idenList = [...new Set(paramsArray.map((p) => p.iden).filter(Boolean))]
            node.dataset.iden = idenList.join(',')
            node._meta = item

            // Позиціонування
            node.style.left = `${(parseInt(item.x) / parseInt(origW)) * 100}%`
            node.style.top = `${(parseInt(item.y) / parseInt(origH)) * 100}%`

            const labelText = paramsArray[0]?.name || ''
            const labelHtml = labelText ? `<span class="node-label">${labelText}</span>` : ''

            // Шаблони груп
            if (item._sourceGroup === 'dtext') {
                node.innerHTML = `${labelHtml}<span class="node-value">--</span>`
            } else if (item._sourceGroup === 'hist') {
                node.classList.add('hist-node', item.img?.dir === 'H' ? 'horizontal' : 'vertical')
                node.style.width = `${(parseInt(item.w) / parseInt(origW)) * 100}%`
                node.style.height = `${(parseInt(item.h) / parseInt(origH)) * 100}%`
                node.innerHTML = '<div class="fill-level"></div>'
            } else if (item._sourceGroup === 'block') {
                node.style.width = `${(parseInt(item.w) / parseInt(origW)) * 100}%`
                node.style.height = `${(parseInt(item.h) / parseInt(origH)) * 100}%`
                node.innerHTML = `${labelHtml}<img class="node-image" style="display:none"></span>`
            }

            this.dom.nodesLayer.appendChild(node)
        })

        this.rebuildIdenMap()
    }

    rebuildIdenMap() {
        this.state.idenMap.clear()
        this.dom.nodesLayer.querySelectorAll('.schema-node').forEach((node) => {
            const ids = (node.dataset.iden || '').split(',').map((s) => s.trim())
            ids.forEach((id) => {
                if (!id) return
                if (!this.state.idenMap.has(id)) this.state.idenMap.set(id, [])
                this.state.idenMap.get(id).push(node)
            })
        })
    }

    /** --- POLLING & DATA UPDATE --- **/

    async startPolling() {
        const ids = Array.from(this.state.idenMap.keys())
        if (!ids.length) return

        try {
            const response = await fetch(
                `${APP_CONFIG.API_BASE}/value/${this.dom.unitSelect.value}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids }),
                },
            )

            if (response.ok) {
                const data = await response.json()
                this.state.lastSuccessTime = Date.now()
                this.updateStatus(true)
                this.processData(data)
            } else {
                this.updateStatus(false)
            }
        } catch (e) {
            this.updateStatus(false)
        }

        this.state.pollingTimer = setTimeout(() => this.startPolling(), this.state.currentInterval)
    }

    processData(data) {
        // Оновлення годинника
        const info = data?.infoslist?.info?.[0]
        if (info) {
            if (this.dom.clock) this.dom.clock.innerText = info.datetime
            if (info.interval) this.state.currentInterval = parseInt(info.interval)
        }

        // Оновлення вузлів
        const params = data?.paramslist?.param || []
        params.forEach((item) => {
            const targetNodes = this.state.idenMap.get(item.iden)
            if (!targetNodes) return

            targetNodes.forEach((node) => {
                const group = node.dataset.group
                if (group === 'dtext') {
                    this.updateText(node.querySelector('.node-value'), item.valuetext)
                } else if (group === 'hist') {
                    this.updateHist(node, item.value)
                } else if (group === 'block') {
                    this.updateText(node.querySelector('.node-value'), item.value)
                    this.updateImage(node, item.iden, item.value)
                }
            })
        })
    }

    /** --- UI HELPERS --- **/

    updateStatus(isOnline) {
        if (this.state.isOnline === isOnline) return
        this.state.isOnline = isOnline

        this.dom.statusBlock?.classList.toggle('is-offline', !isOnline)
        if (this.dom.statusText) this.dom.statusText.textContent = isOnline ? 'Online' : 'Offline'

        this.dom.nodesLayer
            .querySelectorAll('.schema-node')
            .forEach((n) => n.classList.toggle('is-online', isOnline))
    }

    updateText(el, val) {
        if (!el || el.innerText === String(val)) return
        el.innerText = val
        el.classList.add('updated')
        setTimeout(() => el.classList.remove('updated'), 600)
    }

    updateHist(node, val) {
        const { pred_n: min = 0, pred_v: max = 100 } = node._meta?.img || {}
        const percent = Math.min(Math.max(((parseFloat(val) - min) / (max - min)) * 100, 0), 100)
        node.style.setProperty('--p', `${percent}%`)
    }

    updateImage(node, iden, val) {
        const img = node.querySelector('.node-image')
        if (!img) return

        const config = APP_CONFIG.IMAGE_MAP[iden] || APP_CONFIG.IMAGE_MAP['default']
        const src = config[String(val)]

        if (src) {
            const newPath = `img/${src}`
            if (img.getAttribute('src') !== newPath) {
                img.src = newPath
                img.style.display = 'block'
            }
        } else {
            img.style.display = 'none'
        }
    }

    handleResize() {
        if (this.state.bgImage) {
            const mode = this.dom.modeSelect.value
            const img = this.state.bgImage
            const { naturalWidth: ow, naturalHeight: oh } = img
            const { offsetWidth: vw, offsetHeight: vh } = this.dom.container

            this.dom.scene.style.cssText = 'aspect-ratio: auto; width: auto; height: auto;'

            if (mode === 'stretch') {
                this.dom.scene.style.width = '100%'
                this.dom.scene.style.height = '100%'
            } else {
                const scale = Math.min(vw / ow, vh / oh)
                this.dom.scene.style.width = `${ow * scale}px`
                this.dom.scene.style.height = `${oh * scale}px`
            }
        }
    }
}

// Запуск
document.addEventListener('DOMContentLoaded', () => new SchemaApp())
