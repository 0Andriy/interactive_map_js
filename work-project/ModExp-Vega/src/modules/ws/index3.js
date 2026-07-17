import http from 'http'
import { Server } from './core/Server.js'
import { initNsp } from './namespaces/chat.js'

const httpServer = http.createServer()
const io = new Server(httpServer, {
    basePath: '/ws',
    logger: console,
})

//
initNsp(io, console)

const PORT = 3000
httpServer.listen(PORT, () => {
    console.log(`Server 2026 active on port ${PORT}`)
})
