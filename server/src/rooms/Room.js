
import { EventEmitter } from 'node:events';

export class Room extends EventEmitter {
  constructor(id, name = id, options = {}) {
    super();

    this.id = id;
    this.name = name;
    this.description = options.description ?? '';
    this.persistent = options.persistent ?? false;

    this.arena = options.arena ?? {
      width: 1000,
      height: 700,
      asteroids: 15,
      asteroidSpeed: 2,
    };

    this.clients = new Map();
    this.createdAt = new Date().toISOString();
  }

  addClient(client, nickname) {
    this.clients.set(client, {
      nickname,
      joinedAt: new Date().toISOString(),
    });

    this.emit('client:joined', {
      roomId: this.id,
      nickname,
      clientsCount: this.clients.size,
    });
  }

  removeClient(client) {
    const user = this.clients.get(client);

    if (!user) return;

    this.clients.delete(client);

    this.emit('client:left', {
      roomId: this.id,
      nickname: user.nickname,
      clientsCount: this.clients.size,
    });
  }

  broadcast(message, excludedClient = null) {
    for (const client of this.clients.keys()) {
      if (
        client === excludedClient ||
        client.readyState !== 1
      ) {
        continue;
      }

      if (client.bufferedAmount > 1024 * 1024) {
        continue;
      }

      client.send(JSON.stringify(message), (error) => {
        if (error) {
          console.error('Room broadcast error:', error.message);
        }
      });
    }
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      arena: this.arena,
      clientsCount: this.clients.size,
      createdAt: this.createdAt,
    };
  }

  isEmpty() {
    return this.clients.size === 0;
  }
}
