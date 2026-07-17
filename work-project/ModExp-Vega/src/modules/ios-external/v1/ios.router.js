import { Router } from 'express'

import { smartCache, clearDiskCache } from './cacheService.js'
// await clearDiskCache()

/**
 * @swagger
 * tags:
 *   name: IOS
 *   description: Операції зі стороннім SCADA API (XML/JSON/Binary-Транспорт)
 */
export class IosRouter {
    /**
     * @param {Object} iosController - Контролер HTTP-шару для модуля IOS
     * @param {Object} authGuard - AuthGuard із модуля Auth
     */
    constructor(iosController, authGuard) {
        this.router = Router()
        this.controller = iosController
        this.guard = authGuard
        this._initRoutes()
    }

    _initRoutes() {
        /**
         * @swagger
         * /api/v1/ios/value/{unitId}:
         *   post:
         *     summary: Поточні значення параметрів
         *     tags: [IOS]
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: path
         *         name: unitId
         *         required: true
         *         schema:
         *           type: string
         *         description: Унікальний ідентифікатор юніта (UnitNumber)
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required: [ids]
         *             properties:
         *               ids:
         *                 type: array
         *                 items: { type: string }
         *                 example: ["Param1", "Param2", "Param3"]
         *     responses:
         *       200:
         *         description: Успішне отримання даних
         *       401:
         *         description: Токен відсутній або сесію в Oracle вичерпано
         */
        this.router.post('/value/:unitId', this.guard.authenticateApi, this.controller.getValue)

        /**
         * @swagger
         * /api/v1/ios/info/{unitId}:
         *   get:
         *     summary: Запит інформації про статичні характеристики параметрів ІОС
         *     tags: [IOS]
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: path
         *         name: unitId
         *         required: true
         *         schema:
         *           type: string
         *         description: Номер об'єкта (UnitNumber)
         *       - in: query
         *         name: paramType
         *         required: false
         *         schema:
         *           type: string
         *           enum: [A, D, D1, D2]
         *         description: >
         *           Тип параметра (ParamType). Допустимі варіанти:
         *           "A" – аналогові, "D" – дискретні, "D1" – однопозиційні дискретні, "D2" – двопозиційні дискретні.
         *       - in: query
         *         name: paramIdentMask
         *         required: false
         *         schema:
         *           type: string
         *         description: >
         *           Маска ідентифікатора параметрів (ParamIdenMask / ParamIdentMask).
         *           Дозволяє символи: "*" – будь-яка послідовність (включно з пустою), "?" – один будь-який символ.
         *           Можна комбінувати кілька масок через кому ",".
         *       - in: query
         *         name: paramMasMask
         *         required: false
         *         schema:
         *           type: string
         *         description: >
         *           Маска масива параметрів (ParamMasMask).
         *           Дозволяє символи: "*" – будь-яка послідовність (включно з пустою), "?" – один будь-який символ.
         *           Можна комбінувати кілька масок через кому ",".
         *     responses:
         *       200:
         *         description: Успішна відповідь зі статичними характеристиками параметрів
         *       401:
         *         description: Неавторизований запит
         */
        this.router.get('/info/:unitId', this.guard.authenticateApi, this.controller.getInfo)

        /**
         * @swagger
         * /api/v1/ios/state-info/{unitId}:
         *   post:
         *     summary: Стан дискретних параметрів
         *     tags: [IOS]
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: path
         *         name: unitId
         *         required: true
         *         schema: { type: string }
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required: [ids]
         *             properties:
         *               ids:
         *                 type: array
         *                 items: { type: string }
         *                 example: ["Param1", "Param2", "Param3"]
         *     responses:
         *       200:
         *         description: Дані про стани дискретів
         */
        this.router.post(
            '/state-info/:unitId',
            this.guard.authenticateApi,
            this.controller.getParamsStateInfo,
        )

        /**
         * @swagger
         * /api/v1/ios/archive/{unitId}:
         *   post:
         *     summary: Отримання архівних значень (Шлюз)
         *     description: Приймає масив датчиків та часових міток, трансформує і записує дані з джерела.
         *     tags: [IOS]
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: path
         *         name: unitId
         *         required: true
         *         description: Номер енергоблока. Ціле число
         *         schema:
         *           type: integer
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required: [data]
         *             properties:
         *               data:
         *                 type: array
         *                 description: Список датчиків та часових міток
         *                 items:
         *                   type: object
         *                   required: [id, time]
         *                   properties:
         *                     id:
         *                       type: string
         *                       example: "P123"
         *                     time:
         *                       type: string
         *                       description: Дата та час у форматі yyyymmddhhnnss.
         *                       example: "20260525143000"
         *     responses:
         *       200:
         *         description: Масив архівних значень параметрів
         */
        this.router.post(
            '/archive/:unitId',
            this.guard.authenticateApi,
            this.controller.getArcValue,
        )

        /**
         * @swagger
         * /api/v1/ios/value-ex/{unitId}:
         *   post:
         *     summary: Розширені значення параметрів
         *     tags: [IOS]
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: path
         *         name: unitId
         *         required: true
         *         schema: { type: string }
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required: [ids]
         *             properties:
         *               ids:
         *                 type: array
         *                 items: { type: string }
         *                 example: ["Param1", "Param2", "Param3"]
         *     responses:
         *       200:
         *         description: Розширені JSON дані
         */
        this.router.post(
            '/value-ex/:unitId',
            this.guard.authenticateApi,
            this.controller.getValueEx,
        )

        /**
         * @swagger
         * /api/v1/ios/fragments/png/{unitId}:
         *   get:
         *     summary: Отримати PNG зображення фрагмента карти/схеми
         *     tags: [IOS]
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: path
         *         name: unitId
         *         required: true
         *         schema: { type: string }
         *       - in: query
         *         name: fileName
         *         required: true
         *         schema: { type: string }
         *     responses:
         *       200:
         *         description: Бінарний буфер PNG зображення
         *         content:
         *           image/png:
         *             schema: { type: string, format: binary }
         *
         */
        this.router.get(
            '/fragments/png/:unitId',
            this.guard.authenticateApi,
            smartCache(60 * 60 * 12),
            this.controller.getFragmentPNGFile,
        )

        /**
         * @swagger
         * /api/v1/ios/fragments/xml/{unitId}:
         *   get:
         *     summary: Отримати XML/JSON структуру конфігурації фрагмента
         *     tags: [IOS]
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: path
         *         name: unitId
         *         required: true
         *         schema: { type: string }
         *       - in: query
         *         name: fileName
         *         required: true
         *         schema: { type: string }
         *     responses:
         *       200:
         *         description: Об'єкт з описом та розкладкою елементів фрагменту
         *
         */
        this.router.get(
            '/fragments/xml/:unitId',
            this.guard.authenticateApi,
            smartCache(60 * 60 * 12),
            this.controller.getFragmentXMLFile,
        )

        /**
         * @swagger
         * /api/v1/ios/fragments/list:
         *   get:
         *     summary: Запит інформації про фрагменти
         *     description: Генерується динамічно. Повертає інформацію по одному фрагменту (якщо задано FragmentIden) або по всіх фрагментах блока.
         *     tags: [IOS]
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: query
         *         name: UnitNumber
         *         required: true
         *         schema:
         *           type: integer
         *         description: Номер блока. Обов'язковий параметр.
         *       - in: query
         *         name: FragmentIden
         *         required: false
         *         schema:
         *           type: string
         *         description: Ідентифікатор фрагмента (підтримує URL-encode). Якщо не вказано — повертає всі фрагменти.
         *     responses:
         *       200:
         *         description: Успішне отримання інформації про фрагменти
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *       400:
         *         description: Помилка валідації (відсутній обов'язковий параметр UnitNumber)
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 code:
         *                   type: string
         *                   example: UNIT_NUMBER_REQUIRED
         *                 message:
         *                   type: string
         *                   example: Параметр UnitNumber є обовʼязковим у query
         */
        this.router.get(
            '/fragments/list',
            this.guard.authenticateApi,
            smartCache(60 * 60 * 12),
            this.controller.getFragmentsList,
        )

        /**
         * @swagger
         * /api/v1/ios/fragments/tree:
         *   get:
         *     summary: Запит інформації про дерево фрагментов
         *     description: Генерується динамічно. Повертає деревоподібну структуру фрагментів для заданого блока.
         *     tags: [IOS]
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: query
         *         name: UnitNumber
         *         required: true
         *         schema:
         *           type: integer
         *         description: Номер блока. Обов'язковий параметр.
         *     responses:
         *       200:
         *         description: Успішне отримання дерева фрагментів
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *       400:
         *         description: Помилка валідації (відсутній обов'язковий параметр UnitNumber)
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 code:
         *                   type: string
         *                   example: UNIT_NUMBER_REQUIRED
         *                 message:
         *                   type: string
         *                   example: Параметр UnitNumber є обовʼязковим у query
         */
        this.router.get(
            '/fragments/tree',
            this.guard.authenticateApi,
            smartCache(60 * 60 * 12),
            this.controller.getFragmentsTree,
        )

        /**
         * @swagger
         * /api/v1/ios/fragments/params-state:
         *   post:
         *     summary: Запит інформації про поточний стан набору дискретних параметрів
         *     description: Генерується динамічно з використанням типу запиту POST.
         *     tags: [IOS]
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: query
         *         name: UnitNumber
         *         required: true
         *         schema:
         *           type: integer
         *         description: Номер блока. Обов'язковий параметр.
         *     requestBody:
         *       required: true
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             required:
         *               - ids
         *             properties:
         *               ids:
         *                 type: array
         *                 items:
         *                   type: string
         *                 example: ["Iden1=ALG", "Iden1,Iden2", "Iden1,Iden2,Iden3=ALG"]
         *     responses:
         *       200:
         *         description: Успішне отримання стану дискретних параметрів
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *       400:
         *         description: Помилка валідації (відсутні обов'язкові параметри або неправильний формат)
         *         content:
         *           application/json:
         *             schema:
         *               type: object
         *               properties:
         *                 code:
         *                   type: string
         *                   example: UNIT_NUMBER_REQUIRED
         *                 message:
         *                   type: string
         *                   example: Параметр UnitNumber є обовʼязковим у query
         */
        this.router.post(
            '/fragments/params-state',
            this.guard.authenticateApi,
            this.controller.getDiscretParamsState,
        )

        /**
         * @swagger
         * /api/v1/ios/fragments/tablo-texts/{unitId}:
         *   get:
         *     summary: Інформація про тексти табло фрагментів
         *     tags: [IOS]
         *     security:
         *       - BearerAuth: []
         *     parameters:
         *       - in: path
         *         name: unitId
         *         required: true
         *         schema: { type: string }
         *         description: Номер об'єкта (UnitNumber)
         *       - in: query
         *         name: tabloTextNumber
         *         required: false
         *         schema: { type: integer }
         *         description: Номер текста табло (якщо >= 0 — конкретний текст, інакше — всі)
         *     responses:
         *       200:
         *         description: XML дані з текстами табло
         */
        this.router.get(
            '/fragments/tablo-texts/:unitId',
            this.guard.authenticateApi,
            smartCache(60 * 60 * 12),
            this.controller.getTabloTexts,
        )
    }

    /**
     * Повертає налаштований екземпляр Express роутера
     * @returns {Router}
     */
    getRouter() {
        return this.router
    }
}
