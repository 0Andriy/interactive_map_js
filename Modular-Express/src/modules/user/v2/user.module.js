import UserRepository from './user.repository.js'
import UserService from './user.service.js'
import UserController from './user.controller.js'
import UserRoutes from './user.routes.js'

class UserModule {
    /**
     * @param {Object} db - Oracle Connection
     * @param {RoleService} roleService - Експортований сервіс з RoleModule
     */
    static init(db, roleService) {
        const repository = new UserRepository(db)
        const service = new UserService(repository, roleService)
        const controller = new UserController(service)
        const routes = new UserRoutes(controller)

        return {
            router: routes.getRouter(),
            service: service,
        }
    }
}
export default UserModule
