
import { WebSocketServer, WebSocket } from 'ws';
import { MAX_MESSAGE_SIZE, validateMessage } from './validation.js';

const MAX_BUFFERED_AMOUNT = 1024 * 1024;
const MAX_MESSAGES_PER_SECOND = 60;
const JOIN_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 15000;
const STATE_LOG_INTERVAL = 200;

function sendJson(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
    console.warn('WebSocket buffer limit exceeded');
    return false;
  }

  socket.send(JSON.stringify(message), (error) => {
    if (error) {
      console.error('WebSocket send error:', error.message);
    }
  });

  return true;
}

function broadcastRoomUpdate(room) {
  room.broadcast({
    type: 'room:update',
    room: {
      ...room.getInfo(),
      players: [...room.clients.values()],
    },
  });
}

export function attachWebSocketServer(httpServer, roomManager, logger) {
  const webSocketServer = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: MAX_MESSAGE_SIZE,
    perMessageDeflate: false,
  });

  webSocketServer.on('connection', (socket) => {
    socket.room = null;
    socket.nickname = null;
    socket.isAlive = true;
    socket.missedPongs = 0;
    socket.messageTimestamps = [];
    socket.lastStateLog = 0;

    const joinTimer = setTimeout(() => {
      if (!socket.room) {
        sendJson(socket, {
          type: 'error',
          message: 'Join timeout',
        });

        socket.close(4001, 'Join timeout');
      }
    }, JOIN_TIMEOUT);

    socket.on('pong', () => {
      socket.isAlive = true;
      socket.missedPongs = 0;
    });

    socket.on('message', (data, isBinary) => {
      const now = Date.now();

      socket.messageTimestamps = socket.messageTimestamps.filter(
        (timestamp) => now - timestamp < 1000,
      );

      if (socket.messageTimestamps.length >= MAX_MESSAGES_PER_SECOND) {
        sendJson(socket, {
          type: 'error',
          message: 'Rate limit exceeded',
        });

        socket.close(4002, 'Rate limit exceeded');
        return;
      }

      socket.messageTimestamps.push(now);

      const validation = validateMessage(data, isBinary);

      if (!validation.valid) {
        sendJson(socket, {
          type: 'error',
          message: validation.error,
        });

        socket.close(
          validation.closeCode ?? 1008,
          validation.error,
        );

        return;
      }

      const message = validation.message;

      switch (message.type) {
        case 'join': {
          const room = roomManager.getRoom(message.roomId);

          if (!room) {
            sendJson(socket, {
              type: 'error',
              message: 'Room not found',
            });
            break;
          }

          if (socket.room) {
            sendJson(socket, {
              type: 'error',
              message: 'Already joined a room',
            });
            break;
          }

          clearTimeout(joinTimer);

          socket.room = room;
          socket.nickname = message.nickname;

          room.addClient(socket, socket.nickname);

          sendJson(socket, {
            type: 'joined',
            room: room.getInfo(),
            nickname: socket.nickname,
          });

          broadcastRoomUpdate(room);

          room.broadcast(
            {
              type: 'system',
              message: `${socket.nickname} joined the room`,
              timestamp: new Date().toISOString(),
            },
            socket,
          );

          break;
        }

        case 'chat': {
          if (!socket.room) {
            sendJson(socket, {
              type: 'error',
              message: 'You must join a room first',
            });
            break;
          }

          logger?.log({
            type: 'chat',
            roomId: socket.room.id,
            nickname: socket.nickname,
            text: message.text,
          });

          socket.room.broadcast({
            type: 'chat',
            nickname: socket.nickname,
            text: message.text,
            timestamp: new Date().toISOString(),
          });

          break;
        }

        case 'state': {
          if (!socket.room) {
            sendJson(socket, {
              type: 'error',
              message: 'You must join a room first',
            });
            break;
          }

          // Записуємо стан корабля в журнал не частіше ніж раз на 200 мс.
          const stateTimestamp = Date.now();

          if (
            !socket.lastStateLog ||
            stateTimestamp - socket.lastStateLog >= STATE_LOG_INTERVAL
          ) {
            logger?.log({
              type: 'player:state',
              roomId: socket.room.id,
              nickname: socket.nickname,
              state: message.state,
            });

            socket.lastStateLog = stateTimestamp;
          }

          // Передаємо стан корабля іншим учасникам кімнати.
          socket.room.broadcast(
            {
              type: 'player:state',
              nickname: socket.nickname,
              state: message.state,
              timestamp: Date.now(),
            },
            socket,
          );

          break;
        }

        case 'leave': {
          if (socket.room) {
            const room = socket.room;
            const nickname = socket.nickname;

            room.removeClient(socket);

            socket.room = null;
            socket.nickname = null;

            sendJson(socket, {
              type: 'left',
            });

            broadcastRoomUpdate(room);

            room.broadcast({
              type: 'system',
              message: `${nickname} left the room`,
              timestamp: new Date().toISOString(),
            });
          }

          break;
        }

        default: {
          sendJson(socket, {
            type: 'error',
            message: 'Unsupported message type',
          });
        }
      }
    });

    socket.on('close', () => {
      clearTimeout(joinTimer);

      if (socket.room) {
        const room = socket.room;
        const nickname = socket.nickname;

        room.removeClient(socket);

        socket.room = null;
        socket.nickname = null;

        broadcastRoomUpdate(room);

        room.broadcast({
          type: 'system',
          message: `${nickname} disconnected`,
          timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on('error', (error) => {
      console.error('WebSocket client error:', error.message);
    });
  });

  const heartbeatTimer = setInterval(() => {
    for (const socket of webSocketServer.clients) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (!socket.isAlive) {
        socket.missedPongs += 1;

        if (socket.missedPongs >= 2) {
          console.warn('Terminating inactive WebSocket client');
          socket.terminate();
          continue;
        }
      }

      socket.isAlive = false;

      socket.ping((error) => {
        if (error) {
          console.error('WebSocket ping error:', error.message);
          socket.terminate();
        }
      });
    }
  }, HEARTBEAT_INTERVAL);

  heartbeatTimer.unref();

  webSocketServer.on('close', () => {
    clearInterval(heartbeatTimer);
  });

  webSocketServer.on('error', (error) => {
    console.error('WebSocket server error:', error.message);
  });

  return webSocketServer;
}
