// Призначення: Дозволяє об'єктам із несумісними інтерфейсами працювати разом. Він діє як перекладач між двома системами.
// Де використовується: Інтеграція старих бібліотек, які використовують колбеки, з сучасним Promise-орієнтованим кодом; уніфікація доступу до різних зовнішніх API.

// PaymentAdapter.js (Адаптер)

// Старий сервіс оплати (Legacy Service) з несумісним інтерфейсом
class LegacyPayPalService {
    // Приймає лише колбеки (ніяких Promise)
    makePayment(amount, currency, successCallback, failureCallback) {
        console.log(`[Legacy PayPal] Обробка платежу: ${amount} ${currency}...`);
        if (amount > 0) {
            setTimeout(() => successCallback(true, "TX12345"), 500);
        } else {
            failureCallback("Invalid amount");
        }
    }
}

/**
 * Адаптер: обгортає старий сервіс і надає новий, сумісний інтерфейс (Promise-based).
 */
class PayPalAdapter {
    constructor() {
        this.legacyService = new LegacyPayPalService();
    }

    // Новий метод, який повертає Promise
    processPayment(amount, currency) {
        return new Promise((resolve, reject) => {
            // Адаптуємо колбеки старого сервісу до Promise
            this.legacyService.makePayment(
                amount,
                currency,
                (status, txId) => resolve({ status, txId }),
                (error) => reject(error)
            );
        });
    }
}


// --- Застосування (main.js) ---

console.log("\n--- Патерн Адаптер ---");

// Клієнтський код використовує тільки новий, чистий інтерфейс Адаптера
const adapter = new PayPalAdapter();

adapter.processPayment(100, 'USD')
    .then(response => {
        console.log(`✅ [Client] Платіж успішний! ID транзакції: ${response.txId}`);
    })
    .catch(error => {
        console.error(`❌ [Client] Помилка платежу: ${error}`);
    });
