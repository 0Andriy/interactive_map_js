document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form')

    // Перевіряємо, чи ми взагалі на сторінці логіну, щоб не викликати помилок в layout
    if (!form) return

    const usernameInput = document.getElementById('username')
    const passwordInput = document.getElementById('password')
    const togglePasswordBtn = document.getElementById('toggle-password')
    const globalErrorMessage = document.getElementById('error-message')
    const submitBtn = document.getElementById('submit-btn')
    const rememberMeCheckbox = document.getElementById('rememberMe')

    // Безпечно шукаємо лоадер та текст всередині кнопки
    const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null
    const btnLoader = submitBtn ? submitBtn.querySelector('.btn-loader') : null

    // =========================================================================
    // 1. АВТОМАТИЧНЕ ВІДОБРАЖЕННЯ ПОМИЛОК З URL (Для наскрізного входу)
    // =========================================================================
    const urlParams = new URLSearchParams(window.location.search)
    const urlError = urlParams.get('error')

    if (urlError) {
        // Виводимо людський текст помилки, який прислала Middleware
        showGlobalError(decodeURIComponent(urlError))

        // Очищаємо URL-рядок від помилки без перезавантаження сторінки
        window.history.replaceState({}, document.title, window.location.pathname)
    }

    // =========================================================================
    // 2. КЕРУВАННЯ КНОПКОЮ ОКА ДЛЯ ПАРОЛЯ
    // =========================================================================
    if (togglePasswordBtn && passwordInput) {
        const iconEyeOpen = togglePasswordBtn.querySelector('#icon-eye-open')
        const iconEyeClosed = togglePasswordBtn.querySelector('#icon-eye-closed')

        togglePasswordBtn.addEventListener('click', (event) => {
            event.preventDefault() // Запобігаємо будь-якій неочікуваній поведінці

            // 1. Запам'ятовуємо поточний стан ДО зміни типу поля
            const isPassword = passwordInput.type === 'password'

            // 2. Змінюємо тип поля
            passwordInput.type = isPassword ? 'text' : 'password'

            // togglePasswordBtn.textContent = isPassword ? '🔒' : '👁️'

            // Перемикаємо видимість SVG-іконок
            if (iconEyeOpen && iconEyeClosed) {
                if (isPassword) {
                    // Пароль став текстом: ховаємо відкрите око, показуємо закреслене
                    iconEyeOpen.setAttribute('hidden', '')
                    iconEyeClosed.removeAttribute('hidden')
                } else {
                    // Пароль знову став крапками: показуємо відкрите око, ховаємо закреслене
                    iconEyeOpen.removeAttribute('hidden')
                    iconEyeClosed.setAttribute('hidden', '')
                }
            }
        })
    }

    // =========================================================================
    // 3. ОЧИЩЕННЯ ПОМИЛОК ПІД ЧАС ВВЕДЕННЯ ТЕКСТУ
    // =========================================================================
    if (usernameInput) {
        usernameInput.addEventListener('input', () =>
            clearFieldError(usernameInput, 'username-error'),
        )
    }
    if (passwordInput) {
        passwordInput.addEventListener('input', () =>
            clearFieldError(passwordInput, 'password-error'),
        )
    }

    // =========================================================================
    // 4. ОБРОБКА ВІДПРАВКИ ФОРМИ
    // =========================================================================
    form.addEventListener('submit', async (event) => {
        event.preventDefault() // Зупиняємо перезавантаження сторінки

        clearAllErrors()
        let hasError = false

        // Валідація логіну
        if (!usernameInput || !usernameInput.value.trim()) {
            if (usernameInput)
                showFieldError(usernameInput, 'username-error', 'Будь ласка, введіть логін.')
            hasError = true
        }

        // Валідація пароля
        if (!passwordInput || !passwordInput.value.trim()) {
            if (passwordInput)
                showFieldError(passwordInput, 'password-error', 'Будь ласка, введіть пароль.')
            hasError = true
        }

        if (hasError) return

        try {
            setLoading(true)

            const username = usernameInput.value.trim().toUpperCase()
            const password = passwordInput.value // Або .trim(), якщо сервер приймає без пробілів

            // Надсилаємо дані на ваш Express-ендпоінт
            const response = await fetch('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: username,
                    password: password,
                    rememberMe: !!rememberMeCheckbox?.checked, // Безпечне приведення до boolean
                    appId: 'VEGA_USER',
                }),
            })

            // Перевіряємо, чи відповідь сервера є JSON
            const contentType = response.headers.get('content-type')
            let data = {}
            if (contentType && contentType.includes('application/json')) {
                data = await response.json()
            }

            if (!response.ok) {
                // Розподіляємо помилки залежно від відповіді сервера
                if (data.field === 'username') {
                    showFieldError(usernameInput, 'username-error', data.message)
                } else if (data.field === 'password') {
                    showFieldError(passwordInput, 'password-error', data.message)
                } else {
                    showGlobalError(data.message || 'Невірний логін або пароль.')
                }
                setLoading(false)
                return
            }

            // Успішний вхід — перенаправлення
            window.location.href = '/'
        } catch (error) {
            console.error('Помилка авторизації:', error)
            showGlobalError("Не вдалося з'єднатися з сервером. Спробуйте пізніше.")
            setLoading(false)
        } finally {
            // Виконується завжди: і при помилці, і при успіху (якщо не було редіректу)
            setLoading(false)
        }
    })

    // --- Допоміжні функції інтерфейсу ---
    function showFieldError(inputElement, errorBlockId, message) {
        if (!inputElement) return
        inputElement.classList.add('is-invalid')
        const errorBlock = document.getElementById(errorBlockId)
        if (errorBlock) {
            errorBlock.textContent = message
            errorBlock.hidden = false
        }
    }

    function clearFieldError(inputElement, errorBlockId) {
        if (!inputElement) return
        inputElement.classList.remove('is-invalid')
        const errorBlock = document.getElementById(errorBlockId)
        if (errorBlock) {
            errorBlock.textContent = ''
            errorBlock.hidden = true
        }
        hideGlobalError()
    }

    function showGlobalError(text) {
        if (globalErrorMessage) {
            globalErrorMessage.textContent = text
            globalErrorMessage.hidden = false
        }
    }

    function hideGlobalError() {
        if (globalErrorMessage) {
            globalErrorMessage.textContent = ''
            globalErrorMessage.hidden = true
        }
    }

    function clearAllErrors() {
        clearFieldError(usernameInput, 'username-error')
        clearFieldError(passwordInput, 'password-error')
        hideGlobalError()
    }

    function setLoading(isLoading) {
        if (!submitBtn) return
        submitBtn.disabled = isLoading
        if (btnText) btnText.hidden = isLoading
        if (btnLoader) btnLoader.hidden = !isLoading
    }
})
