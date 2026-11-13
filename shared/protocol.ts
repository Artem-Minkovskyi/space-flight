// Binary protocol v1. All multi-byte values are little-endian.
import {
  asPlayerId,
  asSequenceNumber,
  asSimulationTick,
  type InputCommand,
  type ShipState,
  type SnapshotEntity,
  type WorldSnapshot,
} from './types.ts';

export const PROTOCOL_VERSION = 1;
export const MESSAGE_INPUT = 1;
export const MESSAGE_SNAPSHOT = 2;
const INPUT_PACKET_SIZE = 10;
const SNAPSHOT_HEADER_SIZE = 7;
const SNAPSHOT_RECORD_SIZE = 26;

function assertNever(value: never): never {
  throw new Error(`Unsupported snapshot entity: ${String(value)}`);
}

function assertUint(value: number, max: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${field} must be an integer from 0 to ${max}`);
  }
}

function assertFiniteRange(
  value: number,
  min: number,
  max: number,
  field: string,
): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${field} must be between ${min} and ${max}`);
  }
}

export function encodeInput(input: InputCommand): ArrayBuffer {
  assertUint(input.seq, 0xffff_ffff, 'seq');
  assertFiniteRange(input.throttle, -1, 1, 'throttle');
  assertFiniteRange(input.turn, -1, 1, 'turn');
  if (typeof input.fire !== 'boolean')
    throw new TypeError('fire must be boolean');

  const buffer = new ArrayBuffer(INPUT_PACKET_SIZE);
  const view = new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, MESSAGE_INPUT);
  view.setUint32(2, input.seq, true);
  view.setInt8(6, Math.round(input.throttle * 127));
  view.setInt16(7, Math.round(input.turn * 32767), true);
  view.setUint8(9, input.fire ? 1 : 0);
  return buffer;
}

export function decodeInput(data: Uint8Array): InputCommand {
  if (data.byteLength !== INPUT_PACKET_SIZE)
    throw new Error('Invalid binary input packet length');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint8(0) !== PROTOCOL_VERSION)
    throw new Error('Unsupported binary protocol version');
  if (view.getUint8(1) !== MESSAGE_INPUT)
    throw new Error('Unexpected binary message type');
  const throttleRaw = view.getInt8(6);
  const turnRaw = view.getInt16(7, true);
  const fireRaw = view.getUint8(9);
  if (throttleRaw < -127 || turnRaw < -32767 || fireRaw > 1) {
    throw new Error('Binary input contains an out-of-range value');
  }
  return {
    seq: asSequenceNumber(view.getUint32(2, true)),
    throttle: throttleRaw / 127,
    turn: turnRaw / 32767,
    fire: fireRaw === 1,
  };
}

export function encodeSnapshot(
  tick: number,
  players: readonly SnapshotEntity[],
): ArrayBuffer {
  assertUint(tick, 0xffff_ffff, 'tick');
  assertUint(players.length, 255, 'player count');
  const buffer = new ArrayBuffer(
    SNAPSHOT_HEADER_SIZE + players.length * SNAPSHOT_RECORD_SIZE,
  );
  const view = new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, MESSAGE_SNAPSHOT);
  view.setUint32(2, tick, true);
  view.setUint8(6, players.length);
  let offset = SNAPSHOT_HEADER_SIZE;
  for (const player of players) {
    switch (player.kind) {
      case 'ship':
        break;
      case 'asteroid':
        throw new Error(
          'Binary snapshot encoder does not support asteroid entities',
        );
      default:
        assertNever(player);
    }
    assertUint(player.id, 0xffff, 'player id');
    const state = player.state;
    for (const [key, value] of Object.entries({
      x: state.x,
      y: state.y,
      vx: state.vx,
      vy: state.vy,
      angle: state.angle,
    })) {
      if (!Number.isFinite(value))
        throw new RangeError(`${key} must be finite`);
    }
    assertFiniteRange(state.hp, 0, 100, 'hp');
    view.setUint16(offset, player.id, true);
    offset += 2;
    view.setUint32(offset, state.seq, true);
    offset += 4;
    for (const value of [state.x, state.y, state.vx, state.vy]) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
    view.setInt16(offset, Math.round(state.angle * 1000), true);
    offset += 2;
    view.setUint8(offset++, Math.round(state.hp));
    view.setUint8(offset++, (state.thrust ? 1 : 0) | (state.dead ? 2 : 0));
  }
  return buffer;
}

export function decodeSnapshot(data: Uint8Array): WorldSnapshot {
  if (data.byteLength < SNAPSHOT_HEADER_SIZE)
    throw new Error('Invalid binary snapshot header');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint8(0) !== PROTOCOL_VERSION)
    throw new Error('Unsupported binary protocol version');
  if (view.getUint8(1) !== MESSAGE_SNAPSHOT)
    throw new Error('Unexpected binary message type');
  const tick = view.getUint32(2, true);
  const count = view.getUint8(6);
  if (data.byteLength !== SNAPSHOT_HEADER_SIZE + count * SNAPSHOT_RECORD_SIZE) {
    throw new Error('Invalid binary snapshot size');
  }
  const players: SnapshotEntity[] = [];
  let offset = SNAPSHOT_HEADER_SIZE;
  for (let i = 0; i < count; i++) {
    const id = view.getUint16(offset, true);
    offset += 2;
    const seq = view.getUint32(offset, true);
    offset += 4;
    const x = view.getFloat32(offset, true);
    offset += 4;
    const y = view.getFloat32(offset, true);
    offset += 4;
    const vx = view.getFloat32(offset, true);
    offset += 4;
    const vy = view.getFloat32(offset, true);
    offset += 4;
    const angle = view.getInt16(offset, true) / 1000;
    offset += 2;
    const hp = view.getUint8(offset++);
    const flags = view.getUint8(offset++);
    if (
      id === 0 ||
      hp > 100 ||
      (flags & ~3) !== 0 ||
      ![x, y, vx, vy, angle].every(Number.isFinite)
    ) {
      throw new Error('Binary snapshot contains an out-of-range value');
    }
    const state: ShipState = {
      x,
      y,
      vx,
      vy,
      angle,
      hp,
      thrust: (flags & 1) !== 0,
      dead: (flags & 2) !== 0,
      seq: asSequenceNumber(seq),
    };
    players.push({ kind: 'ship', id: asPlayerId(id), state });
  }
  return { tick: asSimulationTick(tick), players };
}
