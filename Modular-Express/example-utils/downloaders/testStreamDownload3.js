import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as readline from 'readline';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


// Опрацювання флажків командного рядка
const args = process.argv.slice(2);
const FLAGS = {
    // --fresh: видалити все і почати з 0
    fresh: args.includes('--fresh'),
    // --resume: продовжувати, якщо є .tmp файл (пріоритет над замовчуванням)
    resume: args.includes('--resume'),
    // Тільки рахувати хеш в пам'яті (без запису на диск)
    noFile: args.includes('--no-file'),
};


const taskId = 1713929
const fileId = 2223485
const HOST = `https://172.16.211.161:3000`
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJQT1JUQUwiLCJzdWIiOiJNVUxJQVJBViIsImF1ZCI6IkFQUFMiLCJ0YWJfbm8iOjEzMDkzLCJsb2dpbiI6Ik1VTElBUkFWIiwicm9sZXMiOlsicG9ydGFsIl0sImRiTmFtZSI6IlRFU1QiLCJpc011bHRpTG9nb24iOmZhbHNlLCJpYXQiOjE3NzAyOTg1MzUsImV4cCI6MTc3MDMwMTUzNX0.D8q7Wkz_IKHm-b8FSDGv8xSZYGb2-CmHJU2UcZENMBI'

const CONFIG = {
    url: `${HOST}/api/v1/portal/tasks/${taskId}/files/${fileId}/range`,
    token: TOKEN,
    testChunkSize: 1024 * 1024, // 1MB для перевірки меж
    downloadDir: './ignore-nodemoon', // Папка для завантаження
    defaultName: 'downloaded_asset.bin',
};


/**
 * Малює прогрес-бар у консолі
 */
function drawProgressBar(current, total, startTime, width = 30) {
    const elapsedMs = Date.now() - startTime;
    const elapsedSec = elapsedMs / 1000;
    const percentage = (current / total) * 100;
    
    // Розрахунок швидкості: Байти / Секунди
    const speedBytesPerSec = elapsedSec > 0 ? current / elapsedSec : 0;
    const speedMBps = (speedBytesPerSec / (1024 * 1024)).toFixed(2);
    
    const progress = Math.round((width * current) / total);
    const bar = '█'.repeat(progress) + '░'.repeat(width - progress);
    
    // Форматуємо вивід: Бар | Відсотки | Швидкість | Об'єм
    const status = `\r📥 [${bar}] ${percentage.toFixed(1)}% | ⚡ ${speedMBps} MB/s | ${(current / (1024 * 1024)).toFixed(1)}MB / ${(total / (1024 * 1024)).toFixed(1)}MB`;
    
    process.stdout.write(status);
}

/**
 * Парсить заголовок Content-Disposition для отримання імені файлу
 */
function getFilenameFromHeaders(headers, defaultName) {
    const disposition = headers.get('content-disposition');
    if (disposition && disposition.includes('filename=')) {
        // Витягуємо текст між filename=" і наступною "
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) return decodeURIComponent(match[1]);
    }
    return defaultName;
}

