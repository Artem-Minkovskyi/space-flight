import { describe, expect, it } from 'vitest';
import { Room } from '../../server/src/rooms/Room.js';
import { RoomManager } from '../../server/src/rooms/RoomManager.js';

describe('server room lifecycle', () => {
  it('adds and removes clients', () => {
    const room = new Room('test');
    const socket = { readyState: 1, bufferedAmount: 0, send: () => {} };
    room.addClient(socket, 'Pilot');
    expect(room.clients.size).toBe(1);
    room.removeClient(socket);
    expect(room.clients.size).toBe(0);
  });
  it('broadcasts only to open clients', () => {
    const room = new Room('test');
    let sent = 0;
    const open = { readyState: 1, bufferedAmount: 0, send: () => { sent++; } };
    const closed = { readyState: 3, bufferedAmount: 0, send: () => { sent++; } };
    room.addClient(open, 'A'); room.addClient(closed, 'B');
    room.broadcast({ type: 'ping' });
    expect(sent).toBe(1);
  });
  it('skips clients with excessive buffered data', () => {
    const room = new Room('test');
    let sent = 0;
    room.addClient({ readyState: 1, bufferedAmount: 2_000_000, send: () => { sent++; } }, 'Slow');
    room.broadcast({ type: 'ping' });
    expect(sent).toBe(0);
  });
  it('reports room metadata', () => expect(new Room('id', 'name').getInfo()).toMatchObject({ id: 'id', name: 'name', clientsCount: 0 }));
  it('emits join and leave lifecycle events', () => {
    const room = new Room('events'); const events: string[] = [];
    room.on('client:joined', () => events.push('join')); room.on('client:left', () => events.push('leave'));
    const socket = { readyState: 1, bufferedAmount: 0, send: () => {} };
    room.addClient(socket, 'A'); room.removeClient(socket);
    expect(events).toEqual(['join', 'leave']);
  });
});

describe('RoomManager', () => {
  it('creates standard rooms', () => expect(new RoomManager().getRooms().length).toBeGreaterThanOrEqual(3));
  it('retrieves a room by id', () => expect(new RoomManager().getRoom('normal')?.id).toBe('normal'));
  it('removes an empty non-persistent room', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('temp', {}, crypto.randomUUID());
    const socket = { readyState: 1, bufferedAmount: 0, send: () => {} };
    room.addClient(socket, 'A'); room.removeClient(socket);
    expect(manager.getRoom('temp')).toBeUndefined();
  });
  it('keeps persistent rooms after last client leaves', () => {
    const manager = new RoomManager(); const room = manager.getRoom('normal')!;
    const socket = { readyState: 1, bufferedAmount: 0, send: () => {} };
    room.addClient(socket, 'A'); room.removeClient(socket);
    expect(manager.getRoom('normal')).toBe(room);
  });
});
