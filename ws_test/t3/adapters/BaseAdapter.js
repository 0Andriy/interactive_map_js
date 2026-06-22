export class BaseAdapter {
  constructor(nspName) { this.nspName = nspName; }
  addAll(socket, rooms) {}
  del(socketId, roomName) {}
  delAll(socketId) {}
  broadcast(roomName, packet, opts) {}
  async fetchSockets() { return []; } // Збір інформації по всьому кластеру
}
