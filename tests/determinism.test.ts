import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createShipState,
  integrateShip,
  SIMULATION,
} from '../shared/simulation.ts';
import {
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
} from '../shared/protocol.ts';
import {
  asPlayerId,
  asSequenceNumber,
  asSimulationTick,
} from '../shared/types.ts';
import {
  parseClientMessage,
  validateMessage,
} from '../server/src/websocket/validation.ts';

test('fixed-step simulation is deterministic for identical inputs', () => {
  const commands = Array.from({ length: 600 }, (_, index) => ({
    seq: asSequenceNumber(index + 1),
    throttle: index % 90 < 60 ? 1 : 0,
    turn: index % 120 < 60 ? 0.25 : -0.25,
    fire: index % 15 === 0,
  }));
  const run = () =>
    commands.reduce(
      (state, command) => integrateShip(state, command, SIMULATION.dt),
      createShipState(500, 350),
    );
  assert.deepEqual(run(), run());
});

test('binary input round-trips and rejects an unsupported version', () => {
  const input = {
    seq: asSequenceNumber(42),
    throttle: 1,
    turn: -1,
    fire: true,
  };
  const encoded = encodeInput(input);
  assert.deepEqual(decodeInput(new Uint8Array(encoded)), input);
  const corrupted = new Uint8Array(encoded.slice(0));
  corrupted[0] = 99;
  assert.throws(() => decodeInput(corrupted), /version/i);
});

test('binary snapshot round-trips a discriminated ship entity', () => {
  const state = { ...createShipState(100, 200), seq: asSequenceNumber(8) };
  const packet = encodeSnapshot(120, [
    { kind: 'ship', id: asPlayerId(7), nickname: 'Pilot', state },
  ]);
  const decoded = decodeSnapshot(new Uint8Array(packet));
  assert.equal(decoded.tick, asSimulationTick(120));
  assert.equal(decoded.players[0]?.kind, 'ship');
  assert.equal(decoded.players[0]?.id, asPlayerId(7));
  assert.equal(decoded.players[0]?.state.seq, state.seq);
  assert.equal(decoded.players[0]?.state.hp, state.hp);
  assert.ok(Math.abs((decoded.players[0]?.state.x ?? 0) - state.x) < 0.01);
});

test('Zod boundary parser accepts valid data and rejects malformed unknown input', () => {
  assert.equal(
    parseClientMessage({
      type: 'join',
      roomId: 'normal',
      nickname: 'Pilot',
      protocol: 'binary',
    })?.type,
    'join',
  );
  assert.equal(
    parseClientMessage({
      type: 'input',
      input: { seq: -1, throttle: 0, turn: 0, fire: false },
    }),
    null,
  );
  assert.equal(parseClientMessage(null), null);
  const invalidJson = validateMessage('{');
  assert.equal(invalidJson.valid, false);
  if (!invalidJson.valid) assert.equal(invalidJson.closeCode, 1007);
});
