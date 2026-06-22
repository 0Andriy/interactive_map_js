import { BaseAdapter } from './BaseAdapter.js';

export class InMemoryAdapter extends BaseAdapter {
  constructor(nspName) {
    super(nspName);
    this.rooms = new Map(); // roomName -> Map(socketId -> Socket)
    this.sids = new Map();  // socketId -> Set(roomName)
  }

  addAll(socket, rooms) {
    const socketId = socket.id;
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
      if (this.rooms.get(roomName).size === 0) this.rooms.delete(roomName);
    }
    if (this.sids.has(socketId)) {
      this.sids.get(socketId).delete(roomName);
    }
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

  broadcast(roomName, packet, opts = {}) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    const payload = JSON.stringify(packet);
    for (const [socketId, socket] of room.entries()) {
      if (socketId === opts.except) continue;
      if (socket.rawWs.readyState === 1) {
        socket.rawWs.send(payload);
      }
    }
  }

  getRoomsDump() {
    const dump = {};
    for (const [roomName, socketsMap] of this.rooms.entries()) {
      dump[roomName] = {
        usersCount: socketsMap.size,
        userIds: Array.from(socketsMap.keys())
      };
    }
    return dump;
  }
}
