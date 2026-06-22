import { BaseAdapter } from './BaseAdapter.js';

export class InMemoryAdapter extends BaseAdapter {
  constructor(nspName) {
    super(nspName);
    this.rooms = new Map();       // roomName -> Map(socketId -> Socket)
    this.sids = new Map();        // socketId -> Set(roomName)
    this.graceTimers = new Map(); // socketId -> setTimeout ID
  }

  addAll(socket, rooms) {
    const socketId = socket.id;
    
    // Якщо користувач перепідключився під час «періоду грації» — скасовуємо видалення
    if (this.graceTimers.has(socketId)) {
      clearTimeout(this.graceTimers.get(socketId));
      this.graceTimers.delete(socketId);
    }

    if (!this.sids.has(socketId)) this.sids.set(socketId, new Set());
    for (const roomName of rooms) {
      this.sids.get(socketId).add(roomName);
      if (!this.rooms.has(roomName)) this.rooms.set(roomName, new Map());
      this.rooms.get(roomName).set(socketId, socket);
    }
  }

  del(socketId, roomName) {
    if (this.rooms.has(roomName)) {
      this.rooms.get(roomName).delete(socketId);
      if (this.rooms.get(roomName).size === 0) this.rooms.delete(roomName);
    }
    if (this.sids.has(socketId)) this.sids.get(socketId).delete(roomName);
  }

  // ВІДКАДЕНЕ ВИДАЛЕННЯ З КІМНАТ (Опціонально для поганого зв'язку)
  delAll(socketId, graceMs = 0, onFinalCleanup = null) {
    if (graceMs <= 0) {
      this.#executeFinalCleanup(socketId);
      if (onFinalCleanup) onFinalCleanup();
      return;
    }

    // Тимчасово заморожуємо видалення на graceMs мілісекунд
    const timerId = setTimeout(() => {
      this.#executeFinalCleanup(socketId);
      this.graceTimers.delete(socketId);
      if (onFinalCleanup) onFinalCleanup();
    }, graceMs);

    this.graceTimers.set(socketId, timerId);
  }

  #executeFinalCleanup(socketId) {
    const socketRooms = this.sids.get(socketId);
    if (!socketRooms) return;

    for (const roomName of socketRooms) {
      if (this.rooms.has(roomName)) {
        this.rooms.get(roomName).delete(socketId);
        if (this.rooms.get(roomName).size === 0) this.rooms.delete(roomName);
      }
    }
    this.sids.delete(socketId);
  }

  broadcast(roomName, packet, opts = {}) {
    const room = this.rooms.get(roomName);
    if (!room) return;
    const payload = JSON.stringify(packet);
    for (const [socketId, socket] of room.entries()) {
      if (socketId === opts.except) continue;
      if (opts.volatile && socket.rawWs.bufferedAmount > 0) continue; // Volatile
      if (socket.rawWs.readyState === 1) socket.rawWs.send(payload);
    }
  }

  async fetchSockets() {
    const localData = {};
    for (const [roomName, socketsMap] of this.rooms.entries()) {
      localData[roomName] = Array.from(socketsMap.keys());
    }
    return localData; // В In-Memory просто повертаємо локальний злімок
  }
}
