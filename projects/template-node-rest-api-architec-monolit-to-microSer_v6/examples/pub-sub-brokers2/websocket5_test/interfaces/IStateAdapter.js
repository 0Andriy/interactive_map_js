/**
 * @interface IStateAdapter
 * Описує методи керування розподіленим станом кластера.
 */
export class IStateAdapter {
    /**
     * @param {string} ns
     * @param {string} room
     * @param {string} socketId
     */
    async addUserToRoom(ns, room, socketId) {
        throw new Error('Not implemented')
    }

    /**
     * @param {string} ns
     * @param {string} room
     * @param {string} socketId
     */
    async removeUserFromRoom(ns, room, socketId) {
        throw new Error('Not implemented')
    }

    /**
     * @param {string} ns
     * @param {string} room
     * @returns {Promise<string[]>}
     */
    async getClientsInRoom(ns, room) {
        throw new Error('Not implemented')
    }

    /**
     * @param {string} ns
     * @param {string} socketId
     * @returns {Promise<string[]>}
     */
    async getUserRooms(ns, socketId) {
        throw new Error('Not implemented')
    }

    /**
     * @param {string} ns
     * @param {string} room
     * @param {string} socketId
     * @returns {boolean}
     */
    async isMember(ns, room, socketId) {
        throw new Error('Not implemented')
    }

    // /**
    //  * @param {string} ns
    //  * @returns {Promise<string[]>}
    //  */
    // async getClientsInNamespace(ns) {
    //     throw new Error('Not implemented')
    // }

    /**
     * @param {string} [ns]
     * @returns {Promise<string[]>}
     */
    async getAllConnections(ns = null) {
        throw new Error('Not implemented')
    }

    /** */
    async clearServerData() {
        throw new Error('Not implemented')
    }
}
