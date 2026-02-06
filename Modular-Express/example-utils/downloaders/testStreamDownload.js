import { createHash } from 'crypto';
import readline from 'readline';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const URL = 'https://172.16.211.161:3000/api/v1/portal/tasks/542836/manuals/1181763' //'https://172.16.211.161:3000/api/v1/portal/tasks/1713929/files/2223485';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJQT1JUQUwiLCJzdWIiOiJNVUxJQVJBViIsImF1ZCI6IkFQUFMiLCJ0YWJfbm8iOjEzMDkzLCJsb2dpbiI6Ik1VTElBUkFWIiwicm9sZXMiOlsicG9ydGFsIl0sImRiTmFtZSI6IlRFU1QiLCJpc011bHRpTG9nb24iOmZhbHNlLCJpYXQiOjE3NzAwOTY4MzUsImV4cCI6MTc3MDA5OTgzNX0.8DWSaY5j4IRFq4nUXrVTD1oxPPLv0hosoeRwHyo5htE'
//'YOUR_BEARER_TOKEN';
const MAX_RETRIES = 3;

async function downloadWithProgress() {
    const startTime = Date.now();
    const response = await fetch(URL, {
        headers: { 
            'Authorization': `Bearer ${TOKEN}`,
            'Accept-Encoding': 'identity'
        }
    });

    // ДЛЯ ДІАГНОСТИКИ: виведемо всі заголовки, щоб зрозуміти, чому немає розміру
    // console.log([...response.headers.entries()]); 

    if (!response.ok) throw new Error(`Помилка: ${response.statusText}`);

    const totalBytes = parseInt(response.headers.get('content-length') || response.headers.get('x-file-size') || 0, 10);
    const expectedHash = response.headers.get('x-expected-hash'); // заголовок вашого сервера 'x-sha256-checksum'
    
    const reader = response.body.getReader();
    const hash = createHash('sha256');
    let downloadedBytes = 0;

    console.log('🚀 Початок потокового зчитування...');

    while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        downloadedBytes += value.length;
        hash.update(value);

        // Розрахунок швидкості
        const elapsedSec = (Date.now() - startTime) / 1000;
        const mbPerSec = (downloadedBytes / 1024 / 1024 / (elapsedSec || 1)).toFixed(2);
        const currentMB = (downloadedBytes / 1024 / 1024).toFixed(2);
        const totalMB = (totalBytes / 1024 / 1024).toFixed(2); // Загальна вага

        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);

        if (!isNaN(totalBytes) && totalBytes > 0) {
            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(2);
            const barLength = 20;
            const filled = Math.round((downloadedBytes / totalBytes) * barLength);
            const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
            
            // Вивід прогрес-бару в один рядок
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);

            // Вивід: [███] 50% | 50.00 / 100.00 MB | 5.20 MB/s
            process.stdout.write(`📥 [${bar}] ${percent}% | ${currentMB} / ${totalMB} MB | 🚀 ${mbPerSec} MB/s`);
        } else {
            // Якщо розмір НЕВІДОМИЙ — просто лічильник MB
            process.stdout.write(`📥 Завантажено: ${currentMB} MB | 🚀 ${mbPerSec} MB/s (розмір невідомий)`);
        }
    }

    const actualHash = hash.digest('hex');
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n\n✅ Завершено за ${totalTime}с.`);
    console.log(`Результат SHA256: ${actualHash}`);

    if (expectedHash && actualHash === expectedHash.toLowerCase()) {
        console.log('✅ Хеш співпадає!');
    } else {
        console.log(expectedHash ? '❌ Хеш НЕ співпадає!' : 'ℹ️ Хеш для перевірки відсутній у заголовках.');
    }
}

downloadWithProgress().catch(err => console.error('\n💥 Помилка:', err.message));