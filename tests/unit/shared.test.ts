import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createShipState, integrateShip, SIMULATION } from '../../shared/simulation.ts';
import { asSequenceNumber, asPlayerId } from '../../shared/types.ts';
import { decodeInput, encodeInput, decodeSnapshot, encodeSnapshot, PROTOCOL_VERSION } from '../../shared/protocol.ts';
import { serverMessageSchema } from '../../shared/messages.ts';

const command = (seq: number, throttle: number, turn: number, fire: boolean) => ({
  seq: asSequenceNumber(seq), throttle, turn, fire,
});

describe('shared simulation', () => {
  it.each(Array.from({ length: 12 }, (_, i) => i))('wraps x/y into arena on tick %i', (i) => {
    const state = createShipState(i * 1000 - 4000, i * 900 - 3000);
    const next = integrateShip(state, command(i, 0, 0, false));
    expect(next.x).toBeGreaterThanOrEqual(0);
    expect(next.x).toBeLessThan(SIMULATION.width);
    expect(next.y).toBeGreaterThanOrEqual(0);
    expect(next.y).toBeLessThan(SIMULATION.height);
  });
  it('does not move a dead ship', () => {
    const state = { ...createShipState(), dead: true, x: 12, y: 34 };
    expect(integrateShip(state, command(3, 1, 1, true))).toMatchObject({ x: 12, y: 34, dead: true });
  });
  it('is deterministic for identical input sequences', () => {
    const inputs = Array.from({ length: 300 }, (_, i) => command(i, Math.sin(i), Math.cos(i), i % 4 === 0));
    const run = () => inputs.reduce((state, input) => integrateShip(state, input), createShipState());
    expect(run()).toEqual(run());
  });
  it('caps ship speed', () => {
    const next = integrateShip({ ...createShipState(), vx: 10000, vy: 10000 }, command(1, 0, 0, false));
    expect(Math.hypot(next.vx, next.vy)).toBeLessThanOrEqual(SIMULATION.maxSpeed + 1e-9);
  });
  it('clamps turn and throttle to legal range', () => {
    const actual = integrateShip(createShipState(), command(1, 100, -100, false));
    const expected = integrateShip(createShipState(), command(1, 1, -1, false));
    expect(actual).toEqual(expected);
  });
});

describe('binary protocol properties', () => {
  it('property: decoded input equals quantized original', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 0xffffffff }),
      fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true }),
      fc.boolean(),
      (seq, throttle, turn, fire) => {
        const decoded = decodeInput(new Uint8Array(encodeInput(command(seq, throttle, turn, fire))));
        expect(decoded.seq).toBe(seq);
        expect(decoded.throttle).toBeCloseTo(Math.round(throttle * 127) / 127, 8);
        expect(decoded.turn).toBeCloseTo(Math.round(turn * 32767) / 32767, 8);
        expect(decoded.fire).toBe(fire);
      }), { numRuns: 250 });
  });
  it('property: input packet length is fixed by the wire format', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.boolean(), (seq, fire) => {
      expect(encodeInput(command(seq, 0, 0, fire)).byteLength).toBe(10);
    }), { numRuns: 100 });
  });
  it('property: corrupted/truncated buffers fail with a controlled error', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 9 }), (length) => {
      expect(() => decodeInput(new Uint8Array(length))).toThrow();
    }), { numRuns: 100 });
  });
  it('property: snapshot length matches header and record sizes', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 20 }), (count) => {
      const players = Array.from({ length: count }, (_, i) => ({ kind: 'ship' as const, id: asPlayerId(i + 1), state: { ...createShipState(), seq: asSequenceNumber(i) } }));
      expect(encodeSnapshot(1, players).byteLength).toBe(7 + count * 26);
    }), { numRuns: 60 });
  });
  it('property: decoded snapshot preserves valid player identity and count', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 50 }), (count) => {
      const players = Array.from({ length: count }, (_, i) => ({ kind: 'ship' as const, id: asPlayerId(i + 1), state: { ...createShipState(i, i), seq: asSequenceNumber(i) } }));
      const result = decodeSnapshot(new Uint8Array(encodeSnapshot(9, players)));
      expect(result.players).toHaveLength(count);
      expect(result.tick).toBe(9);
    }), { numRuns: 60 });
  });
  it('rejects unsupported protocol versions', () => {
    const bytes = new Uint8Array(encodeInput(command(1, 0, 0, false)));
    bytes[0] = PROTOCOL_VERSION + 1;
    expect(() => decodeInput(bytes)).toThrow(/version/i);
  });
  it('rejects invalid fire flag', () => {
    const bytes = new Uint8Array(encodeInput(command(1, 0, 0, false)));
    bytes[9] = 2;
    expect(() => decodeInput(bytes)).toThrow();
  });
  it('rejects malformed snapshot size', () => {
    const bytes = new Uint8Array(encodeSnapshot(1, []));
    expect(() => decodeSnapshot(new Uint8Array([...bytes, 0]))).toThrow();
  });
});

describe('runtime message validation', () => {
  const valid = { type: 'chat', nickname: 'Pilot', text: 'hello' };
  it('accepts valid server messages', () => expect(serverMessageSchema.safeParse(valid).success).toBe(true));
  it('rejects unknown message types', () => expect(serverMessageSchema.safeParse({ type: 'unknown' }).success).toBe(false));
  it('rejects non-string chat text', () => expect(serverMessageSchema.safeParse({ ...valid, text: 42 }).success).toBe(false));
  it('rejects missing chat nickname', () => { const { nickname: _n, ...bad } = valid; expect(serverMessageSchema.safeParse(bad).success).toBe(false); });
  it.each(['system', 'error', 'left', 'chat'])('validates discriminator %s', (type) => {
    const sample = type === 'system' ? { type, message: 'ok' } : type === 'error' ? { type, message: 'bad' } : type === 'left' ? { type } : valid;
    expect(serverMessageSchema.safeParse(sample).success).toBe(true);
  });
});

it('property: ship remains inside the configured arena for arbitrary valid input', () => {
  fc.assert(fc.property(
    fc.double({ min: -100000, max: 100000, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: -100000, max: 100000, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true }),
    (x, y, throttle, turn) => {
      const next = integrateShip(createShipState(x, y), command(1, throttle, turn, false));
      expect(next.x).toBeGreaterThanOrEqual(0); expect(next.x).toBeLessThan(SIMULATION.width);
      expect(next.y).toBeGreaterThanOrEqual(0); expect(next.y).toBeLessThan(SIMULATION.height);
    }), { numRuns: 250 });
});

it('property: parser accepts valid chat and rejects malformed generated values', () => {
  fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 100 }), (text) => {
    expect(serverMessageSchema.safeParse({ type: 'chat', nickname: 'Pilot', text }).success).toBe(true);
    expect(serverMessageSchema.safeParse({ type: 'chat', nickname: 17, text }).success).toBe(false);
  }), { numRuns: 100 });
});
