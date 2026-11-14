import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_DIR: z.string().trim().min(1).optional(),
  ALLOWED_ORIGINS: z.string().default(''),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).max(1000).default(20),
  MAX_ROOMS: z.coerce.number().int().min(1).max(10000).default(100),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(1).max(256).default(16),
  GIT_SHA: z.string().default(process.env.GITHUB_SHA ?? 'local'),
});

const env = schema.parse(process.env);
export const config = Object.freeze({
  port: env.PORT,
  logDirectory: path.resolve(env.LOG_DIR ?? path.join(currentDirectory, '../logs')),
  clientDirectory: path.resolve(currentDirectory, '../../client/dist'),
  allowedOrigins: env.ALLOWED_ORIGINS.split(',').map(v => v.trim()).filter(Boolean),
  maxConnectionsPerIp: env.MAX_CONNECTIONS_PER_IP,
  maxRooms: env.MAX_ROOMS,
  maxPlayersPerRoom: env.MAX_PLAYERS_PER_ROOM,
  gitSha: env.GIT_SHA,
});
