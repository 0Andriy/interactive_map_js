import { BaseAdapter } from './BaseAdapter.js';
import { createClient } from 'redis';

export class RedisAdapter extends BaseAdapter {
  constructor(nspName) {
    super(nspName);
    this.rooms = new Map(); // roomName -> Map(socketId -> Socket)
    this.sids = new Map();  // socketId -> Set(roomName)
    
    this.channelName = `ws-nsp:${nspName}`;
    this.#initRedis();
  }

  async #initRedis() {
    // Створюємо два клієнти: один для публікації, другий для підписки
    this.pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    this.subClient = this.pubClient.duplicate();

    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

    // Підписуємося на події від інших серверів
    await this.subClient.subscribe(this.channelName, (message) => {
      const { roomName, packet, opts, originServerId } = JSON.parse(message);
      
      // Ігноруємо повідомлення, якщо його відправив цей самий сервер
      if (originServerId === this.serverId) return;

      // Розсилаємо локальним клієнтам
      this.#localBroadcast(roomName, packet, opts);
    });

    // Унікальний ID поточного сервера Node.js в кластері
    this.serverId = `srv_${Math.random().toString(36).substring(2, 9)}`;
    console.log(`[RedisAdapter] Ініціалізовано для ${this.nspName} (ID: ${this.serverId})`);
  }

  addAll(socket, rooms) {
    const socketId = socket.id;
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

  delAll(socketId) {
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

  // Публікація в Redis для міжсерверної синхронізації
  broadcast(roomName, packet, opts = {}) {
    // 1. Спочатку відправляємо локальним клієнтам на цьому сервері
    this.#localBroadcast(roomName, packet, opts);

    // 2. Публікуємо в Redis, щоб інші сервери теж відправили своїм клієнтам
    if (this.pubClient?.isOpen) {
      const message = JSON.stringify({
        roomName,
        packet,
        opts,
        originServerId: this.serverId
      });
      this.pubClient.publish(this.channelName, message).catch(console.error);
    }
  }

  // Внутрішній метод для відправки сокетам, підключеним саме до цієї ноди
  #localBroadcast(roomName, packet, opts = {}) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    const payload = JSON.stringify(packet);
    for (const [socketId, socket] of room.entries()) {
      if (socketId === opts.except) continue;
      
      // Фіча Volatile: якщо буфер забитий, пропускаємо відправку для оптимізації
      if (opts.volatile && socket.rawWs.bufferedAmount > 0) {
        continue; 
      }

      if (socket.rawWs.readyState === 1) {
        socket.rawWs.send(payload);
      }
    }
  }

  getRoomsDump() {
    const dump = {};
    for (const [roomName, socketsMap] of this.rooms.entries()) {
      dump[roomName] = {
        localUsersCount: socketsMap.size,
        localUserIds: Array.from(socketsMap.keys()),
        note: "Повна статистика кімнат у кластері збирається через Redis CLI (KEYS/SMEMBERS)"
      };
    }
    return dump;
  }
}
