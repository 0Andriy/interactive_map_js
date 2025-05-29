import { generateKeyPair } from 'crypto'
import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'

function writeKey(filename, content) {
    const folder = path.resolve('./keys')
    mkdirSync(folder, { recursive: true })
    writeFileSync(path.join(folder, filename), content)
}

generateKeyPair(
    'rsa',
    {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    },
    (err, publicKey, privateKey) => {
        if (err) throw err
        writeKey('rsa_private.pem', privateKey)
        writeKey('rsa_public.pem', publicKey)
        console.log('🔐 RSA keys generated in /keys/')
    },
)

// node scripts/genKeys.js
