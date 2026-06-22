import { BaseAdapter } from './BaseAdapter.js';

export class RedisAdapter extends BaseAdapter {
  constructor(nspName, pubClient, subClient) {
    super(nspName);
    this.pubClient = pubClient;
    this.subClient = subClient;
    this.rooms = new Map();
    this.sids = new Map();
    this.graceTimers = new Map();
    
    this.serverId = `srv_${Math.random().toString(36).substring(2, 9)}`;
    
    // Канали для повідомлень та статистики
    this.broadcastChannel = `ws-nsp:${nspName}:broadcast`;
    this.requestChannel = `ws-nsp:${nspName}:request`;
    this.responseChannel = `ws-nsp:${nspName}:response`;
    
    // НОВИЙ КАНАЛ: Для синхронізації подій кімнат в реальному часі
    this.clusterPresenceChannel = `ws-nsp:${nspName}:presence`;
    
    this.activeRequests = new Map();

    this.#initRedis();
  }

  async #initRedis() {
    // 1. Підписка на міжсерверний бродкаст повідомлень
    await this.subClient.subscribe(this.broadcastChannel, (msg) => {
      const { roomName, packet, opts, originServerId } = JSON.parse(msg);
      if (originServerId === this.serverId) return;
      this.localBroadcast(roomName, packet, opts);
    });

    // 2. Підписка на міжсерверні події входів/виходів (Глобальний Presence)
    await this.subClient.subscribe(this.clusterPresenceChannel, (msg) => {
      const { action, socketId, roomName, originServerId } = JSON.parse(msg);
      if (originServerId === this.serverId) return;
      
      // Тут можна викликати глобальні системні івенти на рівні Неймспейсу,
      // щоб поточний сервер знав, що на СУСІДНЬОМУ сервері хтось зайшов в кімнату
      this.nsp?.globalEvents.emit(`cluster_${action}`, { socketId, roomName, remoteServerId: originServerId });
    });

    // 3. Підписка на RPC-запити статистики (fetchSockets)
    await this.subClient.subscribe(this.requestChannel, (msg) => {
      const { requestId, originServerId } = JSON.parse(msg);
      if (originServerId === this.serverId) return;
      const localData = {};
      for (const [roomName, socketsMap] of this.rooms.entries()) {
        localData[roomName] = Array.from(socketsMap.keys());
      }
      this.pubClient.publish(this.responseChannel, JSON.stringify({ requestId, serverId: this.serverId, data: localData })).catch(console.error);
    });

    // 4. Підписка на RPC-відповіді статистики
    await this.subClient.subscribe(this.responseChannel, (msg) => {
      const { requestId, data } = JSON.parse(msg);
      if (this.activeRequests.has(requestId)) {
        this.activeRequests.get(requestId).responses.push(data);
      }
    });
  }

  // Оновлений метод входу в кімнату
  addAll(socket, rooms) {
    const socketId = socket.id;
    if (this.graceTimers.has(socketId)) {
      clearTimeout(this.graceTimers.get(socketId));
      this.graceTimers.delete(socketId);
    }
    if (!this.sids.has(socketId)) this.sids.set(socketId, new Set());
    
    for (const roomName of rooms) {
      this.sids.get(socketId).add(roomName);
      if (!this.rooms.has(roomName)) this.rooms.set(roomName, new Map());
      this.rooms.get(roomName).set(socketId, socket);

      // ТРАНСЛЯЦІЯ ПОДІЇ ВХОДУ В КЛАСТЕР REDIS
      this.#publishPresence('join', socketId, roomName);
    }
  }

  // Оновлений метод виходу з однієї кімнати
  del(socketId, roomName) {
    if (this.rooms.has(roomName)) {
      this.rooms.get(roomName).delete(socketId);
      if (this.rooms.get(roomName).size === 0) this.rooms.delete(roomName);
      
      // ТРАНСЛЯЦІЯ ПОДІЇ ВИХОДУ В КЛАСТЕР REDIS
      this.#publishPresence('leave', socketId, roomName);
    }
    if (this.sids.has(socketId)) {
      this.sids.get(socketId).delete(roomName);
    }
  }

  delAll(socketId, graceMs = 0, onFinalCleanup = null) {
    if (graceMs <= 0) {
      this.#executeFinalCleanup(socketId);
      if (onFinalCleanup) onFinalCleanup();
      return;
    }
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
        
        // Сповіщаємо кластер про масовий вихід з кімнати через повний дисконект
        this.#publishPresence('leave', socketId, roomName);
      }
    }
    this.sids.delete(socketId);
  }

  // Приватний метод для пушу івентів присутності в Redis
  #publishPresence(action, socketId, roomName) {
    if (this.pubClient?.isOpen) {
      this.pubClient.publish(this.clusterPresenceChannel, JSON.stringify({
        action,
        socketId,
        roomName,
        originServerId: this.serverId
      })).catch(console.error);
    }
  }

  broadcast(roomName, packet, opts = {}) {
    this.localBroadcast(roomName, packet, opts);
    if (this.pubClient?.isOpen) {
      this.pubClient.publish(this.broadcastChannel, JSON.stringify({
        roomName, packet, opts, originServerId: this.serverId
      })).catch(console.error);
    }
  }

  localBroadcast(roomName, packet, opts = {}) {
    const payload = JSON.stringify(packet);
    if (roomName === null) {
      for (const roomsSet of this.rooms.values()) {
        for (const [socketId, socket] of roomsSet.entries()) {
          if (socketId === opts.except) continue;
          if (opts.volatile && socket.rawWs.bufferedAmount > 0) continue;
          if (socket.rawWs.readyState === 1) socket.rawWs.send(payload);
        }
      }
      return;
    }
    const room = this.rooms.get(roomName);
    if (!room) return;
    for (const [socketId, socket] of room.entries()) {
      if (socketId === opts.except) continue;
      if (opts.volatile && socket.rawWs.bufferedAmount > 0) continue;
      if (socket.rawWs.readyState === 1) socket.rawWs.send(payload);
    }
  }

  async fetchSockets() {
    return new Promise((resolve) => {
      const requestId = `req_${Math.random().toString(36).substring(2, 9)}`;
      const record = { responses: [], timer: null };
      this.activeRequests.set(requestId, record);

      record.timer = setTimeout(() => {
        this.activeRequests.delete(requestId);
        const clusterRooms = {};
        for (const [roomName, socketsMap] of this.rooms.entries()) {
          clusterRooms[roomName] = Array.from(socketsMap.keys());
        }
        for (const remoteData of record.responses) {
          for (const [roomName, userIds] of Object.entries(remoteData)) {
            if (!clusterRooms[roomName]) clusterRooms[roomName] = [];
            clusterRooms[roomName] = [...new Set([...clusterRooms[roomName], ...userIds])];
          }
        }
        resolve(clusterRooms);
      }, 250);

      if (this.pubClient?.isOpen) {
        this.pubClient.publish(this.requestChannel, JSON.stringify({ requestId, originServerId: this.serverId })).catch(console.error);
      }
    });
  }
}
