export class BaseAdapter {
  constructor(nspName) {
    this.nspName = nspName; // Кожен Namespace має свій адаптер
  }
  addAll(socketId, rooms) { throw new Error("Not implemented"); }
  del(socketId, roomName) { throw new Error("Not implemented"); }
  delAll(socketId) { throw new Error("Not implemented"); }
  broadcast(roomName, packet, opts) { throw new Error("Not implemented"); }
  getRoomsDump() { throw new Error("Not implemented"); }
}
