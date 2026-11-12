
import { randomUUID } from 'node:crypto';
import { Room } from './Room.js';

const DEFAULT_ROOMS = [
  {
    id: 'easy',
    name: 'Початкова',
    description: 'Невелика кількість астероїдів',
    arena: {
      width: 800,
      height: 600,
      asteroids: 8,
      asteroidSpeed: 1,
    },
  },
  {
    id: 'normal',
    name: 'Стандартна',
    description: 'Збалансований режим гри',
    arena: {
      width: 1000,
      height: 700,
      asteroids: 15,
      asteroidSpeed: 2,
    },
  },
  {
    id: 'hard',
    name: 'Складна',
    description: 'Багато швидких астероїдів',
    arena: {
      width: 1200,
      height: 800,
      asteroids: 25,
      asteroidSpeed: 3,
    },
  },
];

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.onEvent = null;

    for (const options of DEFAULT_ROOMS) {
    this.createRoom(
      options.name,
      { ...options, persistent: true },
      options.id,
  );
}
  }

  createRoom(name, options = {}, id = randomUUID()) {
    const room = new Room(id, name, options);

    room.on('client:joined', (event) => {
      this.emitRoomEvent('client:joined', event);
    });

    room.on('client:left', (event) => {
      this.emitRoomEvent('client:left', event);

      if (room.isEmpty() && !room.persistent) {
      this.rooms.delete(room.id);

      this.emitRoomEvent('room:deleted', {
        roomId: room.id,
      });
    }
    });

    this.rooms.set(id, room);

    this.emitRoomEvent('room:created', {
      roomId: id,
      name,
    });

    return room;
  }

  getRoom(id) {
    return this.rooms.get(id);
  }

  getRooms() {
    return Array.from(this.rooms.values(), (room) => room.getInfo());
  }

  emitRoomEvent(eventName, data) {
    this.onEvent?.(eventName, data);
  }

  setEventHandler(handler) {
    this.onEvent = handler;
  }
}
