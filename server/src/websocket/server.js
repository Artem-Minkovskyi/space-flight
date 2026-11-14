import { WebSocketServer, WebSocket } from 'ws';
import { MAX_MESSAGE_SIZE, validateMessage } from './validation.js';
import { createShipState, integrateShip, SIMULATION } from '../../../shared/simulation.js';
import { decodeInput, encodeSnapshot } from '../../../shared/protocol.js';
import { recordMessage, updateRuntimeMetrics } from '../runtime.js';

const MAX_BUFFERED_AMOUNT = 1024 * 1024;
const MAX_MESSAGES_PER_SECOND = 90;
const JOIN_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 15000;
const TICK_MS = 1000 / SIMULATION.tickRate;

function sendJson(socket, message) {
  if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_BUFFERED_AMOUNT) return false;
  socket.send(JSON.stringify(message));
  return true;
}

function broadcastRoomUpdate(room) {
  room.broadcast({ type: 'room:update', room: { ...room.getInfo(), players: [...room.clients.values()] } });
}

function sendSnapshot(room, tick) {
  const players = [...room.clients.values()].map(user => ({
    id: user.id, nickname: user.nickname, state: user.state,
  }));
  for (const [socket, user] of room.clients.entries()) {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > MAX_BUFFERED_AMOUNT) continue;
    if (user.protocol === 'binary') socket.send(encodeSnapshot(tick, players));
    else sendJson(socket, { type: 'snapshot', tick, players });
  }
}

