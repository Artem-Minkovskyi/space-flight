import { createHttpServer } from './http/server.js';
import { attachWebSocketServer } from './websocket/server.js';
import { roomManager } from './rooms/index.js';
import { MatchLogger } from './logs/matchLogger.js';
import { config } from './config.js';
import pino from 'pino';
import { beginShutdown, setReady, updateRuntimeMetrics } from './runtime.js';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const matchLogger = await new MatchLogger(config.logDirectory).start();

roomManager.setEventHandler((eventName, data) => {
  log.info({ event: eventName, ...data }, 'room event');
  matchLogger.log({ type: eventName, ...data });
});

const httpServer = createHttpServer();
const webSocketServer = attachWebSocketServer(httpServer, roomManager, {
  log,
  maxConnectionsPerIp: config.maxConnectionsPerIp,
  maxPlayersPerRoom: config.maxPlayersPerRoom,
  allowedOrigins: config.allowedOrigins,
});

httpServer.on('error', (error) => {
  log.error({ err: error }, 'HTTP server error');
});
webSocketServer.on('error', (error) => {
  log.error({ err: error }, 'WebSocket server error');
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  beginShutdown();
  log.info({ signal }, 'graceful shutdown started');

  const forceTimer = setTimeout(() => {
    for (const socket of webSocketServer.clients) socket.terminate();
  }, 7000);
  forceTimer.unref();

  try {
    for (const socket of webSocketServer.clients) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'shutdown', message: 'Server restarting' }));
        socket.close(1001, 'Server shutting down');
      } else socket.terminate();
    }
    await new Promise(resolve => httpServer.close(resolve));
    await new Promise(resolve => webSocketServer.close(resolve));
    await matchLogger.close();
    clearTimeout(forceTimer);
    log.info('graceful shutdown complete');
    process.exitCode = 0;
  } catch (error) {
    clearTimeout(forceTimer);
    log.error({ err: error }, 'shutdown failed');
    process.exitCode = 1;
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  log.fatal({ err: error }, 'uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log.fatal({ err: reason }, 'unhandled rejection');
  process.exit(1);
});

httpServer.listen(config.port, '0.0.0.0', () => {
  setReady(true);
  updateRuntimeMetrics({ rooms: roomManager.rooms.size });
  log.info({ port: config.port, gitSha: config.gitSha }, 'server listening');
});
