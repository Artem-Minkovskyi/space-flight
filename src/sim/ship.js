export const SHIP_CONFIG = Object.freeze({
  rotationSpeed: 3.6,
  thrustPower: 250,
  reversePower: 115,
  drag: 0.985,
  maxSpeed: 420,
});

// Створення початкового стану корабля.
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

/**
 * Функція фізики корабля.
 * Не використовує DOM або Canvas.
 */
export function integrate(ship, input, dt) {
  const left = input.isDown("ArrowLeft") || input.isDown("KeyA");

  const right = input.isDown("ArrowRight") || input.isDown("KeyD");

  const forward = input.isDown("ArrowUp") || input.isDown("KeyW");

  const reverse = input.isDown("ArrowDown") || input.isDown("KeyS");

  // Поворот корабля.
  const angle =
    ship.angle +
    (Number(right) - Number(left)) * SHIP_CONFIG.rotationSpeed * dt;

  let vx = ship.vx;
  let vy = ship.vy;

  const thrust = forward || reverse;

  // Прискорення вперед або назад.
  if (forward || reverse) {
    const direction = forward ? 1 : -1;

    const power = forward ? SHIP_CONFIG.thrustPower : SHIP_CONFIG.reversePower;

    vx += Math.cos(angle) * power * direction * dt;
    vy += Math.sin(angle) * power * direction * dt;
  }

  // Опір повітря (інерція).
  const damping = Math.pow(SHIP_CONFIG.drag, dt * 60);

  vx *= damping;
  vy *= damping;

  // Обмеження максимальної швидкості.
  const speed = Math.hypot(vx, vy);

  if (speed > SHIP_CONFIG.maxSpeed) {
    const scale = SHIP_CONFIG.maxSpeed / speed;

    vx *= scale;
    vy *= scale;
  }

  // Повертаємо новий стан корабля.
  return {
    x: ship.x + vx * dt,
    y: ship.y + vy * dt,
    vx,
    vy,
    angle,
    thrust,
  };
}

// Інтерполяція кута з урахуванням переходу через 2π.
export function lerpAngle(from, to, alpha) {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));

  return from + difference * alpha;
}

// Інтерполяція між двома станами корабля.
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
