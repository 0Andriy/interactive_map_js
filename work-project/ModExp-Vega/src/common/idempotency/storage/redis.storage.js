// import { createClient } from 'redis'

// export class RedisStorage {
//     constructor(redisUrl) {
//         this.client = createClient({ url: redisUrl })
//     }

//     async connect() {
//         await this.client.connect()
//     }

//     async set(key, value, options = {}) {
//         const redisOptions = {}
//         if (options.NX) redisOptions.NX = true
//         if (options.EX) redisOptions.EX = options.EX

//         return await this.client.set(key, value, redisOptions)
//     }

//     async get(key) {
//         return await this.client.get(key)
//     }

//     async del(key) {
//         return await this.client.del(key)
//     }
// }
