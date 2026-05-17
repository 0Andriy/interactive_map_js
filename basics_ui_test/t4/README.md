# 🚀 Modern Frontend Cheat Sheet: Semantic, BEM, Nesting & Containers

Цей довідник містить ключові стандарти сучасної верстки: від структури HTML до просунутих технік CSS.

---

## 🏗 1. Семантика HTML5
Семантичні теги описують роль контенту, що покращує SEO та доступність (Accessibility).


| Тег | Опис | Порада |
| :--- | :--- | :--- |
| `<header>` | Шапка сторінки або секції | Може містити логотип, пошук, заголовки. |
| `<nav>` | Навігаційне меню | Для основних посилань (не для кожного списку посилань). |
| `<main>` | Головний контент | Має бути лише **один** на сторінці. |
| `<section>` | Тематичний розділ | Використовуйте, якщо у блоку є заголовок (`h2-h6`). |
| `<article>` | Автономний блок | Пост, новина, картка — те, що можна вирвати з контексту. |
| `<aside>` | Другорядний контент | Сайдбар, реклама, виноски. |
| `<footer>` | Підвал сторінки/секції | Авторство, контакти, копірайт. |
| `<figure>` | Ілюстрація/Графік | Групує медіа-контент та підпис `<figcaption>`. |

---

## 🏷 2. BEM (Block, Element, Modifier)
Методологія іменування для створення незалежних та перевикористовуваних компонентів.

### Основні правила:
1.  **Block**: Самостійний об'єкт (`.card`).
2.  **Element**: Частина блоку, що не має сенсу окремо (`.card__title`). Завжди пласка структура: `.card__title`, а не `.card__header__title`.
3.  **Modifier**: Змінює вигляд або стан (`.card--large`, `.card--active`).

### Приклади варіативності:
- **Складні форми**:
  ```html
  <form class="form form--search">
    <input class="form__input form__input--error" type="text">
    <button class="form__button">Шукати</button>
  </form>
  ```
- **BEM Mixes (Мікси)**:
  ```html
  <!-- 'hero__button' задає відступи в Hero, а 'btn' задає загальний вигляд кнопки -->
  <button class="btn hero__button">Натисни мене</button>
  ```

---

## 🔗 3. CSS Nesting (Вкладеність)
Сучасний синтаксис (Native CSS), що дозволяє писати вкладені стилі без препроцесорів.

### Базова вкладеність та псевдокласи:
```css
.card {
  padding: 20px;

  & .card__title { font-weight: bold; } /* Вкладений елемент */
  &:hover { border-color: blue; }        /* Псевдоклас */
}
```

### Зміна елемента залежно від Батька:
За допомогою `&` можна змінити елемент, якщо він опинився в певному контексті.
```css
.button {
  background: gray;

  /* Якщо .button знаходиться всередині .dark-theme */
  .dark-theme & {
    background: black;
    color: white;
  }

  /* Якщо .button є першою дитиною свого батька */
  &:first-child {
    margin-top: 0;
  }

  /* Якщо .button знаходиться всередині .sidebar */
  aside & {
    width: 100%;
    padding: 10px;
  }
}
```

---

## 📦 4. CSS Container Queries
Дозволяють стилізувати елементи залежно від розміру їхнього **безпосереднього батька**, а не всього екрана.

### Реєстрація контейнера:
```css
.card-layout {
  container-type: inline-size;
  container-name: card-container;
}
```

### Використання запиту:
```css
.card {
  display: flex;
  flex-direction: column;

  /* Якщо ширина контейнера 'card-container' більше 450px */
  @container card-container (min-width: 450px) {
    flex-direction: row;
    align-items: center;
    gap: 20px;
  }
}
```

---

## 🛠 Практичний приклад (Комбінація всього)

```html
<main class="page-content">
  <div class="card-slot"> <!-- Container Context -->
    <article class="product-card product-card--featured">
      <h2 class="product-card__title">Pro Laptop 2024</h2>
      <p class="product-card__desc">Потужний інструмент для розробника.</p>
      <button class="product-card__btn">Купити</button>
    </article>
  </div>
</main>
```

```css
.card-slot {
  container-type: inline-size;
}

.product-card {
  background: white;
  padding: 1rem;

  /* Nesting */
  &__title {
    color: #222;

    /* Контекст батька: якщо ми в темній темі */
    .dark-mode & { color: #fff; }
  }

  /* BEM Модифікатор */
  &--featured {
    border: 2px solid gold;
  }

  /* Container Query: коли місця достатньо, збільшуємо текст */
  @container (min-width: 500px) {
    &__title { font-size: 2rem; }
    &__desc { display: block; }
  }
}
```
