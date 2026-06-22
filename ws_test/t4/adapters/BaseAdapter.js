export class BaseAdapter {
  constructor(nspName) { this.nspName = nspName; }
  addAll(socket, rooms) {}
  del(socketId, roomName) {}
  delAll(socketId, graceMs, onFinalCleanup) {} // Підтримка відкладеного видалення
  broadcast(roomName, packet, opts) {}
  async fetchSockets() { return {}; }
}
