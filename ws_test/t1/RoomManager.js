export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomName -> Map(socketId -> SocketInstance)
    this.sids = new Map();  // socketId -> Set(roomName)
  }

  joinRoom(roomName, socket) {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Map());
    }
    this.rooms.get(roomName).set(socket.id, socket);

    if (!this.sids.has(socket.id)) {
      this.sids.set(socket.id, new Set());
    }
    this.sids.get(socket.id).add(roomName);
    console.log(`[RoomManager] Сокет ${socket.id} увійшов в ${roomName}`);
  }

  leaveRoom(roomName, socketId) {
    if (this.rooms.has(roomName)) {
      this.rooms.get(roomName).delete(socketId);
      if (this.rooms.get(roomName).size === 0) {
        this.rooms.delete(roomName);
      }
    }
    if (this.sids.has(socketId)) {
      this.sids.get(socketId).delete(roomName);
    }
  }

  clearSocketFromRooms(socketId) {
    const userRooms = this.sids.get(socketId);
    if (!userRooms) return;

    for (const roomName of userRooms) {
      const room = this.rooms.get(roomName);
      if (room) {
        room.delete(socketId);
        if (room.size === 0) this.rooms.delete(roomName);
      }
    }
    this.sids.delete(socketId);
    console.log(`[RoomManager] Очищено кімнати для сокета ${socketId}`);
  }

  // Реалізація розсилання (кімната, подія, дані, ігнорований сокет id)
  broadcastToRoom(roomName, event, data, skipSocketId = null) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    for (const [socketId, socket] of room.entries()) {
      if (socketId === skipSocketId) continue;
      socket.emit(event, data);
    }
  }

  // Отримання повної статистики для вашого API (Перше запитання)
  getStructureDump() {
    const dump = { rooms: {} };
    for (const [roomName, socketsMap] of this.rooms.entries()) {
      dump.rooms[roomName] = {
        usersCount: socketsMap.size,
        userIds: Array.from(socketsMap.keys())
      };
    }
    return dump;
  }
}
