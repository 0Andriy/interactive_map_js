import { Router } from 'express'
import validate from '../middlewares/validation.middleware.js'
import { UserParamSchema, UserCreateSchema, UserSyncRolesSchema } from './user.validation.js'

class UserRoutes {
    constructor(controller) {
        this.controller = controller
        this.router = Router()
        this.initRoutes()
    }

    initRoutes() {
        this.router.get(
            '/:id',
            validate(UserParamSchema, 'params'),
            this.controller.getById.bind(this.controller),
        )

        this.router.post(
            '/',
            validate(UserCreateSchema, 'body'),
            this.controller.create.bind(this.controller),
        )

        this.router.put(
            '/:id/roles',
            validate(UserParamSchema, 'params'),
            validate(UserSyncRolesSchema, 'body'),
            this.controller.syncRoles.bind(this.controller),
        )

        this.router.delete(
            '/:id',
            validate(UserParamSchema, 'params'),
            this.controller.delete.bind(this.controller),
        )
    }

    getRouter() {
        return this.router
    }
}
export default UserRoutes
