import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Bullet extends Entity {
  constructor({
    position = new Vector2(),
    velocity = new Vector2(),
    damage = 25,
    ttl = 2,
    radius = 4,
  } = {}) {
    super({
      position,
      velocity,
      radius,
      kind: 'bullet',
    });

    this.damage = damage;
    this.ttl = ttl;
  }

  update(deltaTime) {
    if (this.dead) {
      return;
    }

    this.ttl -= deltaTime;

    if (this.ttl <= 0) {
      this.destroy();
      return;
    }

    super.update(deltaTime);
  }
}
