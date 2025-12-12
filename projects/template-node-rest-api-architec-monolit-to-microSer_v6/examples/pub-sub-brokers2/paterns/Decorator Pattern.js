// Призначення: Дозволяє динамічно додавати нову поведінку або відповідальність до об'єкта, не змінюючи його оригінального коду.
// Це досягається шляхом "обгортання" оригінального об'єкта в новий об'єкт-декоратор.
// Де використовується: Express/Koa Middleware, додавання функціоналу (логінг, аутентифікація, кешування) до існуючих функцій або класів без спадкування.

// AuthDecorator.js (Декоратор)

// Оригінальний клас сервісу (компонент)
class UserProfileService {
    getUser(userId) {
        console.log(`[Service] Отримання даних користувача ID: ${userId} з бази даних.`);
        return { id: userId, name: "Test User", role: "user" };
    }
}

/**
 * Декоратор, який додає перевірку автентифікації до сервісу.
 * Він обгортає оригінальний сервіс і додає логіку перед викликом оригінального методу.
 */
class AuthenticatedUserProfileService {
    constructor(userProfileService, currentUser) {
        this.service = userProfileService;
        this.currentUser = currentUser;
    }

    getUser(userId) {
        // Додаткова поведінка (декорування): перевірка автентифікації
        if (!this.currentUser || !this.currentUser.isAuthenticated) {
            console.log('[Decorator] Помилка аутентифікації! Доступ заборонено.');
            return null;
        }

        console.log('[Decorator] Користувач автентифікований. Викликаємо оригінальний сервіс.');
        // Викликаємо метод оригінального об'єкта
        return this.service.getUser(userId);
    }
}


// --- Застосування (main.js) ---

console.log("\n--- Патерн Декоратор ---");

// Створюємо оригінальний сервіс
const originalService = new UserProfileService();

// Створюємо об'єкт поточного користувача (автентифікований)
const loggedInUser = { id: 1, isAuthenticated: true };

// Обгортаємо оригінальний сервіс декоратором
const secureService = new AuthenticatedUserProfileService(originalService, loggedInUser);

// Використовуємо декорований сервіс
secureService.getUser(101); // Працює

// Створюємо неавтентифікованого користувача
const loggedOutUser = { id: 2, isAuthenticated: false };
const secureServiceLoggedOut = new AuthenticatedUserProfileService(originalService, loggedOutUser);

secureServiceLoggedOut.getUser(102); // Заблоковано декоратором
