import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { performance } from 'node:perf_hooks';
import zlib from 'node:zlib';

/**
 * @typedef {Object} FileTransferOptions
 * @property {string|Readable} source - Джерело даних: абсолютний шлях до файлу (string) або потік (Readable/Oracle LOB).
 * @property {string} filename - Ім'я файлу, яке побачить користувач (підтримує Unicode/будь-яку мову).
 * @property {number} [size] - Загальний розмір файлу в байтах. Обов'язковий для потоків (Oracle LOB). Для FS обчислюється автоматично.
 * @property {string} [hash] - HEX-рядок хешу (SHA-256). Використовується для ETag та Content-Digest (RFC 9530).
 * @property {string} [mimeType] - MIME-тип файлу. Якщо не вказано, визначається автоматично за розширенням.
 * @property {boolean} [isPreSliced=false] - Чи є потік уже "нарізаним" (наприклад, через генератор Oracle). Якщо true, внутрішня нарізка Range ігнорується.
 * @property {'inline'|'attachment'} [dispositionType='inline'] - Як відображати файл: 'inline' (відкрити в браузері/плеєрі) або 'attachment' (скачати).
 * @property {'transform'|'readable'} [strategy='transform'] - Стратегія нарізки байтів для потоків. 'transform' рекомендовано для великих файлів.
 */

