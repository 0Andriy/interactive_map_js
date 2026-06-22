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
    this.broadcastChannel = `ws-nsp:${nspName}:broadcast`;
    this.requestChannel = `ws-nsp:${nspName}:request`;
    this.responseChannel = `ws-nsp:${nspName}:response`;
    this.activeRequests = new Map();

    this.#initRedis();
  }

  async #initRedis() {
    await this.subClient.subscribe(this.broadcastChannel, (msg) => {
      const { roomName, packet, opts, originServerId } = JSON.parse(msg);
      if (originServerId === this.serverId) return;
      this.localBroadcast(roomName, packet, opts);
    });

    await this.subClient.subscribe(this.requestChannel, (msg) => {
      const { requestId, originServerId } = JSON.parse(msg);
      if (originServerId === this.serverId) return;

      const localData = {};
      for (const [roomName, socketsMap] of this.rooms.entries()) {
        localData[roomName] = Array.from(socketsMap.keys());
      }
      
      this.pubClient.publish(this.responseChannel, JSON.stringify({
        requestId,
        serverId: this.serverId,
        data: localData
      })).catch(console.error);
    });

    await this.subClient.subscribe(this.responseChannel, (msg) => {
      const { requestId, data } = JSON.parse(msg);
      if (this.activeRequests.has(requestId)) {
        this.activeRequests.get(requestId).responses.push(data);
      }
    });
  }

  addAll(socket, rooms) {
    const socketId = socket.id;
    if (this.graceTimers.has(socketId)) {
      clearTimeout(this.graceTimers.get(socketId));
      this.graceTimers.delete(socketId);
    }
    if (!this.sids.has(socketId)) {
      this.sids.set(socketId, new Set());
    }
    for (const roomName of rooms) {
      this.sids.get(socketId).add(roomName);
      if (!this.rooms.has(roomName)) {
        this.rooms.set(roomName, new Map());
      }
      this.rooms.get(roomName).set(socketId, socket);
    }
  }

  del(socketId, roomName) {
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
        if (this.rooms.get(roomName).size === 0) {
          this.rooms.delete(roomName);
        }
      }
    }
    this.sids.delete(socketId);
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
    const room = this.rooms.get(roomName);
    if (!room) return;
    const payload = JSON.stringify(packet);
    for (const [socketId, socket] of room.entries()) {
      if (socketId === opts.except) continue;
      if (opts.volatile && socket.rawWs.bufferedAmount > 0) continue;
      if (socket.rawWs.readyState === 1) {
        socket.rawWs.send(payload);
      }
    }
  }

  async fetchSockets() {
    const requestId = `req_${Math.random().toString(36).substring(2, 9)}`;
    return new Promise((resolve) => {
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
            if (!clusterRooms[roomName]) {
              clusterRooms[roomName] = [];
            }
            clusterRooms[roomName] = [...new Set([...clusterRooms[roomName], ...userIds])];
          }
        }
        resolve(clusterRooms);
      }, 250);

      if (this.pubClient?.isOpen) {
        this.pubClient.publish(this.requestChannel, JSON.stringify({ 
          requestId, 
          originServerId: this.serverId 
        })).catch(console.error);
      }
    });
  }
}
