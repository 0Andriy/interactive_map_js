import logger from '../../../shared/utils/logger/index.js'
import * as userInternalClient from '../clients/userInternalClient.js' // Внутрішній клієнт для User

export class AuthService {
    constructor() {
        this.logger = logger.getLoggerForService('AuthService')
    }
}
