import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export const SHIP_CONFIG = Object.freeze({
  rotationSpeed: 3.6,
  thrustPower: 250,
  reversePower: 115,
  drag: 0.985,
  maxSpeed: 420,
  maxHp: 100,
});

export class Ship extends Entity {
  #hp;

  constructor({
    position = new Vector2(),
    velocity = new Vector2(),
    angle = 0,
    hp = SHIP_CONFIG.maxHp,
    radius = 15,
  } = {}) {
    super({
      position,
      velocity,
      radius,
      kind: 'ship',
    });

    this.angle = angle;
    this.thrust = false;
    this.#hp = hp;
    this.damageCooldown = 0;
  }

  get hp() {
    return this.#hp;
  }

  takeDamage(amount) {
    if (amount <= 0 || this.dead) {
      return;
    }

    this.#hp = Math.max(0, this.#hp - amount);

    if (this.#hp === 0) {
      this.destroy();
    }
  }

  heal(amount) {
    if (this.dead || amount <= 0) {
      return;
    }

    this.#hp = Math.min(SHIP_CONFIG.maxHp, this.#hp + amount);
  }

  update(deltaTime, input = null) {
    if (this.dead) {
      return;
    }

    this.damageCooldown = Math.max(0, this.damageCooldown - deltaTime);

    // Далі залишається весь твій наявний код методу update()

    if (input) {
      const left = input.isDown('ArrowLeft') || input.isDown('KeyA');

      const right = input.isDown('ArrowRight') || input.isDown('KeyD');

      const forward = input.isDown('ArrowUp') || input.isDown('KeyW');

      const reverse = input.isDown('ArrowDown') || input.isDown('KeyS');

      this.angle +=
        (Number(right) - Number(left)) * SHIP_CONFIG.rotationSpeed * deltaTime;

      this.thrust = forward || reverse;

      if (this.thrust) {
        const direction = forward ? 1 : -1;

        const power = forward
          ? SHIP_CONFIG.thrustPower
          : SHIP_CONFIG.reversePower;

        const acceleration = Vector2.fromAngle(
          this.angle,
          power * direction * deltaTime,
        );

        this.velocity = this.velocity.add(acceleration);
      }

      const damping = Math.pow(SHIP_CONFIG.drag, deltaTime * 60);

      this.velocity = this.velocity.scale(damping);

      const speed = this.velocity.length();

      if (speed > SHIP_CONFIG.maxSpeed) {
        this.velocity = this.velocity.normalize().scale(SHIP_CONFIG.maxSpeed);
      }
    } else {
      this.thrust = false;
    }

    super.update(deltaTime);
  }

  // Сумісність зі старою моделлю координат.
  get x() {
    return this.position.x;
  }

  set x(value) {
    this.position = new Vector2(value, this.position.y);
  }

  get y() {
    return this.position.y;
  }

  set y(value) {
    this.position = new Vector2(this.position.x, value);
  }

  get vx() {
    return this.velocity.x;
  }

  get vy() {
    return this.velocity.y;
  }
}

// Допоміжні функції першої лабораторної.
// Залишаємо їх, щоб поки не змінювати main.js.

export function createShip(x = 0, y = 0) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    thrust: false,
  };
}

export function integrate(ship, input, dt) {
  const left = input.isDown('ArrowLeft') || input.isDown('KeyA');

  const right = input.isDown('ArrowRight') || input.isDown('KeyD');

  const forward = input.isDown('ArrowUp') || input.isDown('KeyW');

  const reverse = input.isDown('ArrowDown') || input.isDown('KeyS');

  const angle =
    ship.angle +
    (Number(right) - Number(left)) * SHIP_CONFIG.rotationSpeed * dt;

  let vx = ship.vx;
  let vy = ship.vy;

  const thrust = forward || reverse;

  if (thrust) {
    const direction = forward ? 1 : -1;

    const power = forward ? SHIP_CONFIG.thrustPower : SHIP_CONFIG.reversePower;

    vx += Math.cos(angle) * power * direction * dt;
    vy += Math.sin(angle) * power * direction * dt;
  }

  const damping = Math.pow(SHIP_CONFIG.drag, dt * 60);

  vx *= damping;
  vy *= damping;

  const speed = Math.hypot(vx, vy);

  if (speed > SHIP_CONFIG.maxSpeed) {
    const scale = SHIP_CONFIG.maxSpeed / speed;

    vx *= scale;
    vy *= scale;
  }

  return {
    x: ship.x + vx * dt,
    y: ship.y + vy * dt,
    vx,
    vy,
    angle,
    thrust,
  };
}

export function lerpAngle(from, to, alpha) {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));

  return from + difference * alpha;
}

export function interpolateShip(previous, current, alpha) {
  return {
    x: previous.x + (current.x - previous.x) * alpha,
    y: previous.y + (current.y - previous.y) * alpha,
    vx: current.vx,
    vy: current.vy,
    angle: lerpAngle(previous.angle, current.angle, alpha),
    thrust: current.thrust,
  };
}
