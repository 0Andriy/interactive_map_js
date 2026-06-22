export class LoggerService {
  constructor(level = 'info') {
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
    this.currentLevel = this.levels[level] !== undefined ? this.levels[level] : 1;
  }

  #log(level, color, message, context = '') {
    if (this.levels[level] < this.currentLevel) return;
    
    const timestamp = new Date().toISOString();
    const ctxString = context ? ` [\x1b[36m${context}\x1b[0m]` : '';
    console.log(`${timestamp} [${color}${level.toUpperCase()}\x1b[0m]${ctxString}: ${message}`);
  }

  debug(msg, ctx) { this.#log('debug', '\x1b[35m', msg, ctx); }
  info(msg, ctx)  { this.#log('info', '\x1b[32m', msg, ctx); }
  warn(msg, ctx)  { this.#log('warn', '\x1b[33m', msg, ctx); }
  error(msg, ctx) { this.#log('error', '\x1b[31m', msg, ctx); }
}
