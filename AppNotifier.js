export class AppNotifier {
  // Зберігаємо посилання на ОСТАННЄ активне сповіщення
  static activeNotification = null;

  /**
   * Запитує дозвіл на сповіщення, якщо додаток запущено у звичайному браузері
   * (В Electron зазвичай права надаються автоматично "granted").
   */
  static async requestPermission() {
    if (!("Notification" in window)) {
      console.warn("Цей браузер або середовище не підтримує сповіщення.");
      return false;
    }

    if (Notification.permission === "granted") return true;

    if (Notification.permission === "denied") {
      console.warn("Сповіщення заблоковані.");
      return false
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    }

    return false;
  }

  /**
   * Створює та показує інформативне сповіщення.
   * @param {string} title - Заголовок сповіщення.
   * @param {string} body - Текст повідомлення (деталі).
   * @param {Object} options - Додаткові налаштування.
   * @param {string} [options.tag='default-tag'] - Тег для групування (нове замінить старе з таким же тегом).
   * @param {string} [options.icon=''] - Шлях до іконки.
   * @param {boolean} [options.requireInteraction=true] - Чи тримати сповіщення на екрані, поки користувач не закриє.
   * @param {boolean} [options.silent=false] - Вимкнути звук сповіщення ОС.
   * @param {Function} [options.onClick=null] - Кастомна функція, яка виконається при кліку.
   */
  static async send({
    title,
    body,
    tag = "app-alert-tag",
    icon = "",
    requireInteraction = true,
    silent = false,
    onClick = null,
  }) {
    // 1. Перевіряємо та запитуємо права
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      console.error("Сповіщення заблоковані користувачем або системою.");
      return null;
    }

    // 2. Конфігурація налаштувань HTML5 Notification API
    const notificationOptions = {
      body: body,
      icon: icon,
      tag: tag,
      requireInteraction: requireInteraction,
      silent: silent,
    };

    // 3. Створення нативного сповіщення
    const notification = new Notification(title, notificationOptions);

    // Запам'ятовуємо його як активне
    this.activeNotification = notification;

    // 4. Стандартна поведінка при кліку (Вивід вікна на передній план)
    notification.onclick = (event) => {
      event.preventDefault();

      // Спроба активувати вікно на рівні ОС
      window.focus();

      // Якщо передано кастомний колбек — викликаємо його
      if (typeof onClick === "function") {
        onClick(event);
      }
      
      notification.close();
    };

    // Обробка помилок (наприклад, якщо ОС відхилила банер)
    notification.onerror = (err) => {
      console.error("Помилка відображення сповіщення:", err);
      try {
        notification.close(); // Очищаємо ресурси при помилці
      } catch(err) {}
    };

    return notification;
  }
}

// Експортуємо для використання у модулях (якщо потрібно)
// export default AppNotifier;

AppNotifier.send({
  title: "📥 Новий документ",
  body: "Менеджер завантажив рахунок для договору №42. Натисніть, щоб відкрити.",
  tag: "document-updates", // Всі нові документи будуть оновлювати цей банер, не створюючи купу нових
});

AppNotifier.send({
  title: "⚠️ Критична помилка API",
  body: "Втрачено зв'язок із сервером бази даних. Перевірте підключення до мережі!",
  tag: "system-errors",
  requireInteraction: true, // Буде висіти, поки користувач не закриє хрестиком
  silent: false, // Увімкне стандартний системний звук ОС для привернення уваги
});

AppNotifier.send({
  title: "💬 Нове повідомлення",
  body: "Олена: 'Привіт! Коли буде готовий звіт?'",
  tag: "chat-messages",
  onClick: () => {
    // Окрім підняття вікна, ми можемо одразу відкрити потрібну вкладку всередині додатку
    if (typeof openChatWithUser === "function") {
      openChatWithUser("Олена");
    }
  },
});

function openChatWithUser(userName) {
  // 1. Знаходимо всі вкладки додатку та ховаємо їх, крім розділу чатів
  document.querySelectorAll(".app-section").forEach((section) => {
    section.classList.add("hidden");
  });

  const chatSection = document.getElementById("chat-section");
  if (chatSection) chatSection.classList.remove("hidden");

  // 2. Знаходимо потрібного користувача у списку контактів зліва та симулюємо клік по ньому
  const userElement = Array.from(
    document.querySelectorAll(".contact-item"),
  ).find((el) => el.textContent.trim() === userName);

  if (userElement) {
    userElement.click(); // Емулюємо фізичний клік користувача по контакту
  } else {
    console.warn(`Користувача ${userName} не знайдено у списку контактів.`);
  }
}
