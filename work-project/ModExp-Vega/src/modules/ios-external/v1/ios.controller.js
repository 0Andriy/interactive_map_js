import { CustomError } from '../../../common/utils/CustomError.js'

export class IosController {
    /**
     * @param {Object} service - Екземпляр класу IosService
     */
    constructor(service) {
        this.service = service
    }

    getValue = async (req, res, next) => {
        try {
            const { unitId } = req.params
            const { ids } = req.body

            const result = await this.service.getValue(unitId, ids)
            return res.status(200).json(result)
        } catch (error) {
            next(error)
        }
    }

    getInfo = async (req, res, next) => {
        try {
            const { unitId } = req.params
            const queryParams = req.query

            const result = await this.service.getInfo(unitId, queryParams)
            return res.status(200).json(result)
        } catch (error) {
            next(error)
        }
    }

    getParamsStateInfo = async (req, res, next) => {
        try {
            const { unitId } = req.params
            const { ids } = req.body

            const result = await this.service.getParamsStateInfo(unitId, ids)
            return res.status(200).json(result)
        } catch (error) {
            next(error)
        }
    }

    getArcValue = async (req, res, next) => {
        try {
            const { unitId } = req.params
            const { data } = req.body // Отримуємо з боді поле data

            // Своєчасно передаємо у сервіс масив під очікуваним ім'ям аргументу
            const result = await this.service.getArcValue(unitId, data)
            return res.status(200).json(result)
        } catch (error) {
            next(error)
        }
    }

    getValueEx = async (req, res, next) => {
        try {
            const { unitId } = req.params
            const { ids } = req.body

            const result = await this.service.getValueEx(unitId, ids)
            return res.status(200).json(result)
        } catch (error) {
            next(error)
        }
    }

    getFragmentPNGFile = async (req, res, next) => {
        try {
            const { unitId } = req.params
            const { fileName } = req.query

            if (!fileName) {
                throw new CustomError(
                    'FILE_NAME_REQUIRED',
                    400,
                    'Параметр fileName є обовʼязковим у query',
                )
            }

            // Безпечно розкодовуємо кирилицю
            const decodedFileName = decodeURIComponent(fileName)

            const binaryData = await this.service.getFragmentPNGFile(unitId, decodedFileName)
            const encodedName = encodeURIComponent(decodedFileName)

            // 2. Формуємо заголовок
            // filename*=UTF-8'' — для сучасних (браузер сам розкодує кирилицю)
            res.setHeader('Content-Type', 'application/octet-stream')
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`)
            return res.status(200).send(binaryData)
        } catch (error) {
            next(error)
        }
    }

    getFragmentXMLFile = async (req, res, next) => {
        try {
            const { unitId } = req.params
            const { fileName } = req.query

            if (!fileName) {
                throw new CustomError(
                    'FILE_NAME_REQUIRED',
                    400,
                    'Параметр fileName є обовʼязковим у query',
                )
            }

            // Безпечно розкодовуємо кирилицю
            const decodedFileName = decodeURIComponent(fileName)

            const result = await this.service.getFragmentXMLFile(unitId, decodedFileName)
            return res.status(200).json(result)
        } catch (error) {
            next(error)
        }
    }

    /**
     * @param {Request} req
     * @param {Response} res
     * @param {NextFunction} next
     */
    getFragmentsList = async (req, res, next) => {
        try {
            const { UnitNumber, FragmentIden } = req.query

            if (!UnitNumber) {
                throw new CustomError(
                    'UNIT_NUMBER_REQUIRED',
                    400,
                    'Параметр UnitNumber є обовʼязковим у query',
                )
            }

            // Безпечно розкодовуємо ідентифікатор фрагмента, якщо він переданий
            const decodedFragmentIden = FragmentIden ? decodeURIComponent(FragmentIden) : undefined

            const result = await this.service.getFragmentsList(UnitNumber, decodedFragmentIden)

            return res.status(200).json(result)
        } catch (error) {
            next(error)
        }
    }

    /**
     * @param {Request} req
     * @param {Response} res
     * @param {NextFunction} next
     */
    getFragmentsTree = async (req, res, next) => {
        try {
            const { UnitNumber } = req.query

            if (!UnitNumber) {
                throw new CustomError(
                    'UNIT_NUMBER_REQUIRED',
                    400,
                    'Параметр UnitNumber є обовʼязковим у query',
                )
            }

            const result = await this.service.getFragmentsTree(UnitNumber)

            return res.status(200).json(result)
        } catch (error) {
            next(error)
        }
    }

    /**
     * @param {Request} req
     * @param {Response} res
     * @param {NextFunction} next
     */
    getDiscretParamsState = async (req, res, next) => {
        try {
            const { UnitNumber } = req.query
            const { ids } = req.body

            if (!UnitNumber) {
                throw new CustomError(
                    'UNIT_NUMBER_REQUIRED',
                    400,
                    'Параметр UnitNumber є обовʼязковим у query',
                )
            }

            if (!ids) {
                throw new CustomError('IDS_REQUIRED', 400, 'Параметр ids є обовʼязковим у body')
            }

            const result = await this.service.getDiscretParamsState(UnitNumber, ids)

            return res.status(200).json(result)
        } catch (error) {
            next(error)
        }
    }

    getTabloTexts = async (req, res, next) => {
        try {
            const { unitId } = req.params
            const { tabloTextNumber } = req.query

            const result = await this.service.getTabloTexts(
                unitId,
                tabloTextNumber ? Number(tabloTextNumber) : undefined,
            )
            return res.status(200).json(result)
        } catch (error) {
            next(error)
        }
    }
}
