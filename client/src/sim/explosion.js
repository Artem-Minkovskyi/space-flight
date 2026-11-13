import { Entity } from './entity.js';
import { Vector2 } from './vector.js';
import { ObjectPool } from './object-pool.js';

const particlePool = new ObjectPool(
  () => ({ position: new Vector2(), velocity: new Vector2() }),
  (particle, angle = 0, speed = 0) => {
    particle.position.x = 0; particle.position.y = 0;
    particle.velocity.x = Math.cos(angle) * speed;
    particle.velocity.y = Math.sin(angle) * speed;
  },
  96,
);

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

      this.particles.push(particlePool.acquire(angle, speed));
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
      particle.position.x += particle.velocity.x * deltaTime;
      particle.position.y += particle.velocity.y * deltaTime;
    }
  }

  destroy() {
    if (this.dead) return;
    super.destroy();
    for (const particle of this.particles) particlePool.release(particle);
    this.particles.length = 0;
  }

  get progress() {
    return Math.max(0, this.ttl / this.duration);
  }
}
