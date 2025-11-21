// src/brokers/IMessageBroker.js
export default class IMessageBroker {
    publish(channel, message) {
        throw new Error('Метод publish() повинен бути реалізований.')
    }
    subscribe(channel, handler) {
        throw new Error('Метод subscribe() повинен бути реалізований.')
    }
}
