import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Pickup extends Entity {
  constructor({
    position = new Vector2(),
    radius = 12,
    type = 'health',
    value = 25,
  } = {}) {
    super({
      position,
      velocity: new Vector2(),
      radius,
      kind: 'pickup',
    });

    this.type = type;
    this.value = value;
  }

  applyTo(ship) {
    if (this.dead || !ship || ship.dead) {
      return false;
    }

    if (this.type === 'health') {
      const missingHp = ship.constructor ? 100 - ship.hp : 0;

      if (missingHp <= 0) {
        return false;
      }

      ship.heal(Math.min(this.value, missingHp));
    }

    this.destroy();
    return true;
  }
}
