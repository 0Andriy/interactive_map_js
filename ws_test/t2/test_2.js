const ws = new WebSocket('ws://localhost:3000/game');

ws.onmessage = (message) => {
  const parsed = JSON.parse(message.data);

  // 1. Обробка вхідного Acknowledgement від сервера
  if (parsed.event === 'ping-client') {
    console.log('Сервер надіслав пінг:', parsed.data);
    
    // Якщо сервер очікує відповідь (передав ackId), повертаємо її
    if (parsed.ackId) {
      ws.send(JSON.stringify({
        isAckResponse: true,
        ackId: parsed.ackId,
        data: { status: 'Успішно доставлено на клієнт!' }
      }));
    }
  }
};

// 2. Запит до сервера з очікуванням підтвердження (Клієнт -> Сервер)
// Створюємо тимчасовий механізм для прослуховування клієнтського Ack
function askServerTime() {
  const clientAckId = 999; // В реальному коді має бути лічильник
  
  // Підписуємося на одноразову відповідь від сервера
  const listenResponse = (msg) => {
    const res = JSON.parse(msg.data);
    if (res.isAckResponse && res.ackId === clientAckId) {
      console.log('Сервер повернув час через колбек:', res.data.time);
      ws.removeEventListener('message', listenResponse);
    }
  };
  ws.addEventListener('message', listenResponse);

  // Відправляємо запит
  ws.send(JSON.stringify({
    event: 'get-server-time',
    data: {},
    ackId: clientAckId
  }));
}

// Виклик тесту через 3 секунди після відкриття сокету
setTimeout(askServerTime, 3000);
