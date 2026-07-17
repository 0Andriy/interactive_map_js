import { CustomError } from '../../../common/utils/CustomError.js'

export class IosService {
    /**
     * @param {Object} httpClient - Налаштований HTTP-клієнт для зв'язку із зовнішнім сервером
     * @param {Object|null} eventBus - Глобальна шина подій (опціонально)
     */
    constructor(httpClient, eventBus = null) {
        this.http = httpClient
        this.events = eventBus
    }

    /**
     * Приватний допоміжний метод для безпечного еміту подій у систему
     * @param {string} event - Назва події
     * @param {any} data - Дані для передачі
     * @private
     */
    #emitUpdate(event, data) {
        if (this.events?.emit) {
            this.events.emit(`ios:${event}`, data)
        }
    }

    /**
     * Отримання поточних значень параметрів
     * @param {string|number} unitId - Ідентифікатор об'єкта (UnitNumber)
     * @param {string[]} ids - Масив ідентифікаторів параметрів (наприклад: ["P1", "P2"])
     * @returns {Promise<string>} XML-строка з результатами
     */
    async getValue(unitId, ids) {
        try {
            if (!Array.isArray(ids)) {
                throw new CustomError('INVALID_IDS_FORMAT', 400, 'Параметр ids має бути масивом')
            }

            // Перетворюємо масив ["P1", "P2"] у рядок "P1\nP2"
            const rawBody = ids.join('\n')

            const result = await this.http.post('/GetParamsValue', rawBody, {
                query: {
                    UnitNumber: unitId,
                },
                responseType: 'xml',
            })

            this.#emitUpdate('value_loaded', result)
            return result
        } catch (error) {
            throw CustomError.from(error, 'IOS_GET_VALUE_FAILED')
        }
    }

    /**
     * Отримання метаданих та інформації про параметри об'єкта
     * @param {string|number} unitId - Ідентифікатор об'єкта (UnitNumber)
     * @param {Object} filterData - Додаткові фільтри для запиту інформації
     * @returns {Promise<string>} XML-строка з метаданими
     */
    async getInfo(unitId, filterData = {}) {
        try {
            const result = await this.http.get('/GetParamsInfo', {
                query: {
                    UnitNumber: unitId,
                    ...filterData,
                },
                responseType: 'xml',
            })

            this.#emitUpdate('info_loaded', result)
            return result
        } catch (error) {
            throw CustomError.from(error, 'IOS_GET_INFO_FAILED')
        }
    }

    /**
     * Отримання інформації про стан дискретних (двійкових) параметрів
     * @param {string|number} unitId - Ідентифікатор об'єкта (UnitNumber)
     * @param {string[]} ids - Масив ідентифікаторів дискретних параметрів
     * @returns {Promise<string>} XML-строка зі станами
     */
    async getParamsStateInfo(unitId, ids) {
        try {
            if (!Array.isArray(ids)) {
                throw new CustomError('INVALID_IDS_FORMAT', 400, 'Параметр ids має бути масивом')
            }

            // Перетворюємо масив ["P1", "P2"] у рядок "P1\nP2"
            const rawBody = ids.join('\n')

            const result = await this.http.post('/GetDiscretParamsStateInfo', rawBody, {
                query: {
                    UnitNumber: unitId,
                },
                responseType: 'xml',
            })

            this.#emitUpdate('state_info_loaded', result)
            return result
        } catch (error) {
            throw CustomError.from(error, 'IOS_GET_STATE_INFO_FAILED')
        }
    }

    /**
     * Отримання архівних значений параметрів за конкретні зліпки часу
     * @param {string|number} unitId - Ідентифікатор об'єкта (UnitNumber)
     * @param {Array<{id: string, time: string}>} dataPoints - Точки запиту архіву [{id: "P1", time: "20240525120000"}]
     * @returns {Promise<string>} XML-строка з архівом значень
     */
    async getArcValue(unitId, dataPoints) {
        try {
            if (!Array.isArray(dataPoints)) {
                throw new CustomError(
                    'INVALID_DATAPOINTS_FORMAT',
                    400,
                    'Параметр dataPoints має бути масивом обʼєктів',
                )
            }

            // Трансформація масиву у формат "ID=YYYYMMDDHHNNSS" з розділювачем нового рядка
            const rawBody = dataPoints.map((item) => `${item.id}=${item.time}`).join('\n')

            const result = await this.http.post('/GetParamsArchiveValue', rawBody, {
                query: {
                    UnitNumber: unitId,
                },
                responseType: 'xml',
            })

            this.#emitUpdate('archive_value_loaded', result)
            return result
        } catch (error) {
            throw CustomError.from(error, 'IOS_GET_ARCHIVE_VALUE_FAILED')
        }
    }

    /**
     * Розширене отримання значень параметрів (Extended)
     * @param {string|number} unitId - Ідентифікатор об'єкта (UnitNumber)
     * @param {string[]} ids - Масив ідентифікаторів параметрів
     * @returns {Promise<string>} XML-строка з розширеними даними
     */
    async getValueEx(unitId, ids) {
        try {
            if (!Array.isArray(ids)) {
                throw new CustomError('INVALID_IDS_FORMAT', 400, 'Параметр ids має бути масивом')
            }

            const rawBody = ids.join('\n')
            const result = await this.http.post('/GetParamsValueEx', rawBody, {
                query: {
                    UnitNumber: unitId,
                },
                responseType: 'xml',
            })

            this.#emitUpdate('value_ex_loaded', result)
            return result
        } catch (error) {
            throw CustomError.from(error, 'IOS_GET_VALUE_EX_FAILED')
        }
    }

    /**
     * Завантаження графічного фрагмента схеми або карти у форматі PNG
     * @param {string|number} unitId - Ідентифікатор об'єкта (UnitNumber)
     * @param {string} fileName - Назва файлу (наприклад: "scheme_main.png")
     * @returns {Promise<Buffer>} Бінарний буфер зображення
     */
    async getFragmentPNGFile(unitId, fileName) {
        try {
            if (!fileName) {
                throw new CustomError('FILE_NAME_REQUIRED', 400, 'Назва файлу є обовʼязковою')
            }

            const result = await this.http.getBuffer('/GetFragmentPNGFile', {
                query: {
                    UnitNumber: unitId,
                    PNGFileName: fileName,
                },
            })

            this.#emitUpdate('png_fragment_loaded', { unitId, fileName })
            return result
        } catch (error) {
            throw CustomError.from(error, 'IOS_GET_PNG_FRAGMENT_FAILED')
        }
    }

    /**
     * Завантаження фрагмента структури або конфігурації у форматі XML
     * @param {string|number} unitId - Ідентифікатор об'єкта (UnitNumber)
     * @param {string} fileName - Назва файлу (наприклад: "layout.xml")
     * @returns {Promise<string>} Контент XML файлу
     */
    async getFragmentXMLFile(unitId, fileName) {
        try {
            if (!fileName) {
                throw new CustomError('FILE_NAME_REQUIRED', 400, 'Назва файлу є обовʼязковою')
            }

            const result = await this.http.get('/GetFragmentXMLFile', {
                query: {
                    UnitNumber: unitId,
                    XMLFileName: fileName,
                },
            })

            this.#emitUpdate('xml_fragment_loaded', { unitId, fileName })
            return result
        } catch (error) {
            throw CustomError.from(error, 'IOS_GET_XML_FRAGMENT_FAILED')
        }
    }

    /**
     * Запит інформації про фрагменти
     * @param {string|number} unitId - Номер блока (UnitNumber)
     * @param {string} [fragmentIden] - Ідентифікатор фрагмента (необов'язковий)
     * @returns {Promise<any>} Інформація про фрагменти
     */
    async getFragmentsList(unitId, fragmentIden = null) {
        try {
            if (!unitId) {
                throw new CustomError('UNIT_NUMBER_REQUIRED', 400, 'Номер блока є обовʼязковим')
            }

            const queryParams = { UnitNumber: unitId }
            if (fragmentIden) {
                queryParams.FragmentIden = fragmentIden
            }

            const result = await this.http.get('/GetFragmentsList', {
                query: queryParams,
                responseType: 'xml',
            })

            this.#emitUpdate('fragments_list_loaded', { unitId, fragmentIden })
            return result
        } catch (error) {
            throw CustomError.from(error, 'IOS_GET_FRAGMENTS_LIST_FAILED')
        }
    }

    /**
     * Запит інформації про дерево фрагментів
     * @param {string|number} unitId - Номер блока (UnitNumber)
     * @returns {Promise<any>} Інформація про дерево фрагментів
     */
    async getFragmentsTree(unitId) {
        try {
            if (!unitId) {
                throw new CustomError('UNIT_NUMBER_REQUIRED', 400, 'Номер блока є обовʼязковим')
            }

            const result = await this.http.get('/GetFragmentsTree', {
                query: {
                    UnitNumber: unitId,
                },
                responseType: 'xml',
            })

            this.#emitUpdate('fragments_tree_loaded', { unitId })
            return result
        } catch (error) {
            throw CustomError.from(error, 'IOS_GET_FRAGMENTS_TREE_FAILED')
        }
    }

    /**
     * Запит інформації про поточний стан набору дискретних параметрів ІОС
     * @param {string|number} unitId - Номер блока (UnitNumber)
     * @param {string[]} lines - Масив рядків у форматі Iden1[,Iden2[,Iden3]][=ALG]
     * @returns {Promise<string>} XML-строка з даними стану
     */
    async getDiscretParamsState(unitId, lines) {
        try {
            if (!unitId) {
                throw new CustomError('UNIT_NUMBER_REQUIRED', 400, 'Номер блока є обовʼязковим')
            }
            if (!Array.isArray(lines) || lines.length === 0) {
                throw new CustomError(
                    'INVALID_LINES_FORMAT',
                    400,
                    'Параметр lines має бути заповненим масивом',
                )
            }

            const rawBody = lines.join('\n')
            const result = await this.http.post('/GetDiscretParamsState', rawBody, {
                query: {
                    UnitNumber: unitId,
                },
                responseType: 'xml',
            })

            this.#emitUpdate('discret_params_state_loaded', { unitId })
            return result
        } catch (error) {
            throw CustomError.from(error, 'IOS_GET_DISCRET_PARAMS_STATE_FAILED')
        }
    }

    /**
     * Отримання інформації про тексти табло фрагментів
     * @param {string|number} unitId - Номер пристрою (UnitNumber)
     * @param {number} [tabloTextNumber] - Номер текста табло (TabloTextNumber)
     * @returns {Promise<string>} XML-строка з текстами табло
     */
    async getTabloTexts(unitId, tabloTextNumber) {
        try {
            const queryParams = { UnitNumber: unitId }

            if (tabloTextNumber !== undefined && tabloTextNumber !== null) {
                queryParams.TabloTextNumber = tabloTextNumber
            }

            const result = await this.http.get('/GetTabloTexts', {
                query: queryParams,
                responseType: 'xml',
            })

            this.#emitUpdate('tablo_texts_loaded', result)
            return result
        } catch (error) {
            throw CustomError.from(error, 'IOS_GET_TABLO_TEXTS_FAILED')
        }
    }
}
