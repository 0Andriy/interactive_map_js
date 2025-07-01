// server
import http from 'http'
import https from 'https'

import config from './config/config.js'
// api
import app from './app.js'
// Logger
import logger from './utils/logger.js'
// Database
import oracleDbManager from './db/OracleDbManager.js'
// JWT
import jwtManager from './utils/JwtManager.js'
// ws - WebSocket
// import WebSocketManager from './ws/WebSocketManager.js'
// import wsHandlers from './ws/handlers.js'

// model
import userModel from './api/v1/models/user.model.js'
import roleModel from './api/v1/models/role.model.js'
import userRoleModel from './api/v1/models/userRole.model.js'
import refreshTokenModel from './api/v1/models/refreshToken.model.js'

// <=======================================================================>
// <=========================  HTTP(S) server  ============================>
// <=======================================================================>
function createAndRunServer(protocol, port, host) {
    let server = null
    let serverType = null
    if (protocol === 'https') {
        server = https.createServer(config.getSslOptions(), app)
        serverType = 'HTTPS'
    } else {
        server = http.createServer(app)
        serverType = 'HTTP'
    }

    server.listen(port, host, () => {
        logger.info(
            `${serverType} Server is running => ${protocol}://${
                host || config.getLocalIp() || 'localhost'
            }:${port}`,
        )
    })

    // Додайте обробку помилок сервера
    server.on('error', (error) => {
        logger.error(`Error starting ${serverType} server on port ${port}:`, error)
        process.exit(1) // Завершити процес у разі критичної помилки
    })

    return server
}

// <=======================================================================>
// <=========================  Run App  ===================================>
// <=======================================================================>
async function initApp() {
    // <=======================================================================>
    // <================  Ініціалізація Oracle Database  ======================>
    // <=======================================================================>
    await oracleDbManager.initialize(config.oracleDB, logger)
    await oracleDbManager.connect('TEST')

    // відповюємо створення схеми
    // userModel.createTable('TEST')
    // roleModel.createTable('TEST')
    // userRoleModel.createTable('TEST')
    // refreshTokenModel.createTable('TEST')

    // <=======================================================================>
    // <========================  Ініціалізація JWT  ==========================>
    // <=======================================================================>
    config.tokenTypes.access.loader = async (keyId) => {
        return {
            key: 'access_key_placeholder', // Замініть на реальний ключ або логіку отримання
        }

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
        return {
            key: 'refresh_key_placeholder', // Замініть на реальний ключ або логіку отримання
        }

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

    await jwtManager.initialize(config, logger)
    console.log(await jwtManager.getKey('access'))
    console.log(await jwtManager.getKey('refresh'))

    const userPayload = {
        userId: '12345',
        role: 'admin',
        username: 'john.doe',
    }
    // const accessToken = await jwtManager.sign(userPayload, 'access', {
    //     iat: Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000),
    //     exp: Math.floor((Date.now() - 1 * 60 * 60 * 1000) / 1000),
    // })
    // console.log(1, accessToken)

    // const verifyToken = await jwtManager.verify(accessToken, 'access')
    // console.log(2, verifyToken)

    // <=======================================================================>
    // <===============  Ініціалізація HTTP Server  ===========================>
    // <=======================================================================>
    let httpServer = null,
        httpsServer = null,
        serversToListen = []

    if (config.server.useHttp) {
        httpServer = createAndRunServer('http', config.server.ports.http, config.server.host)
        serversToListen.push(httpServer)
    }

    // <=======================================================================>
    // <=================  Ініціалізація HTTPS Server  ========================>
    // <=======================================================================>
    if (config.server.useHttps) {
        httpsServer = createAndRunServer('https', config.server.ports.https, config.server.host)
        serversToListen.push(httpsServer)
    }

    // <=======================================================================>
    // <==============  Ініціалізація WebSocketManager  =======================>
    // <=======================================================================>
    const myAuthService = {
        verifyToken: async (token) => {
            console.log(`[AuthService] Перевірка токена: ${token}`)
            await new Promise((resolve) => setTimeout(resolve, 100)) // Імітуємо затримку
            if (token === 'valid_user_token_123') {
                return {
                    isValid: true,
                    payload: { userId: 'user_123', roles: ['admin', 'user'] },
                }
            }
            if (token === 'valid_user_token_456') {
                return { isValid: true, payload: { userId: 'user_456', roles: ['user'] } }
            }
            // Токен для тестування адміністративних функцій (наприклад, adminCommand)
            if (token === 'valid_admin_token_789') {
                return {
                    isValid: true,
                    payload: { userId: 'admin_789', roles: ['admin', 'user'] },
                }
            }
            return { isValid: false, payload: null }
        },
    }

    // const websocketManagerInstance = new WebSocketManager(httpServer, {
    //     config: config,
    //     logger: logger,
    //     dbService: wsHandlers,
    //     authService: myAuthService,
    // })

    // <=======================================================================>
    // <====================  Graceful shutdown  ==============================>
    // <=======================================================================>
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, async (receivedSignal) => {
            logger.info(`${receivedSignal} received. Shutting down gracefully...`)

            if (oracleDbManager) {
                await oracleDbManager.closeAllConnections()
                logger.info('Oracle DB connections closed.')
            }
            process.exit(0)
        })
    }
}

// <=======================================================================>
// <============================  Run   ===================================>
// <=======================================================================>
//
initApp()
