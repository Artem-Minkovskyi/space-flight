import { Buffer } from 'node:buffer';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';

import { decodeInput, encodeSnapshot } from '@space-flight/shared/protocol';
import {
  createShipState,
  integrateShip,
  SIMULATION,
} from '@space-flight/shared/simulation';
import {
  asPlayerId,
  type ArenaConfig,
  type InputCommand,
  type ShipState,
  type SnapshotEntity,
} from '@space-flight/shared/types';

import {
  MAX_MESSAGE_SIZE,
  validateMessage,
  type ClientMessage,
} from './validation.ts';

const MAX_BUFFERED_AMOUNT = 1024 * 1024;
const MAX_MESSAGES_PER_SECOND = 90;
const JOIN_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 15000;
const TICK_MS = 1000 / SIMULATION.tickRate;

interface RoomClient {
  nickname: string;
  joinedAt: string;
  id?: number;
  protocol?: 'binary' | 'json';
  state?: ShipState;
  input?: InputCommand;
}

interface RoomLike {
  readonly id: string;
  readonly arena: ArenaConfig;
  readonly clients: Map<WebSocket, RoomClient>;
  addClient(client: WebSocket, nickname: string): void;
  removeClient(client: WebSocket): void;
  broadcast(message: unknown, excludedClient?: WebSocket | null): void;
  getInfo(): Record<string, unknown>;
}

interface RoomManagerLike {
  readonly rooms: Map<string, RoomLike>;
  getRoom(id: string): RoomLike | undefined;
}

interface MatchLoggerLike {
  log(event: Record<string, unknown>): boolean | void;
}

interface SocketContext {
  room: RoomLike | null;
  nickname: string | null;
  isAlive: boolean;
  messageTimestamps: number[];
}

type BinaryInputMessage = {
  readonly type: 'input';
  readonly input: InputCommand;
};

type IncomingMessage = ClientMessage | BinaryInputMessage;

function assertNever(value: never): never {
  throw new Error(`Unhandled WebSocket message: ${String(value)}`);
}

function sendJson(socket: WebSocket, message: unknown): boolean {
  if (
    socket.readyState !== WebSocket.OPEN ||
    socket.bufferedAmount > MAX_BUFFERED_AMOUNT
  ) {
    return false;
  }

  const serialized = JSON.stringify(message);

  if (serialized === undefined) {
    return false;
  }

  socket.send(serialized);
  return true;
}

function broadcastRoomUpdate(room: RoomLike): void {
  room.broadcast({
    type: 'room:update',
    room: {
      ...room.getInfo(),
      players: [...room.clients.values()],
    },
  });
}

function sendSnapshot(room: RoomLike, tick: number): void {
  const players: SnapshotEntity[] = [];

  for (const user of room.clients.values()) {
    if (user.id === undefined || user.state === undefined) {
      continue;
    }

    players.push({
      kind: 'ship',
      id: asPlayerId(user.id),
      nickname: user.nickname,
      state: user.state,
    });
  }

  for (const [socket, user] of room.clients.entries()) {
    if (
      socket.readyState !== WebSocket.OPEN ||
      socket.bufferedAmount > MAX_BUFFERED_AMOUNT
    ) {
      continue;
    }

    if (user.protocol === 'binary') {
      socket.send(encodeSnapshot(tick, players));
    } else {
      sendJson(socket, {
        type: 'snapshot',
        tick,
        players,
      });
    }
  }
}

