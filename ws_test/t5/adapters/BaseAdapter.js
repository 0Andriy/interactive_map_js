export class BaseAdapter {
  constructor(nspName) {
    this.nspName = nspName;
  }
  addAll(socket, rooms) {
    throw new Error("Method 'addAll' must be implemented");
  }
  del(socketId, roomName) {
    throw new Error("Method 'del' must be implemented");
  }
  delAll(socketId, graceMs, onFinalCleanup) {
    throw new Error("Method 'delAll' must be implemented");
  }
  broadcast(roomName, packet, opts) {
    throw new Error("Method 'broadcast' must be implemented");
  }
  async fetchSockets() {
    throw new Error("Method 'fetchSockets' must be implemented");
  }
}
