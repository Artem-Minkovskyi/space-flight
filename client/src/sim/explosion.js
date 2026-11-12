import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Explosion extends Entity {
  constructor({
    position = new Vector2(),
    particleCount = 12,
    duration = 0.6,
    radius = 30,
  } = {}) {
    super({
      position,
      velocity: new Vector2(),
      radius,
      kind: 'explosion',
    });

    this.duration = duration;
    this.ttl = duration;
    this.particles = [];

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = 40 + Math.random() * 100;

      this.particles.push({
        velocity: Vector2.fromAngle(angle, speed),
        position: new Vector2(),
      });
    }
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

    for (const particle of this.particles) {
      particle.position = particle.position.add(
        particle.velocity.scale(deltaTime),
      );
    }
  }

  get progress() {
    return Math.max(0, this.ttl / this.duration);
  }
}