export function attachWebSocketServer(
  httpServer: Server,
  roomManager: RoomManagerLike,
  logger: MatchLoggerLike,
): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: MAX_MESSAGE_SIZE,
    perMessageDeflate: false,
  });

  const contexts = new WeakMap<WebSocket, SocketContext>();

  let nextPlayerId = 1;
  let tick = 0;
  let nextTick = performance.now() + TICK_MS;

  let tickTimer: ReturnType<typeof setTimeout>;

  function runTick(): void {
    const now = performance.now();

    // Target-time scheduling avoids accumulating setInterval drift.
    while (now >= nextTick) {
      tick += 1;

      for (const room of roomManager.rooms.values()) {
        for (const user of room.clients.values()) {
          if (user.state !== undefined && user.input !== undefined) {
            user.state = integrateShip(
              user.state,
              user.input,
              SIMULATION.dt,
              room.arena,
            );
          }
        }

        if (room.clients.size > 0) {
          sendSnapshot(room, tick);
        }
      }

      nextTick += TICK_MS;
    }

    tickTimer = setTimeout(runTick, Math.max(0, nextTick - performance.now()));
  }

  tickTimer = setTimeout(runTick, TICK_MS);

  wss.on('connection', (socket) => {
    const context: SocketContext = {
      room: null,
      nickname: null,
      isAlive: true,
      messageTimestamps: [],
    };

    contexts.set(socket, context);

    const joinTimer = setTimeout(() => {
      if (context.room === null) {
        sendJson(socket, {
          type: 'error',
          message: 'Join timeout',
        });

        socket.close(4001, 'Join timeout');
      }
    }, JOIN_TIMEOUT);

    socket.on('pong', () => {
      context.isAlive = true;
    });

    socket.on('message', (data: RawData, isBinary: boolean) => {
      const now = Date.now();

      context.messageTimestamps = context.messageTimestamps.filter(
        (time) => now - time < 1000,
      );

      if (context.messageTimestamps.length >= MAX_MESSAGES_PER_SECOND) {
        sendJson(socket, {
          type: 'error',
          message: 'Rate limit exceeded',
        });

        socket.close(4002, 'Rate limit exceeded');
        return;
      }

      context.messageTimestamps.push(now);

      let message: IncomingMessage;

      if (isBinary) {
        try {
          if (context.room === null) {
            throw new Error('Join a room before sending input');
          }

          let packet: Buffer;

          // Convert each RawData variant explicitly to avoid Buffer.from overload ambiguity.
          if (Array.isArray(data)) {
            packet = Buffer.concat(data);
          } else if (data instanceof ArrayBuffer) {
            packet = Buffer.from(new Uint8Array(data));
          } else if (Buffer.isBuffer(data)) {
            packet = data;
          } else {
            packet = Buffer.from(data);
          }

          message = {
            type: 'input',
            input: decodeInput(packet),
          };
        } catch (error: unknown) {
          const reason = error instanceof Error ? error.message : String(error);

          logger.log({
            type: 'protocol:error',
            reason,
          });

          sendJson(socket, {
            type: 'error',
            message: reason,
          });

          return;
        }
      } else {
        const result = validateMessage(data, false);

        if (!result.valid) {
          logger.log({
            type: 'protocol:error',
            reason: result.error,
          });

          sendJson(socket, {
            type: 'error',
            message: result.error,
          });

          socket.close(result.closeCode, result.error);
          return;
        }

        message = result.message;
      }

      switch (message.type) {
        case 'join': {
          const room = roomManager.getRoom(message.roomId);

          if (room === undefined) {
            sendJson(socket, {
              type: 'error',
              message: 'Room not found',
            });
            break;
          }

          if (context.room !== null) {
            sendJson(socket, {
              type: 'error',
              message: 'Already joined a room',
            });
            break;
          }

          clearTimeout(joinTimer);

          context.room = room;
          context.nickname = message.nickname;

          const id = nextPlayerId++ % 65535 || 1;

          room.addClient(socket, message.nickname);

          const user = room.clients.get(socket);

          if (user === undefined) {
            context.room = null;
            context.nickname = null;

            sendJson(socket, {
              type: 'error',
              message: 'Could not join room',
            });

            break;
          }

          user.id = id;
          user.protocol = message.protocol === 'binary' ? 'binary' : 'json';

          user.state = createShipState(
            room.arena.width / 2 + (room.clients.size - 1) * 35,
            room.arena.height / 2,
          );

          user.input = {
            seq: user.state.seq,
            throttle: 0,
            turn: 0,
            fire: false,
          };

          sendJson(socket, {
            type: 'joined',
            playerId: id,
            protocol: user.protocol,
            room: {
              ...room.getInfo(),
              players: [...room.clients.values()],
            },
          });

          broadcastRoomUpdate(room);

          room.broadcast(
            {
              type: 'system',
              message: `${message.nickname} joined the room`,
              timestamp: new Date().toISOString(),
            },
            socket,
          );

          break;
        }

        case 'chat': {
          if (context.room === null) {
            sendJson(socket, {
              type: 'error',
              message: 'You must join a room first',
            });
            break;
          }

          const nickname = context.nickname ?? 'Unknown';

          logger.log({
            type: 'chat',
            roomId: context.room.id,
            nickname,
            text: message.text,
          });

          context.room.broadcast({
            type: 'chat',
            nickname,
            text: message.text,
            timestamp: new Date().toISOString(),
          });

          break;
        }

        case 'input': {
          if (context.room === null) {
            sendJson(socket, {
              type: 'error',
              message: 'Join a room first',
            });
            break;
          }

          const user = context.room.clients.get(socket);

          if (user?.input !== undefined && message.input.seq > user.input.seq) {
            user.input = message.input;
          }

          break;
        }

        case 'leave': {
          if (context.room !== null) {
            const room = context.room;
            const nickname = context.nickname;

            room.removeClient(socket);

            context.room = null;
            context.nickname = null;

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

        case 'state': {
          sendJson(socket, {
            type: 'error',
            message: 'Client state updates are not supported',
          });

          break;
        }

        default: {
          assertNever(message);
        }
      }
    });

    socket.on('close', () => {
      clearTimeout(joinTimer);

      if (context.room !== null) {
        const room = context.room;
        const nickname = context.nickname;

        room.removeClient(socket);

        context.room = null;
        context.nickname = null;

        broadcastRoomUpdate(room);

        room.broadcast({
          type: 'system',
          message: `${nickname} disconnected`,
          timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on('error', (error: Error) => {
      console.error('WebSocket client error:', error.message);
    });
  });

  const heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      const context = contexts.get(socket);

      if (context === undefined) {
        continue;
      }

      if (!context.isAlive) {
        socket.terminate();
        continue;
      }

      context.isAlive = false;

      socket.ping((error?: Error) => {
        if (error) {
          socket.terminate();
        }
      });
    }
  }, HEARTBEAT_INTERVAL);

  heartbeatTimer.unref();

  wss.on('close', () => {
    clearInterval(heartbeatTimer);
    clearTimeout(tickTimer);
  });

  wss.on('error', (error: Error) => {
    console.error('WebSocket server error:', error.message);
  });

  return wss;
}