async function runTest() {
   // Створюємо папку тільки якщо ми збираємося писати файл
    if (!FLAGS.noFile && !fs.existsSync(CONFIG.downloadDir)) {
        fs.mkdirSync(CONFIG.downloadDir, { recursive: true });
    }

    console.log('🚀 Початок перевірки цілісності через fetch...');

    try {
        // 1. Пробний запит для перевірки підтримки Range
        const probe = await fetch(CONFIG.url, {
            headers: { 
                'Authorization': `Bearer ${CONFIG.token}`,
                'Range': 'bytes=0-0' 
            }
        });

        if (!probe.ok) throw new Error(`Сервер відповів помилкою: ${probe.status}`);

        const supportsRange = probe.status === 206;
        const contentRange = probe.headers.get('content-range');
        const totalSize = parseInt(contentRange.split('/')[1], 10);
        const expectedHash = probe.headers.get('x-expected-hash');
        const fileName = getFilenameFromHeaders(probe.headers, CONFIG.defaultName);

        const finalPath = path.join(CONFIG.downloadDir, fileName)
        const tempPath = finalPath + '.tmp'
        const hash = crypto.createHash('sha256');

        console.log(`🚀 Режим: ${supportsRange ? '✅ Range (Пошматково)' : '⚠️ Fallback (Повний потік)'}`);
        console.log(`🚀 Режим: ${FLAGS.noFile ? '⚡ Тільки пам’ять (No-File)' : '💾 Запис на диск'}`);

        // 2. Обробка файлової системи
        if (!FLAGS.noFile) {
            if (FLAGS.fresh) {
                console.log('🗑️  Флажок --fresh: видаляємо старі файли...');
                if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            }

            if (fs.existsSync(finalPath)) {
                const stats = fs.statSync(finalPath);
                const mtime = stats.mtime.toLocaleString('uk-UA'); // Локалізована дата
                const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

                console.log(`ℹ️  Знайдено локальний файл:`);
                console.log(`   📅 Дата зміни: ${mtime}`);
                console.log(`   📦 Розмір: ${sizeMb} MB`);

                if (expectedHash) {
                    console.log(`🔍 Файл знайдено. Перевірка хешу... `);
                    
                    // Читаємо файл стрімом для хешування (щоб не забити RAM великим файлом)
                    const existingHash = await new Promise((resolve) => {
                        const h = crypto.createHash('sha256');
                        const s = fs.createReadStream(finalPath);
                        s.on('data', chunk => h.update(chunk));
                        s.on('end', () => resolve(h.digest('hex')));
                    });

                    if (existingHash.toLowerCase() === expectedHash.toLowerCase()) {
                        console.log(`✅ OK (Хеш збігається): ${existingHash}`);
                        return;
                    } else {
                        console.log('❌ Пошкоджено (Хеш не збігається).');
                        console.log('🔄 Перезавантажуємо файл...');
                        fs.unlinkSync(finalPath); // Видаляємо битий файл
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); // Видаляємо темп, якщо був
                    }
                } else {
                    console.log('✅ Файл знайдено (перевірка хешу неможлива, заголовок з очікувани хешом відсутній).');
                    return;
                }
            }
        }

        let downloadedBytes = 0;
        const startTime = Date.now();

        // --- СЦЕНАРІЙ А: СЕРВЕР ПІДТРИМУЄ RANGE ---
        if (supportsRange) {
            if (!FLAGS.noFile && FLAGS.resume && fs.existsSync(tempPath)) {
                const stats = fs.statSync(tempPath);
                downloadedBytes = stats.size;
                hash.update(fs.readFileSync(tempPath)); // Для хешування існуючої частини
                console.log(`📡 Продовжуємо з ${downloadedBytes} байт`);
            }

            // Відкриваємо файл у режимі 'a' (append - дозапис)
            const fileStream = !FLAGS.noFile ? fs.createWriteStream(tempPath, { flags: 'a' }) : null;

            while (downloadedBytes < totalSize) {
                const end = Math.min(downloadedBytes + CONFIG.testChunkSize - 1, totalSize - 1);
                const res = await fetch(CONFIG.url, {
                    headers: { 
                        'Authorization': `Bearer ${CONFIG.token}`, 
                        'Range': `bytes=${downloadedBytes}-${end}` 
                    }
                });

                const buffer = await res.arrayBuffer();
                const chunk = Buffer.from(buffer);
                
                hash.update(chunk);
                if (fileStream) fileStream.write(chunk);
                downloadedBytes += chunk.length;

                drawProgressBar(downloadedBytes, totalSize, startTime);
            }
            if (fileStream) fileStream.end();

        // --- СЦЕНАРІЙ Б: СЕРВЕР НЕ ПІДТРИМУЄ RANGE (FALLBACK) ---
        } else {
            console.log('📥 Завантаження повним потоком...');
            const res = await fetch(CONFIG.url, { 
                headers: { 
                    'Authorization': `Bearer ${CONFIG.token}` 
                } 
            });

            const fileStream = !FLAGS.noFile ? fs.createWriteStream(tempPath) : null;
            
            // Читаємо як Stream, щоб не забивати RAM
            const reader = res.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                hash.update(value);
                if (fileStream) fileStream.write(value);
                downloadedBytes += value.length;

                drawProgressBar(downloadedBytes, totalSize, startTime);
            }
            if (fileStream) fileStream.end();
        }

        console.log('\n\n🏁 Завантаження завершено!. Перевірка цілісності збереженого файлу (хешу)...');
        const actualHash = hash.digest('hex');

        // 3. Результати
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        const avgSpeed = ((totalSize / (1024 * 1024)) / totalTime).toFixed(2);
        
        console.log('\n\n' + '='.repeat(50));
        console.log(`🏁 Тест завершено за ${totalTime} сек.`);
        console.log(`📈 Середня швидкість: ${avgSpeed} MB/s`);
        console.log(`📦 Файл: ${fileName}`);
        console.log(`📏 Розмір: ${totalSize} байтів, ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`🔑 Очікуваний SHA256: ${expectedHash || 'не надано'}\n`);
        
        // 4. Перевірка хешу збереженого файлу
        if (expectedHash) {
            if (actualHash.toLowerCase() === expectedHash.toLowerCase()) {
                console.log(`✨ Хеш збігається: ${actualHash}`);

                if (!FLAGS.noFile) {
                    fs.renameSync(tempPath, finalPath);
                    console.log(`📂 Файл збережено: ${finalPath}`);
                }
            } else {
                console.error(`❌ Помилка! Хеші не збіглися.`);
                console.error(`Очікували: ${expectedHash}\nОтримали:  ${actualHash}`);
                console.log(`🗑️ Тимчасовий файл ${tempPath} збережено для аналізу помилок.`);
            }
        }

        console.log('='.repeat(50));

    } catch (err) {
        console.error('\n💥 Помилка:', err.message);
    }
}

runTest();