export function attachWebSocketServer(httpServer, roomManager, options = {}) {
  const { log = console, maxConnectionsPerIp = 20, maxPlayersPerRoom = 16, allowedOrigins = [] } = options;
  const ipConnections = new Map();
  const wss = new WebSocketServer({
    server: httpServer, path: '/ws', maxPayload: MAX_MESSAGE_SIZE, perMessageDeflate: false,
    verifyClient: ({ origin, req }, done) => {
      const hostOrigin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      const allowed = allowedOrigins.length === 0
        ? (!origin || origin === hostOrigin)
        : allowedOrigins.includes(origin);
      if (!allowed) return done(false, 403, 'Origin not allowed');
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
      const count = ipConnections.get(ip) || 0;
      if (count >= maxConnectionsPerIp) return done(false, 429, 'Too many connections from this IP');
      done(true);
    },
  });

  let nextPlayerId = 1;
  let tick = 0;
  let nextTick = performance.now() + TICK_MS;
  let tickTimer;

  function updateMetrics() {
    let players = 0;
    for (const room of roomManager.rooms.values()) players += room.clients.size;
    updateRuntimeMetrics({ players, rooms: roomManager.rooms.size });
  }

  function runTick() {
    const started = performance.now();
    const now = started;
    while (now >= nextTick) {
      tick++;
      for (const room of roomManager.rooms.values()) {
        for (const user of room.clients.values()) {
          user.state = integrateShip(user.state, user.input, SIMULATION.dt, room.arena);
        }
        if (room.clients.size) sendSnapshot(room, tick);
      }
      nextTick += TICK_MS;
    }
    updateRuntimeMetrics({ tickDurationMs: performance.now() - started });
    tickTimer = setTimeout(runTick, Math.max(0, nextTick - performance.now()));
  }
  tickTimer = setTimeout(runTick, TICK_MS);

  wss.on('connection', (socket, request) => {
    const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.socket.remoteAddress || 'unknown';
    ipConnections.set(ip, (ipConnections.get(ip) || 0) + 1);
    socket.room = null;
    socket.nickname = null;
    socket.isAlive = true;
    socket.messageTimestamps = [];
    const joinTimer = setTimeout(() => {
      if (!socket.room) {
        sendJson(socket, { type: 'error', message: 'Join timeout' });
        socket.close(4001, 'Join timeout');
      }
    }, JOIN_TIMEOUT);

    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', (data, isBinary) => {
      console.log('[WS DEBUG] Received:', data.toString());
      recordMessage(data.length ?? Buffer.byteLength(data));
      const now = Date.now();
      socket.messageTimestamps = socket.messageTimestamps.filter(time => now - time < 1000);
      if (socket.messageTimestamps.length >= MAX_MESSAGES_PER_SECOND) {
        sendJson(socket, { type: 'error', message: 'Rate limit exceeded' });
        socket.close(4002, 'Rate limit exceeded');
        return;
      }
      socket.messageTimestamps.push(now);

      let message;
      if (isBinary) {
        try {
          if (!socket.room) throw new Error('Join a room before sending input');
          message = { type: 'input', input: decodeInput(Buffer.from(data)) };
        } catch (error) {
          sendJson(socket, { type: 'error', message: error.message });
          socket.close(1007, 'Invalid binary frame');
          return;
        }
      } else {
        const result = validateMessage(data, false);
        if (!result.valid) {
          sendJson(socket, { type: 'error', message: result.error });
          socket.close(result.closeCode ?? 1008, result.error);
          return;
        }
        message = result.message;
      }

      switch (message.type) {
        case 'join': {
          const room = roomManager.getRoom(message.roomId);
          if (!room) { sendJson(socket, { type: 'error', message: 'Room not found' }); break; }
          if (socket.room) { sendJson(socket, { type: 'error', message: 'Already joined a room' }); break; }
          if (room.clients.size >= maxPlayersPerRoom) { sendJson(socket, { type: 'error', message: 'Room is full' }); break; }
          clearTimeout(joinTimer);
          socket.room = room;
          socket.nickname = message.nickname;
          const id = nextPlayerId++ % 65535 || 1;
          room.addClient(socket, socket.nickname);
          const user = room.clients.get(socket);
          Object.assign(user, {
            id, protocol: message.protocol === 'binary' ? 'binary' : 'json',
            state: createShipState(room.arena.width / 2 + (room.clients.size - 1) * 35, room.arena.height / 2),
            input: { seq: 0, throttle: 0, turn: 0, fire: false },
          });
          sendJson(socket, { type: 'joined', playerId: id, protocol: user.protocol, room: { ...room.getInfo(), players: [...room.clients.values()] } });
          broadcastRoomUpdate(room);
          room.broadcast({ type: 'system', message: `${socket.nickname} joined the room`, timestamp: new Date().toISOString() }, socket);
          updateMetrics();
          break;
        }
        case 'chat': {
          console.log('[WS DEBUG] Chat handler:', message);
          if (!socket.room) { sendJson(socket, { type: 'error', message: 'You must join a room first' }); break; }
          log.info?.({ roomId: socket.room.id, playerId: socket.nickname, event: 'chat' }, 'chat message');
          socket.room.broadcast({ type: 'chat', nickname: socket.nickname, text: message.text, timestamp: new Date().toISOString() });
          break;
        }
        case 'input': {
          if (!socket.room) { sendJson(socket, { type: 'error', message: 'Join a room first' }); break; }
          const user = socket.room.clients.get(socket);
          if (message.input.seq > user.input.seq) user.input = message.input;
          break;
        }
        case 'leave': {
          if (socket.room) {
            const room = socket.room; const nickname = socket.nickname;
            room.removeClient(socket); socket.room = null; socket.nickname = null;
            sendJson(socket, { type: 'left' }); broadcastRoomUpdate(room);
            room.broadcast({ type: 'system', message: `${nickname} left the room`, timestamp: new Date().toISOString() });
            updateMetrics();
          }
          break;
        }
        default: sendJson(socket, { type: 'error', message: 'Unsupported message type' });
      }
    });

    socket.on('close', () => {
      clearTimeout(joinTimer);
      const count = Math.max(0, (ipConnections.get(ip) || 1) - 1);
      if (count) ipConnections.set(ip, count); else ipConnections.delete(ip);
      if (socket.room) {
        const room = socket.room; const nickname = socket.nickname;
        room.removeClient(socket); socket.room = null; socket.nickname = null;
        broadcastRoomUpdate(room);
        room.broadcast({ type: 'system', message: `${nickname} disconnected`, timestamp: new Date().toISOString() });
      }
      updateMetrics();
    });
    socket.on('error', error => log.warn?.({ err: error }, 'websocket client error'));
  });

  const heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping(error => { if (error) socket.terminate(); });
    }
  }, HEARTBEAT_INTERVAL);
  heartbeatTimer.unref();

  wss.on('close', () => { clearInterval(heartbeatTimer); clearTimeout(tickTimer); });
  wss.on('error', error => log.error?.({ err: error }, 'websocket server error'));
  return wss;
}
