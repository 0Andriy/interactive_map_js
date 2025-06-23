import morgan from 'morgan'
import logger from '../utils/logger.js'

const morganMiddleware = morgan(
    function (tokens, req, res) {
        return JSON.stringify({
            remote_address: tokens['remote-addr'](req, res), // IP-адреса клієнта
            remote_user: tokens['remote-user'](req, res), // Ім’я користувача (якщо є)
            // date: tokens['date'](req, res, 'iso'),                // Дата у формі ISO
            method: tokens.method(req, res), // HTTP-метод
            url: tokens.url(req, res), // URL запиту
            http_version: tokens['http-version'](req, res), // Версія HTTP
            status: tokens.status(req, res), // Статус код відповіді
            content_length: tokens.res(req, res, 'content-length'), // Розмір відповіді
            referrer: tokens.referrer(req, res), // URL реферера
            user_agent: tokens['user-agent'](req, res), // Інформація про браузер
            response_time: `${tokens['response-time'](req, res)} ms`, // Час обробки запиту
        })
    },
    {
        stream: {
            // Configure Morgan to use our custom logger with the http severity
            write: (message) => {
                const data = JSON.parse(message.trim())
                logger.http(`incoming-request`, data)

                // const formattedString = Object.entries(data)
                //     .map(([key, value]) => `${key}: ${value}`)
                //     .join(' | ');

                // config.logger.http(formattedString.trim())
            },
        },
    },
)

export default morganMiddleware
