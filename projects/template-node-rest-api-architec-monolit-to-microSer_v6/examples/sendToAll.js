/**
     * Відправляє дані всім користувачам у кімнаті, з можливістю виключення.
     * @param {string} eventName - Назва події для клієнта.
     * @param {object} payload - Дані для відправки.
     * @param {object} [options={}] - Додаткові налаштування для відправки повідомлення.
     * @param {string[]} [excludeUsers=[]] - Масив ідентифікаторів користувачів, яких потрібно виключити з розсилки.
     * @returns {Promise<void>}
     */
    async sendToAll(eventName, payload, options = {}, excludeUsers = []) {
        try {
            const allUsers = await this.getUsers()
            const targetUsers = allUsers.filter((userId) => !excludeUsers.includes(userId))

            if (targetUsers.length > 0) {
                this.#wsAdapter.sendToUsers(targetUsers, eventName, payload, options)
                this.#logger.debug(
                    `Sent event '${eventName}' to ${targetUsers.length} users in room '${
                        this.#id
                    }'. Excluded ${excludeUsers.length} users.`,
                )
            } else {
                this.#logger.warn(
                    `No users to send event '${eventName}' to in room '${
                        this.#id
                    }' after exclusion.`,
                )
            }
        } catch (error) {
            this.#logger.error(`Failed to send event '${eventName}' to room '${this.#id}':`, error)
        }
    }
