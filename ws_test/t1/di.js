import { RoomManager } from './RoomManager.js';
import { IoServer } from './IoServer.js';

// Створюємо єдиний екземпляр RoomManager (Singleton)
const roomManager = new RoomManager();

// Створюємо IoServer і «інжектуємо» туди наш RoomManager
const io = new IoServer(roomManager);

// Експортуємо налаштовані сервіси
export { io, roomManager };
