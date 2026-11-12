import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Asteroid extends Entity {
  constructor({
    position = new Vector2(),
    velocity = new Vector2(),
    radius = 25,
    hp = 50,
  } = {}) {
    super({
      position,
      velocity,
      radius,
      kind: 'asteroid',
    });

    this.hp = hp;
  }

  takeDamage(amount) {
    if (this.dead || amount <= 0) {
      return;
    }

    this.hp = Math.max(0, this.hp - amount);

    if (this.hp === 0) {
      this.destroy();
    }
  }
}
