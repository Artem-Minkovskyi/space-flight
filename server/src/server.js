
import { createHttpServer } from './http/server.js';
import { attachWebSocketServer } from './websocket/server.js';
import { roomManager } from './rooms/index.js';
import { MatchLogger } from './logs/matchLogger.js';
import { config } from './config.js';

const logger = await new MatchLogger(config.logDirectory).start();

roomManager.setEventHandler((eventName, data) => {
  const accepted = logger.log({
    type: eventName,
    ...data,
  });

  if (!accepted) {
    console.warn('Logger buffer is full or unavailable');
  }
});

const httpServer = createHttpServer();

const webSocketServer = attachWebSocketServer(
  httpServer,
  roomManager,
  logger,
);

httpServer.on('error', (error) => {
  console.error('HTTP server error:', error);
});

webSocketServer.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(`\nReceived ${signal}. Shutting down...`);

  const forceCloseTimer = setTimeout(() => {
    console.warn('Forcing remaining WebSocket connections to close');

    for (const socket of webSocketServer.clients) {
      socket.terminate();
    }
  }, 3000);

  try {
    const httpClosed = new Promise((resolve, reject) => {
      httpServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    for (const socket of webSocketServer.clients) {
      if (socket.readyState === 1) {
        socket.close(1001, 'Server shutting down');
      } else {
        socket.terminate();
      }
    }

    await new Promise((resolve, reject) => {
      webSocketServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await httpClosed;
    await logger.close();

    console.log('All connections closed.');
    console.log('Log stream flushed.');
    console.log('Server shutdown complete.');

    process.exitCode = 0;
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exitCode = 1;
  } finally {
    clearTimeout(forceCloseTimer);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

httpServer.listen(config.port, () => {
  console.log(`HTTP server running at http://localhost:${config.port}`);
  console.log(`WebSocket server running at ws://localhost:${config.port}/ws`);
  console.log(`Client directory: ${config.clientDirectory}`);
  console.log(`Log directory: ${config.logDirectory}`);
});
