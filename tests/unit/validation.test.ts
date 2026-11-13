import { describe, expect, it } from 'vitest';
import { getClientMessageType, parseClientMessage, validateMessage } from '../../server/src/websocket/validation.ts';

describe('server input validation', () => {
  it('accepts and normalizes a valid join', () => {
    const message = parseClientMessage({ type: 'join', roomId: ' normal ', nickname: ' Pilot ' });
    expect(message).toMatchObject({ type: 'join', roomId: 'normal', nickname: 'Pilot', protocol: 'json' });
  });
  it('rejects a blank nickname', () => expect(parseClientMessage({ type: 'join', roomId: 'normal', nickname: ' ' })).toBeNull());
  it('rejects throttle outside the legal range', () => expect(parseClientMessage({ type: 'input', input: { seq: 1, throttle: 2, turn: 0, fire: false } })).toBeNull());
  it('accepts valid chat and trims text', () => expect(parseClientMessage({ type: 'chat', text: ' hello ' })).toMatchObject({ text: 'hello' }));
  it('rejects malformed JSON without throwing', () => expect(validateMessage('{bad')).toMatchObject({ valid: false, closeCode: 1007 }));
  it('rejects oversized messages', () => expect(validateMessage('x'.repeat(9000))).toMatchObject({ valid: false, closeCode: 1009 }));
  it('rejects unsupported binary payloads', () => expect(validateMessage(new Uint8Array([1, 2]), true)).toMatchObject({ valid: false, closeCode: 1003 }));
  it('returns validated message type exhaustively', () => expect(getClientMessageType({ type: 'leave' })).toBe('leave'));
});