// Базовий словник MIME-типів (щоб не тягнути бібліотеку mime-types)
const MIME_MAP = {
    'pdf': 'application/pdf',
    'mp4': 'video/mp4',
    'mp3': 'audio/mpeg',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'zip': 'application/zip',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

/**
 * Універсальний інструмент для передачі (ОДИНОЧНОГО ФАЙЛУ) файлів будь-якого розміру
 * з підтримкою сучасних стандартів RFC 9530, RFC 6266 та Range-запитів.
 * 
 * @example
 * // 1. Передача файлу з файлової системи (FS)
 * await sendUniversalFile(req, res, {
 *   source: '/var/www/media/video.mp4',
 *   filename: 'Мій_Відео_Звіт.mp4',
 *   dispositionType: 'inline'
 * });
 * 
 * @example
 * // 2. Передача з Oracle LOB (використовуючи попередню нарізку генератором)
 * const lob = result.rows[0][0];
 * const size = result.rows[0][1];
 * const range = req.headers.range;
 * 
 * let stream = lob; // Потік за замовчуванням
 * let preSliced = false;
 * 
 * if (range) {
 *    const parts = range.replace(/bytes=/, "").split("-");
 *    const start = parseInt(parts[0], 10);
 *    const end = parts[1] ? parseInt(parts[1], 10) : size - 1;
 *    stream = createLobGenerator(lob, start, end);
 *    preSliced = true;
 * }
 * 
 * await sendUniversalFile(req, res, {
 *   source: stream,
 *   filename: 'Документ_з_БД.pdf',
 *   size: size,
 *   isPreSliced: preSliced,
 *   hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' // SHA-256 HEX
 * });
 * 
 * @param {import('express').Request} req - Об'єкт запиту Express/Node.js.
 * @param {import('express').Response} res - Об'єкт відповіді Express/Node.js.
 * @param {FileTransferOptions} options - Конфігурація передачі.
 */
export async function sendUniversalFile(req, res, { 
    source, 
    filename, 
    size, 
    mimeType = null, 
    hash = null, 
    isPreSliced = false, 
    dispositionType = 'inline' // Можна передати 'attachment'
}) {
    const startTime = performance.now();
    let finalSize = size;
    let etagValue = hash;
    let transferredBytes = 0;

    // 1. Обробка локального файлу для файлової системи (FS)
    if (typeof source === 'string') {
        try {
            const stats = fs.statSync(source);
            finalSize = stats.size;
            // Для FS використовуємо mtime + size як швидкий ETag
            etagValue = etagValue || `fs-${stats.size}-${stats.mtimeMs}`;
        } catch (e) {
            return res.status(404).send('File not found');
        }
    }

    // 2. Кешування та валідація (304 Not Modified)
    // Використовуємо хеш як ETag для економії трафіку
    if (etagValue) {
        const etag = `"${etagValue}"`;
        if (req.headers['if-none-match'] === etag) {
            return res.status(304).end();
        }

        res.setHeader('ETag', etag);
        // Сучасний заголовок Digest для перевірки цілісності (якщо є хеш)
        if (hash) {
            // Content-Digest (RFC 9530). Конвертуємо HEX-хеш (з бази) у Base64 для стандарту
            const base64Hash = Buffer.from(hash, 'hex').toString('base64');
            res.setHeader('Content-Digest', `sha-256=:${base64Hash}:`);
            // Для зворотної сумісності зі старим софтом:
            res.setHeader('Digest', `sha-256=${hash}`);
        }
    }
    
    // 3. Формування імені файлу (UTF-8) (RFC 6266) для підтримки всіх мов
    const encodedName = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A');
    // Поєднуємо ASCII fallback та UTF-8 розширення
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);

    // 4. Визначаємо MIME-тип або дефолт
    const ext = path.extname(filename).toLowerCase().replace('.', '');
    const finalMimeType = mimeType || MIME_MAP[ext] || 'application/octet-stream';

    // 5. Заголовки для Range та CORS
    res.setHeader('Content-Type', finalMimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Encoding', 'identity'); 
    res.setHeader('Cache-Control', 'public, max-age=31536000, must-revalidate');

    // 6. ІГНОРУВАННЯ КОМПРЕСІЇ (Gzip/Brotli) - Вимикаємо компресію (вона ламає Range та бінарні дані)
    // Компресія ламає Range (Content-Length стає невірним) та імена файлів
    res.removeHeader('Content-Encoding'); // Для Express/Compression middleware
    res.setHeader('Content-Encoding', 'identity'); 

    // Дозволяємо фронтенду (fetch) бачити всі метадані
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Range, Content-Length, ETag, Content-Digest, Digest');
    res.setHeader('Access-Control-Expose-Headers', '*');

    // 6. Логіка Range (якщо запитано) - Обробка Range (Partial Content)
    const range = req.headers.range;
    let stream;

    if (range && finalSize > 0) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        // Якщо parts[1] порожній (запит "500-"), беремо кінець файлу.
        // Якщо не порожній (запит "500-999"), беремо вказане значення.
        const end = parts[1] ? parseInt(parts[1], 10) : finalSize - 1;

        // Валідація
        if (start >= finalSize || end >= finalSize) {
            res.status(416).setHeader('Content-Range', `bytes */${finalSize}`).end('Requested range not satisfiable');
            return;
        }

        // ЗАХИСТ: Клієнт не може запросити більше, ніж є у файлі
        if (end >= finalSize) {
            end = finalSize - 1;
        }

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${finalSize}`);
        res.setHeader('Content-Length', end - start + 1);
        
        // Якщо ми вже нарізали потік генератором (isPreSliced), просто беремо його
        stream = isPreSliced ? source : _createStreamSource(source, start, end);
    } else {
        res.setHeader('Content-Length', finalSize);
        stream = isPreSliced ? source : _createStreamSource(source);
    }

    // 6. Логування прогресу та швидкості
    stream.on('data', (chunk) => { 
        transferredBytes += chunk.length; 
    });

    // 7. Очищення ресурсів (особливо запобігання зависанню Oracle)
    const cleanup = () => {
        const duration = (performance.now() - startTime) / 1000;

        // Динамічне відображення розміру
        let sizeDisplay;
        if (transferredBytes >= 1024 * 1024) {
            sizeDisplay = `${(transferredBytes / 1024 / 1024).toFixed(2)} MB`;
        } else if (transferredBytes >= 1024) {
            sizeDisplay = `${(transferredBytes / 1024).toFixed(2)} KB`;
        } else {
            sizeDisplay = `${transferredBytes} B`;
        }

        const speed = (transferredBytes / 1024 / 1024 / (duration || 0.001)).toFixed(2);
        console.log(`[Transfer] File: ${filename} | Sent: ${sizeDisplay} | Time: ${duration.toFixed(3)}s | Speed: ${speed} MB/s`);

        if (stream && typeof stream.destroy === 'function') {
            stream.destroy();
        }
        // ВАЖЛИВО: знищуємо вхідний LOB потік, щоб звільнити з'єднання в пулі Oracle
        if (source && typeof source.destroy === 'function' && source !== stream) {
            source.destroy();
        }
    };

    res.on('close', cleanup);
    res.on('finish', cleanup);

    stream.on('error', (err) => {
        if (!res.headersSent) {
            res.status(500).send('Stream error');
        }
        cleanup();
    });

    // 7. Передача в потік
    stream.pipe(res);
}

/**
 * Допоміжна функція створення потоку з підтримкою зсуву (для Oracle/FS)
 * Внутрішня функція для створення та нарізки потоку
 * 
 * Створення джерела потоку з вибором стратегії нарізки
 * @private
 * @param {string|Readable} source - Шлях або потік
 * @param {number} start - Початковий байт
 * @param {number} end - Кінцевий байт
 * @param {string} strategy - 'transform' або 'readable' (дефолт 'transform')
 */
function _createStreamSource(source, start = null, end = null, strategy = 'transform') {
    // 1. Нативна стратегія для файлової системи
    if (typeof source === 'string') {
        const options = (start !== null) ? { start, end } : {};
        return fs.createReadStream(source, options);
    } 
    
    // Якщо нарізка не потрібна (повний файл)
    if (start === null) return source;

    // -----  Ручна нарізка потоку (Manual Range) для Oracle BLOB  ------
    // СТРАТЕГІЯ А: Readable (Класична, ручне керування потоком)
    if (strategy === 'readable') {
        let bytesRead = 0; // currentByte

        const slicer = new Readable({
            read() {
                if (typeof source.resume === 'function') {
                    source.resume();
                }
            }
        });

        source.on('data', (chunk) => {
            const chunkStart = bytesRead;
            const chunkEnd = bytesRead + chunk.length - 1;
            bytesRead += chunk.length;

            if (chunkEnd < start || chunkStart > end) return;

            const sliceStart = Math.max(0, start - chunkStart);
            const sliceEnd = Math.min(chunk.length, end - chunkStart + 1);
            
            const chunkPart = chunk.subarray(sliceStart, sliceEnd);
            const isBufferFull = slicer.push(chunkPart) === false;

            // Якщо внутрішній буфер (споживач) переповнений, ставимо джерело на паузу (Backpressure)
            if (isBufferFull) {
                if (typeof source.pause === 'function') {
                    source.pause();
                }
            }
        });

        source.on('end', () => slicer.push(null));
        source.on('error', (err) => slicer.emit('error', err));

        return slicer;
    }

    // ----------------------------
    // СТРАТЕГІЯ Б: Transform (Сучасна, через .pipe())

    if (strategy === 'transform') {
        let bytesRead = 0; // bytesProcessed 

        const slicer = new Transform({
            transform(chunk, encoding, callback) {
                const chunkStart = bytesRead;
                const chunkEnd = bytesRead + chunk.length - 1;
                bytesRead += chunk.length;

                // 1. Пропускаємо чанк, якщо він поза межами Range
                if (chunkEnd < start || chunkStart > end) {
                    return callback(); // Просто кажемо, що готові до наступного чанку
                }

                // Обчислюємо відносні межі всередині чанка
                const sliceStart = Math.max(0, start - chunkStart);
                const sliceEnd = Math.min(chunk.length, end - chunkStart + 1);
                
                const chunkPart = chunk.subarray(sliceStart, sliceEnd);

                // 3. Передаємо дані далі. 
                // Transform сам обробить backpressure (паузу/відновлення)
                this.push(chunkPart);
                callback();
            }
        });

        return source.pipe(slicer);
    }
}



/**
 * Створює оптимізований Readable потік (generator) для читання Oracle LOB об'єктів.
 * 
 * Функція автоматично розбиває дані на чанки, підтримує часткове читання (діапазони)
 * та гарантує звільнення ресурсів (виклик `lob.destroy()`) після завершення або у разі помилки.
 *
 * @param {Object} lob - Об'єкт Oracle LOB (наприклад, з `node-oracledb`).
 * @param {Function} lob.getData - Метод для отримання бінарних даних: `(offset, amount) => Promise<Buffer|Uint8Array>`.
 * @param {Function} [lob.destroy] - Необов'язковий метод для закриття LOB дескриптора.
 * @param {number} [start=0] - Початкова позиція читання (0-базовий індекс).
 * @param {number} [end=Infinity] - Кінцева позиція читання. Якщо `Infinity`, читає до кінця файлу.
 * @param {number} [chunkSize=524288] - Розмір одного чанка в байтах (за замовчуванням 512 КБ).
 * 
 * @returns {Readable} Потік Node.js (Readable stream), який можна передати у відповідь (Response) або в pipeline.
 * 
 * @example
 * // Приклад використання з oracledb:
 * const lob = await connection.getLob(lobPointer);
 * const stream = createLobGenerator(lob, 0, 10 * 1024 * 1024); // Читати перші 10 МБ
 * 
 * stream.on('data', (chunk) => {
 *   console.log(`Отримано чанк розміром: ${chunk.length} байт`);
 * });
 * 
 * stream.on('end', () => {
 *   console.log('Читання LOB завершено, ресурси звільнено.');
 * });
 */
export function createLobGenerator(lob, start = 0, end = Infinity, chunkSize = 512 * 1024) {
    const totalToRead = end - start + 1;

    const generator = async function* () {
        let bytesProcessed = 0;

        try {
            while (true) {
                // Вираховуємо скільки залишилося прочитати, якщо задано end
                const remaining = end !== Infinity 
                    ? totalToRead - bytesProcessed 
                    : chunkSize;

                const amountToRead = Math.min(chunkSize, remaining);

                if (amountToRead <= 0) break;

                // Oracle LOB.getData(offset, amount) - offset починається з 1
                const chunk = await lob.getData(start + bytesProcessed + 1, amountToRead);

                if (!chunk || chunk.length === 0) break;
                
                yield chunk;
                bytesProcessed += chunk.length;

                if (end !== Infinity && bytesProcessed >= totalToRead) break;
            }
        } finally {
            if (lob && typeof lob.destroy === 'function') {
                try { 
                    lob.destroy(); 
                } catch (err) { 
                    console.error('LOB destroy error:', err); 
                }
            }
        }
    };

    return Readable.from(generator());
}


/**
 * Створює потік з шифруванням AES-256-GCM
 * @param {string} password - Ключ шифрування
 * 
 * @forClient
 * @example
 *  async function decryptAndSave(response, targetPath, password) {
        const reader = response.body.getReader(); // 1. Відкриваємо "кран" з даними від сервера
        const writer = fs.createWriteStream(targetPath); // 2. Готуємо файл на диску
        
        // 3. ЧИТАЄМО МЕТАДАНІ (ПЕРШІ 28 БАЙТ) (16 salt + 12 iv), які ми додали в заголовок
        let { value: header } = await reader.read();
        
        const salt = header.subarray(0, 16); // Витягуємо сіль
        const iv = header.subarray(16, 28);   // Витягуємо вектор
        const dataChunk = header.subarray(28); // Все інше — це вже зашифровані дані

        // 4. ГЕНЕРУЄМО КЛЮЧ
        // Використовуємо той самий пароль і сіль, що й сервер, щоб отримати ідентичний ключ
        const key = crypto.scryptSync(password, salt, 32);

        // 5. СТВОРЮЄМО ДЕШИФРАТОР
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

        // 6. ПІДКЛЮЧАЄМО ЛАНЦЮЖОК
        // Дані -> Дешифратор -> Файл
        decipher.pipe(writer);

        // 7. ПРОЦЕС "ПЕРЕЖОВУВАННЯ" 100 ГБ
        if (dataChunk.length > 0) decipher.write(dataChunk);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            decipher.write(value); // Кожен шматок розшифровується і відразу пишеться в файл
        }
        decipher.end();
    }
 */
function createCipher(password) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    // Передаємо salt та iv на початку потоку, щоб клієнт міг дешифрувати
    return { cipher, header: Buffer.concat([salt, iv]) };
}

/**
 * Transform потік для обмеження швидкості (Throttling)
 * @param {number} bytesPerSecond - Ліміт байт/сек
 */
function createThrottle(bytesPerSecond) {
    let startTime = Date.now();
    let bytesSent = 0;

    return new Transform({
        transform(chunk, encoding, callback) {
            bytesSent += chunk.length;
            const elapsedTime = (Date.now() - startTime) / 1000;
            const expectedTime = bytesSent / bytesPerSecond;

            const delay = (expectedTime - elapsedTime) * 1000;

            if (delay > 0) {
                setTimeout(() => {
                    this.push(chunk);
                    callback();
                }, delay);
            } else {
                this.push(chunk);
                callback();
            }
        }
    });
}

// Внутрішня функція зборки потоку
function _buildProcessingPipeline(sourceStream, options) {
    let pipeline = sourceStream;

    // 1. Обмеження швидкості (якщо вказано, наприклад, 1MB/s)
    if (options.bpsLimit) {
        pipeline = pipeline.pipe(createThrottle(options.bpsLimit));
    }

    // 2. Шифрування
    if (options.encryptionKey) {
        // res.setHeader('X-Encrypted', 'true');
        const { cipher, header } = createCipher(options.encryptionKey);
        // Тут ми маємо спочатку відправити заголовок (salt+iv), 
        // але в стрімі простіше обгорнути це в об'єкт
        // res.write(header); // Відправляємо Salt + IV першими 28 байтами
        pipeline = pipeline.pipe(cipher);
    }

    return pipeline;
}


// ---------------------------------------------

/**
 * @typedef {Object} BundleItem
 * @property {string} uid - Унікальний ID об'єкта (наприклад, UUID з бази або повний шлях).
 * @property {string} name - Ім'я файлу.
 * @property {Object} metadata - Додаткові дані (шляхи, дати).
 * @property {Readable|Buffer|null} content - Бінарний вміст.
 * @property {number} size - Розмір у байтах.
 * @property {string} [hash] - SHA-256 хеш.
 */


/**
 * ПОТОКОВА ПЕРЕДАЧА ПАКЕТУ ОБ'ЄКТІВ (Smart Bundle) з підтримкою дозавантаження (Resume)
 * Стрімінг масиву складних об'єктів з вкладеними BLOB з динамічним boundary у заголовках.
 * Підтримує передачу "на льоту" (streaming), щоб клієнт міг відновлювати дані в процесі.
 * 
 * (Binary Pack.) -> Стрімінг складних об'єктів з сирими бінарними даними (без Base64)
 * Формат: JSON_metadata + \n + Raw_Binary_Content + \n + Boundary
 * 
 * @param {import('express').Response} res 
 * @param {AsyncIterable<BundleItem>} items - Потік об'єктів.
 * @param {Object} options 
 * @param {boolean} [options.useBase64=false] - Якщо true, використовує JSONL (JSON Lines) + Base64. Якщо false - Binary Pack.
 * @param {string} [options.boundary='--OBJ-BOUNDARY--'] - Розділювач для бінарного режиму, якщо не вказано, генерується автоматично
 * @param {Object} [options.resumeAfter] - Назва файлу/ID, після якого треба продовжити
 * @example
 *  import { streamSmartBundle, createLobGenerator } from './universal-file-transfer.js';
    app.get('/api/backup-bundle', async (req, res) => {
        try {
            // 1. Отримуємо дані з Oracle (наприклад, список файлів для користувача)
            const result = await connection.execute(
                `SELECT id, filename, folder_path, blob_content, 
                        DBMS_LOB.GETLENGTH(blob_content) as f_size, 
                        sha256_hash 
                FROM user_files WHERE user_id = :uid`,
                { uid: req.user.id }
            );

            // 2. Створюємо генератор, який перетворює рядки БД на об'єкти BundleItem
            async function* itemGenerator() {
                for (const row of result.rows) {
                    const [id, name, path, lob, size, hash] = row;

                    // Створюємо потік для конкретного LOB (читаємо весь файл)
                    const contentStream = createLobGenerator(lob, 0, size - 1);

                    yield {
                        name: name,
                        size: size,
                        hash: hash, // передаємо оригінальний хеш з БД
                        metadata: {
                            db_id: id,
                            full_path: path,
                            uploaded_at: new Date().toISOString()
                        },
                        content: contentStream // передаємо потік, а не весь файл в пам'ять!
                    };
                }
            }

            async function* mixedGenerator() {
                // Об'єкт 1: Конфігурація з БД (маленький об'єкт)
                yield {
                    name: 'config.json',
                    size: Buffer.from(configJson).length,
                    metadata: { type: 'config' },
                    content: Buffer.from(configJson)
                };

                // Об'єкт 2: Величезне відео з диска
                const videoStats = fs.statSync('./videos/intro.mp4');
                yield {
                    name: 'intro.mp4',
                    size: videoStats.size,
                    metadata: { type: 'media' },
                    content: fs.createReadStream('./videos/intro.mp4')
                };
            }

            // 3. Запускаємо стрімінг у бінарному режимі (найкраще для великих BLOB)
            await streamSmartBundle(res, itemGenerator(), {
                useBase64: false, // використовуємо Binary Pack для швидкості
                boundary: '--MY-CUSTOM-BOUNDARY--'
            });

        } catch (err) {
            console.error('Bundle error:', err);
            if (!res.headersSent) res.status(500).send('Помилка формування пакету');
        }
    });


 * @forClient
 * 
 * Потокове відновлення пакету об'єктів (Binary Pack)
 * Опрацьовує потік пакетів від сервера та зберігає їх на диск
 * @param {string} url - URL сервера
 * @param {string} targetBaseDir - Куди зберігати файли
 * @example
 *  async function downloadWithResume(url, targetDir) {
        // 1. Знаходимо останній завантажений файл для Resume
        const existingFiles = fs.existsSync(targetDir) ? fs.readdirSync(targetDir) : [];
        let lastDownloadedFile = null;
        
        if (existingFiles.length > 0) {
            // Сортуємо за датою або іншим логічним порядком
            const stats = existingFiles.map(f => ({ name: f, time: fs.statSync(path.join(targetDir, f)).mtime }));
            lastDownloadedFile = stats.sort((a, b) => b.time - a.time)[0]?.name;
        }

        // 2. Робимо запит із вказівкою, звідки продовжувати
        const response = await fetch(url, {
            method: 'POST', // Або GET з параметрами
            body: JSON.stringify({ resumeAfter: lastDownloadedFile }),
            headers: { 'Content-Type': 'application/json' }
        });

        // 3. Викликаємо наш стандартний метод відновлення
        await downloadAndRestoreBundle(response, targetDir);
    }
 * 
    async function downloadAndRestoreBundle(url, targetBaseDir) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Server returned ${response.status}`);

        // 1. Витягуємо boundary з заголовків
        const contentType = response.headers.get('Content-Type');
        const boundaryMatch = contentType?.match(/boundary=([^;]+)/);
        if (!boundaryMatch) throw new Error("Boundary not found in headers");
        
        const boundary = boundaryMatch[1];
        const boundaryBuf = Buffer.from(`\n${boundary}\n`);
        
        console.log(`[Client] Початок завантаження. Розділювач: ${boundary}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = Buffer.alloc(0);

        **
         * Допоміжна функція для запису файлу та перевірки хешу
         *
        async function processItem(baseDir, meta, content) {
            const relativePath = meta.metadata?.full_path || "";
            const fullDirPath = path.join(baseDir, relativePath);
            const fullFilePath = path.join(fullDirPath, meta.name);

            // Створюємо папку
            if (!fs.existsSync(fullDirPath)) {
                fs.mkdirSync(fullDirPath, { recursive: true });
            }

            if (meta.hasContent) {
                fs.writeFileSync(fullFilePath, content);

                // Перевірка цілісності
                if (meta.hash) {
                    const hash = crypto.createHash('sha256').update(content).digest('hex');
                    if (hash === meta.hash) {
                        console.log(`✅ ${meta.name} (Integrity OK)`);
                    } else {
                        console.error(`❌ ${meta.name} (Integrity FAIL!)`);
                    }
                } else {
                    console.log(`📄 ${meta.name} saved.`);
                }
            } else {
                console.log(`📁 Directory/Metadata: ${meta.name} processed.`);
            }
        }

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done && buffer.length === 0) break;

                if (value) buffer = Buffer.concat([buffer, Buffer.from(value)]);

                // 1. Шукаємо метадані (рядок JSON до першого \n)
                const newlineIdx = buffer.indexOf('\n');
                if (newlineIdx === -1) {
                    if (done) break; 
                    continue;
                }

                const metaRaw = buffer.subarray(0, newlineIdx);
                let meta;
                try {
                    meta = JSON.parse(metaRaw.toString());
                } catch (e) {
                    // Якщо це не JSON, можливо це залишок після попереднього об'єкта, шукаємо далі
                    buffer = buffer.subarray(newlineIdx + 1);
                    continue;
                }

                buffer = buffer.subarray(newlineIdx + 1);
                const fileSize = meta.size || 0;

                // 3. Якщо є контент, зчитуємо його
                let fileContent = Buffer.alloc(0);
                if (meta.hasContent && fileSize > 0) {
                    while (buffer.length < fileSize) {
                        const { done: d, value: v } = await reader.read();
                        if (d) break;
                        buffer = Buffer.concat([buffer, Buffer.from(v)]);
                    }
                    fileContent = buffer.subarray(0, fileSize);
                    buffer = buffer.subarray(fileSize);

                    // 4. Обробка об'єкта (Збереження файлу)
                    await processItem(targetBaseDir, meta, fileContent);
                }
                
                // 5. Видаляємо boundary з буфера перед наступним об'єктом
                const bIdx = buffer.indexOf(boundaryBuf);
                if (bIdx !== -1) {
                    buffer = buffer.subarray(bIdx + boundaryBuf.length);
                } else if (buffer.indexOf(boundary) !== -1) {
                    // Випадок якщо boundary без \n (в самому кінці)
                    buffer = buffer.subarray(buffer.indexOf(boundary) + boundary.length);
                }

                if (done && buffer.length < boundary.length) break;
            }
            console.log("🏁 Всі файли успішно відновлено!");
        } catch (err) {
            console.error("🚀 Критична помилка при читанні потоку:", err);
        }
    }
    
 */
export async function streamSmartBundle(res, items, { 
        useBase64 = false, 
        boundary = `---OBJ-BOUNDARY-${Date.now()}---`.trim(), 
        compress = true,
        resumeAfter = null,
    } = {}
) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Встановлюємо boundary у заголовки
    const contentType = useBase64 ? 'application/x-ndjson' : 'application/octet-stream';
    res.setHeader('Content-Type', `${contentType}; boundary=${boundary}`); 
    res.setHeader('X-Boundary', boundary); 
    res.setHeader('Accept-Ranges', 'none'); // Для пакетів Range не працює, працює Resume
    // Дозволяємо фронтенду прочитати цей заголовок
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Disposition');

    let output = res;

    // Якщо стиснення увімкнено, повідомляємо клієнта
    if (compress) {
        res.setHeader('Content-Encoding', 'gzip');
        const gzip = zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED });
        gzip.pipe(res);
        output = gzip;
    }

    // Допоміжна функція для Base64 режиму
    async function streamToBuffer(stream) {
        // Для JSON режиму доводиться зчитувати потік у пам'ять (не рекомендується для >100МБ)
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }

    let skipMode = !!resumeAfter;

    for await (const item of items) {
        // Якщо працює режим Resume: пропускаємо айтеми, поки не знайдемо потрібний
        if (skipMode) {
            if (item.uid === resumeAfter) {
                skipMode = false; // Знайшли останній успішний, наступний будемо відправляти
            }
            continue;
        }

        const hasContent = item.content !== undefined && item.content !== null;
        const meta = {
            uid: item.uid || null,  // або fullPathFile
            name: item.name,
            size: hasContent ? (item.size || 0) : 0,
            hash: item.hash || null,
            data: item.metadata || {},
            hasContent: hasContent, // Прапорець для клієнта
            timestamp: Date.now()
        };

        if (useBase64) {
            // СТРАТЕГІЯ 1: JSON Lines + Base64
            // контент або додається як Base64, або лишається null
            let base64Content = null
            let buffer = null

            if (hasContent) {
                if (Buffer.isBuffer(item.content)) {
                    buffer = item.content
                } else if (item.content instanceof Readable) {
                    buffer = await streamToBuffer(item.content);
                }

                base64Content = buffer.toString('base64');
            }

            output.write(JSON.stringify({ ...meta, content: base64Content }) + '\n');
        } else {
            // СТРАТЕГІЯ 2: Binary Pack (JSON метадані + Raw Binary (якщо він є))
            // Формат: [JSON]\n[BINARY][BOUNDARY]\n
            output.write(JSON.stringify(meta) + '\n');

            if (hasContent && meta.size > 0) {
                if (item.content instanceof Readable) {
                    await new Promise((resolve, reject) => {
                        item.content.pipe(output, { end: false });
                        item.content.on('end', resolve);
                        item.content.on('error', reject);
                    });
                } else {
                    output.write(item.content);
                }
            }

            output.write(`\n${boundary}\n`);
        }
        
        // Backpressure check
        if (output.writableNeedDrain) {
            await new Promise(resolve => output.once('drain', resolve));
        }
    }

    if (compress) {
        output.end()
    } else {
        res.end();
    }
    
}


