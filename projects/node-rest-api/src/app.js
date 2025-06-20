import config from './config/config.js'

import http from 'http'
import https from 'https'
import express from 'express'

import cors from 'cors'
import cookieParser from 'cookie-parser'
import compression from 'compression'

// Logger
import logger from './utils/logger.js'
// Database
import OracleDbManager from './db/OracleDbManager.js'
// JWT
import JwtManager from './utils/JwtManager.js'
// // Swagger
// import swaggerDocs from './swagger.js'

// Middleware (проміжне ПЗ)
import errorHandling from './middleware/globalErrorHandler.js'
// import { requestContextMiddleware } from './middleware/requestContext.js'
// import morganMiddleware from './middleware/morganMiddleware.js'
// import forceHttps from './middleware/forceHttps.js'

// // Endpoints (роутери)
// import basicRouter from '../routes/basic/basic.route.js'
// import authRouter from '../routes/auth/auth.route.js'

// <=======================================================================>
// <=======================================================================>
// <=======================================================================>

// Створюємо екземпляр додатку
const app = express()

// <=======================================================================>
// <==========================  Middleware ===============================>
// <=======================================================================>

// // Middleware для додавання requestId і correlationId
// app.use(requestContextMiddleware)
// // Підключає middleware для стиснення відповідей (зменшує обсяг переданих даних)
// app.use(compression(config.getCompressionOptions()))
// // logger http request
// app.use(morganMiddleware)
// // redirect http to https
// app.use(forceHttps(config.server.useHttps))
// // To support JSON-encoded bodies -- Для того щоб Express розумів JSON в request.body
// app.use(express.json())
// // To support URL-encoded bodies
// app.use(express.urlencoded({ extended: true }))
// app.use(cors(config.getCorsOptions()))
// app.use(cookieParser())

// <=======================================================================>
// <==========================    Static files    =========================>
// <=======================================================================>

// Додаємо роздачу статичних файлів (зображення, стилі, скрипти) з папки 'public'
async function addStaticFiles(path = 'public') {
    // Шлях до папки зі статичними файлами
    const staticFolderPath = path.resolve(path)
    try {
        // Перевіряємо доступність папки
        await fs.access(staticFolderPath)

        // Якщо папка існує, налаштовуємо роздачу статичних файлів
        app.use(express.static(staticFolderPath))
        console.log(`Serving static files from: ${staticFolderPath}`)
    } catch (error) {
        // Якщо папка не існує, додаємо заглушку
        app.use((req, res) => {
            res.status(404).json({
                error: 'Static folder not found',
                message: 'The requested static resource could not be served.',
            })
        })
        console.log('Static folder not found. Using fallback.')
    }

    // or

    // if (fs.existsSync(staticFolderPath)) {
    //     app.use(express.static(staticFolderPath))
    // } else {
    //     console.error(`Static folder "${staticFolderPath}" does not exist.`)
    // }
}
// addStaticFiles("../public")

// <=======================================================================>
// <========================== Routes (endpoints) =========================>
// <=======================================================================>

// default
// app.use('/api/v1/', basicRouter)

// auth
// app.use('/api/v1/auth', authRouter)

// ! Test
app.get('/', (req, res) => {
    logger.info('Викликано: app.get("/")')
    const data = 'This is a post about how to use the compression package'.repeat(10000)

    res.send(data)
})

// <=======================================================================>
// <================   404 - Not Found endpoint  ==========================>
// <=======================================================================>

// Обробка неіснуючих маршрутів (404) через генерацію помилки
app.use((req, res, next) => {
    logger.info('Викликано: 404')
    const error = new Error('Неіснуючий endpoint')
    error.status = 404
    next(error) // Перехід до наступного middleware (обробник помилок)
})

// <=======================================================================>
// <================  Error handling middleware  ==========================>
// <=======================================================================>
app.use(errorHandling)

// <=======================================================================>
// <=========================  http server  ===============================>
// <=======================================================================>
function initHttpServer() {
    // Create servers
    const httpServer = http.createServer(app)

    // Servers running
    httpServer.listen(config.server.ports.http, config.server.host, () => {
        const { address, port } = httpServer.address()

        logger.info(`Server is running => http://${config.server.host}:${port}`)
        // swaggerDocs(app, port, config.server.host)
    })
}

// <=======================================================================>
// <=========================  https server  ==============================>
// <=======================================================================>
function initHttpsServer() {
    // Create servers
    const httpsServer = https.createServer(config.getSslOptions(), app)

    // Servers running
    httpsServer.listen(config.server.ports.https, config.server.host, () => {
        const { address, port } = httpsServer.address()

        logger.info(`Server is running => https://${config.server.host}:${port}`)
        // swaggerDocs(app, port, config.server.host)
    })
}

// <=======================================================================>
// <=========================  Run App  ===================================>
// <=======================================================================>
async function initApp() {
    // <=======================================================================>
    // <======================  Connect to database  ==========================>
    // <=======================================================================>
    const oracleDbManager = new OracleDbManager(config.oracleDB, logger)
    await oracleDbManager.connect('TEST')

    // <=======================================================================>
    // <==================  Create and settings JWT  =========================>
    // <=======================================================================>
    config.tokenTypes.access.loader = async (keyId) => {
        const sqlScript = `begin
                            :key := BASE_OBJ.SSO_PKG.get_s_key_f(1,1);
                        end;`
        const sqlParams = {
            key: { dir: oracleDbManager.oracledb.BIND_OUT, type: oracleDbManager.oracledb.STRING },
        }

        const result = (await oracleDbManager.execute('TEST', sqlScript, sqlParams)).outBinds.key
        return {
            key: result,
        }
    }

    config.tokenTypes.refresh.loader = async (keyId) => {
        const sqlScript = `begin
                            :key := BASE_OBJ.SSO_PKG.get_s_key_f(2,2);
                        end;`
        const sqlParams = {
            key: { dir: oracleDbManager.oracledb.BIND_OUT, type: oracleDbManager.oracledb.STRING },
        }

        const result = (await oracleDbManager.execute('TEST', sqlScript, sqlParams)).outBinds.key
        return {
            key: result,
        }
    }

    const jwtManager = new JwtManager(config.tokenTypes, logger)
    // console.log(await jwtManager.getKey('access'))
    // console.log(await jwtManager.getKey('refresh'))

    const userPayload = {
        userId: '12345',
        role: 'admin',
        username: 'john.doe',
    }
    const accessToken = await jwtManager.sign(userPayload, 'access', {
        iat: Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000),
        exp: Math.floor((Date.now() - 1 * 60 * 60 * 1000) / 1000),
    })
    console.log(1, accessToken)

    const verifyToken = await jwtManager.verify(accessToken, 'access')
    console.log(2, verifyToken)

    // <=======================================================================>
    // <===============  Run and settings HTTP Server  ========================>
    // <=======================================================================>
    if (config.server.useHttp) {
        initHttpServer()
    }

    // <=======================================================================>
    // <==============  Run and settings HTTPS Server  ========================>
    // <=======================================================================>
    if (config.server.useHttps) {
        initHttpsServer()
    }

    process.on('SIGINT', async () => {
        await oracleDbManager.closeAllConnections()
        process.exit(0)
    })
}

// <=======================================================================>
// <============================  Run   ===================================>
// <=======================================================================>
//
initApp()
