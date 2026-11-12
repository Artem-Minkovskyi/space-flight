import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

function parsePort(value) {
  const port = Number(value ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
}

function parseLogDirectory(value) {
  if (value !== undefined && value.trim() === '') {
    throw new Error('LOG_DIR cannot be empty');
  }

  return path.resolve(value ?? path.join(currentDirectory, '../logs'));
}

export const config = Object.freeze({
  port: parsePort(process.env.PORT),
  logDirectory: parseLogDirectory(process.env.LOG_DIR),
  clientDirectory: path.resolve(currentDirectory, '../../client/dist'),
});