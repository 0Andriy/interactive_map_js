// chatHandlers.js

const onConnect = async (namespace, userId) => {
    const room = await namespace.getOrCreateRoom('general')
    await room.addUser(userId)
    namespace.logger.info(`User '${userId}' was automatically joined to 'general' room.`)
}

const onMessage = async (namespace, userId, message, defaultHandled) => {
    // Якщо дефолтний обробник спрацював, ми можемо додати додаткову логіку.
    if (defaultHandled) {
        switch (message.type) {
            case 'joinRoom': {
                const room = namespace.getRoom(message.roomId)
                if (room && !room.hasScheduledTask('cleanupTask')) {
                    namespace.logger.info(`Adding 'cleanupTask' to room '${room.id}' on join.`)

                    room.addScheduledTask(
                        'cleanupTask',
                        async (taskParams) => {
                            const currentUsers = await room.getUsers()
                            if (currentUsers.length === 0) {
                                namespace.logger.info(
                                    `'cleanupTask' for room '${room.id}' detected no users. Stopping task.`,
                                )
                                await taskParams.room.removeScheduledTask('cleanupTask')
                            }
                        },
                        { interval: 5000 },
                        {},
                    )
                }
                break
            }
        }
    } else {
        switch (message.type) {
            default:
                namespace.logger.warn(
                    `Namespace '${namespace.id}': Unknown message type '${message.type}' from user '${userId}'.`,
                )
                break
        }
    }
}

const onDisconnect = async (namespace, userId) => {
    namespace.logger.debug(`Custom onDisconnect handler called for user '${userId}'.`)
}

export const chatHandlers = {
    onConnect,
    onMessage,
    onDisconnect,
}
