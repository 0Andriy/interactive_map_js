// role.routes.js
import { Router } from 'express'
import validate from '../middlewares/validation.middleware.js'
import { RoleIdParamSchema, RoleBodySchema } from './role.validation.js'

/**
 * Клас для конфігурації маршрутів модуля Role.
 */
class RoleRoutes {
    /**
     * @param {RoleController} controller - Екземпляр контролера (DI)
     */
    constructor(controller) {
        this.controller = controller
        this.router = Router()
        this.initRoutes()
    }

    /**
     * Ініціалізація маршрутів та прив'язка middleware
     */
    initRoutes() {
        this.router.get('/', this.controller.getAll.bind(this.controller))

        this.router.get(
            '/:id',
            validate(RoleIdParamSchema, 'params'),
            this.controller.getById.bind(this.controller),
        )

        this.router.post(
            '/',
            validate(RoleBodySchema, 'body'),
            this.controller.create.bind(this.controller),
        )

        this.router.put(
            '/:id',
            validate(RoleIdParamSchema, 'params'),
            validate(RoleBodySchema.partial(), 'body'),
            this.controller.update.bind(this.controller),
        )

        this.router.delete(
            '/:id',
            validate(RoleIdParamSchema, 'params'),
            this.controller.delete.bind(this.controller),
        )
    }

    /**
     * Повертає налаштований екземпляр Router
     * @returns {Router}
     */
    getRouter() {
        return this.router
    }
}

export default RoleRoutes

// // role.routes.js
// import { Router } from 'express'
// import { validate } from './validate.middleware.js'
// import { RoleIdParamSchema, CreateRoleSchema, UpdateRoleSchema } from './role.validation.js'

// /**
//  * Функція ініціалізації маршрутів для модуля Roles.
//  * @param {RoleController} roleController - Екземпляр контролера, переданий через DI.
//  * @returns {Router}
//  */
// const roleRoutes = (roleController) => {
//     const router = Router()

//     /**
//      * Маршрути для роботи з колекцією ролей
//      */
//     router.get('/', roleController.getAll.bind(roleController))
//     router.post('/', validate(CreateRoleSchema, 'body'), roleController.create.bind(roleController))

//     /**
//      * Маршрути для роботи з конкретною роллю
//      */
//     router.get(
//         '/:id',
//         validate(RoleIdParamSchema, 'params'),
//         roleController.getById.bind(roleController),
//     )
//     router.put(
//         '/:id',
//         validate(RoleIdParamSchema, 'params'),
//         validate(UpdateRoleSchema, 'body'),
//         roleController.update.bind(roleController),
//     )
//     router.delete(
//         '/:id',
//         validate(RoleIdParamSchema, 'params'),
//         roleController.delete.bind(roleController),
//     )

//     return router
// }

// export default roleRoutes
