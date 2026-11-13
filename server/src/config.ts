import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const environmentSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_DIR: z.string().trim().min(1).optional(),
  })
  .strict();

const environment = environmentSchema.parse({
  PORT: process.env.PORT,
  ...(process.env.LOG_DIR === undefined
    ? {}
    : { LOG_DIR: process.env.LOG_DIR }),
});

export const config = Object.freeze({
  port: environment.PORT,
  logDirectory: path.resolve(
    environment.LOG_DIR ?? path.join(currentDirectory, '../logs'),
  ),
  clientDirectory: path.resolve(currentDirectory, '../../client/dist'),
});
