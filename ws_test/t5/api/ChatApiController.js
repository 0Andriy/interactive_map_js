export class ChatApiController {
  constructor(io, logger) {
    this.io = io;
    this.logger = logger;
  }

  sendSystemNotification(req, res) {
    const { roomName, message } = req.body;

    if (!roomName || !message) {
      return res.status(400).json({ error: 'roomName and message are required' });
    }

    this.logger.info(`HTTP запит на розсилку в кімнату "${roomName}": ${message}`, 'ChatApiController');

    const chatNsp = this.io.of('/chat');
    chatNsp.adapter.broadcast(roomName, {
      event: 'sys-alert',
      data: { text: message, timestamp: new Date() }
    });

    return res.json({ success: true, deliveredToRoom: roomName });
  }

  kickUser(req, res) {
    const { socketId } = req.params;
    const chatNsp = this.io.of('/chat');
    const socket = chatNsp.sockets.get(socketId);

    if (!socket) {
      this.logger.warn(`Спроба кікнути сокет ${socketId}, але його не знайдено на цій ноді`, 'ChatApiController');
      return res.status(404).json({ error: 'Socket not found on this instance' });
    }

    socket.terminate();
    return res.json({ success: true, kickedSocketId: socketId });
  }
}
