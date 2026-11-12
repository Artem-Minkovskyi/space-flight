import { Vector2 } from './vector.js';

export class Entity {
  static #nextId = 1;

  constructor({
    position = new Vector2(),
    velocity = new Vector2(),
    radius = 10,
    kind = 'entity',
  } = {}) {
    this.id = Entity.#nextId++;
    this.position = position;
    this.velocity = velocity;
    this.radius = radius;
    this.kind = kind;
    this.dead = false;
  }

  update(deltaTime) {
    this.position = this.position.add(this.velocity.scale(deltaTime));
  }

  destroy() {
    this.dead = true;
  }
}
