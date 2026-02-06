import express from 'express'
import {
    sendUniversalFile,
    streamSmartBundle,
    createLobGenerator,
} from './universal-file-transfer.js'
import fs from 'node:fs'
import path from 'node:path'

const app = express()
app.use(express.json())

// Створимо тестовий файл, якщо його немає
const testFile = './test-large-file.bin'
if (!fs.existsSync(testFile)) {
    fs.writeFileSync(testFile, Buffer.alloc(1024 * 1024 * 5, 'X')) // 5MB файл
}

// 1. Тест одиночного файлу (Range, Назва, Хеш)
app.get('/single', async (req, res) => {
    await sendUniversalFile(req, res, {
        source: testFile,
        filename: 'Українська Назва 😊.bin',
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // приклад
        dispositionType: 'inline',
    })
})

// 2. Тест пакетного стрімінгу (Bundle + Resume)
app.get('/bundle', async (req, res) => {
    const resumeAfterUid = req.query.resumeAfterUid || null

    // Симулюємо дані з бази
    async function* mockDatabaseItems() {
        const items = [
            { uid: 'id-1', name: 'config.json', content: Buffer.from('{"status":"ok"}'), size: 17 },
            {
                uid: 'id-2',
                name: 'image_1.png',
                content: fs.createReadStream(testFile),
                size: 5242880,
            },
            {
                uid: 'id-3',
                name: 'image_2.png',
                content: fs.createReadStream(testFile),
                size: 5242880,
            },
        ]

        for (const item of items) {
            yield {
                uid: item.uid,
                name: item.name,
                size: item.size,
                metadata: { folder: 'backup/2024' },
                content: item.content,
            }
        }
    }

    await streamSmartBundle(res, mockDatabaseItems(), {
        useBase64: false,
        compress: true,
        resumeAfter: resumeAfterUid,
    })
})

app.listen(3000, () => console.log('🚀 Тестовий сервер: http://localhost:3000'))


// curl.exe -I http://localhost:3000/single
// curl.exe -v -H "Range: bytes=500-599" http://localhost:3000/single
// curl.exe -v http://localhost:3000/bundle
// curl.exe -v --compressed http://localhost:3000/bundle -o result.txt
// curl.exe -v "http://localhost:3000/bundle?resumeAfterUid=id-2"
// curl.exe -v --compressed "http://localhost:3000/bundle?resumeAfterUid=id-2" -o result.txt
