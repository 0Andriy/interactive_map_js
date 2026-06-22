import { IoServer } from './IoServer.js';
import { InMemoryAdapter } from './adapters/InMemoryAdapter.js';

// Інжектуємо InMemoryAdapter у конструктор головного сервера
const io = new IoServer(InMemoryAdapter);

export { io };
