
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { replayMatches } from '../logs/replay.js';
import { pipeline } from 'node:stream';
import { config } from '../config.js';
import { roomManager } from '../rooms/index.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });

  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  const maxSize = 16 * 1024;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > maxSize) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON');
    error.statusCode = 400;
    throw error;
  }
}

function handleRoomsApi(request, response) {
  if (request.method === 'GET') {
    sendJson(response, 200, {
      rooms: roomManager.getRooms(),
    });
    return;
  }

  if (request.method === 'POST') {
    readJsonBody(request)
      .then((body) => {
        if (
          !body ||
          typeof body.name !== 'string' ||
          body.name.trim().length === 0 ||
          body.name.trim().length > 32
        ) {
          sendJson(response, 400, {
            error: 'Room name must contain 1–32 characters',
          });
          return;
        }

        const room = roomManager.createRoom(body.name.trim());

        sendJson(response, 201, {
          room: room.getInfo(),
        });
      })
      .catch((error) => {
        sendJson(response, error.statusCode ?? 400, {
          error: error.message,
        });
      });

    return;
  }

  response.setHeader('Allow', 'GET, POST');
  sendJson(response, 405, { error: 'Method not allowed' });
}

async function handleReplayApi(response) {
  try {
    const events = [];

    const logFile = path.join(
      config.logDirectory,
      'matches.ndjson',
    );

    await replayMatches(logFile, (event) => {
      events.push(event);
    });

    sendJson(response, 200, {
      count: events.length,
      events,
    });
  } catch (error) {
    console.error('Replay API error:', error);

    sendJson(response, 500, {
      error: 'Failed to read replay logs',
    });
  }
}

function serveStaticFile(request, response, pathname) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { error: 'Invalid URL encoding' });
    return;
  }

  const segments = decodedPath.split('/');

  if (segments.includes('..') || decodedPath.includes('\\')) {
    sendJson(response, 403, { error: 'Path traversal is forbidden' });
    return;
  }

  const relativePath =
    decodedPath === '/' ? 'index.html' : decodedPath.slice(1);

  const filePath = path.resolve(config.clientDirectory, relativePath);

  if (
    filePath !== config.clientDirectory &&
    !filePath.startsWith(config.clientDirectory + path.sep)
  ) {
    sendJson(response, 403, { error: 'Access denied' });
    return;
  }

  try {
    const stats = statSync(filePath);

    if (!stats.isFile()) {
      sendJson(response, 404, { error: 'File not found' });
      return;
    }

    const contentType =
      MIME_TYPES[path.extname(filePath).toLowerCase()] ??
      'application/octet-stream';

    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    pipeline(createReadStream(filePath), response, (error) => {
      if (error && !response.destroyed) {
        console.error('Static file stream error:', error);
        response.destroy(error);
      }
    });
  } catch {
    sendJson(response, 404, { error: 'File not found' });
  }
}

export function createHttpServer() {
  return createServer((request, response) => {
    let url;

    try {
      url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    } catch {
      sendJson(response, 400, { error: 'Invalid URL' });
      return;
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      sendJson(response, 200, {
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname === '/api/rooms') {
      handleRoomsApi(request, response);
      return;
    }

    if (url.pathname === '/api/replay') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');

        sendJson(response, 405, {
          error: 'Method not allowed',
        });

        return;
      }

      handleReplayApi(response);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    serveStaticFile(request, response, url.pathname);
  });
}
