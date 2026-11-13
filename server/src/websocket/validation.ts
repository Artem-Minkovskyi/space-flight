import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { asRoomId, asSequenceNumber } from '@space-flight/shared/types';

const MAX_MESSAGE_SIZE = 8 * 1024;
const MAX_POSITION = 100_000;
const MAX_VELOCITY = 1_000;

const joinSchema = z
  .object({
    type: z.literal('join'),
    roomId: z.string().trim().min(1).max(64).transform(asRoomId),
    nickname: z.string().trim().min(1).max(24),
    protocol: z.enum(['binary', 'json']).optional().default('json'),
  })
  .strict();

const chatSchema = z
  .object({
    type: z.literal('chat'),
    text: z.string().trim().min(1).max(1000),
  })
  .strict();

const leaveSchema = z.object({ type: z.literal('leave') }).strict();

const inputSchema = z
  .object({
    type: z.literal('input'),
    input: z
      .object({
        seq: z
          .number()
          .int()
          .min(0)
          .max(0xffff_ffff)
          .transform(asSequenceNumber),
        throttle: z.number().finite().min(-1).max(1),
        turn: z.number().finite().min(-1).max(1),
        fire: z.boolean(),
      })
      .strict(),
  })
  .strict();

const stateSchema = z
  .object({
    type: z.literal('state'),
    state: z
      .object({
        x: z.number().finite().min(-MAX_POSITION).max(MAX_POSITION),
        y: z.number().finite().min(-MAX_POSITION).max(MAX_POSITION),
        vx: z.number().finite().min(-MAX_VELOCITY).max(MAX_VELOCITY),
        vy: z.number().finite().min(-MAX_VELOCITY).max(MAX_VELOCITY),
        angle: z.number().finite(),
        hp: z.number().finite().min(0).max(100),
        thrust: z.boolean(),
        dead: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const clientMessageSchema = z.discriminatedUnion('type', [
  joinSchema,
  chatSchema,
  leaveSchema,
  inputSchema,
  stateSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type InputMessage = Extract<ClientMessage, { type: 'input' }>;

function assertNever(value: never): never {
  throw new Error(`Unhandled client message: ${String(value)}`);
}

export function getClientMessageType(
  message: ClientMessage,
): ClientMessage['type'] {
  switch (message.type) {
    case 'join':
      return 'join';
    case 'chat':
      return 'chat';
    case 'leave':
      return 'leave';
    case 'input':
      return 'input';
    case 'state':
      return 'state';
    default:
      return assertNever(message);
  }
}

export type ValidationResult =
  | { readonly valid: true; readonly message: ClientMessage }
  | {
      readonly valid: false;
      readonly error: string;
      readonly closeCode: number;
    };

export function parseClientMessage(value: unknown): ClientMessage | null {
  const parsed = clientMessageSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data;
}

function toUtf8(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
      'utf8',
    );
  }
  return null;
}

/** Decode untrusted WebSocket JSON without throwing; malformed payloads become a closeable result. */
export function validateMessage(
  data: unknown,
  isBinary = false,
): ValidationResult {
  if (isBinary)
    return {
      valid: false,
      error: 'Binary messages are not supported here',
      closeCode: 1003,
    };
  const text = toUtf8(data);
  if (text === null)
    return {
      valid: false,
      error: 'Unsupported message format',
      closeCode: 1003,
    };
  if (Buffer.byteLength(text, 'utf8') > MAX_MESSAGE_SIZE) {
    return { valid: false, error: 'Message is too large', closeCode: 1009 };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch (error: unknown) {
    return { valid: false, error: 'Invalid JSON', closeCode: 1007 };
  }

  const message = parseClientMessage(decoded);
  if (!message)
    return {
      valid: false,
      error: 'Invalid message structure or values',
      closeCode: 1008,
    };
  return { valid: true, message };
}

export { MAX_MESSAGE_SIZE };
