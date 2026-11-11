import { updateHoming } from './behaviors.js';
import { resolveCollisions } from './collision.js';

export class World {
  constructor() {
    this.entities = new Map();
  }

  spawn(entity) {
    this.entities.set(entity.id, entity);
    return entity;
  }

  despawn(entity) {
    const existing = this.entities.get(entity.id);

    if (existing) {
      existing.destroy();
    }
  }

  // Видаляє знищені сутності та повертає їх.
  sweep() {
    const removed = [];

    for (const [id, entity] of this.entities) {
      if (entity.dead) {
        removed.push(entity);
        this.entities.delete(id);
      }
    }

    return removed;
  }

  // Оновлює світ, передаючи керування потрібній сутності.
  step(deltaTime, inputEntity = null, input = null) {
    for (const entity of this.entities.values()) {
      if (entity.dead) {
        continue;
      }

      updateHoming(entity, deltaTime);

      if (!entity.dead) {
        const entityInput = entity === inputEntity ? input : null;
        entity.update(deltaTime, entityInput);
      }
    }

    resolveCollisions(this);

    return this.sweep();
  }

  *ofKind(kind) {
    for (const entity of this.entities.values()) {
      if (entity.kind === kind && !entity.dead) {
        yield entity;
      }
    }
  }

  [Symbol.iterator]() {
    return this.entities.values();
  }

  get size() {
    return this.entities.size;
  }
}
