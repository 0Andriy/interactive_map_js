// DocumentFactory.js (Factory Method)

class PDFDocument {
    generate() {
        console.log('📄 Генерація PDF-документа.')
    }
}

class HTMLDocument {
    generate() {
        console.log('🌐 Генерація HTML-документа.')
    }
}

/**
 * Клас DocumentFactory інкапсулює логіку створення різних типів документів.
 */
class DocumentFactory {
    /**
     * Фабричний метод, який створює об'єкт на основі типу.
     * @param {string} type - Тип документа ('pdf' або 'html').
     */
    createDocument(type) {
        switch (type.toLowerCase()) {
            case 'pdf':
                return new PDFDocument()
            case 'html':
                return new HTMLDocument()
            default:
                throw new Error(`Непідтримуваний тип документа: ${type}`)
        }
    }
}

export default DocumentFactory

// --- Застосування (main.js) ---

import DocumentFactory from './DocumentFactory.js'

console.log('\n--- Патерн Фабрика ---')

const factory = new DocumentFactory()

// Клієнтський код використовує фабрику, не знаючи, як створюються PDF чи HTML
const pdfDoc = factory.createDocument('pdf')
pdfDoc.generate()

const htmlDoc = factory.createDocument('html')
htmlDoc.generate()
