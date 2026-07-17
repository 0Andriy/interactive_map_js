import {
    setProtectedResource,
    secureApi,
    cachedSecureApi,
    cachedPublicApi,
} from './apiClient/index.js'

/**
 * --- CONFIGURATION ---
 */
const APP_CONFIG = {
    HOST: window.location.host,
    API_BASE: '/api/v1/ios',
    DEFAULT_POLLING_MS: 1000 * 4,
    WS_BASE: '/ws/ios',
    // Функція для побудови HTTP URL
    getApiUrl(path) {
        const protocol = window.location.protocol // http: або https:

        // Формуємо базовий origin
        const baseOrigin = `${protocol}//${this.HOST}`

        // Поєднуємо API_BASE та path, очищаючи від подвійних /
        const combinedPath = `${this.API_BASE}/${path}`.replace(/\/+/g, '/')

        // Конструктор URL автоматично все зліпить правильно
        const fullUrl = new URL(combinedPath, baseOrigin)
        return fullUrl.href
    },
    // Функція для побудови WebSocket URL
    getWsUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        return `${protocol}//${this.HOST}${this.WS_BASE}`
    },
    LAYOUT_PADDING: 0,
    ICONS: {
        exitFullscreen:
            '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>',
        enterFullscreen:
            '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    },
    //Кольори відносно статусу
    STATUS_COLORS: {
        0: '#04d004',
        1: 'yellow',
        2: 'red',
        3: '#ff40ff', //magenta
        4: 'yellow',
        5: 'red',
        6: '#ff40ff',
        7: 'white',
        255: '#ff40ff',
        default: 'magenta',
    },
    // Карта станів для зображень (src картинок у папці img/)
    BLOCK_UI_CONFIG: {
        default: {
            type: null,
            icon: {
                default: 'round-help-outline',
            },
            color: {
                default: 'gray',
            },
        },
        CDCY: {
            type: 'C',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
            },
            color: {
                1: 'black',
                2: 'yellow',
                3: '#ff40ff',
            },
        },
        CDPB: {
            type: 'C',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
            },
            color: {
                1: 'blue',
                2: 'black',
                3: '#ff40ff',
            },
        },
        CDPR: {
            type: 'C',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: '#ff40ff',
            },
        },
        CDPY: {
            type: 'C',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
            },
            color: {
                1: 'yellow',
                2: 'black',
                3: '#ff40ff',
            },
        },
        DIAGN1: {
            type: 'C',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
            },
        },
        DIAGN2: {
            type: 'C',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
            },
            color: {
                1: 'aqua',
                2: 'black',
                3: '#ff40ff',
            },
        },
        DIAGN3: {
            type: 'C',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
            },
        },
        DIAGN4: {
            type: 'C',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
            },
            color: {
                1: 'aqua',
                2: 'black',
                3: '#ff40ff',
            },
        },
        DIAGNL: {
            type: 'C',
            icon: {
                1: 'triangle-left-fill',
                2: 'triangle-left-fill',
                3: 'triangle-left-fill',
            },
            color: {
                1: 'aqua',
                2: 'black',
                3: '#ff40ff',
            },
        },
        DIAGNN: {
            type: 'C',
            icon: {
                1: 'triangle-down-fill',
                2: 'triangle-down-fill',
                3: 'triangle-down-fill',
            },
            color: {
                1: 'aqua',
                2: 'black',
                3: '#ff40ff',
            },
        },
        DIAGNP: {
            type: 'C',
            icon: {
                1: 'triangle-right-fill',
                2: 'triangle-right-fill',
                3: 'triangle-right-fill',
            },
            color: {
                1: 'aqua',
                2: 'black',
                3: '#ff40ff',
            },
        },
        DIAGNV: {
            type: 'C',
            icon: {
                1: 'triangle-up-fill',
                2: 'triangle-up-fill',
                3: 'triangle-up-fill',
            },
            color: {
                1: 'aqua',
                2: 'black',
                3: '#ff40ff',
            },
        },
        DIAGZK: {
            type: 'C',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: '#ff40ff',
            },
        },
        AVODZ: {
            type: 'D',
            icon: {
                1: 'auto-protect-input-on',
                2: 'auto-protect-input-off',
                3: 'auto-protect-input-off',
                4: 'auto-protect-input-off',
                5: 'auto-protect-input-off',
                6: 'auto-protect-input-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        DPR1: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'black',
                2: 'red',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        DSG: {
            type: 'D',
            icon: {
                1: 'rect-fill',
                2: 'rect-outline',
                3: 'rect-fill',
                4: 'rect-fill',
                5: 'rect-fill',
                6: 'rect-fill',
            },
            color: {
                1: 'green',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        DSGIN: {
            type: 'D',
            icon: {
                1: 'rect-c1-fill',
                2: 'rect-c1-outline',
                3: 'rect-c1-fill',
                4: 'rect-c1-fill',
                5: 'rect-c1-fill',
                6: 'rect-c1-fill',
            },
            color: {
                1: 'green',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        DSR: {
            type: 'D',
            icon: {
                1: 'rect-fill',
                2: 'rect-outline',
                3: 'rect-fill',
                4: 'rect-fill',
                5: 'rect-fill',
                6: 'rect-fill',
            },
            color: {
                1: 'red',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        DSRG: {
            type: 'D',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                4: 'rect-fill',
                5: 'rect-fill',
                6: 'rect-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: 'red',
                5: 'green',
                6: 'black',
            },
        },
        DSRGIN: {
            type: 'D',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                4: 'rect-fill',
                5: 'rect-fill',
                6: 'rect-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'black',
            },
        },
        DSRIN: {
            type: 'D',
            icon: {
                1: 'rect-c1-fill',
                2: 'rect-c1-outline',
                3: 'rect-c1-fill',
                4: 'rect-c1-fill',
                5: 'rect-c1-fill',
                6: 'rect-c1-fill',
            },
            color: {
                1: 'red',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        DSY: {
            type: 'D',
            icon: {
                1: 'rect-fill',
                2: 'rect-outline',
                3: 'rect-fill',
                4: 'rect-fill',
                5: 'rect-fill',
                6: 'rect-fill',
            },
            color: {
                1: 'yellow',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        KLSTG: {
            type: 'D',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'ptime-horizontal-outline',
                4: 'ptime-horizontal-outline',
                5: 'ptime-horizontal-outline',
                6: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        KLSTV: {
            type: 'D',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'ptime-vertical-outline',
                4: 'ptime-vertical-outline',
                5: 'ptime-vertical-outline',
                6: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MAVODZ: {
            type: 'D',
            icon: {
                1: 'auto-protect-input-on',
                2: 'auto-protect-input-off',
                3: 'auto-protect-input-off',
                4: 'auto-protect-input-off',
                5: 'auto-protect-input-off',
                6: 'auto-protect-input-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MGC10: {
            type: 'D',
            icon: {
                1: 'rhombus-fill',
                2: 'rhombus-fill',
                3: 'rhombus-fill',
                4: 'rhombus-fill',
                5: 'rhombus-fill',
                6: 'rhombus-fill',
            },
            color: {
                1: 'green',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MGC15: {
            type: 'D',
            icon: {
                1: 'rhombus-fill',
                2: 'rhombus-fill',
                3: 'rhombus-fill',
                4: 'rhombus-fill',
                5: 'rhombus-fill',
                6: 'rhombus-fill',
            },
            color: {
                1: 'green',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },

        MKLSTG: {
            type: 'D',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'ptime-horizontal-outline',
                4: 'ptime-horizontal-outline',
                5: 'ptime-horizontal-outline',
                6: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MKLSTV: {
            type: 'D',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'ptime-vertical-outline',
                4: 'ptime-vertical-outline',
                5: 'ptime-vertical-outline',
                6: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MNAKL: {
            type: 'D',
            icon: {
                1: 'switch-vertical-on',
                2: 'switch-vertical-down-off',
                3: 'switch-vertical-down-off',
                4: 'switch-vertical-down-off',
                5: 'switch-vertical-down-off',
                6: 'switch-vertical-down-on',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MNAKLG: {
            type: 'D',
            icon: {
                1: 'switch-horizontal-on',
                2: 'switch-horizontal-off',
                3: 'switch-horizontal-off',
                4: 'switch-horizontal-off',
                5: 'switch-horizontal-off',
                6: 'switch-horizontal-on',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MNASON: {
            type: 'D',
            icon: {
                1: 'arrow-down-fill',
                2: 'arrow-down-outline',
                3: 'arrow-down-outline',
                4: 'arrow-down-outline',
                5: 'arrow-down-outline',
                6: 'arrow-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MNASOP: {
            type: 'D',
            icon: {
                1: 'arrow-right-fill',
                2: 'arrow-right-outline',
                3: 'arrow-right-outline',
                4: 'arrow-right-outline',
                5: 'arrow-right-outline',
                6: 'arrow-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MNKGIN: {
            type: 'D',
            icon: {
                1: 'switch-horizontal-off',
                2: 'switch-horizontal-on',
                3: 'switch-horizontal-on',
                4: 'switch-horizontal-on',
                5: 'switch-horizontal-on',
                6: 'switch-horizontal-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MRC10: {
            type: 'D',
            icon: {
                1: 'rhombus-fill',
                2: 'rhombus-fill',
                3: 'rhombus-fill',
                4: 'rhombus-fill',
                5: 'rhombus-fill',
                6: 'rhombus-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MRC15: {
            type: 'D',
            icon: {
                1: 'rhombus-fill',
                2: 'rhombus-fill',
                3: 'rhombus-fill',
                4: 'rhombus-fill',
                5: 'rhombus-fill',
                6: 'rhombus-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MRG10: {
            type: 'D',
            icon: {
                1: 'rhombus-fill',
                2: 'rhombus-fill',
                3: 'rhombus-fill',
                4: 'rhombus-fill',
                5: 'rhombus-fill',
                6: 'rhombus-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MRG15: {
            type: 'D',
            icon: {
                1: 'rhombus-fill',
                2: 'rhombus-fill',
                3: 'rhombus-fill',
                4: 'rhombus-fill',
                5: 'rhombus-fill',
                6: 'rhombus-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MYC10: {
            type: 'D',
            icon: {
                1: 'rhombus-fill',
                2: 'rhombus-fill',
                3: 'rhombus-fill',
                4: 'rhombus-fill',
                5: 'rhombus-fill',
                6: 'rhombus-fill',
            },
            color: {
                1: 'yellow',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        MYC15: {
            type: 'D',
            icon: {
                1: 'rhombus-fill',
                2: 'rhombus-fill',
                3: 'rhombus-fill',
                4: 'rhombus-fill',
                5: 'rhombus-fill',
                6: 'rhombus-fill',
            },
            color: {
                1: 'yellow',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        NAKL: {
            type: 'D',
            icon: {
                1: 'switch-vertical-on',
                2: 'switch-vertical-down-off',
                3: 'switch-vertical-down-off',
                4: 'switch-vertical-down-off',
                5: 'switch-vertical-down-off',
                6: 'switch-vertical-down-on',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        NAKLG: {
            type: 'D',
            icon: {
                1: 'switch-horizontal-on',
                2: 'switch-horizontal-off',
                3: 'switch-horizontal-off',
                4: 'switch-horizontal-off',
                5: 'switch-horizontal-off',
                6: 'switch-horizontal-on',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        NASOP: {
            type: 'D',
            icon: {
                1: 'arrow-right-fill',
                2: 'arrow-right-outline',
                3: 'arrow-right-outline',
                4: 'arrow-right-outline',
                5: 'arrow-right-outline',
                6: 'arrow-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        NEISK: {
            type: 'D',
            icon: {
                1: 'circle-fill',
                2: 'circle-fill',
                3: 'circle-fill',
                4: 'circle-fill',
                5: 'circle-fill',
                6: 'circle-fill',
            },
            color: {
                1: 'yellow',
                2: 'green',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        NKGIN: {
            type: 'D',
            icon: {
                1: 'switch-horizontal-off',
                2: 'switch-horizontal-on',
                3: 'switch-horizontal-on',
                4: 'switch-horizontal-on',
                5: 'switch-horizontal-on',
                6: 'switch-horizontal-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SCR15: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'black',
                2: 'red',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SCY10: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'black',
                2: 'yellow',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SDA: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'black',
                2: 'aqua',
                3: 'black',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SGC10: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SGC15: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SGR10: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SGR15: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SRC10: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SRC10N: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: '#ff40ff',
                4: 'red',
                5: 'black',
                6: 'white',
            },
        },
        SRC15: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SRG10: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SRG10N: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: 'red',
                5: 'green',
                6: 'white',
            },
        },
        SRG15: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SRG15N: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: 'red',
                5: 'green',
                6: 'white',
            },
        },
        SYC10: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'yellow',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SYC15: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'yellow',
                2: 'black',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        SYG15: {
            type: 'D',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'yellow',
                2: 'green',
                3: '#ff40ff',
                4: 'black',
                5: 'black',
                6: 'white',
            },
        },
        FDIA: {
            type: 'F',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                6: 'rect-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                6: 'white',
            },
        },
        FGR10: {
            type: 'F',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: '#ff40ff',
                6: 'white',
            },
        },
        FGR15: {
            type: 'F',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: '#ff40ff',
                6: 'white',
            },
        },
        FRC10: {
            type: 'F',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: '#ff40ff',
                6: 'white',
            },
        },
        FRC15: {
            type: 'F',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: '#ff40ff',
                6: 'white',
            },
        },
        FRG10: {
            type: 'F',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                6: 'white',
            },
        },
        FRG15: {
            type: 'F',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                6: 'white',
            },
        },
        KSD_G: {
            type: 'F',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                6: 'rect-fill',
            },
            color: {
                1: 'green',
                2: 'gray',
                3: '#ff40ff',
                6: 'black',
            },
        },
        KSD_O: {
            type: 'F',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                6: 'rect-fill',
            },
            color: {
                1: 'orange',
                2: 'gray',
                3: '#ff40ff',
                6: 'black',
            },
        },
        KSD_R: {
            type: 'F',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                6: 'rect-fill',
            },
            color: {
                1: 'red',
                2: 'gray',
                3: '#ff40ff',
                6: 'black',
            },
        },
        KSD_Y: {
            type: 'F',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                6: 'rect-fill',
            },
            color: {
                1: 'yellow',
                2: 'gray',
                3: '#ff40ff',
                6: 'black',
            },
        },
        MNASFL: {
            type: 'F',
            icon: {
                1: 'arrow-left-fill',
                2: 'arrow-left-outline',
                3: 'arrow-left-outline',
                6: 'arrow-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        MNASFN: {
            type: 'F',
            icon: {
                1: 'arrow-down-fill',
                2: 'arrow-down-outline',
                3: 'arrow-down-outline',
                6: 'arrow-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        MNASFP: {
            type: 'F',
            icon: {
                1: 'arrow-right-fill',
                2: 'arrow-right-outline',
                3: 'arrow-right-outline',
                6: 'arrow-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        MNASFV: {
            type: 'F',
            icon: {
                1: 'arrow-up-fill',
                2: 'arrow-up-outline',
                3: 'arrow-up-outline',
                6: 'arrow-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        MVENFL: {
            type: 'F',
            icon: {
                1: 'fan-left-fill',
                2: 'fan-left-outline',
                3: 'fan-left-outline',
                6: 'fan-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        MVENFN: {
            type: 'F',
            icon: {
                1: 'fan-down-fill',
                2: 'fan-down-outline',
                3: 'fan-down-outline',
                6: 'fan-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        MVENFP: {
            type: 'F',
            icon: {
                1: 'fan-right-fill',
                2: 'fan-right-outline',
                3: 'fan-right-outline',
                6: 'fan-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        MVENFV: {
            type: 'F',
            icon: {
                1: 'fan-up-fill',
                2: 'fan-up-outline',
                3: 'fan-up-outline',
                6: 'fan-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        NASFL: {
            type: 'F',
            icon: {
                1: 'arrow-left-fill',
                2: 'arrow-left-outline',
                3: 'arrow-left-outline',
                6: 'arrow-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        NASFN: {
            type: 'F',
            icon: {
                1: 'arrow-down-fill',
                2: 'arrow-down-outline',
                3: 'arrow-down-outline',
                6: 'arrow-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        NASFP: {
            type: 'F',
            icon: {
                1: 'arrow-right-fill',
                2: 'arrow-right-outline',
                3: 'arrow-right-outline',
                6: 'arrow-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        NASFV: {
            type: 'F',
            icon: {
                1: 'arrow-up-fill',
                2: 'arrow-up-outline',
                3: 'arrow-up-outline',
                6: 'arrow-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        OPZASH: {
            type: 'F',
            icon: {
                1: 'triangle-up-outline',
                2: 'triangle-up-outline',
                3: 'triangle-up-outline',
                6: 'triangle-up-outline',
            },
            color: {
                1: 'green',
                2: 'black',
                3: '#ff40ff',
                6: 'white',
            },
        },
        SNK: {
            type: 'F',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                6: 'square-fill',
            },
            color: {
                1: 'brown',
                2: 'black',
                3: '#ff40ff',
                6: 'black',
            },
        },
        // TODO
        // TRIGR: {
        //   type: 'F',
        // },

        VENFL: {
            type: 'F',
            icon: {
                1: 'fan-left-fill',
                2: 'fan-left-outline',
                3: 'fan-left-outline',
                6: 'fan-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        VENFN: {
            type: 'F',
            icon: {
                1: 'fan-down-fill',
                2: 'fan-down-outline',
                3: 'fan-down-outline',
                6: 'fan-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        VENFP: {
            type: 'F',
            icon: {
                1: 'fan-right-fill',
                2: 'fan-right-outline',
                3: 'fan-right-outline',
                6: 'fan-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        VENFV: {
            type: 'F',
            icon: {
                1: 'fan-up-fill',
                2: 'fan-up-outline',
                3: 'fan-up-outline',
                6: 'fan-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                6: 'white',
            },
        },
        DKSD: {
            type: 'G',
            icon: {
                1: 'rect-outline',
                2: 'rect-outline',
                3: 'rect-outline',
                4: 'rect-outline',
                5: 'rect-outline',
                6: 'rect-outline',
                7: 'rect-outline',
                8: 'rect-outline',
                9: 'rect-outline',
            },
            color: {
                1: 'green',
                2: 'red',
                3: 'yellow',
                4: 'yellow',
                5: 'gray',
                6: 'white',
                7: '#ff40ff',
                8: 'blue',
                9: '#ff40ff',
            },
        },
        KSD_4: {
            type: 'G',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                4: 'rect-fill',
                5: 'rect-fill',
                6: 'rect-fill',
                7: 'rect-fill',
                8: 'rect-fill',
                9: 'rect-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: 'black',
                4: 'black',
                5: 'black',
                6: 'black',
                7: '#ff40ff',
                8: 'black',
                9: 'gray',
            },
        },
        KSD_5: {
            type: 'G',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                4: 'rect-fill',
                5: 'rect-fill',
                6: 'rect-fill',
                7: 'rect-fill',
                8: 'rect-fill',
                9: 'rect-fill',
            },
            color: {
                1: 'orange',
                2: 'green',
                3: 'red',
                4: 'black',
                5: 'black',
                6: 'black',
                7: '#ff40ff',
                8: 'black',
                9: 'gray',
            },
        },
        KVV_G: {
            type: 'G',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                4: 'rect-fill',
                5: 'rect-fill',
                6: 'rect-fill',
                7: 'rect-fill',
                8: 'rect-fill',
                9: 'rect-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: 'yellow',
                4: 'black',
                5: 'black',
                6: 'black',
                7: '#ff40ff',
                8: 'black',
                9: '#ff40ff',
            },
        },
        LSD_G: {
            type: 'G',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                4: 'rect-fill',
                5: 'rect-fill',
                6: 'rect-fill',
                7: 'rect-fill',
                8: 'rect-fill',
                9: 'rect-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: 'yellow',
                4: 'black',
                5: 'black',
                6: 'black',
                7: '#ff40ff',
                8: 'black',
                9: '#ff40ff',
            },
        },
        USBL: {
            type: 'V',
            icon: {
                1: 'label-down-outline',
                2: 'label-down-outline',
                4: 'label-down-outline',
                5: 'label-down-outline',
                6: 'label-down-outline',
                7: 'label-down-outline',
                8: 'label-down-outline',
            },
            color: {
                1: 'green',
                2: 'red',
                4: 'brown',
                5: 'green',
                6: '#ff40ff',
                7: 'blue',
                8: '#ff40ff',
            },
        },
        USBLIN: {
            type: 'W',
            icon: {
                1: 'label-up-outline',
                2: 'label-up-outline',
                4: 'label-up-outline',
                5: 'label-up-outline',
                6: 'label-up-outline',
                7: 'label-up-outline',
                8: 'label-up-outline',
            },
            color: {
                1: 'red',
                2: 'green',
                4: 'brown',
                5: 'red',
                6: '#ff40ff',
                7: 'blue',
                8: '#ff40ff',
            },
        },
        SIGK: {
            type: 'X',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                4: 'rect-fill',
                5: 'rect-fill',
                6: 'rect-fill',
                7: 'rect-fill',
            },
            color: {
                1: 'blue',
                2: 'green',
                3: 'red',
                4: 'brown',
                5: 'yellow',
                6: '#ff40ff',
                7: 'brown',
            },
        },
        SIGU: {
            type: 'Y',
            icon: {
                1: 'rect-fill',
                2: 'rect-fill',
                3: 'rect-fill',
                4: 'rect-fill',
                5: 'rect-fill',
                6: 'rect-fill',
                7: 'rect-fill',
                8: 'rect-fill',
                9: 'rect-fill',
                10: 'rect-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: 'red',
                4: 'brown',
                5: 'yellow',
                6: '#ff40ff',
                7: 'blue',
                8: '#ff40ff',
                9: 'black',
                10: 'black',
            },
        },
        DGRC: {
            type: 'g',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
            },
            color: {
                1: 'black',
                2: 'black',
                3: 'red',
                4: 'red',
                5: 'yellow',
                6: 'yellow',
                7: 'blue',
                8: 'blue',
                9: 'black',
                10: '#ff40ff',
            },
        },
        FRG26: {
            type: 'g',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
            },
            color: {
                1: 'gray',
                2: 'gray',
                3: 'gray',
                4: 'gray',
                5: 'gray',
                6: 'gray',
                7: 'gray',
                8: 'gray',
                9: 'black',
                10: 'black',
            },
        },
        KBL: {
            type: 'k',
            icon: {
                1: 'long-arrow-down-fill',
                2: 'long-arrow-down-fill',
                4: 'long-arrow-down-fill',
                5: 'long-arrow-down-fill',
                6: 'long-arrow-down-fill',
                7: 'long-arrow-down-fill',
                8: 'long-arrow-down-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                4: 'brown',
                5: 'green',
                6: '#ff40ff',
                7: 'blue',
                8: '#ff40ff',
            },
        },
        IPKTL: {
            type: 'I',
            icon: {
                1: 'triangle-left-fill',
                2: 'triangle-left-fill',
                3: 'triangle-left-outline',
                4: 'triangle-left-outline',
                5: 'triangle-left-outline',
                6: 'triangle-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: '#ff40ff',
                6: 'white',
            },
        },
        IPKTN: {
            type: 'I',
            icon: {
                1: 'triangle-down-fill',
                2: 'triangle-down-fill',
                3: 'triangle-down-outline',
                4: 'triangle-down-outline',
                5: 'triangle-down-outline',
                6: 'triangle-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: '#ff40ff',
                6: 'white',
            },
        },
        IPKTP: {
            type: 'I',
            icon: {
                1: 'triangle-right-fill',
                2: 'triangle-right-fill',
                3: 'triangle-right-outline',
                4: 'triangle-right-outline',
                5: 'triangle-right-outline',
                6: 'triangle-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: '#ff40ff',
                6: 'white',
            },
        },
        IPKTV: {
            type: 'I',
            icon: {
                1: 'triangle-up-fill',
                2: 'triangle-up-fill',
                3: 'triangle-up-outline',
                4: 'triangle-up-outline',
                5: 'triangle-up-outline',
                6: 'triangle-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: '#ff40ff',
                6: 'white',
            },
        },
        BC10MN: {
            type: 'M',
            icon: {
                1: 'square-fill',
                2: 'square-outline',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-outline',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        ELMAG: {
            type: 'M',
            icon: {
                1: 'electromagnet-on',
                2: 'electromagnet-off',
                3: 'electromagnet-off',
                4: 'electromagnet-off',
                5: 'electromagnet-on',
                6: 'electromagnet-off',
                7: 'electromagnet-off',
                8: 'electromagnet-off',
                9: 'electromagnet-off',
                10: 'electromagnet-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        GC10MN: {
            type: 'M',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-outline',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'black',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'green',
                6: 'black',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        GC15MN: {
            type: 'M',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'black',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'green',
                6: 'black',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        GR10MN: {
            type: 'M',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'green',
                6: 'red',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        GR15MN: {
            type: 'M',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'green',
                6: 'red',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },

        IPKG: {
            type: 'M',
            icon: {
                1: 'pulse-valve-right-fill',
                2: 'pulse-valve-right-outline',
                3: 'pulse-valve-right-outline',
                4: 'pulse-valve-right-outline',
                5: 'pulse-valve-right-fill',
                6: 'pulse-valve-right-outline',
                7: 'pulse-valve-right-outline',
                8: 'pulse-valve-right-outline',
                9: 'pulse-valve-right-outline',
                10: 'pulse-valve-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        IPKV: {
            type: 'M',
            icon: {
                1: 'pulse-valve-up-fill',
                2: 'pulse-valve-up-outline',
                3: 'pulse-valve-up-outline',
                4: 'pulse-valve-up-outline',
                5: 'pulse-valve-up-fill',
                6: 'pulse-valve-up-outline',
                7: 'pulse-valve-up-outline',
                8: 'pulse-valve-up-outline',
                9: 'pulse-valve-up-outline',
                10: 'pulse-valve-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        KPKOG: {
            type: 'M',
            icon: {
                1: 'safety-valve-down-fill',
                2: 'safety-valve-down-outline',
                3: 'safety-valve-down-outline',
                4: 'safety-valve-down-outline',
                5: 'safety-valve-down-fill',
                6: 'safety-valve-down-outline',
                7: 'safety-valve-down-outline',
                8: 'safety-valve-down-outline',
                9: 'safety-valve-down-outline',
                10: 'safety-valve-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        KPKOGV: {
            type: 'M',
            icon: {
                1: 'safety-valve-up-fill',
                2: 'safety-valve-up-outline',
                3: 'safety-valve-up-outline',
                4: 'safety-valve-up-outline',
                5: 'safety-valve-up-fill',
                6: 'safety-valve-up-outline',
                7: 'safety-valve-up-outline',
                8: 'safety-valve-up-outline',
                9: 'safety-valve-up-outline',
                10: 'safety-valve-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        KPKOV: {
            type: 'M',
            icon: {
                1: 'safety-valve-right-fill',
                2: 'safety-valve-right-outline',
                3: 'safety-valve-right-outline',
                4: 'safety-valve-right-outline',
                5: 'safety-valve-right-fill',
                6: 'safety-valve-right-outline',
                7: 'safety-valve-right-outline',
                8: 'safety-valve-right-outline',
                9: 'safety-valve-right-outline',
                10: 'safety-valve-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        KPKOVL: {
            type: 'M',
            icon: {
                1: 'safety-valve-left-fill',
                2: 'safety-valve-left-outline',
                3: 'safety-valve-left-outline',
                4: 'safety-valve-left-outline',
                5: 'safety-valve-left-fill',
                6: 'safety-valve-left-outline',
                7: 'safety-valve-left-outline',
                8: 'safety-valve-left-outline',
                9: 'safety-valve-left-outline',
                10: 'safety-valve-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        KPUL: {
            type: 'M',
            icon: {
                1: 'tr-dl-fill',
                2: 'tr-dl-outline',
                3: 'tr-dl-outline',
                4: 'tr-dl-outline',
                5: 'tr-dl-fill',
                6: 'tr-dl-outline',
                7: 'tr-dl-outline',
                8: 'tr-dl-outline',
                9: 'tr-dl-outline',
                10: 'tr-dl-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        KPUP: {
            type: 'M',
            icon: {
                1: 'tr-dr-fill',
                2: 'tr-dr-outline',
                3: 'tr-dr-outline',
                4: 'tr-dr-outline',
                5: 'tr-dr-fill',
                6: 'tr-dr-outline',
                7: 'tr-dr-outline',
                8: 'tr-dr-outline',
                9: 'tr-dr-outline',
                10: 'tr-dr-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MIPKG: {
            type: 'M',
            icon: {
                1: 'pulse-valve-right-fill',
                2: 'pulse-valve-right-outline',
                3: 'pulse-valve-right-outline',
                4: 'pulse-valve-right-outline',
                5: 'pulse-valve-right-fill',
                6: 'pulse-valve-right-outline',
                7: 'pulse-valve-right-outline',
                8: 'pulse-valve-right-outline',
                9: 'pulse-valve-right-outline',
                10: 'pulse-valve-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MIPKV: {
            type: 'M',
            icon: {
                1: 'pulse-valve-up-fill',
                2: 'pulse-valve-up-outline',
                3: 'pulse-valve-up-outline',
                4: 'pulse-valve-up-outline',
                5: 'pulse-valve-up-fill',
                6: 'pulse-valve-up-outline',
                7: 'pulse-valve-up-outline',
                8: 'pulse-valve-up-outline',
                9: 'pulse-valve-up-outline',
                10: 'pulse-valve-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MKPKOG: {
            type: 'M',
            icon: {
                1: 'safety-valve-down-fill',
                2: 'safety-valve-down-outline',
                3: 'safety-valve-down-outline',
                4: 'safety-valve-down-outline',
                5: 'safety-valve-down-fill',
                6: 'safety-valve-down-outline',
                7: 'safety-valve-down-outline',
                8: 'safety-valve-down-outline',
                9: 'safety-valve-down-outline',
                10: 'safety-valve-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MKPKOV: {
            type: 'M',
            icon: {
                1: 'safety-valve-right-fill',
                2: 'safety-valve-right-outline',
                3: 'safety-valve-right-outline',
                4: 'safety-valve-right-outline',
                5: 'safety-valve-right-fill',
                6: 'safety-valve-right-outline',
                7: 'safety-valve-right-outline',
                8: 'safety-valve-right-outline',
                9: 'safety-valve-right-outline',
                10: 'safety-valve-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MKPUL: {
            type: 'M',
            icon: {
                1: 'tr-dl-fill',
                2: 'tr-dl-outline',
                3: 'tr-dl-outline',
                4: 'tr-dl-outline',
                5: 'tr-dl-fill',
                6: 'tr-dl-outline',
                7: 'tr-dl-outline',
                8: 'tr-dl-outline',
                9: 'tr-dl-outline',
                10: 'tr-dl-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MKPUP: {
            type: 'M',
            icon: {
                1: 'tr-dr-fill',
                2: 'tr-dr-outline',
                3: 'tr-dr-outline',
                4: 'tr-dr-outline',
                5: 'tr-dr-fill',
                6: 'tr-dr-outline',
                7: 'tr-dr-outline',
                8: 'tr-dr-outline',
                9: 'tr-dr-outline',
                10: 'tr-dr-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MNAGEL: {
            type: 'M',
            icon: {
                1: 'electric-heater-right-on',
                2: 'electric-heater-right-off',
                3: 'electric-heater-right-off',
                4: 'electric-heater-right-off',
                5: 'electric-heater-right-on',
                6: 'electric-heater-right-off',
                7: 'electric-heater-right-off',
                8: 'electric-heater-right-off',
                9: 'electric-heater-right-off',
                10: 'electric-heater-right-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MNAGEP: {
            type: 'M',
            icon: {
                1: 'electric-heater-left-on',
                2: 'electric-heater-left-off',
                3: 'electric-heater-left-off',
                4: 'electric-heater-left-off',
                5: 'electric-heater-left-on',
                6: 'electric-heater-left-off',
                7: 'electric-heater-left-off',
                8: 'electric-heater-left-off',
                9: 'electric-heater-left-off',
                10: 'electric-heater-left-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MNASGL: {
            type: 'M',
            icon: {
                1: 'arrow-left-fill',
                2: 'arrow-left-outline',
                3: 'arrow-left-outline',
                4: 'arrow-left-outline',
                5: 'arrow-left-fill',
                6: 'arrow-left-outline',
                7: 'arrow-left-outline',
                8: 'arrow-left-outline',
                9: 'arrow-left-outline',
                10: 'arrow-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MNASGP: {
            type: 'M',
            icon: {
                1: 'arrow-right-fill',
                2: 'arrow-right-outline',
                3: 'arrow-right-outline',
                4: 'arrow-right-outline',
                5: 'arrow-right-fill',
                6: 'arrow-right-outline',
                7: 'arrow-right-outline',
                8: 'arrow-right-outline',
                9: 'arrow-right-outline',
                10: 'arrow-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MNASVN: {
            type: 'M',
            icon: {
                1: 'arrow-down-fill',
                2: 'arrow-down-outline',
                3: 'arrow-down-outline',
                4: 'arrow-down-outline',
                5: 'arrow-down-fill',
                6: 'arrow-down-outline',
                7: 'arrow-down-outline',
                8: 'arrow-down-outline',
                9: 'arrow-down-outline',
                10: 'arrow-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MNASVV: {
            type: 'M',
            icon: {
                1: 'arrow-up-fill',
                2: 'arrow-up-outline',
                3: 'arrow-up-outline',
                4: 'arrow-up-outline',
                5: 'arrow-up-fill',
                6: 'arrow-up-outline',
                7: 'arrow-up-outline',
                8: 'arrow-up-outline',
                9: 'arrow-up-outline',
                10: 'arrow-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MNOKLG: {
            type: 'M',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'ptime-horizontal-outline',
                4: 'ptime-horizontal-outline',
                5: 'ptime-horizontal-fill',
                6: 'ptime-horizontal-outline',
                7: 'ptime-horizontal-outline',
                8: 'ptime-horizontal-outline',
                9: 'ptime-horizontal-outline',
                10: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MNOKLV: {
            type: 'M',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'ptime-vertical-outline',
                4: 'ptime-vertical-outline',
                5: 'ptime-vertical-fill',
                6: 'ptime-vertical-outline',
                7: 'ptime-vertical-outline',
                8: 'ptime-vertical-outline',
                9: 'ptime-vertical-outline',
                10: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MOKLG: {
            type: 'M',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'tr-ud-horizontal-half-fill',
                4: 'ptime-horizontal-outline',
                5: 'ptime-horizontal-fill',
                6: 'ptime-horizontal-outline',
                7: 'tr-ud-horizontal-half-fill',
                8: 'ptime-horizontal-outline',
                9: 'ptime-horizontal-outline',
                10: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MOKLV: {
            type: 'M',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'tr-ud-vertical-half-fill',
                4: 'ptime-vertical-outline',
                5: 'ptime-vertical-fill',
                6: 'ptime-vertical-outline',
                7: 'tr-ud-vertical-half-fill',
                8: 'ptime-vertical-outline',
                9: 'ptime-vertical-outline',
                10: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MPKOGV: {
            type: 'M',
            icon: {
                1: 'safety-valve-up-fill',
                2: 'safety-valve-up-outline',
                3: 'safety-valve-up-outline',
                4: 'safety-valve-up-outline',
                5: 'safety-valve-up-fill',
                6: 'safety-valve-up-outline',
                7: 'safety-valve-up-outline',
                8: 'safety-valve-up-outline',
                9: 'safety-valve-up-outline',
                10: 'safety-valve-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MPKOVL: {
            type: 'M',
            icon: {
                1: 'safety-valve-left-fill',
                2: 'safety-valve-left-outline',
                3: 'safety-valve-left-outline',
                4: 'safety-valve-left-outline',
                5: 'safety-valve-left-fill',
                6: 'safety-valve-left-outline',
                7: 'safety-valve-left-outline',
                8: 'safety-valve-left-outline',
                9: 'safety-valve-left-outline',
                10: 'safety-valve-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MRKLGM: {
            type: 'M',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'tr-ud-horizontal-half-fill',
                4: 'ptime-horizontal-outline',
                5: 'ptime-horizontal-fill',
                6: 'ptime-horizontal-outline',
                7: 'tr-ud-horizontal-half-fill',
                8: 'ptime-horizontal-outline',
                9: 'ptime-horizontal-outline',
                10: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: 'aqua',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MRKLVM: {
            type: 'M',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'tr-ud-vertical-half-fill',
                4: 'ptime-vertical-outline',
                5: 'ptime-vertical-fill',
                6: 'ptime-vertical-outline',
                7: 'tr-ud-vertical-half-fill',
                8: 'ptime-vertical-outline',
                9: 'ptime-vertical-outline',
                10: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: 'aqua',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MVENGL: {
            type: 'M',
            icon: {
                1: 'fan-left-fill',
                2: 'fan-left-outline',
                3: 'fan-left-outline',
                4: 'fan-left-outline',
                5: 'fan-left-fill',
                6: 'fan-left-outline',
                7: 'fan-left-outline',
                8: 'fan-left-outline',
                9: 'fan-left-outline',
                10: 'fan-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MVENGP: {
            type: 'M',
            icon: {
                1: 'fan-right-fill',
                2: 'fan-right-outline',
                3: 'fan-right-outline',
                4: 'fan-right-outline',
                5: 'fan-right-fill',
                6: 'fan-right-outline',
                7: 'fan-right-outline',
                8: 'fan-right-outline',
                9: 'fan-right-outline',
                10: 'fan-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MVENVN: {
            type: 'M',
            icon: {
                1: 'fan-down-fill',
                2: 'fan-down-outline',
                3: 'fan-down-outline',
                4: 'fan-down-outline',
                5: 'fan-down-fill',
                6: 'fan-down-outline',
                7: 'fan-down-outline',
                8: 'fan-down-outline',
                9: 'fan-down-outline',
                10: 'fan-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MVENVV: {
            type: 'M',
            icon: {
                1: 'fan-up-fill',
                2: 'fan-up-outline',
                3: 'fan-up-outline',
                4: 'fan-up-outline',
                5: 'fan-up-fill',
                6: 'fan-up-outline',
                7: 'fan-up-outline',
                8: 'fan-up-outline',
                9: 'fan-up-outline',
                10: 'fan-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MVKLEG: {
            type: 'M',
            icon: {
                1: 'switch-horizontal-on',
                2: 'switch-horizontal-off',
                3: 'switch-horizontal-off',
                4: 'switch-horizontal-off',
                5: 'switch-horizontal-on',
                6: 'switch-horizontal-off',
                7: 'switch-horizontal-off',
                8: 'switch-horizontal-off',
                9: 'switch-horizontal-off',
                10: 'switch-horizontal-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MVKLEV: {
            type: 'M',
            icon: {
                1: 'switch-vertical-on',
                2: 'switch-vertical-off',
                3: 'switch-vertical-off',
                4: 'switch-vertical-off',
                5: 'switch-vertical-on',
                6: 'switch-vertical-off',
                7: 'switch-vertical-off',
                8: 'switch-vertical-off',
                9: 'switch-vertical-off',
                10: 'switch-vertical-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MZADBG: {
            type: 'M',
            icon: {
                1: 'latch-up-fill',
                2: 'latch-up-outline',
                3: 'latch-up-outline',
                4: 'latch-up-outline',
                5: 'latch-up-fill',
                6: 'latch-up-outline',
                7: 'latch-up-outline',
                8: 'latch-up-outline',
                9: 'latch-up-outline',
                10: 'latch-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        MZADBV: {
            type: 'M',
            icon: {
                1: 'latch-left-fill',
                2: 'latch-left-outline',
                3: 'latch-left-outline',
                4: 'latch-left-outline',
                5: 'latch-left-fill',
                6: 'latch-left-outline',
                7: 'latch-left-outline',
                8: 'latch-left-outline',
                9: 'latch-left-outline',
                10: 'latch-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        NAGEL: {
            type: 'M',
            icon: {
                1: 'electric-heater-right-on',
                2: 'electric-heater-right-off',
                3: 'electric-heater-right-off',
                4: 'electric-heater-right-off',
                5: 'electric-heater-right-on',
                6: 'electric-heater-right-off',
                7: 'electric-heater-right-off',
                8: 'electric-heater-right-off',
                9: 'electric-heater-right-off',
                10: 'electric-heater-right-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        NAGEP: {
            type: 'M',
            icon: {
                1: 'electric-heater-left-on',
                2: 'electric-heater-left-off',
                3: 'electric-heater-left-off',
                4: 'electric-heater-left-off',
                5: 'electric-heater-left-on',
                6: 'electric-heater-left-off',
                7: 'electric-heater-left-off',
                8: 'electric-heater-left-off',
                9: 'electric-heater-left-off',
                10: 'electric-heater-left-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        NASGL: {
            type: 'M',
            icon: {
                1: 'arrow-left-fill',
                2: 'arrow-left-outline',
                3: 'arrow-left-outline',
                4: 'arrow-left-outline',
                5: 'arrow-left-fill',
                6: 'arrow-left-outline',
                7: 'arrow-left-outline',
                8: 'arrow-left-outline',
                9: 'arrow-left-outline',
                10: 'arrow-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        NASGP: {
            type: 'M',
            icon: {
                1: 'arrow-right-fill',
                2: 'arrow-right-outline',
                3: 'arrow-right-outline',
                4: 'arrow-right-outline',
                5: 'arrow-right-fill',
                6: 'arrow-right-outline',
                7: 'arrow-right-outline',
                8: 'arrow-right-outline',
                9: 'arrow-right-outline',
                10: 'arrow-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        NASOTK: {
            type: 'M',
            icon: {
                1: 'arrow-down-fill',
                2: 'arrow-down-fill',
                3: 'arrow-down-outline',
                4: 'arrow-down-outline',
                5: 'arrow-down-fill',
                6: 'arrow-down-fill',
                7: 'arrow-down-outline',
                8: 'arrow-down-outline',
                9: 'arrow-down-outline',
                10: 'arrow-down-outline',
            },
            color: {
                1: 'green',
                2: 'red',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'green',
                6: 'red',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        NASVKL: {
            type: 'M',
            icon: {
                1: 'arrow-down-fill',
                2: 'arrow-down-fill',
                3: 'arrow-down-outline',
                4: 'arrow-down-outline',
                5: 'arrow-down-fill',
                6: 'arrow-down-fill',
                7: 'arrow-down-outline',
                8: 'arrow-down-outline',
                9: 'arrow-down-outline',
                10: 'arrow-down-outline',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'red',
                6: 'green',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        NASVN: {
            type: 'M',
            icon: {
                1: 'arrow-down-fill',
                2: 'arrow-down-outline',
                3: 'arrow-down-outline',
                4: 'arrow-down-outline',
                5: 'arrow-down-fill',
                6: 'arrow-down-outline',
                7: 'arrow-down-outline',
                8: 'arrow-down-outline',
                9: 'arrow-down-outline',
                10: 'arrow-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        NASVV: {
            type: 'M',
            icon: {
                1: 'arrow-up-fill',
                2: 'arrow-up-outline',
                3: 'arrow-up-outline',
                4: 'arrow-up-outline',
                5: 'arrow-up-fill',
                6: 'arrow-up-outline',
                7: 'arrow-up-outline',
                8: 'arrow-up-outline',
                9: 'arrow-up-outline',
                10: 'arrow-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        NOKLG: {
            type: 'M',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'ptime-horizontal-outline',
                4: 'ptime-horizontal-outline',
                5: 'ptime-horizontal-fill',
                6: 'ptime-horizontal-outline',
                7: 'ptime-horizontal-outline',
                8: 'ptime-horizontal-outline',
                9: 'ptime-horizontal-outline',
                10: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        NOKLV: {
            type: 'M',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'ptime-vertical-outline',
                4: 'ptime-vertical-outline',
                5: 'ptime-vertical-fill',
                6: 'ptime-vertical-outline',
                7: 'ptime-vertical-outline',
                8: 'ptime-vertical-outline',
                9: 'ptime-vertical-outline',
                10: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        OKLG: {
            type: 'M',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'tr-ud-horizontal-half-fill',
                4: 'ptime-horizontal-outline',
                5: 'ptime-horizontal-fill',
                6: 'ptime-horizontal-outline',
                7: 'tr-ud-horizontal-half-fill',
                8: 'ptime-horizontal-outline',
                9: 'ptime-horizontal-outline',
                10: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: 'aqua',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        OKLV: {
            type: 'M',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'tr-ud-vertical-half-fill',
                4: 'ptime-vertical-outline',
                5: 'ptime-vertical-fill',
                6: 'ptime-vertical-outline',
                7: 'tr-ud-vertical-half-fill',
                8: 'ptime-vertical-outline',
                9: 'ptime-vertical-outline',
                10: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: 'aqua',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        RC10MN: {
            type: 'M',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'red',
                6: 'black',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        RC15MN: {
            type: 'M',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'red',
                6: 'black',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        REG: {
            type: 'M',
            icon: {
                default: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'red',
                6: 'green',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        REGS: {
            type: 'M',
            icon: {
                default: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: 'yellow',
                4: '#ff40ff',
                5: 'red',
                6: 'green',
                7: 'yellow',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        REGSR: {
            type: 'M',
            icon: {
                default: 'square-fill',
            },
            color: {
                1: 'red',
                2: '#ff40ff',
                3: 'green',
                4: 'yellow',
                5: 'red',
                6: '#ff40ff',
                7: 'green',
                8: 'yellow',
                9: '#ff40ff',
                10: 'white',
            },
        },
        RG10MN: {
            type: 'M',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'red',
                6: 'green',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        RG15MN: {
            type: 'M',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'red',
                6: 'green',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        RKLGM: {
            type: 'M',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'tr-ud-horizontal-half-fill',
                4: 'ptime-horizontal-outline',
                5: 'ptime-horizontal-fill',
                6: 'ptime-horizontal-outline',
                7: 'tr-ud-horizontal-half-fill',
                8: 'ptime-horizontal-outline',
                9: 'ptime-horizontal-outline',
                10: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: 'aqua',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        RKLVM: {
            type: 'M',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'tr-ud-vertical-half-fill',
                4: 'ptime-vertical-outline',
                5: 'ptime-vertical-fill',
                6: 'ptime-vertical-outline',
                7: 'tr-ud-vertical-half-fill',
                8: 'ptime-vertical-outline',
                9: 'ptime-vertical-outline',
                10: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: 'aqua',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        SKTPNG: {
            type: 'M',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'tr-ud-horizontal-half-fill',
                4: 'ptime-horizontal-outline',
                5: 'ptime-horizontal-fill',
                6: 'ptime-horizontal-outline',
                7: 'tr-ud-horizontal-half-fill',
                8: 'ptime-horizontal-outline',
                9: 'ptime-horizontal-outline',
                10: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: 'aqua',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        SKTPNV: {
            type: 'M',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'tr-ud-vertical-half-fill',
                4: 'ptime-vertical-outline',
                5: 'ptime-vertical-fill',
                6: 'ptime-vertical-outline',
                7: 'tr-ud-vertical-half-fill',
                8: 'ptime-vertical-outline',
                9: 'ptime-vertical-outline',
                10: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: 'aqua',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        VENGL: {
            type: 'M',
            icon: {
                1: 'fan-left-fill',
                2: 'fan-left-outline',
                3: 'fan-left-outline',
                4: 'fan-left-outline',
                5: 'fan-left-fill',
                6: 'fan-left-outline',
                7: 'fan-left-outline',
                8: 'fan-left-outline',
                9: 'fan-left-outline',
                10: 'fan-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        VENGP: {
            type: 'M',
            icon: {
                1: 'fan-right-fill',
                2: 'fan-right-outline',
                3: 'fan-right-outline',
                4: 'fan-right-outline',
                5: 'fan-right-fill',
                6: 'fan-right-outline',
                7: 'fan-right-outline',
                8: 'fan-right-outline',
                9: 'fan-right-outline',
                10: 'fan-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        VENVN: {
            type: 'M',
            icon: {
                1: 'fan-down-fill',
                2: 'fan-down-outline',
                3: 'fan-down-outline',
                4: 'fan-down-outline',
                5: 'fan-down-fill',
                6: 'fan-down-outline',
                7: 'fan-down-outline',
                8: 'fan-down-outline',
                9: 'fan-down-outline',
                10: 'fan-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        VENVV: {
            type: 'M',
            icon: {
                1: 'fan-up-fill',
                2: 'fan-up-outline',
                3: 'fan-up-outline',
                4: 'fan-up-outline',
                5: 'fan-up-fill',
                6: 'fan-up-outline',
                7: 'fan-up-outline',
                8: 'fan-up-outline',
                9: 'fan-up-outline',
                10: 'fan-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        VKLEG: {
            type: 'M',
            icon: {
                1: 'switch-horizontal-on',
                2: 'switch-horizontal-off',
                3: 'switch-horizontal-off',
                4: 'switch-horizontal-off',
                5: 'switch-horizontal-on',
                6: 'switch-horizontal-off',
                7: 'switch-horizontal-off',
                8: 'switch-horizontal-off',
                9: 'switch-horizontal-off',
                10: 'switch-horizontal-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        VKLEV: {
            type: 'M',
            icon: {
                1: 'switch-vertical-on',
                2: 'switch-vertical-off',
                3: 'switch-vertical-off',
                4: 'switch-vertical-off',
                5: 'switch-vertical-on',
                6: 'switch-vertical-off',
                7: 'switch-vertical-off',
                8: 'switch-vertical-off',
                9: 'switch-vertical-off',
                10: 'switch-vertical-off',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        ZADBG: {
            type: 'M',
            icon: {
                1: 'latch-up-fill',
                2: 'latch-up-outline',
                3: 'latch-up-outline',
                4: 'latch-up-outline',
                5: 'latch-up-fill',
                6: 'latch-up-outline',
                7: 'latch-up-outline',
                8: 'latch-up-outline',
                9: 'latch-up-outline',
                10: 'latch-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        ZADBV: {
            type: 'M',
            icon: {
                1: 'latch-left-fill',
                2: 'latch-left-outline',
                3: 'latch-left-outline',
                4: 'latch-left-outline',
                5: 'latch-left-fill',
                6: 'latch-left-outline',
                7: 'latch-left-outline',
                8: 'latch-left-outline',
                9: 'latch-left-outline',
                10: 'latch-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'aqua',
                6: 'aqua',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        ZOTKRB: {
            type: 'M',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-fill',
                3: 'ptime-horizontal-outline',
                4: 'ptime-horizontal-outline',
                5: 'ptime-horizontal-fill',
                6: 'ptime-horizontal-fill',
                7: 'ptime-horizontal-outline',
                8: 'ptime-horizontal-outline',
                9: 'ptime-horizontal-outline',
                10: 'ptime-horizontal-outline',
            },
            color: {
                1: 'red',
                2: 'green',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'red',
                6: 'green',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        ZZAKRB: {
            type: 'M',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-fill',
                3: 'ptime-horizontal-outline',
                4: 'ptime-horizontal-outline',
                5: 'ptime-horizontal-fill',
                6: 'ptime-horizontal-fill',
                7: 'ptime-horizontal-outline',
                8: 'ptime-horizontal-outline',
                9: 'ptime-horizontal-outline',
                10: 'ptime-horizontal-outline',
            },
            color: {
                1: 'green',
                2: 'red',
                3: '#ff40ff',
                4: '#ff40ff',
                5: 'green',
                6: 'red',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: 'white',
            },
        },
        BRUG: {
            type: 'S',
            icon: {
                1: 'safety-valve-down-fill',
                2: 'safety-valve-down-outline',
                3: 'safety-valve-down-half-fill',
                4: 'safety-valve-down-half-fill',
                5: 'safety-valve-down-outline',
                6: 'safety-valve-down-half-fill',
                7: 'safety-valve-down-fill',
                8: 'safety-valve-down-outline',
                9: 'safety-valve-down-half-fill',
                10: 'safety-valve-down-half-fill',
                11: 'safety-valve-down-outline',
                12: 'safety-valve-down-half-fill',
                13: 'safety-valve-down-outline',
                14: 'safety-valve-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        BRUV: {
            type: 'S',
            icon: {
                1: 'safety-valve-right-fill',
                2: 'safety-valve-right-outline',
                3: 'safety-valve-right-half-fill',
                4: 'safety-valve-right-half-fill',
                5: 'safety-valve-right-outline',
                6: 'safety-valve-right-half-fill',
                7: 'safety-valve-right-fill',
                8: 'safety-valve-right-outline',
                9: 'safety-valve-right-half-fill',
                10: 'safety-valve-right-half-fill',
                11: 'safety-valve-right-outline',
                12: 'safety-valve-right-half-fill',
                13: 'safety-valve-right-outline',
                14: 'safety-valve-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        GC10SP: {
            type: 'S',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
                11: 'square-fill',
                12: 'square-fill',
                13: 'square-fill',
                14: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'black',
                3: 'green',
                4: 'green',
                5: '#ff40ff',
                6: 'green',
                7: 'green',
                8: 'black',
                9: 'green',
                10: 'green',
                11: '#ff40ff',
                12: 'green',
                13: '#ff40ff',
                14: 'white',
            },
        },
        GC15SP: {
            type: 'S',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
                11: 'square-fill',
                12: 'square-fill',
                13: 'square-fill',
                14: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'black',
                3: 'green',
                4: 'green',
                5: '#ff40ff',
                6: 'green',
                7: 'green',
                8: 'black',
                9: 'green',
                10: 'green',
                11: '#ff40ff',
                12: 'green',
                13: '#ff40ff',
                14: 'white',
            },
        },
        GR10SP: {
            type: 'S',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
                11: 'square-fill',
                12: 'square-fill',
                13: 'square-fill',
                14: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: 'green',
                4: 'green',
                5: '#ff40ff',
                6: 'green',
                7: 'green',
                8: 'red',
                9: 'green',
                10: 'green',
                11: '#ff40ff',
                12: 'green',
                13: '#ff40ff',
                14: 'white',
            },
        },
        GR15SP: {
            type: 'S',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
                11: 'square-fill',
                12: 'square-fill',
                13: 'square-fill',
                14: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'red',
                3: 'green',
                4: 'green',
                5: '#ff40ff',
                6: 'green',
                7: 'green',
                8: 'red',
                9: 'green',
                10: 'green',
                11: '#ff40ff',
                12: 'green',
                13: '#ff40ff',
                14: 'white',
            },
        },
        IPKSPL: {
            type: 'S',
            icon: {
                1: 'safety-valve-left-fill',
                2: 'safety-valve-left-outline',
                3: 'safety-valve-left-half-fill',
                4: 'safety-valve-left-half-fill',
                5: 'safety-valve-left-outline',
                6: 'safety-valve-left-half-fill',
                7: 'safety-valve-left-fill',
                8: 'safety-valve-left-outline',
                9: 'safety-valve-left-half-fill',
                10: 'safety-valve-left-half-fill',
                11: 'safety-valve-left-outline',
                12: 'safety-valve-left-half-fill',
                13: 'safety-valve-left-outline',
                14: 'safety-valve-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        IPKSPN: {
            type: 'S',
            icon: {
                1: 'safety-valve-down-fill',
                2: 'safety-valve-down-outline',
                3: 'safety-valve-down-half-fill',
                4: 'safety-valve-down-half-fill',
                5: 'safety-valve-down-outline',
                6: 'safety-valve-down-half-fill',
                7: 'safety-valve-down-fill',
                8: 'safety-valve-down-outline',
                9: 'safety-valve-down-half-fill',
                10: 'safety-valve-down-half-fill',
                11: 'safety-valve-down-outline',
                12: 'safety-valve-down-half-fill',
                13: 'safety-valve-down-outline',
                14: 'safety-valve-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        IPKSPP: {
            type: 'S',
            icon: {
                1: 'safety-valve-right-fill',
                2: 'safety-valve-right-outline',
                3: 'safety-valve-right-half-fill',
                4: 'safety-valve-right-fill',
                5: 'safety-valve-right-outline',
                6: 'safety-valve-right-fill',
                7: 'safety-valve-right-fill',
                8: 'safety-valve-right-outline',
                9: 'safety-valve-right-half-fill',
                10: 'safety-valve-right-half-fill',
                11: 'safety-valve-right-outline',
                12: 'safety-valve-right-half-fill',
                13: 'safety-valve-right-outline',
                14: 'safety-valve-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        IPKSPV: {
            type: 'S',
            icon: {
                1: 'safety-valve-up-fill',
                2: 'safety-valve-up-outline',
                3: 'safety-valve-up-half-fill',
                4: 'safety-valve-up-half-fill',
                5: 'safety-valve-up-outline',
                6: 'safety-valve-up-half-fill',
                7: 'safety-valve-up-fill',
                8: 'safety-valve-up-outline',
                9: 'safety-valve-up-half-fill',
                10: 'safety-valve-up-half-fill',
                11: 'safety-valve-up-outline',
                12: 'safety-valve-up-half-fill',
                13: 'safety-valve-up-outline',
                14: 'safety-valve-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        KLUSPL: {
            type: 'S',
            icon: {
                1: 'tr-dr-fill',
                2: 'tr-dr-outline',
                3: 'tr-dr-half-fill',
                4: 'tr-dr-half-fill',
                5: 'tr-dr-outline',
                6: 'tr-dr-half-fill',
                7: 'tr-dr-fill',
                8: 'tr-dr-outline',
                9: 'tr-dr-half-fill',
                10: 'tr-dr-half-fill',
                11: 'tr-dr-outline',
                12: 'tr-dr-half-fill',
                13: 'tr-dr-outline',
                14: 'tr-dr-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        KLUSPP: {
            type: 'S',
            icon: {
                1: 'tr-dl-fill',
                2: 'tr-dl-outline',
                3: 'tr-dl-half-fill',
                4: 'tr-dl-half-fill',
                5: 'tr-dl-outline',
                6: 'tr-dl-half-fill',
                7: 'tr-dl-fill',
                8: 'tr-dl-outline',
                9: 'tr-dl-half-fill',
                10: 'tr-dl-half-fill',
                11: 'tr-dl-outline',
                12: 'tr-dl-half-fill',
                13: 'tr-dl-outline',
                14: 'tr-dl-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        MOKLGS: {
            type: 'S',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'tr-ud-horizontal-half-fill',
                4: 'tr-ud-horizontal-half-fill',
                5: 'ptime-horizontal-outline',
                6: 'tr-ud-horizontal-half-fill',
                7: 'ptime-horizontal-fill',
                8: 'ptime-horizontal-outline',
                9: 'tr-ud-horizontal-half-fill',
                10: 'tr-ud-horizontal-half-fill',
                11: 'ptime-horizontal-outline',
                12: 'tr-ud-horizontal-half-fill',
                13: 'ptime-horizontal-outline',
                14: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        MOKLVS: {
            type: 'S',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'tr-ud-vertical-half-fill',
                4: 'tr-ud-vertical-half-fill',
                5: 'ptime-vertical-outline',
                6: 'tr-ud-vertical-half-fill',
                7: 'ptime-vertical-fill',
                8: 'ptime-vertical-outline',
                9: 'tr-ud-vertical-half-fill',
                10: 'tr-ud-vertical-half-fill',
                11: 'ptime-vertical-outline',
                12: 'tr-ud-vertical-half-fill',
                13: 'ptime-vertical-outline',
                14: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        MRKLG: {
            type: 'S',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'tr-ud-horizontal-half-fill',
                4: 'tr-ud-horizontal-half-fill',
                5: 'ptime-horizontal-outline',
                6: 'tr-ud-horizontal-half-fill',
                7: 'ptime-horizontal-fill',
                8: 'ptime-horizontal-outline',
                9: 'tr-ud-horizontal-half-fill',
                10: 'tr-ud-horizontal-half-fill',
                11: 'ptime-horizontal-outline',
                12: 'tr-ud-horizontal-half-fill',
                13: 'ptime-horizontal-outline',
                14: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        MRKLV: {
            type: 'S',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'tr-ud-vertical-half-fill',
                4: 'tr-ud-vertical-half-fill',
                5: 'ptime-vertical-outline',
                6: 'tr-ud-vertical-half-fill',
                7: 'ptime-vertical-fill',
                8: 'ptime-vertical-outline',
                9: 'tr-ud-vertical-half-fill',
                10: 'tr-ud-vertical-half-fill',
                11: 'ptime-vertical-outline',
                12: 'tr-ud-vertical-half-fill',
                13: 'ptime-vertical-outline',
                14: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        MZADZG: {
            type: 'S',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'tr-ud-horizontal-outline',
                4: 'tr-ud-horizontal-fill',
                5: 'ptime-horizontal-outline',
                6: 'tr-ud-horizontal-half-fill',
                7: 'ptime-horizontal-fill',
                8: 'ptime-horizontal-outline',
                9: 'tr-ud-horizontal-outline',
                10: 'tr-ud-horizontal-fill',
                11: 'ptime-horizontal-outline',
                12: 'tr-ud-horizontal-half-fill',
                13: 'ptime-horizontal-outline',
                14: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        MZADZV: {
            type: 'S',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'tr-ud-vertical-outline',
                4: 'tr-ud-vertical-fill',
                5: 'ptime-vertical-outline',
                6: 'tr-ud-vertical-half-fill',
                7: 'ptime-vertical-fill',
                8: 'ptime-vertical-outline',
                9: 'tr-ud-vertical-outline',
                10: 'tr-ud-vertical-fill',
                11: 'ptime-vertical-outline',
                12: 'tr-ud-vertical-half-fill',
                13: 'ptime-vertical-outline',
                14: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        OKLGS: {
            type: 'S',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'tr-ud-horizontal-half-fill',
                4: 'tr-ud-horizontal-half-fill',
                5: 'ptime-horizontal-outline',
                6: 'tr-ud-horizontal-half-fill',
                7: 'ptime-horizontal-fill',
                8: 'ptime-horizontal-outline',
                9: 'tr-ud-horizontal-half-fill',
                10: 'tr-ud-horizontal-half-fill',
                11: 'ptime-horizontal-outline',
                12: 'tr-ud-horizontal-half-fill',
                13: 'ptime-horizontal-outline',
                14: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        OKLVS: {
            type: 'S',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'tr-ud-vertical-half-fill',
                4: 'tr-ud-vertical-half-fill',
                5: 'ptime-vertical-outline',
                6: 'tr-ud-vertical-half-fill',
                7: 'ptime-vertical-fill',
                8: 'ptime-vertical-outline',
                9: 'tr-ud-vertical-half-fill',
                10: 'tr-ud-vertical-half-fill',
                11: 'ptime-vertical-outline',
                12: 'tr-ud-vertical-half-fill',
                13: 'ptime-vertical-outline',
                14: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        RC10SP: {
            type: 'S',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
                11: 'square-fill',
                12: 'square-fill',
                13: 'square-fill',
                14: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: 'red',
                4: 'red',
                5: '#ff40ff',
                6: 'red',
                7: 'red',
                8: 'black',
                9: 'red',
                10: 'red',
                11: '#ff40ff',
                12: 'red',
                13: '#ff40ff',
                14: 'white',
            },
        },
        RC15SP: {
            type: 'S',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
                11: 'square-fill',
                12: 'square-fill',
                13: 'square-fill',
                14: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'black',
                3: 'red',
                4: 'red',
                5: '#ff40ff',
                6: 'red',
                7: 'red',
                8: 'black',
                9: 'red',
                10: 'red',
                11: '#ff40ff',
                12: 'red',
                13: '#ff40ff',
                14: 'white',
            },
        },
        RG10SP: {
            type: 'S',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
                11: 'square-fill',
                12: 'square-fill',
                13: 'square-fill',
                14: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: 'red',
                4: 'red',
                5: '#ff40ff',
                6: 'red',
                7: 'red',
                8: 'green',
                9: 'red',
                10: 'red',
                11: '#ff40ff',
                12: 'red',
                13: '#ff40ff',
                14: 'white',
            },
        },
        RG15SP: {
            type: 'S',
            icon: {
                1: 'square-fill',
                2: 'square-fill',
                3: 'square-fill',
                4: 'square-fill',
                5: 'square-fill',
                6: 'square-fill',
                7: 'square-fill',
                8: 'square-fill',
                9: 'square-fill',
                10: 'square-fill',
                11: 'square-fill',
                12: 'square-fill',
                13: 'square-fill',
                14: 'square-fill',
            },
            color: {
                1: 'red',
                2: 'green',
                3: 'red',
                4: 'red',
                5: '#ff40ff',
                6: 'red',
                7: 'red',
                8: 'green',
                9: 'red',
                10: 'red',
                11: '#ff40ff',
                12: 'red',
                13: '#ff40ff',
                14: 'white',
            },
        },
        RKLG: {
            type: 'S',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'tr-ud-horizontal-half-fill',
                4: 'tr-ud-horizontal-half-fill',
                5: 'ptime-horizontal-outline',
                6: 'tr-ud-horizontal-half-fill',
                7: 'ptime-horizontal-fill',
                8: 'ptime-horizontal-outline',
                9: 'tr-ud-horizontal-half-fill',
                10: 'tr-ud-horizontal-half-fill',
                11: 'ptime-horizontal-outline',
                12: 'tr-ud-horizontal-half-fill',
                13: 'ptime-horizontal-outline',
                14: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        RKLV: {
            type: 'S',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'tr-ud-vertical-half-fill',
                4: 'tr-ud-vertical-half-fill',
                5: 'ptime-vertical-outline',
                6: 'tr-ud-vertical-half-fill',
                7: 'ptime-vertical-fill',
                8: 'ptime-vertical-outline',
                9: 'tr-ud-vertical-half-fill',
                10: 'tr-ud-vertical-half-fill',
                11: 'ptime-vertical-outline',
                12: 'tr-ud-vertical-half-fill',
                13: 'ptime-vertical-outline',
                14: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        ZADZG: {
            type: 'S',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                3: 'tr-ud-horizontal-outline',
                4: 'tr-ud-horizontal-fill',
                5: 'ptime-horizontal-outline',
                6: 'tr-ud-horizontal-half-fill',
                7: 'ptime-horizontal-fill',
                8: 'ptime-horizontal-outline',
                9: 'tr-ud-horizontal-outline',
                10: 'tr-ud-horizontal-fill',
                11: 'ptime-horizontal-outline',
                12: 'tr-ud-horizontal-half-fill',
                13: 'ptime-horizontal-outline',
                14: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        ZADZV: {
            type: 'S',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                3: 'tr-ud-vertical-outline',
                4: 'tr-ud-vertical-fill',
                5: 'ptime-vertical-outline',
                6: 'tr-ud-vertical-half-fill',
                7: 'ptime-vertical-fill',
                8: 'ptime-vertical-outline',
                9: 'tr-ud-vertical-outline',
                10: 'tr-ud-vertical-fill',
                11: 'ptime-vertical-outline',
                12: 'tr-ud-vertical-half-fill',
                13: 'ptime-vertical-outline',
                14: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                7: 'aqua',
                8: 'aqua',
                9: 'aqua',
                10: 'aqua',
                11: '#ff40ff',
                12: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        ZOTKR: {
            type: 'S',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-fill',
                3: 'ptime-horizontal-fill',
                4: 'ptime-horizontal-fill',
                5: 'ptime-horizontal-outline',
                6: 'ptime-horizontal-fill',
                7: 'ptime-horizontal-fill',
                8: 'ptime-horizontal-fill',
                9: 'ptime-horizontal-fill',
                10: 'ptime-horizontal-fill',
                11: 'ptime-horizontal-outline',
                12: 'ptime-horizontal-fill',
                13: 'ptime-horizontal-outline',
                14: 'ptime-horizontal-outline',
            },
            color: {
                1: 'red',
                2: 'green',
                3: 'red',
                4: 'red',
                5: '#ff40ff',
                6: 'red',
                7: 'red',
                8: 'green',
                9: 'red',
                10: 'red',
                11: '#ff40ff',
                12: 'red',
                13: '#ff40ff',
                14: 'white',
            },
        },
        ZZAKR: {
            type: 'S',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-fill',
                3: 'ptime-horizontal-fill',
                4: 'ptime-horizontal-fill',
                5: 'ptime-horizontal-outline',
                6: 'ptime-horizontal-fill',
                7: 'ptime-horizontal-fill',
                8: 'ptime-horizontal-fill',
                9: 'ptime-horizontal-fill',
                10: 'ptime-horizontal-fill',
                11: 'ptime-horizontal-outline',
                12: 'ptime-horizontal-fill',
                13: 'ptime-horizontal-outline',
                14: 'ptime-horizontal-outline',
            },
            color: {
                1: 'green',
                2: 'red',
                3: 'green',
                4: 'green',
                5: '#ff40ff',
                6: 'green',
                7: 'green',
                8: 'red',
                9: 'green',
                10: 'green',
                11: '#ff40ff',
                12: 'green',
                13: '#ff40ff',
                13: 'white',
            },
        },
        // TODO
        // BPKG: {
        //     type: 'B',
        // },
        IPKFL: {
            type: 'K',
            icon: {
                1: 'triangle-left-fill',
                2: 'triangle-left-fill',
                3: 'triangle-left-outline',
                4: 'triangle-left-outline',
                5: 'triangle-left-outline',
                6: 'triangle-left-outline',
                7: 'triangle-left-outline',
                8: 'triangle-left-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: '#ff40ff',
                6: '#ff40ff',
                7: '#ff40ff',
                8: 'white',
            },
        },
        IPKFN: {
            type: 'K',
            icon: {
                1: 'triangle-down-fill',
                2: 'triangle-down-fill',
                3: 'triangle-down-outline',
                4: 'triangle-down-outline',
                5: 'triangle-down-outline',
                6: 'triangle-down-outline',
                7: 'triangle-down-outline',
                8: 'triangle-down-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: '#ff40ff',
                6: '#ff40ff',
                7: '#ff40ff',
                8: 'white',
            },
        },
        IPKFP: {
            type: 'K',
            icon: {
                1: 'triangle-right-fill',
                2: 'triangle-right-fill',
                3: 'triangle-right-outline',
                4: 'triangle-right-outline',
                5: 'triangle-right-outline',
                6: 'triangle-right-outline',
                7: 'triangle-right-outline',
                8: 'triangle-right-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: '#ff40ff',
                6: '#ff40ff',
                7: '#ff40ff',
                8: 'white',
            },
        },
        IPKFV: {
            type: 'K',
            icon: {
                1: 'triangle-up-fill',
                2: 'triangle-up-fill',
                3: 'triangle-up-outline',
                4: 'triangle-up-outline',
                5: 'triangle-up-outline',
                6: 'triangle-up-outline',
                7: 'triangle-up-outline',
                8: 'triangle-up-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                3: 'aqua',
                4: '#ff40ff',
                5: '#ff40ff',
                6: '#ff40ff',
                7: '#ff40ff',
                8: 'white',
            },
        },
        // TODO
        // PBL: {
        //     type: 'L',
        // },
        IPGG: {
            type: 'Z',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                5: 'tr-ud-horizontal-half-fill',
                6: 'ptime-horizontal-outline',
                13: 'ptime-horizontal-outline',
                14: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                5: 'aqua',
                6: '#ff40ff',
                13: '#ff40ff',
                14: 'white',
            },
        },
        IPGV: {
            type: 'Z',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                5: 'tr-ud-vertical-half-fill',
                6: 'ptime-vertical-outline',
                13: 'ptime-vertical-outline',
                14: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                5: 'aqua',
                6: '#ff40ff',
                13: '#ff40ff',
                14: 'white',
            },
        },
        MIPGG: {
            type: 'Z',
            icon: {
                1: 'ptime-horizontal-fill',
                2: 'ptime-horizontal-outline',
                5: 'tr-ud-horizontal-half-fill',
                6: 'ptime-horizontal-outline',
                13: 'ptime-horizontal-outline',
                14: 'ptime-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                5: 'aqua',
                6: '#ff40ff',
                13: '#ff40ff',
                14: 'white',
            },
        },
        MIPGV: {
            type: 'Z',
            icon: {
                1: 'ptime-vertical-fill',
                2: 'ptime-vertical-outline',
                5: 'tr-ud-vertical-half-fill',
                6: 'ptime-vertical-outline',
                13: 'ptime-vertical-outline',
                14: 'ptime-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                5: 'aqua',
                6: '#ff40ff',
                13: '#ff40ff',
                14: 'white',
            },
        },
        TEN: {
            type: 'Z',
            icon: {
                1: 'rhombus-fill',
                2: 'rhombus-outline',
                5: 'rhombus-outline',
                6: 'rhombus-half-fill',
                13: 'rhombus-outline',
                14: 'rhombus-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        ZDPARG: {
            type: 'Z',
            icon: {
                1: 'tr-ud2-horizontal-fill',
                2: 'tr-ud2-horizontal-outline',
                5: 'tr-ud2-horizontal-outline',
                6: 'tr-ud2-horizontal-half-fill',
                13: 'tr-ud2-horizontal-outline',
                14: 'tr-ud2-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        ZDPARV: {
            type: 'Z',
            icon: {
                1: 'tr-ud2-vertical-fill',
                2: 'tr-ud2-vertical-outline',
                5: 'tr-ud2-vertical-outline',
                6: 'tr-ud2-vertical-half-fill',
                13: 'tr-ud2-vertical-outline',
                14: 'tr-ud2-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        ZDPOSG: {
            type: 'Z',
            icon: {
                1: 'tr-ud1-horizontal-fill',
                2: 'tr-ud1-horizontal-outline',
                5: 'tr-ud1-horizontal-outline',
                6: 'tr-ud1-horizontal-half-fill',
                13: 'tr-ud1-horizontal-outline',
                14: 'tr-ud1-horizontal-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        ZDPOSV: {
            type: 'Z',
            icon: {
                1: 'tr-ud1-vertical-fill',
                2: 'tr-ud1-vertical-outline',
                5: 'tr-ud1-vertical-outline',
                6: 'tr-ud1-vertical-half-fill',
                13: 'tr-ud1-vertical-outline',
                14: 'tr-ud1-vertical-outline',
            },
            color: {
                1: 'aqua',
                2: 'aqua',
                5: '#ff40ff',
                6: 'aqua',
                13: '#ff40ff',
                14: 'white',
            },
        },
        D2_3RG: {
            type: 'd',
            icon: {
                default: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'green',
                3: 'green',
                4: 'green',
                5: 'green',
                6: 'green',
                7: 'green',
                8: 'red',
                9: 'red',
                10: 'red',
                11: 'red',
                12: 'red',
                13: 'red',
                14: 'red',
                15: '#ff40ff',
                16: '#ff40ff',
                17: '#ff40ff',
                18: '#ff40ff',
                19: '#ff40ff',
                20: '#ff40ff',
                21: '#ff40ff',
                22: '#ff40ff',
                23: '#ff40ff',
                24: '#ff40ff',
                25: '#ff40ff',
                26: '#ff40ff',
                27: '#ff40ff',
                28: 'white',
                29: '#ff40ff',
            },
        },
        DM2iz3: {
            type: 'd',
            icon: {
                default: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'green',
                3: 'green',
                4: 'green',
                5: 'green',
                6: 'green',
                7: 'green',
                8: 'red',
                9: 'red',
                10: 'red',
                11: 'red',
                12: 'red',
                13: 'red',
                14: 'red',
                15: '#ff40ff',
                16: '#ff40ff',
                17: '#ff40ff',
                18: '#ff40ff',
                19: '#ff40ff',
                20: '#ff40ff',
                21: '#ff40ff',
                22: '#ff40ff',
                23: '#ff40ff',
                24: '#ff40ff',
                25: '#ff40ff',
                26: '#ff40ff',
                27: '#ff40ff',
                28: 'white',
                29: '#ff40ff',
            },
        },
        SIGNB: {
            type: 'o',
            icon: {
                default: 'rect-fill',
            },
            color: {
                1: 'red',
                2: 'red',
                3: 'red',
                4: 'green',
                5: 'green',
                6: 'green',
                7: '#ff40ff',
                8: 'green',
                9: '#ff40ff',
                10: '#ff40ff',
                11: '#ff40ff',
                12: '#ff40ff',
                13: 'green',
                14: '#ff40ff',
                15: 'red',
                16: 'red',
                17: 'red',
                18: 'green',
            },
        },
        F2_3RG: {
            type: 'd',
            icon: {
                default: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'green',
                3: 'green',
                4: 'green',
                5: 'green',
                6: 'green',
                7: 'green',
                8: 'red',
                9: 'red',
                10: 'red',
                11: 'red',
                12: 'red',
                13: 'red',
                14: 'red',
                15: '#ff40ff',
                16: '#ff40ff',
                17: '#ff40ff',
                18: '#ff40ff',
                19: '#ff40ff',
                20: '#ff40ff',
                21: '#ff40ff',
                22: '#ff40ff',
                23: '#ff40ff',
                24: '#ff40ff',
                25: '#ff40ff',
                26: '#ff40ff',
                27: '#ff40ff',
                28: 'white',
                29: '#ff40ff',
            },
        },
        FD2iz3: {
            type: 'd',
            icon: {
                default: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'green',
                3: 'green',
                4: 'green',
                5: 'green',
                6: 'green',
                7: 'green',
                8: 'red',
                9: 'red',
                10: 'red',
                11: 'red',
                12: 'red',
                13: 'red',
                14: 'red',
                15: '#ff40ff',
                16: '#ff40ff',
                17: '#ff40ff',
                18: '#ff40ff',
                19: '#ff40ff',
                20: '#ff40ff',
                21: '#ff40ff',
                22: '#ff40ff',
                23: '#ff40ff',
                24: '#ff40ff',
                25: '#ff40ff',
                26: '#ff40ff',
                27: '#ff40ff',
                28: 'white',
                29: '#ff40ff',
            },
        },
        SIGZB: {
            type: 'x',
            icon: {
                default: 'rect-fill',
            },
            color: {
                1: 'red',
                2: 'red',
                3: 'red',
                4: 'green',
                5: 'green',
                6: 'green',
                7: '#ff40ff',
                8: 'brown',
                9: 'green',
                10: 'yellow',
                11: '#ff40ff',
                12: 'blue',
                13: '#ff40ff',
                14: '#ff40ff',
                15: '#ff40ff',
                16: 'green',
                17: '#ff40ff',
                18: 'red',
                19: 'brown',
                20: 'brown',
                21: 'brown',
                22: 'brown',
                23: 'blue',
                24: 'yellow',
                25: 'yellow',
                26: 'yellow',
                27: 'red',
                28: 'yellow',
                29: 'blue',
                30: 'blue',
                31: 'blue',
            },
        },
        GRSIG: {
            type: 'y',
            icon: {
                default: 'rect-fill',
            },
            color: {
                1: 'red',
                2: 'red',
                3: 'red',
                4: 'green',
                5: 'green',
                6: 'green',
                7: '#ff40ff',
                8: 'green',
                9: '#ff40ff',
                10: 'blue',
                11: '#ff40ff',
                12: '#ff40ff',
                13: '#ff40ff',
                14: 'yellow',
                15: 'yellow',
                16: 'yellow',
            },
        },
        AKRBK: {
            type: 'a',
            icon: {
                default: 'square-fill',
            },
            color: {
                1: 'green',
                2: 'yellow',
                3: 'red',
                4: '#ff40ff',
                5: 'yellow',
                6: 'red',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: '#ff40ff',
                11: 'red',
                12: '#ff40ff',
                13: 'white',
            },
        },
        AKRBTL: {
            type: 'a',
            icon: {
                default: 'triangle-left-fill',
            },
            color: {
                1: 'green',
                2: 'yellow',
                3: 'red',
                4: '#ff40ff',
                5: 'yellow',
                6: 'red',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: '#ff40ff',
                11: 'red',
                12: '#ff40ff',
                13: 'white',
            },
        },
        AKRBTP: {
            type: 'a',
            icon: {
                default: 'triangle-right-fill',
            },
            color: {
                1: 'green',
                2: 'yellow',
                3: 'red',
                4: '#ff40ff',
                5: 'yellow',
                6: 'red',
                7: '#ff40ff',
                8: '#ff40ff',
                9: '#ff40ff',
                10: '#ff40ff',
                11: 'red',
                12: '#ff40ff',
                13: 'white',
            },
        },

        // Елементи які нема в файлі, але є на схемі (DKSD)
        DIAG: {
            type: 'G',
            icon: {
                1: 'rect-outline',
                2: 'rect-outline',
                3: 'rect-outline',
                4: 'rect-outline',
                5: 'rect-outline',
                6: 'rect-outline',
                7: 'rect-outline',
                8: 'rect-outline',
                9: 'rect-outline',
            },
            color: {
                1: 'green',
                2: 'red',
                3: 'yellow',
                4: 'yellow',
                5: 'gray',
                6: 'white',
                7: '#ff40ff',
                8: 'blue',
                9: '#ff40ff',
            },
        },
        DIAG1: {
            type: 'G',
            icon: {
                1: 'rect-outline',
                2: 'rect-outline',
                3: 'rect-outline',
                4: 'rect-outline',
                5: 'rect-outline',
                6: 'rect-outline',
                7: 'rect-outline',
                8: 'rect-outline',
                9: 'rect-outline',
            },
            color: {
                1: 'green',
                2: 'red',
                3: 'yellow',
                4: 'yellow',
                5: 'gray',
                6: 'white',
                7: '#ff40ff',
                8: 'blue',
                9: '#ff40ff',
            },
        },

        // !---------------------

        // KLSTV: {
        //     icon: {
        //         1: 'ptime-vertical-fill',
        //         2: 'ptime-vertical-outline',
        //         3: 'ptime-vertical-outline',
        //         4: 'ptime-vertical-outline',
        //         5: 'ptime-vertical-outline',
        //         6: 'ptime-vertical-outline',
        //     },
        //     color: {
        //         1: 'aqua',
        //         2: 'aqua',
        //         3: '#ff40ff',
        //         4: 'black',
        //         5: 'black',
        //         6: 'white',
        //     },
        // },

        // DPR1: {
        //     icon: {
        //         1: 'square-fill',
        //         2: 'square-fill',
        //         3: 'square-fill',
        //         4: 'square-fill',
        //         5: 'square-fill',
        //         6: 'square-fill',
        //     },
        //     color: {
        //         1: 'black',
        //         2: 'red',
        //         3: '#ff40ff',
        //         4: 'black',
        //         5: 'black',
        //         6: 'white',
        //     },
        // },

        // SRR10: {
        //     icon: {
        //         1: 'square-fill',
        //         2: 'square-fill',
        //         3: 'square-fill',
        //         4: 'square-fill',
        //         5: 'square-fill',
        //         6: 'square-fill',
        //     },
        //     color: {
        //         1: 'green',
        //         2: 'red',
        //         3: '#ff40ff',
        //         4: 'black',
        //         5: 'black',
        //         6: 'white',
        //     },
        // },
        // SRR15: {
        //     icon: {
        //         1: 'square-fill',
        //         2: 'square-fill',
        //         3: 'square-fill',
        //         4: 'square-fill',
        //         5: 'square-fill',
        //         6: 'square-fill',
        //     },
        //     color: {
        //         1: 'green',
        //         2: 'red',
        //         3: '#ff40ff',
        //         4: 'black',
        //         5: 'black',
        //         6: 'white',
        //     },
        // },

        // MVENGN: {
        //     icon: {
        //         1: 'fan-down-fill',
        //         2: 'fan-down-outline',
        //         3: 'fan-down-outline',
        //         4: 'fan-down-outline',
        //         5: 'fan-down-fill',
        //         6: 'fan-down-outline',
        //         7: 'fan-down-outline',
        //         8: 'fan-down-outline',
        //         9: 'fan-down-outline',
        //         10: 'fan-down-outline',
        //     },
        //     color: {
        //         1: 'aqua',
        //         2: 'aqua',
        //         3: '#ff40ff',
        //         4: '#ff40ff',
        //         5: 'aqua',
        //         6: 'aqua',
        //         7: '#ff40ff',
        //         8: '#ff40ff',
        //         9: '#ff40ff',
        //         10: 'white',
        //     },
        // },
        // MVENGV: {
        //     icon: {
        //         1: 'fan-up-fill',
        //         2: 'fan-up-outline',
        //         3: 'fan-up-outline',
        //         4: 'fan-up-outline',
        //         5: 'fan-up-fill',
        //         6: 'fan-up-outline',
        //         7: 'fan-up-outline',
        //         8: 'fan-up-outline',
        //         9: 'fan-up-outline',
        //         10: 'fan-up-outline',
        //     },
        //     color: {
        //         1: 'aqua',
        //         2: 'aqua',
        //         3: '#ff40ff',
        //         4: '#ff40ff',
        //         5: 'aqua',
        //         6: 'aqua',
        //         7: '#ff40ff',
        //         8: '#ff40ff',
        //         9: '#ff40ff',
        //         10: 'white',
        //     },
        // },

        // DM2iz3RG: {
        //     icon: {
        //         default: 'square-fill',
        //     },
        //     color: {
        //         1: 'green',
        //         2: 'green',
        //         3: 'green',
        //         4: 'green',
        //         5: 'green',
        //         6: 'green',
        //         7: 'green',
        //         8: 'red',
        //         9: 'red',
        //         10: 'red',
        //         11: 'red',
        //         12: 'red',
        //         13: 'red',
        //         14: 'red',
        //         15: '#ff40ff',
        //         16: '#ff40ff',
        //         17: '#ff40ff',
        //         18: '#ff40ff',
        //         19: '#ff40ff',
        //         20: '#ff40ff',
        //         21: '#ff40ff',
        //         22: '#ff40ff',
        //         23: '#ff40ff',
        //         24: '#ff40ff',
        //         25: '#ff40ff',
        //         26: '#ff40ff',
        //         27: '#ff40ff',
        //         28: 'white',
        //         29: '#ff40ff',
        //     },
        // },
    },
}

/**
 * Модуль для рендерингу кругового секторного лічильника
 */
const RadialChart = {
    // Константи конфігурації
    SETTINGS: {
        TOTAL_SEGMENTS: 60,
        STEP_INTERVAL: 5,
        // LINE_WIDTH_BORDER: 3,
        // LINE_WIDTH_AXIS: 2,
        COLOR_BACKGROUND: '#4a4a4a',
        COLOR_FOREGROUND: '#000000',
        COLOR_TEXT: '#ffffff',
    },

    /**
     * Переводить внутрішні одиниці шкали в радіани із нульовою точкою на 12:00
     * @param {number} value - Поточне значення лічильника
     * @returns {number} Кут в радіанах
     */
    convertToRadians(value, invert = false) {
        const degreesPerUnit = 360 / this.SETTINGS.TOTAL_SEGMENTS
        const sign = invert ? -1 : 1
        return (value * sign * degreesPerUnit * Math.PI) / 180 - Math.PI / 2
    },

    /**
     * Головний метод відмальовки діаграми
     * @param {string|HTMLElement} container - ID контейнера (Рядок) АБО сам DOM-елемент (Об'єкт)
     * @param {number} value - Значення лічильника (від -60 до 60)
     * @param {string} activeSectorColor - Колір заповнення
     */
    render(container, value = 0, activeSectorColor = '#ff9800') {
        // ПЕРЕВІРКА ТИПУ: Якщо передано рядок — шукаємо по ID, інакше беремо сам елемент
        const targetElement =
            typeof container === 'string' ? document.getElementById(container) : container

        // Валідація: перевіряємо чи це дійсно коректний HTML-елемент на сторінці
        if (!targetElement || !(targetElement instanceof HTMLElement)) {
            return
        }

        // Повне очищення контейнера перед оновленням Canvas
        targetElement.innerHTML = ''

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        const size = Math.min(targetElement.clientWidth, targetElement.clientHeight)
        canvas.width = size
        canvas.height = size
        targetElement.appendChild(canvas)

        const centerX = size / 2
        const centerY = size / 2

        // Два радіуси для створення меж
        const maxRadius = size * 0.45 // Зовнішній край диска (після цифр)
        // const showLabels = size >= 140
        const innerCircleRadius = /*showLabels ? size * 0.34 : size * 0.43 */ size * 0.34 // Внутрішній край диска (до цифр)

        const borderLineWidth = Math.max(1.5, size * 0.01)
        const axisLineWidth = Math.max(1, size * 0.006)
        const fontSize = Math.max(8, size * 0.043)

        // let stepInterval = 5
        // if (size < 130) {
        //     stepInterval = 15
        // } else if (size < 200) {
        //     stepInterval = 10
        // }

        // 1. Малювання СУЦІЛЬНОГО СІРОГО ФОНУ аж до самої зовнішньої границі
        ctx.beginPath()
        ctx.arc(centerX, centerY, maxRadius, 0, 2 * Math.PI)
        ctx.fillStyle = this.SETTINGS.COLOR_BACKGROUND
        ctx.fill()

        const isNegative = value < 0

        // 2. Малювання активного кольорового сектора (обмежений внутрішнім радіусом)
        if (value !== 0) {
            ctx.beginPath()
            ctx.moveTo(centerX, centerY)

            const startAngle = this.convertToRadians(0)
            const endAngle = this.convertToRadians(Math.abs(value), isNegative)

            ctx.arc(centerX, centerY, innerCircleRadius, startAngle, endAngle, isNegative)
            ctx.closePath()
            ctx.fillStyle = activeSectorColor
            ctx.fill()
        }

        // 3. Побудова чорних ліній та рендеринг білих цифр
        // if (showLabels) {
        ctx.font = `bold ${fontSize}px Arial`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        // }

        for (let i = 0; i < this.SETTINGS.TOTAL_SEGMENTS; i += this.SETTINGS.STEP_INTERVAL) {
            const angle = this.convertToRadians(i, isNegative)

            // Лінії розрізів йдуть від центру лише до внутрішньої границі (до цифр)
            ctx.beginPath()
            ctx.moveTo(centerX, centerY)
            ctx.lineTo(
                centerX + innerCircleRadius * Math.cos(angle),
                centerY + innerCircleRadius * Math.sin(angle),
            )
            ctx.strokeStyle = this.SETTINGS.COLOR_FOREGROUND
            ctx.lineWidth = axisLineWidth
            ctx.stroke()

            // Цифри рендеряться у кільці між внутрішнім та зовнішнім колами
            // if (showLabels || i % stepInterval === 0) {
            const textRadius = (maxRadius + innerCircleRadius) / 2
            const textX = centerX + textRadius * Math.cos(angle)
            const textY = centerY + textRadius * Math.sin(angle)

            ctx.fillStyle = this.SETTINGS.COLOR_TEXT
            ctx.fillText(`${isNegative && i !== 0 ? '-' : ''}${i}`, textX, textY)
            // }
        }

        // 4. ГРАНИЦЯ 1: Внутрішнє чорне коло (до цифр)
        ctx.beginPath()
        ctx.arc(centerX, centerY, innerCircleRadius, 0, 2 * Math.PI)
        ctx.strokeStyle = this.SETTINGS.COLOR_FOREGROUND
        ctx.lineWidth = borderLineWidth
        ctx.stroke()

        // 5. ГРАНИЦЯ 2: Зовнішнє чорне коло (після цифр, де закінчується сірий фон)
        ctx.beginPath()
        ctx.arc(centerX, centerY, maxRadius, 0, 2 * Math.PI)
        ctx.strokeStyle = this.SETTINGS.COLOR_FOREGROUND
        ctx.lineWidth = borderLineWidth
        ctx.stroke()

        // 6. Центральна чорна точка
        const centerDotRadius = Math.max(2, size * 0.015)
        ctx.beginPath()
        ctx.arc(centerX, centerY, centerDotRadius, 0, 2 * Math.PI)
        ctx.fillStyle = this.SETTINGS.COLOR_FOREGROUND
        ctx.fill()
    },
}

/**
 * Фрагменти
 */
class SchemaModule {
    /**
     * @param {string} selector - CSS селектор головного контейнера (наприклад, '#mainWidget')
     */
    constructor(selector) {
        this.root = document.querySelector(selector)
        if (!this.root) {
            console.error(`[SchemaModule] Container ${selector} not found`)
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
            currentFragment: null,
            idenMap: new Map(), // Карта для миттєвого доступу iden -> [DOM nodes]
            lastParams: new Map(), //Остані отримані реальні дані
            tooltip: {
                iden: null,
                currentNode: null,
                interval: null,
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

        // Глобальний кеш для уникнення повторних запитів
        this.iconCache = new Map()

        this.init()
    }

    init() {
        this.applySavedSettings()
        this.initTooltip()
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

    // /**
    //  * Відновлює Unit, Fragment та Mode з URL або LocalStorage
    //  */
    // applySavedSettings() {
    //     const saved = JSON.parse(localStorage.getItem(this.storageKey) || '{}')
    //     if (saved.unit && this.dom.unitSelect) this.dom.unitSelect.value = saved.unit
    //     if (saved.fragment && this.dom.fragmentSelect)
    //         this.dom.fragmentSelect.value = saved.fragment
    //     if (saved.mode && this.dom.modeSelect) this.dom.modeSelect.value = saved.mode
    // }

    // /**
    //  * Зберігає Unit, Fragment та Mode в LocalStorage
    //  */
    // saveSettings() {
    //     const settings = {
    //         unit: this.dom.unitSelect?.value,
    //         fragment: this.dom.fragmentSelect?.value,
    //         mode: this.dom.modeSelect?.value,
    //     }
    //     localStorage.setItem(this.storageKey, JSON.stringify(settings))
    // }

    /**
     * Відновлює Unit, Fragment та Mode з URL або sessionStorage (память вкладки)
     */
    applySavedSettings() {
        // 1. Читаємо параметри з URL поточного вікна
        const urlParams = new URLSearchParams(window.location.search)

        // 2. Читаємо резервні налаштування з sessionStorage (окреме для кожної вкладки)
        const savedSession = JSON.parse(sessionStorage.getItem(this.storageKey) || '{}')

        // Пріоритет: спочатку URL, якщо немає — sessionStorage
        const unit = urlParams.get('unit') || savedSession.unit
        const fragment = urlParams.get('fragment') || savedSession.fragment
        const mode = urlParams.get('mode') || savedSession.mode

        // 3. Застосовуємо значення до DOM-елементів
        if (unit && this.dom.unitSelect) this.dom.unitSelect.value = unit
        if (fragment && this.dom.fragmentSelect) this.dom.fragmentSelect.value = fragment
        if (mode && this.dom.modeSelect) this.dom.modeSelect.value = mode

        // Перезаписуємо URL, щоб актуалізувати параметри при першому завантаженні
        this.saveSettings()
    }

    /**
     * Зберігає Unit, Fragment та Mode в sessionStorage та оновлює URL без перезавантаження сторінки
     */
    saveSettings() {
        const settings = {
            unit: this.dom.unitSelect?.value,
            fragment: this.dom.fragmentSelect?.value,
            mode: this.dom.modeSelect?.value,
        }

        // 1. Зберігаємо у sessionStorage (ізольовано для поточної вкладки)
        sessionStorage.setItem(this.storageKey, JSON.stringify(settings))

        // 2. Оновлюємо параметри в URL для копіювання посилання
        const url = new URL(window.location.href)

        // // Перевіряємо unit
        // if (settings.unit) {
        //     url.searchParams.set('unit', settings.unit)
        // } else {
        //     url.searchParams.delete('unit')
        // }

        // Автоматично обробляємо всі ключі з об'єкта settings
        Object.entries(settings).forEach(([key, value]) => {
            if (value) {
                url.searchParams.set(key, value)
            } else {
                url.searchParams.delete(key)
            }
        })

        // Змінюємо URL в браузері без перезавантаження сторінки
        window.history.replaceState({}, '', url.toString())
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
        ;[this.dom.unitSelect, this.dom.fragmentSelect].forEach((el) => {
            if (el) {
                el.addEventListener('change', () => {
                    this.saveSettings()
                    // this.loadFragment()
                    this.hideTooltip()
                })
            }
        })
        ;[this.dom.fragmentSelect].forEach((el) => {
            if (el) {
                el.addEventListener('change', () => {
                    this.saveSettings()
                    this.loadFragment()
                    this.hideTooltip()
                })
            }
        })
        ;[this.dom.modeSelect].forEach((el) => {
            if (el) {
                el.addEventListener('change', () => {
                    this.saveSettings()
                    this.handleResize()
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

        // Мета-дані при наведенні для дебагу (раз на секунду) mousemove, click, contextmenu
        this.dom.nodesLayer.addEventListener('contextmenu', (event) => {
            const node = event.target.closest('.schema-node')
            if (node) {
                // 1. Скасовуємо стандартне контекстне меню браузера
                event.preventDefault()

                const now = Date.now()
                if (now - (node._lastLog || 0) > 1000) {
                    // console.log('Node Meta:', node._meta)
                    console.log(JSON.stringify(node._meta, null, 2))
                    node._lastLog = now
                }
            }
        })

        // Поява тултіпа
        this.dom.nodesLayer.addEventListener('mouseover', (event) => {
            const node = event.target.closest('.schema-node')
            if (!node) return

            clearTimeout(this.tooltipTimer)

            // Якщо це той самий вузол, на якому ми вже стоїмо — нічого не робимо
            if (this.state.tooltip.currentNode === node) return

            // Затримка на "активацію" нового вузла
            clearTimeout(this.activationTimer)
            this.activationTimer = setTimeout(() => {
                const idens = node.dataset.iden ? node.dataset.iden.split(',') : []
                if (idens.length === 0) return

                // Якщо це новий вузол — скидаємо вибір на перший ID
                if (this.state.tooltip.currentNode !== node) {
                    this.state.tooltip.iden = idens[0]
                    this.state.tooltip.currentNode = node
                }

                this.renderTooltipContent(node, idens)
                this.tooltipEl.style.display = 'block'
                this.positionGlobalTooltip(node)
            }, 100) // 100мс достатньо, щоб "проскочити" сусідній вузол
        })

        // Приховування тултіпа (з перевіркою, чи мишка не пішла на сам тултіп)
        this.dom.nodesLayer.addEventListener('mouseout', (event) => {
            const toElement = event.relatedTarget

            // Якщо мишка пішла з вузла, не встигнувши активувати його — скасовуємо
            clearTimeout(this.activationTimer)

            // Якщо ми перейшли всередині того ж вузла або на тултіп — ігноруємо
            if (
                toElement?.closest('.schema-node') === this.state.tooltip.currentNode ||
                toElement?.closest('.global-tooltip')
            ) {
                return
            }

            // Запускаємо таймер приховування
            clearTimeout(this.tooltipTimer)
            this.tooltipTimer = setTimeout(() => this.hideTooltip(), 150)
        })
    }

    // ! ----------------- Tooltip ------------------------

    initTooltip() {
        // Шукаємо або створюємо
        this.tooltipEl = this.dom.scene.querySelector('.global-tooltip')

        if (!this.tooltipEl) {
            this.tooltipEl = document.createElement('div')
            this.tooltipEl.className = 'global-tooltip'
            this.tooltipEl.style.display = 'none'
            this.tooltipEl.style.pointerEvents = 'all'
            this.dom.scene.appendChild(this.tooltipEl)
        }

        // Події на самому тултіпі
        this.tooltipEl.addEventListener('mouseenter', () => {
            clearTimeout(this.tooltipTimer)
        })

        this.tooltipEl.addEventListener('mouseleave', (event) => {
            // Якщо мишка не повернулася на вузол — ховаємо
            if (!event.relatedTarget?.closest('.schema-node')) {
                this.hideTooltip()
            }
        })
    }

    renderTooltipContent(node, idens) {
        if (!this.tooltipEl) return

        const currentIden = this.state.tooltip.iden
        const liveData = this.state.lastParams?.get(currentIden)
        const meta = node._meta || {}

        // Пошук метаданих саме для активного IDEN
        // 1. Спускаємось до об'єкта, де реально лежать масиви або параметри
        const paramsRoot = meta.params || {}

        let currentParamMeta = {}

        // 2. Перевіряємо структуру з вашого прикладу (obj_par_graf.param)
        if (paramsRoot.obj_par_graf?.param) {
            currentParamMeta = paramsRoot.obj_par_graf.param
        }
        // На випадок, якщо в інших нодах дані все ж приходять як старий масив meta.params.param
        else if (Array.isArray(paramsRoot.param)) {
            currentParamMeta =
                paramsRoot.param.find((p) => p?.iden === currentIden) || paramsRoot.param[0] || {}
        }
        // На випадок, якщо meta.params.param — це один об'єкт
        else if (paramsRoot.param) {
            currentParamMeta = paramsRoot.param
        }

        // 2. Визначаємо активну вісь на основі порівняння поточного iden з iden_x та iden_y
        const isXAxis = currentIden === currentParamMeta.iden_x
        const isYAxis = currentIden === currentParamMeta.iden_y

        // 3. Функція вибору значень відповідно до визначеної осі
        const getValue = (field) => {
            if (isXAxis) {
                return currentParamMeta[`${field}_x`] || currentParamMeta[field] || ''
            }
            if (isYAxis) {
                return currentParamMeta[`${field}_y`] || currentParamMeta[field] || ''
            }

            // Якщо точного збігу по iden немає, повертаємо хоч якесь доступне чисте значення
            return currentParamMeta[field] || ''
        }

        const masValue = getValue('mas')
        const nomValue = getValue('nom')

        // Генерація табів (тільки якщо ID > 1)
        let tabsHtml = ''
        if (idens.length > 1) {
            if (idens.length > 6) {
                // ВАРІАНТ: ВИПАДАЮЧИЙ СПИСОК (для великої кількості)
                tabsHtml = `
                <div class="tooltip-header-select">
                    <label>Параметр:</label>
                    <select class="tab-select">
                        ${idens
                            .map(
                                (id) => `
                            <option value="${id}" ${id === currentIden ? 'selected' : ''}>${id}</option>
                        `,
                            )
                            .join('')}
                    </select>
                </div>`
            } else {
                // ВАРІАНТ: КНОПКИ (для малої кількості)
                tabsHtml = `
                <div class="tooltip-tabs">
                    ${idens
                        .map(
                            (id) => `
                        <div class="tab-btn ${id === currentIden ? 'active' : ''}" data-id="${id}">
                            ${id}
                        </div>
                    `,
                        )
                        .join('')}
                </div>`
            }
        }

        this.tooltipEl.innerHTML = `
            ${tabsHtml}
            <div class="tooltip-content">
                <div class="tooltip-line row-id">
                    <span class="tooltip-key">ID:</span>
                    <span class="tooltip-val id-value">${currentIden}</span>
                </div>
                <div class="tooltip-line row-address">
                    <span class="tooltip-key">Адреса (M/N):</span>
                    <span class="tooltip-val address-value">${masValue}/${nomValue}</span>
                </div>
                <div class="tooltip-line row-name">
                    <span class="tooltip-key">Назва:</span>
                    <span class="tooltip-val name-value">${meta?.info?.text || ''}</span>
                </div>
                <div class="tooltip-line row-live">
                    <span class="tooltip-key">Значення (${liveData?.type || ''}):</span>
                    <span class="tooltip-val live-value">${
                        liveData?.valuetext
                            ? `${liveData?.valuetext || ''} ${liveData?.dim || ''}`
                            : ''
                    }</span>
                </div>
                <div class="tooltip-line row-raw">
                    <span class="tooltip-key">Значення (${liveData?.type || ''}):</span>
                    <span class="tooltip-val raw-value">${
                        liveData?.value ? `${liveData.value} ${liveData?.dim || ''}`.trim() : ''
                    }</span>
                </div>
            </div>
        `

        // <div class="tooltip-line row-type">
        //     <span class="tooltip-key">Тип параметру:</span>
        //     <span class="tooltip-val type-value">${liveData?.type || ''}</span>
        // </div>

        // Обробка кліків по табах всередині тултіпа для Кнопок
        this.tooltipEl.querySelectorAll('.tab-btn').forEach((btn) => {
            btn.onclick = (event) => {
                event.stopPropagation()
                this.state.tooltip.iden = btn.dataset.id
                this.renderTooltipContent(node, idens) // Перемальовуємо з новим ID
            }
        })

        // Обробка подій для Select
        const select = this.tooltipEl.querySelector('.tab-select')
        if (select) {
            select.onchange = (event) => {
                this.state.tooltip.iden = event.target.value
                this.renderTooltipContent(node, idens)
            }
        }
    }

    //
    positionGlobalTooltip(node) {
        const scene = this.dom.scene
        const tooltip = this.tooltipEl

        // Позиція вузла відносно сцени в % (як ми їх і задавали)
        const nodeLeft = parseFloat(node.style.left)
        const nodeTop = parseFloat(node.style.top)

        // Розміри в пікселях для корекції виходу за межі
        const tW = (tooltip.offsetWidth / scene.offsetWidth) * 100
        const tH = (tooltip.offsetHeight / scene.offsetHeight) * 100

        let x = nodeLeft
        let y = nodeTop - tH - 1 // Трохи вище вузла

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

    hideTooltip() {
        if (this.tooltipEl) {
            this.tooltipEl.style.display = 'none'
        }
        this.state.tooltip.iden = null
        this.state.tooltip.currentNode = null
    }

    //
    updateTooltipContent() {
        if (!this.tooltipEl || this.tooltipEl.style.display === 'none') return

        const iden = this.state.tooltip.iden
        const liveData = this.state.lastParams?.get(iden)

        const valueEl = this.tooltipEl.querySelector('.live-value')
        if (valueEl) {
            valueEl.textContent = liveData?.valuetext
                ? `${liveData?.valuetext || ''} ${liveData?.dim || ''}`
                : ''
        }

        const rawValueEl = this.tooltipEl.querySelector('.raw-value')
        if (rawValueEl) {
            rawValueEl.textContent = liveData?.value
                ? `${liveData.value} ${liveData?.dim || ''}`.trim()
                : ''
        }
    }

    // updateTooltipContent(node = null) {
    //     if (!this.tooltipEl || this.tooltipEl.style.display === 'none') return

    //     const currentIden = this.state.tooltip.iden
    //     const liveData = this.state.lastParams?.get(currentIden)
    //     const meta = node?._meta || this.state.meta || {}

    //     const paramsArray = Array.isArray(meta.params?.param)
    //         ? meta.params.param
    //         : [meta.params?.param].filter(Boolean)
    //     const currentParamMeta =
    //         paramsArray.find((p) => p?.iden === currentIden) || paramsArray[0] || {}

    //     // Хелпер, який оновлює текст ТА ховає рядок, якщо даних немає
    //     const updateRow = (rowSelector, valSelector, value) => {
    //         const rowEl = this.tooltipEl.querySelector(rowSelector)
    //         const valEl = this.tooltipEl.querySelector(valSelector)

    //         // Перевірка на валідність даних (прибираємо порожні значення)
    //         const hasValue =
    //             value !== undefined &&
    //             value !== null &&
    //             value !== '' &&
    //             value !== '-' &&
    //             value !== '---'

    //         if (rowEl) {
    //             // Якщо даних немає — додаємо клас 'hidden' (або міняємо display)
    //             rowEl.style.display = hasValue ? 'flex' : 'none'
    //         }

    //         if (valEl && hasValue && valEl.textContent !== value) {
    //             valEl.textContent = value
    //         }
    //     }

    //     // Формуємо рядки з урахуванням розмірностей (dim)
    //     const addressText =
    //         currentParamMeta?.mas || currentParamMeta?.nom
    //             ? `${currentParamMeta?.mas || '-'}/${currentParamMeta?.nom || '-'}`
    //             : ''
    //     const liveText = liveData?.valuetext
    //         ? `${liveData.valuetext} ${liveData.dim || ''}`.trim()
    //         : ''
    //     const rawText = liveData?.value ? `${liveData.value} ${liveData.dim || ''}`.trim() : ''

    //     // Динамічно керуємо кожним рядком
    //     updateRow('.row-id', '.id-value', currentIden)
    //     updateRow('.row-address', '.address-value', addressText)
    //     updateRow('.row-name', '.name-value', meta?.info?.text)
    //     updateRow('.row-live', '.live-value', liveText)
    //     updateRow('.row-raw', '.raw-value', rawText)
    //     updateRow('.row-type', '.type-value', liveData?.type)
    // }

    /**
     * WATCHDOG: Перевіряє актуальність даних відносно поточного інтервалу
     */
    initWatchdog() {
        // setInterval(() => {
        //     if (this.state.connectionState === 'waiting') return
        //     // Ліміт: 1 повних цикли опитування + запас 2 секунди
        //     const dynamicTimeout = this.state.currentInterval * 1 + 2000
        //     const timeSinceLastData = Date.now() - this.state.lastSuccessTime
        //     if (timeSinceLastData > dynamicTimeout) {
        //         this.updateStatus(false)
        //     }
        // }, 1000)
    }

    //
    async loadFragment() {
        const unitId = this.dom.unitSelect?.value
        const fragmentName = this.dom.fragmentSelect?.value

        if (!unitId || !fragmentName) {
            this.resetToZero()
            return
        }

        if (this.state.pollingTimer) clearTimeout(this.state.pollingTimer)

        try {
            const lastDot = fragmentName.lastIndexOf('.')
            const baseName = lastDot !== -1 ? fragmentName.substring(0, lastDot) : fragmentName
            const xmlName = baseName + '.xml'
            const imgName = baseName + '.png'

            const fragmentXmlUrl = APP_CONFIG.getApiUrl(
                `/fragments/xml/${unitId}?fileName=${xmlName}`,
            )

            // const response = await fetch(fragmentXml)

            // if (!response.ok) throw new Error(`API Error: ${response.status}`)
            // const config = await response.json()

            const config = await cachedSecureApi.request(fragmentXmlUrl, {
                responseType: 'json',
                customCache: {
                    useCache: true,
                    ttl: 60 * 60 * 1000,
                },
            })

            // 1. Рендер вузлів
            this.renderNodes(config)

            // 2. Завантаження фону
            this.dom.bgLayer.innerHTML = ''
            // const fragmentUrl = `${APP_CONFIG.API_BASE}/fragments/png/${unitId}?fileName=${fragmentName}`
            const fragmentUrl = APP_CONFIG.getApiUrl(`/fragments/png/${unitId}?fileName=${imgName}`)
            const img = new Image()
            img.className = 'bg-img'
            img.onload = () => {
                this.handleResize()
            }
            // img.src = fragmentUrl
            await setProtectedResource(img, fragmentUrl)

            this.dom.bgLayer.appendChild(img)
            this.state.bgImage = img

            // 3. Запуск опитування
            this.startPollingHttp(false)
            this.startPollingWs()
        } catch (err) {
            console.error('Loading error:', err)
            this.updateStatus(false)
        }
    }

    /**
     *
     */
    resetToZero() {
        if (this.state.pollingTimer) clearTimeout(this.state.pollingTimer)
        if (this.wsClient) this.wsClient.close()

        this.dom.bgLayer.innerHTML = ''
        this.state.bgImage = null

        this.dom.nodesLayer.innerHTML = ''

        this.updateStatus('waiting')
        console.log('Стан скинуто до нуля')
    }

    // Відмалювання елементів на фрагменті
    async renderNodes(config) {
        this.dom.nodesLayer.innerHTML = ''
        if (!config?.fragment) return

        const { w: origW, h: origH, dynamic } = config.fragment
        const allowedKeys = ['dtext', 'block', 'hist', 'tablo', 'zont', 'knop', 'knop_kfb']

        Object.entries(dynamic).forEach(([key, val]) => {
            // if (!allowedKeys.includes(key)) return

            const items = Array.isArray(val) ? val : [val]

            items.forEach((item) => {
                if (!item.x || !item.y) return
                item._sourceGroup = key

                const node = document.createElement('div')
                node.className = 'schema-node'
                node.dataset.group = key

                // Збір ID параметрів
                const rawParam = item.params?.param
                // const paramsArray = Array.isArray(rawParam) ? rawParam : rawParam ? [rawParam] : []
                // const idenList = [...new Set(paramsArray.map((p) => p.iden).filter(Boolean))]

                const paramsObj = item.params || {}

                // 1. Отримуємо масив усіх об'єктів (значень) всередині item.params
                const paramsArray = Object.values(paramsObj).flat().filter(Boolean)

                // 2. Збираємо унікальні iden з оригінальним регістром, ігноруючи пусті значення
                const idenList = [
                    ...new Set(
                        paramsArray
                            .map((p) => p.iden)
                            .filter(
                                (iden) => iden && typeof iden === 'string' && iden.trim() !== '',
                            ),
                    ),
                ]
                item._idenList = idenList

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
                    // const paramsObj = item.params || {}
                    // const imgDir = item.img?.dir === 'V' ? 'vertical' : 'horizontal'

                    // // Дістаємо унікальні ID для значення та ліміту
                    // const valueIden = paramsObj.param?.iden
                    // const limitIden = paramsObj.va?.iden // nr, na, vr

                    // // Формуємо масив iden для загального відстеження
                    // const idens = [valueIden, limitIden].filter(Boolean)
                    // node.setAttribute('data-iden', idens.join(','))

                    // // Визначаємо, чи є ліміт
                    // const hasLimit = !!limitIden

                    // node.innerHTML = `
                    //     <div class="histogram ${imgDir}" data-iden="${valueIden}">
                    //         <div class="fill"></div>
                    //         <div class="ticks-layer"></div>
                    //         ${
                    //             hasLimit
                    //                 ? `<div class="limit-wrapper" data-iden="${limitIden}">
                    //                     <div class="limit-line"></div>
                    //                 </div>`
                    //                 : ''
                    //         }
                    //     </div>
                    // `

                    //
                    const paramsObj = item.params || {}
                    const imgDir = item.img?.dir === 'V' ? 'vertical' : 'horizontal'

                    // 1. Дістаємо ID основного значення
                    const valueIden = paramsObj.param?.iden

                    // 2. Визначаємо ключі, які відповідають за ліміти
                    const limitKeys = ['va', 'nr', 'na', 'vr']

                    // 3. Збираємо всі наявні iden лімітів (ігноруємо порожні або відсутні)
                    const limitIdens = limitKeys
                        .map((k) => paramsObj[k]?.iden)
                        .filter((iden) => iden && iden.trim() !== '') // валідація на порожній рядок ""

                    // 3. Формуємо загальний масив усіх атрибутів iden для батьківського вузла
                    const allIdens = [valueIden, ...limitIdens].filter(Boolean)
                    node.setAttribute('data-iden', allIdens.join(','))

                    // 5. Генеруємо HTML для кожного знайденого ліміту
                    // Додаємо клас з назвою ключа (наприклад, limit-nr), щоб стилізувати їх окремо
                    const limitsHtml = limitKeys
                        .filter((k) => paramsObj[k]?.iden && paramsObj[k].iden.trim() !== '')
                        .map(
                            (k) => `
                                <div class="limit-wrapper limit-${k}" data-limit-type="${k}" data-iden="${paramsObj[k].iden}">
                                    <div class="limit-line"></div>
                                </div>
                            `,
                        )
                        .join('')

                    // 5. Рендеримо фінальну розмітку
                    node.innerHTML = `
                        <div class="histogram ${imgDir}" data-iden="${valueIden}">
                            <div class="fill"></div>
                            <div class="ticks-layer"></div>
                            ${limitsHtml}
                        </div>
                    `
                } else if (key === 'block') {
                    node.innerHTML = ``
                } else if (key === 'tablo') {
                    node.innerHTML = item.img.text?.txt
                        ? `<span class="node-value">${item.img.text?.txt}</span>`
                        : ''
                } else if (key === 'zont') {
                    node.innerHTML = ``
                } else if (key === 'knop') {
                    // 1. ТОЧКОВА ГЕНЕРАЦІЯ СТРУКТУРИ (Створюємо span лише якщо його ще немає в DOM)
                    let valueTextElement = node.querySelector('.node-value')
                    if (!valueTextElement) {
                        valueTextElement = document.createElement('span')
                        valueTextElement.classList.add('node-value')
                        // Повністю очищаємо старий вміст (захист від залишків бруду) та додаємо безпечний елемент
                        node.textContent = ''
                        node.appendChild(valueTextElement)
                    }

                    // 2. БЕЗПЕЧНЕ ОНОВЛЕННЯ ТЕКСТУ (Зміна лише за потреби) ??
                    const targetButtonText = String(item?.img?.text?.txt || rawParam?.iden || '')
                    if (valueTextElement.textContent !== targetButtonText) {
                        valueTextElement.textContent = targetButtonText
                    }

                    // 3. ОПТИМІЗАЦІЯ СТИЛІВ КНОПКИ
                    node.style.setProperty('--background-color', '#27272A')
                    valueTextElement.style.setProperty('--value-color', '#FFFFFF')

                    // 4. ЗАХИСТ ВІД ВИТОКУ ПАМ'ЯТІ (Підписка на клік ТІЛЬКИ ОДИН РАЗ)
                    if (!node.hasClickEventListener) {
                        node.addEventListener('click', () => {
                            // Безпечно дістаємо назву фрагмента для переходу
                            const targetFragmentName = String(rawParam?.iden ?? '')
                                // .toLowerCase()
                                .trim()
                            if (!targetFragmentName) return

                            const fragmentSelectDropdown = this.dom?.fragmentSelect
                            if (fragmentSelectDropdown) {
                                // Змінюємо значення випадаючого списку мнемосхем
                                fragmentSelectDropdown.value = `${targetFragmentName}`

                                // Ініціюємо та примусово запускаємо стандартну подію 'change'
                                const changeEvent = new Event('change', { bubbles: true })
                                fragmentSelectDropdown.dispatchEvent(changeEvent)
                            }
                        })

                        // Встановлюємо маркер, щоб при наступних тиках телеметрії подія більше не додавалася
                        node.hasClickEventListener = true
                    }
                } else if (key === 'knop_kfb') {
                    node.innerHTML = `<span class="node-value">${item.img.text.txt}</span>`
                    node.style.setProperty('--background-color', '#27272A')
                    node.style.setProperty('--value-color', '#FFFFFF')
                } else if (key === 'kfb') {
                    node.innerHTML = ``
                } else if (key === 'par_graf') {
                    const paramsObj = item.params?.obj_par_graf || {}

                    // 1. Дістаємо ID обох осей телеметрії
                    const idenX = paramsObj.param?.iden_x
                    const idenY = paramsObj.param?.iden_y

                    // 2. Збираємо унікальні ID та записуємо в батьківський node
                    const allIdens = [idenX, idenY].filter((iden) => iden && iden.trim() !== '')
                    node.setAttribute('data-iden', allIdens.join(','))

                    // 2. Очищаємо фоновий колір на батьківському вузлі (інлайн або через CSS-змінну)
                    node.style.removeProperty('--background-color')
                    node.style.backgroundColor = 'transparent' // Гарантоване скидання фону

                    // 3. Визначаємо колір за замовчуванням із конфігу (якщо задано)
                    const defaultColor = paramsObj.img?.color || '#00ff66'

                    // 3. Рендеримо 2D-полотно і маркер всередину вже позиціонованого node
                    // (Позиціонування самого node.style.left/top/width/height у вас уже виконано вище)
                    // 4. Генеруємо чисту структуру. Статичний колір відразу кладемо в CSS-змінну.
                    node.innerHTML = `
                        <div class="graph-2d-canvas">
                            <div class="graph-grid-layer"></div>
                            <div class="graph-pointer"
                                data-iden-x="${idenX}"
                                data-iden-y="${idenY}"
                                style="--pointer-color: ${defaultColor};">
                                <!-- Лінії перехрестя (осі прицілу) керуються через CSS -->
                                <div class="axis-line axis-x"></div>
                                <div class="axis-line axis-y"></div>
                            </div>
                        </div>
                    `
                }

                this.dom.nodesLayer.appendChild(node)
            })
        })

        this.rebuildIdenMap()
    }

    rebuildIdenMap() {
        this.state.idenMap.clear()

        // 1. Отримуємо всі вузли за один раз
        const nodes = this.dom.nodesLayer.querySelectorAll('.schema-node[data-iden]')

        nodes.forEach((element) => {
            const iden = element.dataset.iden
            if (!iden) return

            // 2. Розбиваємо та очищаємо ідентифікатори
            const ids = iden.split(',').map((s) => s.trim())

            // Опціонально: якщо дитині колись знадобиться знайти свій головний контейнер
            // const mainParentNode = element.closest('.schema-node');

            ids.forEach((id) => {
                if (!id || id === 'unknown') return

                // 3. Ініціалізуємо Set для унікальних елементів, якщо його немає
                if (!this.state.idenMap.has(id)) {
                    this.state.idenMap.set(id, new Set())
                }

                // 4. Set автоматично ігнорує дублікати елементів
                const elementsSet = this.state.idenMap.get(id)
                elementsSet.add(element)
            })
        })
    }

    // http polling
    async startPollingHttp(isPeriodic = false) {
        // 1. КРИТИЧНО: Якщо є активний попередній запит — обриваємо його
        if (this.httpAbortController) {
            this.httpAbortController.abort()
            console.log('%c[HTTP] Previous request aborted.', 'color: #ffae00')
        }

        // Очищаємо попередній таймер перед новим посиланням, щоб уникати накладання
        if (this.state.pollingTimer) {
            clearTimeout(this.state.pollingTimer)
        }

        const unitId = this.dom.unitSelect?.value
        const fragmentName = this.dom.fragmentSelect?.value
        const ids = Array.from(this.state.idenMap.keys())
        //
        const blockIds = ids
            .map((id) => {
                // Знаходимо перший елемент із групи "block" для цього id
                const firstBlockEl = Array.from(this.state.idenMap.get(id) || []).find(
                    (el) => el.dataset.group === 'block' || el.dataset.group === 'rdp',
                )

                if (!firstBlockEl) return null

                const typeImg = String(firstBlockEl?._meta?.img?.name || '')

                const config = APP_CONFIG.BLOCK_UI_CONFIG[typeImg]

                return {
                    rawIden: firstBlockEl.dataset.iden || '', // Повний сирий рядок, як він є в DOM
                    type: config?.type || '',
                }
            })
            .filter(Boolean) // Відсікаємо null (елементи, які не підійшли під умову групи)

        const blockIdsArray = blockIds.map((item) =>
            item.type ? `${item.rawIden}=${item.type}` : item.rawIden,
        )

        // Зберігаємо поточний маркер запиту для захисту від Race Condition
        const currentRequestKey = `${unitId}-${fragmentName}`
        this.state.lastRequestKey = currentRequestKey

        // 2. Створюємо НОВИЙ контролер для ПOTOЧНОГО запиту
        this.httpAbortController = new AbortController()
        const { signal } = this.httpAbortController

        try {
            const requests = []

            // Перший запит: для всіх ids
            const mainDataUrl = APP_CONFIG.getApiUrl(`/value/${unitId}`)
            // const response = await secureApi.request(mainDataUrl, {
            //     responseType: 'raw',
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify({ ids }),
            //     signal: signal,
            // })

            requests.push(
                secureApi.request(mainDataUrl, {
                    responseType: 'raw',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids }),
                    signal,
                }),
            )

            // Другий запит: для blockIds на ІНШИЙ URL (тільки якщо вони існують)
            if (blockIdsArray.length > 0) {
                const blockDataUrl = APP_CONFIG.getApiUrl(
                    `/fragments/params-state?UnitNumber=${unitId}`,
                )

                requests.push(
                    secureApi.request(blockDataUrl, {
                        responseType: 'raw',
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: blockIdsArray }),
                        signal,
                    }),
                )
            }

            // 3. Виконуємо запити паралельно
            const responses = await Promise.all(requests)

            const allOk = responses.every((res) => res.ok)
            if (!allOk) {
                // console.error(
                //     `Fetch fail: ${response.status} ${response.statusText} | URL: ${response.url}`,
                // )
                // this.updateStatus(false)
                // return

                const failedRes = responses.find((res) => !res.ok)
                console.error(
                    `Fetch fail: ${failedRes.status} ${failedRes.statusText} | URL: ${failedRes.url}`,
                )
                this.updateStatus(false)
                return
            }

            // Захист: якщо користувач вже змінив фільтр, поки летів fetch — ігноруємо старі дані
            if (this.state.lastRequestKey !== currentRequestKey) return
            this.state.lastSuccessTime = Date.now()
            this.updateStatus(true)

            // const data = await response.json()
            // // Безпечна перевірка наявності структури в отриманих даних
            // if (data?.infoslist?.info?.[0]) {
            //     data.infoslist.info[0].interval = this.state.currentInterval
            // }

            // this.processData(data)

            // Парсимо JSON результати паралельно
            const dataResults = await Promise.all(responses.map((res) => res.json()))

            // 1. Деструктуризуємо масив (це чистіше, ніж індекси [0] та [1])
            const [mainData, blockData] = dataResults

            // 2. Робимо глибоку копію структури mainData (якщо вона є), щоб уникнути мутації оригіналу
            const updatedMainData = mainData ? JSON.parse(JSON.stringify(mainData)) : {}

            // Безпечно додаємо інтервал у скопійовані дані
            if (updatedMainData?.infoslist?.info?.[0] && isPeriodic) {
                updatedMainData.infoslist.info[0].interval = this.state.currentInterval
            }

            // 3. Об'єднуємо об'єкти. Якщо blockData є — додаємо його під окремий ключ,
            // щоб він не перезаписав властивості з mainData (якщо це окремі блоки даних)
            const data = {
                ...updatedMainData,
                ...(blockData ? { blockData } : {}), // додасть ключ blockData лише якщо він існує
            }

            this.processData(data)
        } catch (error) {
            // 4. ОБОВ'ЯЗКОВО обробляємо помилку обриву
            if (error.name === 'AbortError' || error.message?.includes('AbortError')) {
                console.log('%c[HTTP] Fetch successfully caught abort.', 'color: #888888')
                return // При ручному скасуванні не перезапускаємо таймер опитування штатно тут
            }

            console.error('Polling error:', error)
            this.updateStatus(false)
        } finally {
            // 5. Очищаємо посилання на контролер, якщо запит завершився сам
            // (але тільки якщо це той самий контролер, а не вже новий)
            if (this.httpAbortController?.signal === signal) {
                this.httpAbortController = null
            }
        }

        // 6. Перезапуск таймера для Long Polling (передаємо true далі!)
        if (isPeriodic) {
            this.state.pollingTimer = setTimeout(
                () => this.startPollingHttp(true), // Обов'язково передаємо true, інакше опитування зупиниться
                this.state.currentInterval,
            )
        }
    }

    // ws
    async startPollingWs() {
        // 1. Динамічно завантажуємо модулі
        const { WebSocketClient, CONNECTION_STATE, WS_AUTH_MODE } =
            await import('./WebSocketClient.js')

        const unitId = this.dom.unitSelect?.value
        const fragmentName = this.dom.fragmentSelect?.value
        const ids = Array.from(this.state.idenMap.keys())
        //
        const blockIds = ids
            .map((id) => {
                // Знаходимо перший елемент із групи "block" для цього id
                const firstBlockEl = Array.from(this.state.idenMap.get(id) || []).find(
                    (el) => el.dataset.group === 'block' || el.dataset.group === 'rdp',
                )

                if (!firstBlockEl) return null

                const typeImg = String(firstBlockEl?._meta?.img?.name || '')

                const config = APP_CONFIG.BLOCK_UI_CONFIG[typeImg]

                return {
                    rawIden: firstBlockEl.dataset.iden || '', // Повний сирий рядок, як він є в DOM
                    type: config?.type || '',
                }
            })
            .filter(Boolean) // Відсікаємо null (елементи, які не підійшли під умову групи)

        const blockIdsArray = blockIds.map((item) =>
            item.type ? `${item.rawIden}=${item.type}` : item.rawIden,
        )

        if (!unitId || !ids.length) return

        // Нові параметри кімнати
        const nextRoomPayload = {
            blockId: unitId,
            fragmentName: fragmentName,
            ids: ids,
            blockIdsArray: blockIdsArray,
        }

        // 2. ПЕРЕВИКОРИСТАННЯ ПІДКЛЮЧЕННЯ
        if (this.wsClient && this.wsClient.state === CONNECTION_STATE.CONNECTED) {
            console.log('Reusing connection. Switching rooms...')

            // Виходимо зі старої кімнати, використовуючи збережені раніше дані
            if (this.state.currentFragment) {
                // Перевірка: якщо фільтри не змінилися, нічого не робимо
                if (
                    this.state.currentFragment.blockId === unitId &&
                    this.state.currentFragment.fragmentName === fragmentName
                ) {
                    return
                }

                this.wsClient.send({
                    event: 'leave-api-room',
                    payload: this.state.currentFragment, // Тут старі blockId та fragmentName
                })
            }

            // Заходимо в нову кімнату
            this.wsClient.send({
                event: 'join-api-room',
                payload: nextRoomPayload,
            })

            // Оновлюємо дані про поточну кімнату
            this.state.currentFragment = nextRoomPayload
            return
        }

        // 3. СТВОРЕННЯ НОВОГО ПІДКЛЮЧЕННЯ (якщо старого немає)
        if (this.wsClient) {
            console.log('Closing previous WebSocket connection...')
            // Важливо: метод disconnect/close має бути реалізований у WebSocketClient
            // або просто викликати внутрішній ws.close()
            this.wsClient.close?.()
            this.wsClient = null
        }

        const logger = {
            error: (msg, ...args) =>
                console.error(`%c[ERROR]`, 'color: #ff0000; font-weight: bold', msg, ...args),
            warn: (msg, ...args) =>
                console.warn(`%c[WARN]`, 'color: #ffae00; font-weight: bold', msg, ...args),
            info: (msg, ...args) => console.log(`%c[INFO]`, 'color: #00d9ff', msg, ...args),
            debug: (msg, ...args) => console.log(`%c[DEBUG]`, 'color: #b1b1b1', msg, ...args),
            // // Trace зазвичай використовується для покрокового відстеження виконання коду
            // trace: (msg, ...args) =>
            //     console.log(`%c[TRACE]`, 'color: #888888; font-style: italic', msg, ...args),
            // // Silly — це "сміттєві" логи (наприклад, кожен байт пакету)
            // silly: (msg, ...args) => console.log(`%c[SILLY]`, 'color: #555555', msg, ...args),
        }

        const wsConfig = {
            authMode: WS_AUTH_MODE.QUERY,
            authConfig: {
                mode: 'TEMPORARY', // 'ACCESS'
                queryKey: 'token',
                getAccessToken: async () => {
                    try {
                        const urlTempToken = 'api/v1/auth/temporary-token'

                        const response = await fetch(urlTempToken, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            credentials: 'include', // Обов'язково для HttpOnly кук
                            body: JSON.stringify({
                                scope: 'WEBSOCKET',
                                expiresIn: '30s',
                            }),
                        })

                        if (!response.ok) {
                            const error = new Error(
                                `Temp accessToken failed with status ${response.status}`,
                            )
                            error.status = response.status // Зберігаємо 401, 403, 500 тощо
                            throw error
                        }

                        const data = await response.json()

                        const newToken = data?.token || null

                        return newToken
                    } catch (error) {
                        console.error(
                            '[WS Auth] Помилка під час отримання тимчасового токену:',
                            error.message,
                        )
                        // Прокидаємо помилку далі наверх у метод connect(), не повертаємо null!
                        throw error
                    }
                },

                // refreshTokens: async () => {
                //     try {
                //         const urlRefresh = 'api/v1/auth/refresh'

                //         const response = await fetch(urlRefresh, {
                //             method: 'POST',
                //             headers: {
                //                 'Content-Type': 'application/json',
                //             },
                //             credentials: 'include', // Обов'язково для HttpOnly кук
                //         })

                //         // Якщо сервер повернув 401, 403, 500 тощо — рефреш злетів
                //         if (!response.ok) {
                //             throw new Error(`Refresh failed with status ${response.status}`)
                //         }

                //         // Перевіряємо, чи є у відповіді якийсь вміст (JSON або текст)
                //         const contentType = response.headers.get('content-type') || ''

                //         if (contentType.includes('application/json')) {
                //             const data = await response.json()

                //             // Якщо бекенд прислав JSON, але там чомусь немає поля accessToken
                //             // (наприклад, він оновив Cookies, але в JSON повернув { status: "ok" }),
                //             // ми примусово додаємо заглушку accessToken: true
                //             if (data && typeof data === 'object') {
                //                 if (!data.accessToken) {
                //                     data.accessToken = true
                //                 }
                //                 console.log('[WS Auth] Токени оновлено (отримано JSON)')
                //                 return data
                //             }
                //         }

                //         // Сюди ми потрапляємо, якщо відповідь успішна (200 OK), але тіло порожнє
                //         // або це звичайний текст (чисті куки через Set-Cookie).
                //         // Повертаємо об'єкт-муляж, який гарантовано пройде перевірку клієнта!
                //         console.log('[WS Auth] Токени оновлено через Set-Cookie (порожнє тіло)')
                //         return { accessToken: true }
                //     } catch (error) {
                //         console.error('[WS Auth] Помилка під час оновлення токенів:', error.message)
                //         // Завжди повертаємо null у разі загрози DDOS-у, щоб клієнт зупинив цикл
                //         return null
                //     }
                // },
            },
        }

        this.wsClient = new WebSocketClient(APP_CONFIG.getWsUrl(), wsConfig, logger)

        this.wsClient.on('open', () => {
            // ДИНАМІЧНЕ ЗЧИТУВАННЯ: беремо актуальні фільтри
            const currentPayload = {
                blockId: this.dom.unitSelect?.value,
                fragmentName: this.dom.fragmentSelect?.value,
                ids: ids,
                blockIdsArray: blockIdsArray,
            }

            this.wsClient.send({
                event: 'join-api-room',
                payload: currentPayload,
            })

            // Запам'ятовуємо кімнату при першому підключенні
            this.state.currentFragment = currentPayload
        })

        this.wsClient.on('statusChange', (status) => {
            if (status == CONNECTION_STATE.CONNECTED) {
                this.updateStatus(true)
            } else {
                this.updateStatus(false)
            }
        })

        this.wsClient.on('fragment-data-update', (rawData) => {
            const data = rawData.data

            this.state.lastSuccessTime = Date.now()
            this.updateStatus(true)

            if (data?.infoslist?.info?.[0]) {
                data.infoslist.info[0].interval = data?.meta?.refreshInterval
            }

            this.processData(data)

            // console.log(1111111111111, Array.from(this.state.idenMap.keys()), data)
        })

        await this.wsClient.connect()
    }

    // // updateUI
    // processData(data) {
    //     // 1. Витягуємо сирі дані з безпечним оператором ?.
    //     const rawParam = data?.paramslist?.param

    //     // 2. Нормалізуємо дані: робимо з будь-чого чистий масив
    //     const paramArray = Array.isArray(rawParam) ? rawParam : rawParam ? [rawParam] : []

    //     // Зберігаємо всі параметри в Map для швидкого доступу за ID
    //     this.state.lastParams = new Map(paramArray.map((p) => [p.iden, p]))

    //     // Оновлення серверної інформації
    //     const info = data?.infoslist?.info?.[0]
    //     if (info) {
    //         if (this.dom.clock) this.dom.clock.innerText = info.datetime

    //         if (info.interval) {
    //             const newInterval = parseInt(info.interval)
    //             this.state.currentInterval = newInterval
    //             if (this.dom.clockPeriodTag) {
    //                 this.dom.clockPeriodTag.innerText = `${newInterval / 1000}с`
    //             }
    //         }
    //     }

    //     // Оновлення параметрів
    //     // const params = data?.paramslist?.param || []
    //     paramArray.forEach((item) => {
    //         const targetNodes = this.state.idenMap.get(item.iden)
    //         if (!targetNodes) return

    //         targetNodes.forEach((node) => {
    //             // ЗНАХОДИМО ГРУПУ: шукаємо на самому елементі або підіймаємося до батька .schema-node
    //             const groupHolder = node.closest('[data-group]')
    //             if (!groupHolder) return // Якщо раптом групи немає ніде вище по дереву

    //             const group = groupHolder.dataset.group

    //             if (group === 'dtext') {
    //                 this.syncText(
    //                     groupHolder.querySelector('.node-value'),
    //                     item.valuetext,
    //                     item.status,
    //                 )
    //             } else if (group === 'hist') {
    //                 this.syncHist(groupHolder, item.value, item.status, item.iden)
    //             } else if (group === 'block') {
    //                 this.syncImage(groupHolder, item.iden, item.value)
    //             } else if (group === 'tablo') {
    //                 this.syncTablo(groupHolder, item.status)
    //             } else if (group === 'knop') {
    //                 this.syncText(groupHolder.querySelector('.node-value'), item.valuetext)
    //             } else if (group === 'kfb') {
    //                 this.syncKFB(groupHolder, item.value, item.status)
    //             }
    //         })
    //     })

    //     // //
    //     // // Оновлення параметрів
    //     // const params = data?.paramslist?.param || []
    //     // const nodesToUpdate = new Map()

    //     // // Step 1: Групуємо всі item для кожного конкретного node
    //     // params.forEach((item) => {
    //     //     const targetNodes = this.state.idenMap.get(item.iden)
    //     //     if (!targetNodes) return

    //     //     targetNodes.forEach((node) => {
    //     //         if (!nodesToUpdate.has(node)) {
    //     //             nodesToUpdate.set(node, [])
    //     //         }
    //     //         nodesToUpdate.get(node).push(item)
    //     //     })
    //     // })

    //     // const aggregateParams = (itemsList) => {
    //     //     // Якщо список порожній, повертаємо null
    //     //     if (!itemsList || itemsList.length === 0) return null

    //     //     let resultItem = null

    //     //     // Якщо елемент лише один, беремо його
    //     //     if (itemsList.length === 1) {
    //     //         resultItem = itemsList[0]
    //     //     } else {
    //     //         // ТИМЧАСОВО: якщо елементів більше 1, повертаємо перший.
    //     //         // ТУТ БУДЕ ЗМІНА ЛОГІКИ ДЛЯ ДЕКІЛЬКОХ ЕЛЕМЕНТІВ
    //     //         resultItem = itemsList[0]
    //     //     }

    //     //     // Повертаємо новий об'єкт (копію), щоб уникнути мутації оригінальних даних
    //     //     return {
    //     //         ...resultItem,
    //     //     }
    //     // }

    //     // // Step 2: Проходимо по кожному node строго ОДИН раз
    //     // nodesToUpdate.forEach((itemsList, node) => {
    //     //     // Пропускаємо через функцію агрегації для отримання єдиного фінального результату
    //     //     const finalItem = aggregateParams(itemsList)
    //     //     if (!finalItem) return

    //     //     const group = node.dataset.group

    //     //     if (group === 'dtext') {
    //     //         this.syncText(
    //     //             node.querySelector('.node-value'),
    //     //             finalItem.valuetext,
    //     //             finalItem.status,
    //     //         )
    //     //     } else if (group === 'hist') {
    //     //         this.syncHist(node, finalItem.value, finalItem.status)
    //     //     } else if (group === 'block') {
    //     //         this.syncImage(node, finalItem.iden, finalItem.value)
    //     //     } else if (group === 'tablo') {
    //     //         this.syncTablo(node, finalItem.status)
    //     //     } else if (group === 'knop') {
    //     //         this.syncText(node.querySelector('.node-value'), finalItem.valuetext)
    //     //     } else if (group === 'kfb') {
    //     //         this.syncKFB(node, finalItem.value, finalItem.status)
    //     //     }
    //     // })

    //     // Оновлюємо tooltip
    //     this.updateTooltipContent()
    // }

    async processData(data) {
        // console.log(111111111, data)

        // 1. Витягуємо сирі дані з безпечним оператором ?.
        const rawParam = data?.paramslist?.param
        const rawDiscr = data?.blockData?.algorslist?.algor

        // 2. Нормалізуємо дані: робимо з будь-чого чистий масив
        const paramArray = Array.isArray(rawParam) ? rawParam : rawParam ? [rawParam] : []

        const discretArray = Array.isArray(rawDiscr) ? rawDiscr : rawDiscr ? [rawDiscr] : []

        // Зберігаємо всі параметри в Map для швидкого доступу за ID
        this.state.lastParams = new Map(paramArray.map((p) => [p.iden, p]))

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
        paramArray.forEach((item) => {
            // 1. Отримуємо Set, у якому лежать чисті DOM-елементи
            const elementsSet = this.state.idenMap.get(item.iden)
            if (!elementsSet) return

            elementsSet.forEach((element) => {
                // ЗНАХОДИМО ГРУПУ: тепер шукаємо від нашого конкретного element
                const groupHolder = element.closest('.schema-node[data-group]')
                if (!groupHolder) return

                const group = groupHolder.dataset.group
                //Дістаємо fullIden прямо з елемента на льоту
                const fullIden = element.dataset.iden

                if (group === 'dtext') {
                    this.syncText(
                        groupHolder.querySelector('.node-value'),
                        item.valuetext,
                        item.status,
                    )
                } else if (group === 'hist') {
                    this.syncHist(groupHolder, item.value, item.status, item.iden)
                } /*else if (group === 'block') {
                    // Передаємо fullIden замість одиночного item.iden
                    this.syncImage(groupHolder, fullIden, item.value)
                }*/ else if (group === 'tablo') {
                    this.syncTablo(groupHolder, item.status)
                } else if (group === 'knop') {
                    this.syncText(groupHolder.querySelector('.node-value'), item.valuetext)
                } else if (group === 'kfb') {
                    this.syncKFB(groupHolder, item.value, item.status)
                } else if (group === 'clock') {
                    this.syncClock(groupHolder, item.value, item.status)
                } else if (group === 'par_graf') {
                    this.syncGraph2D(groupHolder, item.value, item.iden, item.status)
                }
            })
        })

        discretArray.forEach((item) => {
            // 1. Отримуємо Set, у якому лежать чисті DOM-елементи
            const elementsSet = this.state.idenMap.get(item.iden1)
            if (!elementsSet) return

            for (const element of elementsSet) {
                if (!element || !element.closest) continue // Захист, якщо element не є DOM-нодою

                // ЗНАХОДИМО ГРУПУ від нашого конкретного element
                const groupHolder = element.closest('.schema-node[data-group]')
                if (!groupHolder) continue // для циклів for...of замість return пишемо continue

                const group = groupHolder.dataset.group

                // Дістаємо fullIden прямо з елемента на льоту
                const fullIden = element.dataset.iden

                if (group === 'block' || group === 'rdp') {
                    this.syncImage(groupHolder, item.iden1, item.state)
                }
            }

            // elementsSet.forEach((element) => {
            //     // ЗНАХОДИМО ГРУПУ: тепер шукаємо від нашого конкретного element
            //     const groupHolder = element.closest('.schema-node[data-group]')
            //     if (!groupHolder) return

            //     const group = groupHolder.dataset.group
            //     //Дістаємо fullIden прямо з елемента на льоту
            //     const fullIden = element.dataset.iden

            //     if (group === 'block') {
            //         // Передаємо fullIden замість одиночного item.iden
            //         this.syncImage(groupHolder, item.iden1, item.state)
            //     }
            // })
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

    // ---------------------------
    formatTime(input) {
        if (input === null || input === undefined || isNaN(input)) return '--:--:--'

        // 1. Автовизначення: якщо число велике, це мілісекунди. Переводимо в секунди.
        // Поріг 283722000000 (рік 1979) допомагає відрізнити Timestamp від великої тривалості
        const isMs = input > 283722000000
        let totalSeconds = isMs ? Math.floor(input / 1000) : Math.floor(input)

        // 2. Якщо це Timestamp (конкретна дата), повертаємо локальний час для неї
        if (isMs) {
            const date = new Date(input)
            const hours = String(date.getHours()).padStart(2, '0')
            const minutes = String(date.getMinutes()).padStart(2, '0')
            const seconds = String(date.getSeconds()).padStart(2, '0')
            return `${hours}:${minutes}:${seconds}`
        }

        // 3. Якщо це просто тривалість (кількість секунд)
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60

        // Форматуємо, додаючи нулі попереду (01, 02 тощо)
        const hStr = String(hours).padStart(2, '0')
        const mStr = String(minutes).padStart(2, '0')
        const sStr = String(seconds).padStart(2, '0')

        return `${hStr}:${mStr}:${sStr}`
    }

    // dtext
    // syncText(el, val, status = null) {
    //     if (!el) return

    //     // Оновлюємо текст, тільки якщо він змінився
    //     const newVal = String(val ?? '')
    //     if (el.textContent !== newVal) {
    //         el.textContent = newVal
    //     }

    //     if (status != null) {
    //         // Отримуємо колір за статусом
    //         const color = APP_CONFIG.STATUS_COLORS[status]

    //         // Передаємо колір у CSS змінну
    //         el.style.setProperty('--value-color', color)
    //     }

    //     // el.style.color = '#fbbf24'
    //     // // el.classList.add('updated')
    //     // setTimeout(() => {
    //     //     el.style.color = ''
    //     //     // el.classList.remove('updated')
    //     // }, 500)
    // }

    async fetchTabloText(value) {
        const stringValue = String(value)

        const unitId = this.dom.unitSelect?.value

        try {
            const url = APP_CONFIG.getApiUrl(`/fragments/tablo-texts/${unitId}`)

            const tabloTextData = await cachedSecureApi.request(url, {
                responseType: 'json',
                customCache: {
                    useCache: true,
                    ttl: 60 * 60 * 1000,
                },
            })

            const list = tabloTextData?.tablotextslist?.tablotext

            // 1. Перевіряємо, чи отримали ми масив даних
            if (Array.isArray(list)) {
                // 2. Шукаємо елемент, у якого number збігається з поточним stringValue
                const foundItem = list.find((item) => String(item.number) === stringValue)

                // 3. Якщо знайшли — повертаємо текст, якщо ні — саме число (fallback)
                if (foundItem) {
                    return foundItem.text
                }
            }

            return stringValue
        } catch (error) {
            console.error('Помилка завантаження DTEXT_TABLO:', error)
            return stringValue // У разі помилки виводимо сире значення
        }
    }

    async syncText(domNode, incomingValue, statusKey = null) {
        if (!domNode) return

        let targetTextElement = domNode

        // 1. АВТОМАТИЧНИЙ ЗАХИСТ ТА ГЕНЕРАЦІЯ СТРУКТУРИ
        // Якщо передали батьківський контейнер .schema-node
        if (domNode.classList.contains('schema-node')) {
            targetTextElement = domNode.querySelector('.node-value')

            // Якщо всередині контейнера ще немає елемента для виведення тексту — створюємо його!
            if (!targetTextElement) {
                targetTextElement = document.createElement('span')
                targetTextElement.classList.add('node-value')

                // Якщо всередині батька був якийсь старий текстовий бруд, очищаємо його
                domNode.textContent = ''
                domNode.appendChild(targetTextElement)
            }
        }

        // 2. ОПРАЦЮВАННЯ ЧИСЕЛ ТА ЗАМІНА КОМ
        let formattedValue = String(incomingValue ?? '')

        // Знаходимо кореневу ноду для зчитування мета-даних (вона або сам domNode, або його батько)
        const rootSchemaNode = targetTextElement.closest('.schema-node') || domNode

        const metadata = rootSchemaNode?._meta
        const algor = metadata?.params?.algor

        if (algor === 'DTEXT_TIMER') {
            formattedValue = this.formatTime(formattedValue)
        } else if (algor === 'DTEXT_TABLO') {
            // Захист від перегонів (якщо нове значення прийде швидше, ніж завершиться await)
            targetTextElement.dataset.lastValue = formattedValue

            // Викликаємо асинхронний метод через await
            const resolvedText = await this.fetchTabloText(formattedValue)

            // Перевіряємо, чи за час очікування запиту значення не змінилося на інше
            if (targetTextElement.dataset.lastValue === formattedValue) {
                formattedValue = resolvedText
            } else {
                return // Перериваємо виконання, оскільки вже актуальне інше значення
            }
        } else if (formattedValue.toUpperCase().includes('E')) {
            // ЗАХИСТ ЕКСПONЕНЦІАЛЬНОГО ФОРМАТУ (наприклад: 0.00E+000)
            // Якщо в даних є інженерна літера 'E' або 'e', ми залишаємо рядок у початковому вигляді
            // Можна лише замінити кому на крапку, якщо це потрібно для світового стандарту (наприклад, 0,00E+00 -> 0.00E+00)
            formattedValue = formattedValue.replace(',', '.')
        } else {
            // Стандартний числовий/текстовий режим: уніфікуємо роздільник (і кому, і крапку)
            const standardizedValue = formattedValue.replace(',', '.')
            const numericValue = parseFloat(standardizedValue)

            // Перевіряємо, чи це дійсно валідне число
            if (!isNaN(numericValue) && isFinite(numericValue)) {
                // Тепер ми застраховані! Будь-яке число (хоч з комою, хоч з крапкою) розпарситься правильно.
                // Тут, якщо знадобиться, можна легко увімкнути округлення:
                // formattedValue = numericValue.toFixed(1).replace('.', ',');
                formattedValue = String(numericValue)
            }
        }

        // 3. ОНОВЛЕННЯ DOM (Тільки якщо текст дійсно змінився)
        if (targetTextElement.textContent !== formattedValue) {
            targetTextElement.textContent = formattedValue
        }

        // 4. СИНХРОНІЗАЦІЯ СТАТУСНИХ КОЛЬОРІВ ТА СТИЛІВ
        if (statusKey !== null) {
            const statusColorValue =
                APP_CONFIG.STATUS_COLORS[statusKey] || APP_CONFIG.STATUS_COLORS.default

            // Записуємо колір тексту безпосередньо на сам текстовий тег
            targetTextElement.style.setProperty('--value-color', statusColorValue)

            // // Дублюємо колір на головну обгортку, якщо вона є
            // if (rootSchemaNode) {
            //     rootSchemaNode.style.setProperty('--value-color', statusColorValue)
            //     rootSchemaNode.style.setProperty('--dynamic-color', statusColorValue)
            // }
        }

        // 5. ДИНАМІЧНЕ ВИРІВНЮВАННЯ ТЕКСТУ (ЗЧИТУВАННЯ З МЕТА-ДАНИХ)
        if (rootSchemaNode?._meta?.img) {
            const alignType = rootSchemaNode._meta.img.align // Наприклад: 'l', 'r' або 'c'
            let cssTextAlignValue = 'center' // Значення за замовчуванням

            if (alignType === 'l') {
                cssTextAlignValue = 'left'
            } else if (alignType === 'r') {
                cssTextAlignValue = 'right'
            }

            // Записуємо правильне значення у CSS-змінну
            targetTextElement.style.setProperty('--text-align', cssTextAlignValue)
        }
    }

    // Hist
    // syncHist(node, val, status = null, currentIden = null) {
    //     // console.log(node)
    //     const histogram = node.querySelector('.histogram')
    //     // Перевіряємо наявність node._meta.img (де лежать параметри x, y, h, filltype тощо)
    //     if (!histogram || !node._meta?.img) return

    //     const img = node._meta.img
    //     const min = parseFloat(img.pred_n || 0)
    //     const max = parseFloat(img.pred_v || 100)
    //     const currentVal = parseFloat(val || 0)
    //     // Напрямок заповнення: 'I' - інвертований (зверху), інакше - знизу
    //     const isInverted = img.filltype === 'I'

    //     // Розрахунок відсотка (0-100)
    //     const range = max - min
    //     const rawPercent = range === 0 ? 0 : ((currentVal - min) / range) * 100
    //     let percent = Math.min(Math.max(rawPercent, 0), 100)

    //     if (isInverted) {
    //         percent = 100 - percent
    //     }

    //     if (isInverted) {
    //         histogram.classList.add('inverted')
    //     } else {
    //         histogram.classList.remove('inverted')
    //     }

    //     // Встановлюємо відсоток заповнення
    //     histogram.style.setProperty('--fill-level-pc', `${percent}`)

    //     // Робота з кольорами та градієнтами
    //     if (status != null) {
    //         const color = APP_CONFIG.STATUS_COLORS[status] || APP_CONFIG.STATUS_COLORS.default
    //         node.style.setProperty('--dynamic-color', color)
    //     }

    //     // Розрахунок ліміту (уставка також має дзеркалитися за тією ж логікою)
    //     if (node._meta?.params?.va) {
    //         histogram.style.setProperty('--l-pos', `${percent}`)
    //     }
    // }

    async syncHist(domNode, sensorValue, statusKey = null, currentTelemetryId = null) {
        let activeTarget = domNode

        // 1. ВИЗНАЧЕННЯ ТОЧНОЇ ЦІЛІ ОНОВЛЕННЯ ЧЕРЕЗ ТЕГ ТЕЛЕМЕТРІЇ (IDEN)
        // Якщо прийшов загальний батьківський контейнер .schema-node, шукаємо всередині нього точковий елемент
        if (domNode.classList.contains('schema-node') && currentTelemetryId) {
            const exactTargetChild = domNode.querySelector(
                `[data-iden="${currentTelemetryId}"]:not(.schema-node)`,
            )

            if (exactTargetChild) {
                activeTarget = exactTargetChild // Перемикаємося на конкретний елемент
            } else {
                // Фолбек для зворотної сумісності, якщо точкових data-iden на дитині ще немає
                const defaultHistogram = domNode.querySelector('.histogram')
                if (!defaultHistogram) return
                activeTarget = defaultHistogram
            }
        }

        // 2. ВИЗНАЧЕННЯ ТЕХНОЛОГІЧНОЇ РОЛІ ЕЛЕМЕНТА
        const isTargetAnOverlayLimit = activeTarget.classList?.contains('limit-wrapper')
        const histogramWidget = isTargetAnOverlayLimit
            ? activeTarget.closest('.histogram')
            : activeTarget

        const rootSchemaNode = histogramWidget?.closest?.('.schema-node')

        // Перевіряємо наявність обов'язкових мета-даних конфігурації приладу
        if (!histogramWidget || !rootSchemaNode?._meta?.img) return

        // Дані
        const metadata = rootSchemaNode._meta.img

        // 3. МАТЕМАТИЧНИЙ РОЗРАХУНОК ВІДСОТКОВОЇ ШКАЛИ (0 - 100%)
        const scaleMinimum = parseFloat(metadata.pred_n ?? 0)
        const scaleMaximum = parseFloat(metadata.pred_v ?? 100)
        const measurementRange = scaleMaximum - scaleMinimum

        // Перетворюємо значення в рядок, міняємо кому на крапку, і лише потім парсимо у дробове число
        // Використовуємо ?? замість ||, щоб коректно обробляти порожні рядки чи нулі
        const sanitizedStringValue = String(sensorValue ?? 0).replace(',', '.')
        const incomingNumericValue = parseFloat(sanitizedStringValue)

        // Розрахунок базового відсотка (0 - 100)
        // Захист від ділення на нуль при некоректній конфігурації шкали (якщо min === max)
        const calculatedPercentage =
            measurementRange === 0
                ? 0
                : ((incomingNumericValue - scaleMinimum) / measurementRange) * 100

        // Обмежуємо відсоток суворо в межах від 0% до 100%
        const basePercentage = Math.min(Math.max(calculatedPercentage, 0), 100)
        let finalPercentage = basePercentage

        // --- ОРІЄНТАЦІЯ ТА ІНВЕРСІЯ ЗГІДНО КОНФІГУ ---
        const dir = metadata.dir //|| 'P' // L (ліворуч), P (праворуч), V (вгору), N (вниз)
        const filltype = metadata.filltype //|| 'S' // I (Inverted value), S (Standard)
        const type = metadata.type //|| 'O' // O (Ordinary)
        const name = metadata.name //|| ''

        // ПРАВИЛО 1: Математична інверсія значення (якщо filltype === "I")
        const isValueInverted = filltype === 'I'
        if (isValueInverted) {
            finalPercentage = 100 - basePercentage
        }

        // ПРАВИЛО 2: Інверсія самої гістограми (візуальне відображення нуля і ліній уставки)
        // Шкала вважається інвертованою, якщо name дорівнює 'GistIn'
        const isHistogramInverted = name === 'GistIn' //|| name === 'GistSt'
        histogramWidget.classList.toggle('inverted', isHistogramInverted)

        // if (isHistogramInverted) {
        //     histogramWidget.classList.add('inverted')
        // } else {
        //     histogramWidget.classList.remove('inverted')
        // }

        // ПРАВИЛО 3: Розподіл по площинах згідно з dir
        const isHorizontal = dir === 'L' || dir === 'P'
        histogramWidget.classList.toggle('horizontal', isHorizontal)
        histogramWidget.classList.toggle('vertical', !isHorizontal)

        // Зберігаємо тип заповнення в data-атрибут для CSS
        histogramWidget.dataset.dir = dir
        histogramWidget.dataset.filltype = filltype
        histogramWidget.dataset.type = type

        //! 4. ТОЧКОВИЙ ЗАПИС ДАНИХ У CSS ТА DOM ЗГІДНО З РОЛЛЮ
        if (isTargetAnOverlayLimit) {
            // ОНОВЛЕННЯ ЛІНІЇ УСТАВКИ ОБМЕЖЕННЯ (в CSS є calc(var(--l-pos) * 1%))
            // Записуємо позицію індивідуально для цієї лінії
            activeTarget.style.setProperty('--l-pos', `${finalPercentage}`)

            // 4.1 ЗЧИТУЄМО ТИП ЛІМІТУ З ДАТА-АТРИБУТУ
            const limitType = activeTarget.dataset.limitType // Отримаємо 'nr', 'na', 'vr' або 'va'

            const LIMIT_COLORS = {
                va: 'red',
                vr: 'yellow',
                na: 'red',
                nr: 'yellow',
            }

            // 4.2 ДИНАМІЧНО СТАВИМО КОЛІР ПІД ТИП ЛІМІТУ
            if (limitType && statusKey !== null) {
                const limitColor = LIMIT_COLORS[limitType] || 'red'
                activeTarget.style.setProperty('--l-color', limitColor)
            }
        } else {
            // ОНОВЛЕННЯ ОСНОВНОГО РІВНЯ ЗАПОВНЕННЯ ГІСТОГРАМИ
            histogramWidget.style.setProperty('--fill-level-pc', `${finalPercentage}`)

            // ОНОВЛЕННЯ ДИНАМІЧНИХ СТАТУСНИХ КОЛЬОРІВ (НОРМА / УВАГА / АВАРІЯ)
            if (statusKey !== null) {
                const statusColorValue =
                    APP_CONFIG.STATUS_COLORS[statusKey] || APP_CONFIG.STATUS_COLORS.default
                histogramWidget.style.setProperty('--dynamic-color', statusColorValue)
            }
        }
    }

    // Icons
    async fetchIcon(iconName) {
        if (!iconName || typeof iconName !== 'string') {
            throw new TypeError('[IconService] iconName must be a valid string')
        }

        const svgUrl = `assets/icons/ios/${iconName}.svg`

        try {
            const svgText = await cachedPublicApi.request(svgUrl, {
                method: 'GET',
                responseType: 'text', // Просимо повернути текст, а не Response
                customCache: {
                    useCache: true,
                    ttl: 60 * 60 * 1000,
                },
            })

            if (!svgText || !svgText.trim().startsWith('<svg')) {
                throw new Error(`[IconService] Resource at ${svgUrl} is not a valid SVG`)
            }

            // Очищуємо або модифікуємо SVG для маніпуляцій через CSS колір (currentColor)
            // svgText = svgText.replace(/fill="[^"]*"/g, 'fill="currentColor"')

            return svgText
        } catch (err) {
            console.error(`[IconService] Failed to load icon: ${iconName}`, err)
            // Повертаємо дефолтну іконку-заглушку (inline SVG), щоб інтерфейс не ламався
            return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`
        }

        // if (this.iconCache.has(iconName)) {
        //     return this.iconCache.get(iconName)
        // }

        // const promise = fetch(`assets/icons/ios/${iconName}.svg`)
        //     .then((response) => {
        //         if (!response.ok) throw new Error('Icon not found')
        //         return response.text()
        //     })
        //     // .then((svgText) => {
        //     //     // Очищуємо SVG від зайвих атрибутів (опціонально)
        //     //     return svgText.replace(/fill="[^"]*"/g, 'fill="currentColor"')
        //     // })
        //     .catch((err) => {
        //         this.iconCache.delete(iconName)
        //         throw err
        //     })

        // this.iconCache.set(iconName, promise)
        // return promise
    }

    // async updateIcon(container, iconName, color) {
    //     if (!container || !iconName) return

    //     // 1. Перевірка на дублікат
    //     if (container.dataset.currentIcon === iconName) {
    //         const svg = container.querySelector('svg')
    //         if (svg && svg.style.color !== color) {
    //             svg.style.color = color
    //         }
    //         return
    //     }

    //     try {
    //         const svgText = await this.fetchIcon(iconName)

    //         // Вставляємо вміст
    //         container.innerHTML = svgText
    //         container.dataset.currentIcon = iconName

    //         const svg = container.querySelector('svg')
    //         if (svg) {
    //             // ВАЖЛИВО: getBBox() працює лише якщо елемент вже в DOM і видимий
    //             // Якщо іконки завантажуються в прихований контейнер, bbox буде 0
    //             // requestAnimationFrame(() => {
    //             //     const bbox = svg.getBBox()
    //             //     if (bbox.width > 0) {
    //             //         svg.setAttribute(
    //             //             'viewBox',
    //             //             `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`,
    //             //         )
    //             //     }
    //             // })

    //             const bbox = svg.getBBox()
    //             if (bbox.width > 0) {
    //                 svg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`)
    //             }

    //             // svg.style.cssText = `display:block; width:100%; height:100%; color:${color};`
    //             svg.style.width = '100%'
    //             svg.style.height = '100%'
    //             svg.style.display = 'block'
    //             svg.style.color = color
    //             // svg.style.transform = 'scale(0.9)'
    //             // svg.style.transformOrigin = 'center'

    //             svg.querySelectorAll('path').forEach((p) => {
    //                 p.setAttribute('fill', 'currentColor')
    //             })
    //         }
    //     } catch (err) {
    //         console.error('Error loading icon:', iconName, err)
    //         container.dataset.currentIcon = 'error'
    //     }
    // }

    async updateIcon(container, iconName, color) {
        if (!container || !iconName) return

        // 1. Перевірка на дублікат
        if (container.dataset.currentIcon === iconName) {
            const svg = container.querySelector('svg')
            if (svg && svg.style.color !== color) {
                svg.style.color = color
            }
            return
        }

        try {
            const svgText = await this.fetchIcon(iconName)

            // Парсимо рядок в реальний DOM-елемент замість innerHTML
            const parser = new DOMParser()
            const doc = parser.parseFromString(svgText, 'image/svg+xml')
            const newSvg = doc.querySelector('svg')

            if (!newSvg) throw new Error('Invalid SVG text')

            // Налаштовуємо стилі та атрибути до вставки в DOM
            newSvg.style.width = '100%'
            newSvg.style.height = '100%'
            newSvg.style.display = 'block'
            newSvg.style.color = color

            newSvg.querySelectorAll('path').forEach((p) => {
                p.setAttribute('fill', 'currentColor')
            })

            // Очищуємо контейнер і вставляємо новий елемент
            container.innerHTML = ''
            container.appendChild(newSvg)
            container.dataset.currentIcon = iconName

            // getBBox потребує, щоб елемент був у DOM та видимим
            // Повертаємо requestAnimationFrame, щоб уникнути нульових розмірів
            requestAnimationFrame(() => {
                if (!container.isConnected) return // перевірка, чи контейнер досі в DOM
                const bbox = newSvg.getBBox()
                if (bbox.width > 0) {
                    newSvg.setAttribute(
                        'viewBox',
                        `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`,
                    )
                }
            })
        } catch (err) {
            console.error('Error loading icon:', iconName, err)
            container.dataset.currentIcon = 'error'
        }
    }

    // async updateIcon(container, iconName, color) {
    //     if (!container || !iconName) return

    //     // 1. ОПТИМІЗАЦІЯ: Перевіряємо, чи ця іконка вже завантажена
    //     // Використовуємо data-атрибут для збереження поточної назви
    //     if (container.dataset.currentIcon === iconName) {
    //         // Якщо іконка та сама, міняємо ТІЛЬКИ колір (миттєво, без fetch)
    //         const svg = container.querySelector('svg')
    //         if (svg) svg.style.color = color
    //         return
    //     }

    //     // 2. Якщо іконка нова — завантажуємо її
    //     try {
    //         const response = await fetch(`assets/icons/ios/${iconName}.svg`)
    //         if (!response.ok) throw new Error('Icon not found')

    //         let svgText = await response.text()

    //         // Вставляємо SVG
    //         container.innerHTML = svgText
    //         container.dataset.currentIcon = iconName // Запам'ятовуємо, що завантажили

    //         const svg = container.querySelector('svg')
    //         if (svg) {
    //             // 1. Отримуємо реальні координати контуру іконки
    //             const bbox = svg.getBBox()

    //             // 2. Встановлюємо viewBox точно по розмірах контуру
    //             svg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`)

    //             svg.style.width = '100%'
    //             svg.style.height = '100%'
    //             svg.style.display = 'block'
    //             svg.style.color = color // Фарбуємо
    //             // бо є відступи в середині svg
    //             // svg.style.transform = 'scale(1.2)'
    //             // svg.style.transformOrigin = 'center'

    //             // Якщо у ваших SVG всередині path є fill="black",
    //             // цей рядок змусить його слухатися кольору контейнера:
    //             svg.querySelectorAll('path').forEach((p) => p.setAttribute('fill', 'currentColor'))
    //         }
    //     } catch (err) {
    //         console.error('Помилка завантаження:', iconName, err)
    //         container.innerHTML = '<!-- бита іконка тут -->'
    //         container.dataset.currentIcon = 'error'
    //     }
    // }

    async syncImage(node, iden, val) {
        // const img = node.querySelector('.node-image')
        // if (!img) return

        const idenEntries = this.state.idenMap.get(iden)
        // Якщо записів немає — одразу виходимо
        if (!idenEntries) return

        const valStr = String(val)

        for (const entry of idenEntries) {
            if (!entry) continue

            // Перевіряємо, чи є entry DOM-нодою, чи об'єктом, що містить її
            const elementWithMeta = entry.nodeType ? entry : entry.element
            if (!elementWithMeta) continue

            // ЗАХИСТ: Перевіряємо, чи цей конкретний елемент лежить усередині НАШОЇ node
            // Якщо елемент належить іншій копії, ми його просто пропускаємо
            if (!node.contains(elementWithMeta) && node !== elementWithMeta) {
                continue
            }

            const typeImg = String(elementWithMeta?._meta?.img?.name || '')

            // Беремо конфігурацію саме для цього конкретного елемента
            const config =
                APP_CONFIG.BLOCK_UI_CONFIG[typeImg] || APP_CONFIG.BLOCK_UI_CONFIG['default']

            // Визначаємо іконку та колір (або значення за замовчуванням)
            const iconName = config.icon[valStr] || config.icon.default || 'round-help-outline'
            const iconColor = config.color[valStr] || config.color.default || 'inherit'

            // console.log('Processing entry:', elementWithMeta, typeImg, iconName, iconColor)

            // Тепер оновлюємо САМЕ ту node, яка прийшла в аргументи і пройшла перевірку
            this.updateIcon(node, iconName, iconColor)

            // Перериваємо цикл, бо ми знайшли потрібний елемент для цієї node
            break
        }

        // if (imageName) {
        //     const newPath = `img/${imageName}`
        //     if (img.getAttribute('src') !== newPath) {
        //         img.src = newPath
        //         img.style.display = 'block'
        //     }
        // } else {
        //     img.style.display = 'none'
        //     img.removeAttribute('src')
        // }
    }

    // tablo
    // syncTablo(el, status = null) {
    //     if (!el) return

    //     if (status !== null) {
    //         // Отримуємо колір за статусом
    //         const color = APP_CONFIG.STATUS_COLORS[status]

    //         // Передаємо колір у CSS змінну
    //         el.style.setProperty('--border-color', color)
    //     }
    // }

    async syncTablo(domNode, statusKey = null) {
        if (!domNode) return

        if (statusKey !== null) {
            const statusColorValue =
                APP_CONFIG.STATUS_COLORS[statusKey] || APP_CONFIG.STATUS_COLORS.default

            // Записуємо колір безпосередньо на елемент табло
            domNode.style.setProperty('--border-color', statusColorValue)
            domNode.style.setProperty('--value-color', `#FFFFFF`)

            // // Якщо елемент вкладений, дублюємо колір на головну обгортку .schema-node
            // const rootSchemaNode = domNode.closest('.schema-node')
            // if (rootSchemaNode) {
            //     rootSchemaNode.style.setProperty('--border-color', statusColorValue)
            //     rootSchemaNode.style.setProperty('--dynamic-color', statusColorValue)
            // }
        }
    }

    // kfb
    // syncKFB(node, val, status) {
    //     if (!node || val === undefined || val === null) return

    //     // 1. Приведення вхідних значень
    //     const currentStatus = Number(status)
    //     const cleanVal = String(val).replace(',', '.')
    //     let currentNom = Math.round(Number(cleanVal))

    //     // 2. Застосування бізнес-правил для визначення коду стану (currentNom)
    //     if (currentStatus === 255) {
    //         currentNom = 0
    //     } else if (currentStatus === 0 && currentNom === 0) {
    //         currentNom = -1
    //     } else if (currentStatus === 0) {
    //         // Якщо статус 0, а currentNom має інші значення — залишаємо поточний Math.round
    //     }

    //     // Перевірка на NaN (якщо дані некоректні)
    //     if (isNaN(currentNom)) return

    //     // 2. Перевірка, чи значення змінилося (захист від повторного перекачування)
    //     if (node.lastSostNom === currentNom) {
    //         // Зображення те саме, нічого не робимо
    //         return
    //     }

    //     // 3. Пошук відповідного файлу в метаданих
    //     const nameFolder = node?._meta?.img?.name || ''
    //     const sostList = node?._meta?.img?.sost || []
    //     const matchedState = sostList.find((item) => Math.round(Number(item.nom)) === currentNom)

    //     if (matchedState) {
    //         // 4. Формування URL
    //         const unitId = this.dom.unitSelect?.value
    //         const relativePath = `fragment/png/${unitId}?fileName=${nameFolder}/${matchedState.file}.png`
    //         const imgUrl = `${APP_CONFIG.getApiUrl(relativePath)}`

    //         // 5. Робота з елементом img (знаходження або створення)
    //         let imgEl = node

    //         // Якщо node — це не тег IMG, шукаємо або створюємо його всередині
    //         if (node.tagName !== 'IMG') {
    //             imgEl = node.querySelector('img') // Шукаємо перший img всередині контейнера

    //             if (!imgEl) {
    //                 imgEl = document.createElement('img')
    //                 imgEl.classList.add('node-image')
    //                 node.appendChild(imgEl) // Додаємо створений img в контейнер
    //             }
    //         }

    //         // 6. Оновлення джерела зображення
    //         imgEl.src = imgUrl

    //         // 7. Запам'ятовуємо поточний стан у властивостях контейнера
    //         node.lastSostNom = currentNom
    //     }
    // }

    async syncKFB(domNode, sensorValue, technologicalStatus) {
        if (!domNode || sensorValue === undefined || sensorValue === null) return

        // 1. ВИЗНАЧЕННЯ ГОЛОВНОГО КОНТЕЙНЕРА ДЛЯ ЗБЕРЕЖЕННЯ КЕШУ СТАНУ
        // Завжди прив'язуємо стан приладу до .schema-node, навіть якщо викликано з внутрішнього шару
        const rootSchemaNode = domNode.closest('.schema-node') || domNode

        // 2. ПРИВЕДЕННЯ ТА САНИТАЦІЯ ВХІДНИХ ДАНИХ (Захист від ком)
        const numericStatusValue = Number(technologicalStatus)
        const sanitizedStringValue = String(sensorValue).replace(',', '.')
        let targetStateCode = Math.round(Number(sanitizedStringValue))

        // 3. ЗАСТОСУВАННЯ ТЕХНОЛОГІЧНИХ БІЗНЕС-ПРАВИЛ ДЛЯ ВИЗНАЧЕННЯ КОДУ СТАНУ
        if (numericStatusValue === 255) {
            targetStateCode = 0 // Недостовірні дані з сервера
        } else if (numericStatusValue === 0 && targetStateCode === 0) {
            targetStateCode = -1 // Прилад вимкнено / знеструмлено
        }

        // Захист від некоректного парсингу
        if (isNaN(targetStateCode)) return

        // 4. ЗАХИСТ ВІД ПОВТОРНОГО ПЕРЕМАЛЬОВУВАННЯ (Кеш на рівні головної ноди)
        if (rootSchemaNode.lastSostNom === targetStateCode) {
            return // Графіка вже відповідає поточному стану, виходимо
        }

        // 5. ПОШУК ВІДПОВІДНОГО ФАЙЛУ В МЕТА-ДАННИХ
        const assetFolderName = rootSchemaNode?._meta?.img?.name || ''
        const stateConfigurationsList = rootSchemaNode?._meta?.img?.sost || []

        const matchedStateConfig = stateConfigurationsList.find((stateItem) => {
            return Math.round(Number(stateItem.nom)) === targetStateCode
        })

        if (matchedStateConfig) {
            // 6. ФОРМУВАННЯ РЕЗУЛЬТАТИВНОГО URL КАРТИНКИ
            const activeUnitId = this.dom.unitSelect?.value
            const queryParams = `fragments/png/${activeUnitId}?fileName=${assetFolderName}/${matchedStateConfig.file}.png`
            const generatedImageUrl = APP_CONFIG.getApiUrl(queryParams)

            // 7. СЕЛЕКЦІЯ АБО ГЕНЕРАЦІЯ ЕЛЕМЕНТА IMG В DOM
            let targetImageElement = domNode

            if (domNode.tagName !== 'IMG') {
                targetImageElement = domNode.querySelector('img')

                // Якщо всередині контейнера картинки ще немає, створюємо її динамічно
                if (!targetImageElement) {
                    targetImageElement = document.createElement('img')
                    targetImageElement.classList.add('node-image')
                    domNode.appendChild(targetImageElement)
                }
            }

            // 8. ОНОВЛЕННЯ ДЖЕРЕЛА ЗОБРАЖЕННЯ НА СЦЕНІ
            // targetImageElement.src = generatedImageUrl
            setProtectedResource(targetImageElement, generatedImageUrl)

            // 9. ЗАПИС КОДУ СТАНУ В КЕШ ГОЛОВНОЇ НОДИ
            rootSchemaNode.lastSostNom = targetStateCode
        }
    }

    // RadialChart (clock)
    async syncClock(domNode, sensorValue, technologicalStatus) {
        // 1. Валідація DOM-вузла на старті
        if (!domNode) return

        // 2. Нормалізація вхідних даних
        const numericStatusValue = Number(technologicalStatus)
        const sanitizedStringValue = String(sensorValue).replace(',', '.')
        const targetStateCode = Math.round(Number(sanitizedStringValue))

        // 3. Кешування: перевіряємо, чи змінилися значення від попереднього виклику
        const previousValue = domNode.dataset.lastValue
        const previousColorCode = domNode.dataset.lastColorCode

        // Якщо значення і статус збігаються з минулими — блокуємо рендеринг
        if (
            previousValue === sanitizedStringValue &&
            previousColorCode === String(targetStateCode)
        ) {
            return
        }

        // 4. Розрахунок кольору (виконується тільки якщо рендер дійсно потрібен)
        const statusColorValue =
            APP_CONFIG.STATUS_COLORS[targetStateCode] || APP_CONFIG.STATUS_COLORS.default

        // 5. Оновлення кешу в DOM-вузлі
        domNode.dataset.lastValue = sanitizedStringValue
        domNode.dataset.lastColorCode = String(targetStateCode)

        // 6. Виклик рендерингу
        RadialChart.render(domNode, Number(sanitizedStringValue), statusColorValue)
    }

    // 2d graf
    async syncGraph2D(domNode, sensorValue, currentTelemetryId = null, technologicalStatus = null) {
        // 1. Валідація DOM-вузла на старті
        if (!domNode) return

        // Шукаємо маркер всередині контейнера
        const pointer = domNode.querySelector('.graph-pointer')
        const rootSchemaNode = domNode.classList.contains('schema-node')
            ? domNode
            : domNode.closest('.schema-node')

        if (!pointer || !rootSchemaNode?._meta?.img) return
        const metadata = rootSchemaNode._meta.img

        // 2. Нормалізація вхідних даних
        const sanitizedStringValue = String(sensorValue ?? 0).replace(',', '.')
        const incomingNumericValue = parseFloat(sanitizedStringValue)
        const targetStateCode =
            technologicalStatus !== null ? Math.round(Number(technologicalStatus)) : null

        // Визначаємо, яка саме ось оновлюється
        const isXAxis = pointer.getAttribute('data-iden-x') === currentTelemetryId
        const isYAxis = pointer.getAttribute('data-iden-y') === currentTelemetryId

        if (!isXAxis && !isYAxis) return // Якщо ID не наш — ігноруємо

        // 3. Кешування окремо для кожної осі + для коду кольору
        if (isXAxis) {
            const previousX = pointer.dataset.lastX
            const previousColorX = pointer.dataset.lastColorX

            // Перериваємо виконання, якщо і значення осі X, і статус не змінилися
            if (previousX === sanitizedStringValue && previousColorX === String(targetStateCode)) {
                return
            }
            // Оновлюємо кеш для осі X
            pointer.dataset.lastX = sanitizedStringValue
            pointer.dataset.lastColorX = String(targetStateCode)
        }

        if (isYAxis) {
            const previousY = pointer.dataset.lastY
            const previousColorY = pointer.dataset.lastColorY

            // Перериваємо виконання, якщо і значення осі Y, і статус не змінилися
            if (previousY === sanitizedStringValue && previousColorY === String(targetStateCode)) {
                return
            }
            // Оновлюємо кеш для осі Y
            pointer.dataset.lastY = sanitizedStringValue
            pointer.dataset.lastColorY = String(targetStateCode)
        }

        // 4. Математичний розрахунок і оновлення координат у CSS
        if (isXAxis) {
            const minX = parseFloat(metadata.pred_n_x ?? 0)
            const maxX = parseFloat(metadata.pred_v_x ?? 100)
            const rangeX = maxX - minX

            let pctX = rangeX === 0 ? 0 : ((incomingNumericValue - minX) / rangeX) * 100
            pctX = Math.min(Math.max(pctX, 0), 100)

            if (metadata.napr_x === 'l') pctX = 100 - pctX

            pointer.style.setProperty('--x-pos', `${pctX}%`)
        }

        if (isYAxis) {
            const minY = parseFloat(metadata.pred_n_y ?? 0)
            const maxY = parseFloat(metadata.pred_v_y ?? 100)
            const rangeY = maxY - minY

            let pctY = rangeY === 0 ? 0 : ((incomingNumericValue - minY) / rangeY) * 100
            pctY = Math.min(Math.max(pctY, 0), 100)

            if (metadata.napr_y === 'v') pctY = 100 - pctY

            pointer.style.setProperty('--y-pos', `${pctY}%`)
        }

        // 5. Розрахунок та встановлення статусного кольору
        if (targetStateCode !== null && typeof APP_CONFIG !== 'undefined') {
            const statusColorValue =
                APP_CONFIG.STATUS_COLORS[targetStateCode] || APP_CONFIG.STATUS_COLORS.default

            // Передаємо в CSS-змінну, яка миттєво оновить колір точки та її підсвітку
            pointer.style.setProperty('--pointer-dynamic-color', statusColorValue)
        }
    }

    // --------------
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

//
class AdvancedSelect {
    constructor(containerElement, options = {}) {
        this.container = containerElement
        this.options = {
            multiple: false,
            searchable: true,
            data: [],
            placeholder: 'Оберіть елементи...',
            selectableParents: false,
            onChange: (selectedIds) => {},
            ...options,
        }

        this.state = {
            selected: new Set(),
            isOpen: false,
            searchQuery: '',
            expandedNodes: new Set(),
        }

        this.elements = {}
        this.init()
    }

    init() {
        this.container.classList.add('advanced-select')
        this.renderBase()
        this.bindEvents()
    }

    updateData(newData) {
        this.options.data = newData
        this.state.selected.clear()
        this.renderTags()
        this.renderDropdown()
    }

    getFlatData(data = this.options.data, flatList = new Map()) {
        for (const item of data) {
            flatList.set(item.id, item)
            if (item.children) {
                this.getFlatData(item.children, flatList)
            }
        }
        return flatList
    }

    renderBase() {
        this.container.innerHTML = `
            <div class="trigger">
                <div class="tags-container" style="display:flex; gap:6px; flex-wrap:wrap;"></div>
                ${this.options.searchable ? `<input type="text" class="search-input" placeholder="${this.options.placeholder}">` : ''}
            </div>
            <div class="advanced-dropdown"></div>
        `
        this.elements.trigger = this.container.querySelector('.trigger')
        this.elements.tags = this.container.querySelector('.tags-container')
        this.elements.input = this.container.querySelector('.search-input')
        this.elements.dropdown = this.container.querySelector('.advanced-dropdown')
    }

    bindEvents() {
        this.elements.trigger.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) return
            this.toggleDropdown(true)
            if (this.elements.input) this.elements.input.focus()
        })

        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.toggleDropdown(false)
            }
        })

        if (this.elements.input) {
            this.elements.input.addEventListener('input', (e) => {
                this.state.searchQuery = e.target.value.toLowerCase()
                this.renderDropdown()
            })
        }
    }

    toggleDropdown(forceOpen = null) {
        this.state.isOpen = forceOpen !== null ? forceOpen : !this.state.isOpen
        this.elements.dropdown.classList.toggle('open', this.state.isOpen)
        if (this.state.isOpen) this.renderDropdown()
    }

    toggleNode(id) {
        if (this.state.expandedNodes.has(id)) {
            this.state.expandedNodes.delete(id)
        } else {
            this.state.expandedNodes.add(id)
        }
        this.renderDropdown()
    }

    isNodeSelectable(node, hasChildren) {
        if (typeof node.selectable !== 'undefined') {
            return node.selectable
        }
        if (hasChildren && !this.options.selectableParents) {
            return false
        }
        return true
    }

    handleSelect(id, isRemoveAction = false) {
        if (this.options.multiple) {
            if (this.state.selected.has(id)) {
                this.state.selected.delete(id)
            } else {
                this.state.selected.add(id)
            }
        } else {
            // Якщо акція прийшла від хрестика (isRemoveAction === true) і цей елемент обрано — видаляємо його
            if (isRemoveAction && this.state.selected.has(id)) {
                this.state.selected.clear()
            } else {
                // Звичайний клік у дропдауні завжди примусово обирає елемент (навіть якщо він уже був обраний)
                this.state.selected.clear()
                this.state.selected.add(id)
            }

            this.toggleDropdown(false)
        }

        this.renderTags()
        this.renderDropdown()

        if (this.elements.input) {
            this.elements.input.value = ''
            this.state.searchQuery = ''
        }

        this._emitChange()
    }

    setValue(ids, triggerChange = true) {
        this.state.selected.clear()
        const idsArray = Array.isArray(ids) ? ids : [ids]
        idsArray.forEach((id) => this.state.selected.add(id))
        this.renderTags()
        this.renderDropdown()
        if (triggerChange) this._emitChange()
    }

    _emitChange() {
        const selectedArray = Array.from(this.state.selected)
        if (typeof this.options.onChange === 'function') {
            this.options.onChange(selectedArray)
        }
        const event = new CustomEvent('advancedSelect:change', {
            detail: { selectedIds: selectedArray, instance: this },
            bubbles: true,
        })
        this.container.dispatchEvent(event)
    }

    renderTags() {
        const flatData = this.getFlatData()
        this.elements.tags.innerHTML = ''

        if (this.state.selected.size === 0 && this.elements.input) {
            this.elements.input.placeholder = this.options.placeholder
            return
        }

        if (this.elements.input) this.elements.input.placeholder = ''

        this.state.selected.forEach((id) => {
            const item = flatData.get(id)
            if (!item) return

            const tag = document.createElement('div')
            tag.className = 'selected-tag'

            // Динамічно додаємо data-атрибути до тегу, якщо вони є
            if (item.dataset) {
                Object.assign(tag.dataset, item.dataset)
            }

            tag.innerHTML = `
                ${item.icon ? `<span class="tag-icon">${item.icon}</span>` : ''}
                ${item.label}
                <span class="remove-btn" data-id="${id}">×</span>
            `
            tag.querySelector('.remove-btn').addEventListener('click', (event) => {
                event.stopPropagation()
                this.handleSelect(id, true)
            })
            this.elements.tags.appendChild(tag)
        })
    }

    renderDropdown() {
        this.elements.dropdown.innerHTML = ''
        const fragment = this.buildNodes(this.options.data)

        if (fragment.childNodes.length === 0) {
            this.elements.dropdown.innerHTML = '<div class="no-results">Нічого не знайдено</div>'
        } else {
            this.elements.dropdown.appendChild(fragment)
        }
    }

    buildNodes(nodes) {
        const fragment = document.createDocumentFragment()

        nodes.forEach((node) => {
            const hasChildren = node.children && node.children.length > 0
            const matchesSearch = node.label.toLowerCase().includes(this.state.searchQuery)

            let childFragment = null
            let childrenMatch = false

            if (hasChildren) {
                childFragment = this.buildNodes(node.children)
                childrenMatch = childFragment.childNodes.length > 0
            }

            if (!matchesSearch && !childrenMatch && this.state.searchQuery !== '') return

            const isSelectable = this.isNodeSelectable(node, hasChildren)

            const itemDiv = document.createElement('div')
            const rowDiv = document.createElement('div')

            rowDiv.className = `item-row ${this.state.selected.has(node.id) ? 'selected' : ''} ${!isSelectable ? 'not-selectable' : ''}`

            if (node.dataset) {
                Object.assign(rowDiv.dataset, node.dataset)
            }

            const toggleIcon = hasChildren
                ? `<span class="toggle-icon">${this.state.expandedNodes.has(node.id) || this.state.searchQuery ? '▼' : '▶'}</span>`
                : '<span class="toggle-icon"></span>'

            rowDiv.innerHTML = `
                ${toggleIcon}
                ${node.icon ? `<span class="item-icon">${node.icon}</span>` : ''}
                <span class="item-label">${node.label}</span>
            `

            if (hasChildren) {
                const toggleBtn = rowDiv.querySelector('.toggle-icon')
                toggleBtn.addEventListener('click', (event) => {
                    event.stopPropagation()
                    this.toggleNode(node.id)
                })
            }

            // rowDiv.addEventListener('click', () => {
            //     if (isSelectable) {
            //         this.handleSelect(node.id)
            //     } else if (hasChildren) {
            //         this.toggleNode(node.id)
            //     }
            // })

            // Навішуємо обробник подій на весь рядок
            rowDiv.addEventListener('click', (event) => {
                // Якщо клікнули на іконку стрілочки (вона має свій окремий обробник або логіку)
                // або якщо цей вузол має дітей і його НЕ можна обрати як значення
                if (hasChildren && !isSelectable) {
                    event.stopPropagation()
                    this.toggleNode(node.id) // Замість вибору просто розгортаємо/згортаємо дерево
                    return
                }

                // Якщо вузол взагалі заблокований (наприклад, node.selectable === false) і не має дітей
                if (!isSelectable && !hasChildren) {
                    event.stopPropagation()
                    return // Нічого не робимо, ігноруємо клік
                }

                // Якщо вузол можна обирати — виконуємо стандартний select
                this.handleSelect(node.id)
            })

            itemDiv.appendChild(rowDiv)

            if (hasChildren && childFragment) {
                const childrenContainer = document.createElement('div')
                childrenContainer.className = 'children-container'
                if (this.state.expandedNodes.has(node.id) || this.state.searchQuery) {
                    childrenContainer.classList.add('expanded')
                }
                childrenContainer.appendChild(childFragment)
                itemDiv.appendChild(childrenContainer)
            }

            fragment.appendChild(itemDiv)
        })

        return fragment
    }
}

// Ініціалізація після завантаження DOM
document.addEventListener('DOMContentLoaded', async () => {
    // Безпечна ініціалізація віджета (якщо елемент #mainWidget існує)
    if (document.querySelector('#mainWidget')) {
        window.schemaApp = new SchemaModule('#mainWidget')
    }

    // Отримуємо елементи
    const selectUnit = document.getElementById('select-unit')
    const selectFragment = document.getElementById('select-fragment')
    const defaultFragment = document.getElementById('default-fragment')

    const fragmentsSelect = document.querySelector('#fragments-select')
    const fragmentsComponent = document.querySelector('#fragments-component')
    // ЗАХИСТ: Створюємо порожній масив, якщо компонент або дані відсутні
    const ALL_FRAGMENTS = fragmentsComponent?.dataset.fragments
        ? JSON.parse(fragmentsComponent.dataset.fragments)
        : []

    // 2. Одразу видаляємо атрибут з DOM
    if (fragmentsComponent) {
        delete fragmentsComponent.dataset.fragments // або fragmentsComponent.removeAttribute('data-fragments')
        // // Одразу видаляємо весь елемент з дерева DOM
        // fragmentsComponent?.remove()
    }

    let selectFragmentInstance = null
    let isSyncing = false // Прапорець для захисту від нескінченного циклу подій

    // // ЗАХИСТ: Отримуємо масив опцій ТІЛЬКИ якщо selectFragment існує в DOM
    // // Якщо елемента немає, створюється порожній масив, і подальший код не ламається
    // const fragmentOptions = selectFragment ? Array.from(selectFragment.options) : []

    // // ВИНЕСЕНА ЛОГІКА АДАПТАЦІЇ СПИСКУ
    // function adaptFragments() {
    //     // ЗАХИСТ: Якщо головні елементи відсутні, просто виходимо з функції
    //     if (!selectUnit || !selectFragment) return

    //     const selectedUnitId = selectUnit.value

    //     // Якщо блок НЕ обраний (дефолтний варіант)
    //     if (!selectedUnitId) {
    //         selectFragment.disabled = true
    //         selectFragment.value = ''

    //         // ЗАХИСТ: Використовуємо ?. на випадок, якщо defaultFragment немає в DOM
    //         if (defaultFragment) defaultFragment.textContent = 'Спочатку оберіть блок...'

    //         fragmentOptions.forEach((opt) => {
    //             if (!opt.disabled) opt.hidden = true
    //         })
    //         return
    //     }

    //     // Якщо блок обраний, налаштовуємо дефолтну опцію фрагмента
    //     if (defaultFragment) defaultFragment.textContent = 'Оберіть фрагмент...'

    //     // Фільтруємо опції
    //     fragmentOptions.forEach((option) => {
    //         if (option.disabled) return

    //         // ЗАХИСТ: ?.getAttribute поверне null замість помилки, якщо атрибута немає
    //         const dataUnit = option.getAttribute('data-unit')
    //         const allowedUnits = dataUnit ? dataUnit.split(' ') : []

    //         if (allowedUnits.includes(selectedUnitId)) {
    //             option.hidden = false // Показуємо відповідні
    //         } else {
    //             option.hidden = true // Ховаємо невідповідні
    //             // Якщо раніше був обраний фрагмент з іншого блоку, скидаємо його
    //             if (selectFragment.value === option.value) {
    //                 selectFragment.value = ''
    //             }
    //         }
    //     })

    //     // Активуємо список фрагментів
    //     selectFragment.disabled = false
    // }

    //
    function adaptFragments(selectedUnitId) {
        if (!selectFragmentInstance) return

        const currentUnitId = selectUnit ? selectUnit.value : null

        // Беремо значення прямо з першоджерела (селекту юнітів)
        const numericUnitId = selectedUnitId ? Number(selectedUnitId) : null

        // 1. ЗАПАМ'ЯТОВУЄМО, що зараз обрано в нативному селекті (наприклад, відновлене з URL)
        // Це критично важливо, щоб значення не загубилося під час оновлення плагіна
        const savedNativeValue = selectFragment ? selectFragment.value : ''

        // 2. Якщо блок НЕ обраний
        if (!numericUnitId || isNaN(numericUnitId)) {
            selectFragmentInstance.options.placeholder = 'Спочатку оберіть блок...'
            selectFragmentInstance.updateData([])
            selectFragmentInstance.container.classList.add('disabled')

            if (selectFragment && selectFragment.value !== '') {
                isSyncing = true
                selectFragment.value = ''
                selectFragment.dispatchEvent(new Event('change', { bubbles: true }))
                isSyncing = false
            }
            return
        }

        // 2. Якщо блок обраний
        selectFragmentInstance.container.classList.remove('disabled')
        selectFragmentInstance.options.placeholder = 'Оберіть фрагмент...'

        // 3. Фільтруємо
        // 3. РЕКУРСИВНА ФІЛЬТРАЦІЯ ДЕРЕВА (Захист пошуку)
        // Ця функція фільтрує і батьків, і дітей на будь-якій глибині,
        // створюючи абсолютно новий масив даних для плагіна.
        function filterTree(nodes) {
            return nodes
                .map((node) => {
                    // Робимо копію вузла, щоб не пошкодити оригінальний ALL_FRAGMENTS
                    const clonedNode = { ...node }

                    // Перевіряємо, чи підходить сам вузол під обраний юніт
                    const allowedUnits = clonedNode.dataset?.unitIds
                    let matchesUnit = false

                    if (Array.isArray(allowedUnits)) {
                        matchesUnit = allowedUnits.map(Number).includes(numericUnitId)
                    } else if (typeof allowedUnits === 'string') {
                        matchesUnit = allowedUnits.split(' ').map(Number).includes(numericUnitId)
                    }

                    // Якщо є діти, фільтруємо їх рекурсивно
                    if (clonedNode.children && clonedNode.children.length > 0) {
                        clonedNode.children = filterTree(clonedNode.children)
                    }

                    // Вузол залишається, якщо він сам підходить під юніт,
                    // АБО якщо хоча б один з його дітей підходить під цей юніт
                    const hasValidChildren = clonedNode.children && clonedNode.children.length > 0

                    if (matchesUnit || hasValidChildren) {
                        return clonedNode
                    }
                    return null
                })
                .filter((node) => node !== null) // Прибираємо порожні елементи
        }

        // Отримуємо відфільтроване дерево
        const filteredFragments = filterTree(ALL_FRAGMENTS)

        // 5. Оновлюємо дані в плагіні (тут плагін очищує свій внутрішній вибраний стан)
        selectFragmentInstance.updateData(filteredFragments)

        // 6. СИНХРОНІЗАЦІЯ ПІСЛЯ ОНОВЛЕННЯ ДАНИХ
        // Тепер, коли плагін вже має потрібні фрагменти у своєму списку,
        // ми беремо наше збережене значення (з кроку 1) і вставляємо його назад
        const valueToRestore = savedNativeValue || (selectFragment ? selectFragment.value : '')

        if (valueToRestore) {
            const flatFilteredData = selectFragmentInstance.getFlatData(filteredFragments)

            // Шукаємо сам об'єкт елемента в пласкому мапі (перевіряємо різні типи ключів)
            const matchedNode =
                flatFilteredData.get(valueToRestore) ||
                flatFilteredData.get(Number(valueToRestore)) ||
                flatFilteredData.get(String(valueToRestore))

            // Перевіряємо, чи елемент взагалі існує в новому дереві
            let isStillValid = !!matchedNode

            // ЗАХИСТ: Перевіряємо, чи дозволено цей елемент обирати
            if (isStillValid && matchedNode) {
                const hasChildren = matchedNode.children && matchedNode.children.length > 0

                // Викликаємо логіку вашого класу для визначення, чи є елемент selectable
                // Якщо у вашому класі цей метод доступний, використовуємо його, або дублюємо логіку:
                let isSelectable = true
                if (typeof matchedNode.selectable !== 'undefined') {
                    isSelectable = matchedNode.selectable
                } else if (hasChildren && !selectFragmentInstance.options.selectableParents) {
                    isSelectable = false
                }

                // Якщо елемент виявився "not-selectable", ми вважаємо його невалідним для вибору
                if (!isSelectable) {
                    isStillValid = false
                }
            }

            if (isStillValid) {
                isSyncing = true
                if (selectFragment) selectFragment.value = valueToRestore
                selectFragmentInstance.setValue([valueToRestore], false)
                isSyncing = false
            } else {
                // Якщо елемент не підходить під юніт АБО є неклікабельним (not-selectable) — скидаємо його
                isSyncing = true
                if (selectFragment) selectFragment.value = ''
                selectFragment?.dispatchEvent(new Event('change', { bubbles: true }))
                isSyncing = false
            }
        }
    }

    // 1. ВИКЛИК ПРИ ПЕРЕЗАВАНТАЖЕННІ СТОРІНКИ
    // Перевіряємо стан селекту відразу після завантаження DOM
    // adaptFragments()

    // 2. ВИКЛИК ПРИ ЗМІНІ ВИБОРУ КОРИСТУВАЧЕМ
    // ЗАХИСТ: Слухач подій додається тільки якщо selectUnit дійсно існує
    // selectUnit?.addEventListener('change', (event) => {
    //     // adaptFragments()
    //     adaptFragments(event.target.value)
    // })

    //
    // Ініціалізація плагіна
    if (fragmentsSelect) {
        selectFragmentInstance = new AdvancedSelect(fragmentsSelect, {
            multiple: false,
            searchable: true,
            placeholder: 'Фрагменти',
            data: [], // Стартуємо з порожнього, adaptFragments заповнить його
            selectableParents: false,
        })

        // НАПРЯМОК 1: Плагін ➔ Нативний селект (Ваша підписка з виправленням)
        document.addEventListener('advancedSelect:change', (event) => {
            if (isSyncing) return

            if (event.target === fragmentsSelect) {
                const { selectedIds } = event.detail
                const newValue = selectedIds[0] || ''

                if (selectFragment && selectFragment.value !== newValue) {
                    isSyncing = true
                    selectFragment.value = newValue

                    // Сповіщаємо старий код про зміну
                    selectFragment.dispatchEvent(new Event('change', { bubbles: true }))
                    isSyncing = false
                }
            }
        })
    }

    // НАПРЯМОК 2: Магія проксі (Перехоплюємо пряме присвоєння selectFragment.value = ...)
    if (selectFragment) {
        const originalDescriptor = Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            'value',
        )

        Object.defineProperty(selectFragment, 'value', {
            get: function () {
                return originalDescriptor.get.call(this)
            },
            set: function (newValue) {
                originalDescriptor.set.call(this, newValue)

                // Коли старий код міняє .value, ми миттєво оновлюємо плагін візуально
                if (!isSyncing && selectFragmentInstance) {
                    isSyncing = true
                    selectFragmentInstance.setValue(newValue ? [newValue] : [], false)
                    isSyncing = false
                }
            },
            configurable: true,
        })

        // На випадок, якщо старий код викликає подію change вручну
        selectFragment.addEventListener('change', () => {
            if (isSyncing || !selectFragmentInstance) return
            isSyncing = true
            selectFragmentInstance.setValue(
                selectFragment.value ? [selectFragment.value] : [],
                false,
            )
            isSyncing = false
        })
    }

    selectUnit?.addEventListener('change', (event) => {
        // adaptFragments()
        adaptFragments(event.target.value)

        //
        window.schemaApp.loadFragment()
    })

    // Важливо: запускаємо після того, як applySavedSettings() повністю відпрацює.
    // Затримка у 50-100мс гарантує, що браузер встигне розставити значення з sessionStorage.
    if (selectUnit) {
        adaptFragments(selectUnit.value)
    } else {
        adaptFragments(null)
    }
})
