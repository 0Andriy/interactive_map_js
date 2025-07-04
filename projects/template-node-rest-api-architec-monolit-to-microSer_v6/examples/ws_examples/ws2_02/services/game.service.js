// src/websockets/services/game.service.js (namespace)

/**
 * @file Обробник логіки для WebSocket неймспейсу гри (`/ws/game/:gameId`).
 * Керує підключеннями, повідомленнями та відключеннями клієнтів гри,
 * використовуючи RoomManager для управління ігровими кімнатами та синхронізацією стану.
 */

import { roomManager } from '../index.js' // Імпортуємо RoomManager

/**
 * Унікальний префікс для всіх ігрових кімнат.
 * @type {string}
 * @constant
 */
const GAME_ROOM_PREFIX = 'game:'

/**
 * Генерує повну унікальну назву ігрової кімнати, використовуючи префікс.
 * @param {string} gameId - Унікальний ідентифікатор гри.
 * @returns {string} Повна назва ігрової кімнати (наприклад, 'game:mygame123').
 */
const getGameRoomName = (gameId) => `${GAME_ROOM_PREFIX}${gameId}`

/**
 * Інтервал оновлення стану гри в мілісекундах.
 * @type {number}
 * @constant
 * @default 2000 (2 секунди)
 */
const GAME_UPDATE_INTERVAL_MS = 2000

/**
 * Обробник підключення нового клієнта до неймспейсу гри.
 * Приєднує клієнта до вказаної ігрової кімнати та налаштовує періодичні оновлення стану гри.
 * @param {import('../RoomManager.js').CustomWebSocket} ws - Об'єкт WebSocket клієнта.
 * @param {string} gameId - ID гри, до якої приєднується клієнт (витягується з URL).
 */
const handleGameConnection = async (ws, gameId) => {
    // Формуємо унікальну назву кімнати з префіксом
    const roomName = getGameRoomName(gameId)
    roomManager.logger.info(
        `[Game Namespace] Client ${
            ws.username || ws.userId
        } connecting to game ${gameId} (room: ${roomName}).`,
    )

    /**
     * Асинхронна функція зворотного виклику для періодичного оновлення стану гри.
     * @param {string} currentRoomName - Повна назва кімнати, для якої відбувається оновлення.
     * @param {Set<import('../RoomManager.js').CustomWebSocket>} clientsInRoom - Множина клієнтів у цій кімнаті на поточному інстансі.
     * @returns {Promise<object>} Об'єкт, що представляє поточний стан гри.
     */
    const gameUpdateCallback = async (currentRoomName, clientsInRoom) => {
        // У реальному застосунку тут буде складна логіка отримання поточного стану гри з БД/пам'яті
        // та формування оновлення для клієнтів.
        const gameState = {
            type: 'GAME_STATE_UPDATE',
            gameId: currentRoomName.substring(GAME_ROOM_PREFIX.length), // Повертаємо чистий gameId
            playersCount: clientsInRoom.size, // Кількість гравців на цьому інстансі
            status: 'playing',
            timestamp: Date.now(),
            dummyData: Math.random(), // Демонстраційні дані, що змінюються
        }
        roomManager.logger.debug(
            `[Game Namespace] Sending game state update for ${currentRoomName}. Players: ${clientsInRoom.size}`,
        )
        return gameState // RoomManager опублікує це в Redis, який потім розішле всім клієнтам у кімнаті
    }

    // Приєднання до ігрової кімнати з періодичним оновленням
    await roomManager.joinRoom(roomName, ws, gameUpdateCallback, GAME_UPDATE_INTERVAL_MS, true)

    ws.send(
        JSON.stringify({
            type: 'GAME_WELCOME',
            message: `Welcome to game ${gameId}, ${ws.username}!`,
            currentPlayers: roomManager.getClientCount(roomName),
        }),
    )

    // Повідомляємо інших гравців про нового гравця
    await roomManager.sendMessageToRoom(roomName, {
        type: 'GAME_PLAYER_JOINED',
        username: ws.username,
        message: `${ws.username} has joined the game.`,
        currentPlayers: roomManager.getClientCount(roomName),
    })
}

/**
 * Обробник повідомлення від клієнта в неймспейсі гри.
 * Обробляє ігрові дії або внутрішньоігровий чат.
 * @param {import('../RoomManager.js').CustomWebSocket} ws - Об'єкт WebSocket клієнта.
 * @param {string | Buffer} message - Отримане повідомлення від клієнта.
 */
const handleGameMessage = async (ws, message) => {
    try {
        const parsedMessage = JSON.parse(message.toString())
        // Знаходимо roomName, до якої належить цей клієнт з його myRooms
        const roomName =
            ws.myRooms && Array.from(ws.myRooms).find((room) => room.startsWith(GAME_ROOM_PREFIX))
        const gameId = roomName ? roomName.substring(GAME_ROOM_PREFIX.length) : 'unknown_game'

        if (!roomName) {
            roomManager.logger.warn(
                `[Game Namespace] Client ${ws.username} sent message without being in a game room. Path: ${ws.path}`,
            )
            return
        }

        if (parsedMessage.type === 'GAME_ACTION' && parsedMessage.action) {
            roomManager.logger.debug(
                `[Game Namespace] Action from ${ws.username} in game ${gameId}: ${parsedMessage.action}`,
            )
            // Тут буде логіка обробки ігрових дій (наприклад, рух, постріл)
            // Після обробки, можливо, потрібно буде розіслати оновлення стану
            await roomManager.sendMessageToRoom(roomName, {
                type: 'GAME_ACTION_RECEIVED',
                username: ws.username,
                action: parsedMessage.action,
                timestamp: Date.now(),
            })
        } else if (parsedMessage.type === 'GAME_CHAT' && parsedMessage.text) {
            roomManager.logger.debug(
                `[Game Namespace] Game Chat from ${ws.username} in game ${gameId}: ${parsedMessage.text}`,
            )
            await roomManager.sendMessageToRoom(roomName, {
                type: 'GAME_IN_GAME_CHAT',
                username: ws.username,
                text: parsedMessage.text,
                timestamp: Date.now(),
            })
        } else {
            roomManager.logger.warn(
                `[Game Namespace] Invalid message format from ${ws.username} in game ${gameId}:`,
                parsedMessage,
            )
        }
    } catch (error) {
        roomManager.logger.error(
            `[Game Namespace] Error parsing message from ${ws.username}:`,
            error,
        )
    }
}

/**
 * Обробник відключення клієнта від неймспейсу гри.
 * @param {import('../RoomManager.js').CustomWebSocket} ws - Об'єкт WebSocket клієнта.
 */
const handleGameClose = async (ws) => {
    roomManager.logger.info(
        `[Game Namespace] Client ${ws.username || ws.userId} disconnected from game.`,
    )
    // Додаткова логіка, якщо потрібно, після того, як клієнт покине кімнату (наприклад, оновлення статусу гравця в БД).
}

export default {
    handleConnection: handleGameConnection,
    handleMessage: handleGameMessage,
    handleClose: handleGameClose,
}
