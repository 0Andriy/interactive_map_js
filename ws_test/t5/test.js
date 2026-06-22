const chatNsp = io.of('/chat');

// Слухаємо глобальні події кластера через наш новий Redis Presence механізм
chatNsp.on('cluster_join', ({ socketId, roomName, remoteServerId }) => {
  logger.info(`[Кластер Сповіщення]: Сокет ${socketId} увійшов в кімнату "${roomName}" на віддаленому сервері [${remoteServerId}]`, 'ClusterPresence');
});

chatNsp.on('cluster_leave', ({ socketId, roomName, remoteServerId }) => {
  logger.warn(`[Кластер Сповіщення]: Сокет ${socketId} залишив кімнату "${roomName}" на віддаленому сервері [${remoteServerId}]`, 'ClusterPresence');
});
