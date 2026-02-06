import { createHash } from 'crypto';
import * as readline from 'readline';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


const taskId = 542836
const HOST = `https://172.16.211.161:3000`
const LIST_API_URL = `${HOST}/api/v1/portal/tasks/${taskId}/sync`
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJQT1JUQUwiLCJzdWIiOiJNVUxJQVJBViIsImF1ZCI6IkFQUFMiLCJ0YWJfbm8iOjEzMDkzLCJsb2dpbiI6Ik1VTElBUkFWIiwicm9sZXMiOlsicG9ydGFsIl0sImRiTmFtZSI6IlRFU1QiLCJpc011bHRpTG9nb24iOmZhbHNlLCJpYXQiOjE3NzAxOTI3NzUsImV4cCI6MTc3MDE5NTc3NX0.ii2HvDb-f6gxow0Y3ilDy4yvOjtkAnyM6XGYULx9Q1g'




// Функція для завантаження ОДНОГО файлу (ваша логіка з прогрес-баром)
async function downloadFile(fileData, index, totalFiles) {
    const { downloadUrl, fileName } = fileData;
    const startTime = Date.now();
    
    console.log(`\n📦 [${index + 1}/${totalFiles}] Завантаження: ${fileName || downloadUrl}`);

    const response = await fetch(`${HOST}${downloadUrl}`, {
        headers: { 
            'Authorization': `Bearer ${TOKEN}`,
            'Accept-Encoding': 'identity'
        }
    });

    if (!response.ok) throw new Error(`Помилка: ${response.statusText}`);

    const totalBytes = parseInt(response.headers.get('content-length') || response.headers.get('x-file-size') || 0, 10);
    const expectedHash = response.headers.get('x-expected-hash');
    
    const reader = response.body.getReader();
    const hash = createHash('sha256');
    let downloadedBytes = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        downloadedBytes += value.length;
        hash.update(value);

        const elapsedSec = (Date.now() - startTime) / 1000;
        const mbPerSec = (downloadedBytes / 1024 / 1024 / (elapsedSec || 1)).toFixed(2);
        const currentMB = (downloadedBytes / 1024 / 1024).toFixed(2);

        readline.cursorTo(process.stdout, 0);
        if (totalBytes > 0) {
            const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(2);
            process.stdout.write(`📥 [${percent}%] ${currentMB}/${totalMB} MB | 🚀 ${mbPerSec} MB/s`);
        } else {
            process.stdout.write(`📥 Завантажено: ${currentMB} MB | 🚀 ${mbPerSec} MB/s`);
        }
    }

    const actualHash = hash.digest('hex');
    console.log(`\n✅ Готово. SHA256: ${actualHash}`); // ${actualHash.substring(0, 10)}...
    return actualHash;
}

// Головна функція для керування чергою
async function main() {
    try {
        // Етап 1: Отримання масиву об'єктів з URL
        console.log('🔍 Отримання списку файлів...');
        const listResponse = await fetch(LIST_API_URL, {
            method: "POST",
            headers: { 
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([])
        });

        if (!listResponse.ok) throw new Error(`Sync API error: ${listResponse.status}`);

        const { tasks: files } = await listResponse.json(); // Очікуємо [{url: '...', name: '...'}, ...]
        console.log(files)

        if (!Array.isArray(files)) throw new Error('Отримано некоректний формат списку');

        // Етап 2: Послідовне завантаження кожного файлу
        for (let i = 0; i < files.length; i++) {
            await downloadFile(files[i], i, files.length)
        }

        console.log('\n\n🎉 Усі завантаження завершено!');
    } catch (err) {
        console.error('\n💥 Критична помилка:', err.message);
    }
}

main();



