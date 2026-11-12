// Binary protocol v1. All multi-byte values are little-endian.
export const PROTOCOL_VERSION = 1;
export const MESSAGE_INPUT = 1;
export const MESSAGE_SNAPSHOT = 2;

export function encodeInput({ seq, throttle = 0, turn = 0, fire = false }) {
  const buffer = new ArrayBuffer(10);
  const view = new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, MESSAGE_INPUT);
  view.setUint32(2, seq >>> 0, true);
  view.setInt8(6, Math.round(Math.max(-1, Math.min(1, throttle)) * 127));
  view.setInt16(7, Math.round(Math.max(-1, Math.min(1, turn)) * 32767), true);
  view.setUint8(9, fire ? 1 : 0);
  return buffer;
}

export function decodeInput(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.byteLength !== 10 || view.getUint8(0) !== PROTOCOL_VERSION || view.getUint8(1) !== MESSAGE_INPUT) {
    throw new Error('Invalid binary input packet');
  }
  return {
    seq: view.getUint32(2, true),
    throttle: view.getInt8(6) / 127,
    turn: view.getInt16(7, true) / 32767,
    fire: Boolean(view.getUint8(9)),
  };
}

// Header: version, type, tick, count; records: id, seq, x, y, vx, vy, angle, hp, flags.
export function encodeSnapshot(tick, players) {
  const recordSize = 26;
  const buffer = new ArrayBuffer(7 + players.length * recordSize);
  const view = new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, MESSAGE_SNAPSHOT);
  view.setUint32(2, tick >>> 0, true);
  view.setUint8(6, players.length);
  let offset = 7;
  for (const player of players) {
    view.setUint16(offset, player.id, true); offset += 2;
    view.setUint32(offset, player.state.seq >>> 0, true); offset += 4;
    for (const key of ['x', 'y', 'vx', 'vy']) { view.setFloat32(offset, player.state[key], true); offset += 4; }
    view.setInt16(offset, Math.round(player.state.angle * 1000), true); offset += 2;
    view.setUint8(offset++, player.state.hp);
    view.setUint8(offset++, (player.state.thrust ? 1 : 0) | (player.state.dead ? 2 : 0));
  }
  return buffer;
}

export function decodeSnapshot(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.byteLength < 7 || view.getUint8(0) !== PROTOCOL_VERSION || view.getUint8(1) !== MESSAGE_SNAPSHOT) {
    throw new Error('Invalid binary snapshot packet');
  }
  const tick = view.getUint32(2, true);
  const count = view.getUint8(6);
  const recordSize = 26;
  if (view.byteLength !== 7 + count * recordSize) throw new Error('Invalid snapshot size');
  const players = [];
  let offset = 7;
  for (let i = 0; i < count; i++) {
    const id = view.getUint16(offset, true); offset += 2;
    const seq = view.getUint32(offset, true); offset += 4;
    const [x, y, vx, vy] = [0, 1, 2, 3].map(() => { const n = view.getFloat32(offset, true); offset += 4; return n; });
    const angle = view.getInt16(offset, true) / 1000; offset += 2;
    const hp = view.getUint8(offset++);
    const flags = view.getUint8(offset++);
    players.push({ id, state: { x, y, vx, vy, angle, hp, thrust: Boolean(flags & 1), dead: Boolean(flags & 2), seq } });
  }
  return { tick, players };
}
