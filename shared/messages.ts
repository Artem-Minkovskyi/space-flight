import { z } from 'zod';
import {
  asPlayerId,
  asRoomId,
  asSequenceNumber,
  asSimulationTick,
} from './types.ts';

const shipStateSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    vx: z.number().finite(),
    vy: z.number().finite(),
    angle: z.number().finite(),
    hp: z.number().finite(),
    thrust: z.boolean(),
    dead: z.boolean(),
    seq: z
      .number()
      .int()
      .nonnegative()
      .max(0xffff_ffff)
      .transform(asSequenceNumber),
  })
  .passthrough();

const playerSchema = z
  .object({
    kind: z.literal('ship'),
    id: z.number().int().positive().max(0xffff).transform(asPlayerId),
    nickname: z.string().optional(),
    state: shipStateSchema,
  })
  .passthrough();

const roomPlayerSchema = z
  .object({
    id: z.number().int().positive().max(0xffff).transform(asPlayerId),
    nickname: z.string(),
    protocol: z.enum(['json', 'binary']).optional(),
    state: shipStateSchema.optional(),
  })
  .passthrough();

const roomSchema = z
  .object({
    id: z.string().transform(asRoomId),
    name: z.string(),
    players: z.array(z.union([roomPlayerSchema, z.string()])).optional(),
  })
  .passthrough();

export const serverMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('joined'),
      playerId: z.number().int().positive().max(0xffff).transform(asPlayerId),
      protocol: z.enum(['json', 'binary']),
      room: roomSchema,
    })
    .passthrough(),
  z.object({ type: z.literal('room:update'), room: roomSchema }).passthrough(),
  z
    .object({
      type: z.literal('snapshot'),
      tick: z
        .number()
        .int()
        .nonnegative()
        .max(0xffff_ffff)
        .transform(asSimulationTick),
      players: z.array(playerSchema),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('chat'),
      nickname: z.string(),
      text: z.string(),
      timestamp: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('system'),
      message: z.string(),
      timestamp: z.string().optional(),
    })
    .passthrough(),
  z.object({ type: z.literal('error'), message: z.string() }).passthrough(),
  z.object({ type: z.literal('left') }).passthrough(),
  z
    .object({
      type: z.literal('player:state'),
      nickname: z.string(),
      state: shipStateSchema,
    })
    .passthrough(),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
