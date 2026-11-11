import './style.css';

import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { attachHoming } from './sim/behaviors.js';
import { Vector2 } from './sim/vector.js';
import { Ship } from './sim/ship.js';
import { World } from './sim/world.js';
import { Asteroid } from './sim/asteroid.js';
import { Bullet } from './sim/bullet.js';
import { Pickup } from './sim/pickup.js';
import { Explosion } from './sim/explosion.js';

import { setupCanvas } from './render/canvas.js';
import { drawScene } from './render/draw.js';

const canvas = document.querySelector('#game');

const stepsElement = document.querySelector('#steps');
const fpsElement = document.querySelector('#fps');
const frameTimeElement = document.querySelector('#frame-time');
const centerMessage = document.querySelector('#center-message');

const surface = setupCanvas(canvas);
const input = createInput(window);

const world = new World();

// Налаштування гри.
const FIRE_INTERVAL = 0.2;
const BULLET_SPEED = 550;
const RESPAWN_DELAY = 2;
const MAX_ASTEROIDS = 10;
const ASTEROID_SCORE = 100;

// Стан гри.
let score = 0;
let respawnTimer = 0;
let fireCooldown = 0;
let asteroidSpawnTimer = 0;
let pickupSpawnTimer = 0;

// Поточний корабель.
let ship = null;

// Попередній стан корабля для інтерполяції.
let previousPosition = new Vector2();
let previousAngle = 0;

// Створення корабля.
function spawnShip(position = null) {
  const spawnPosition =
    position ?? new Vector2(surface.width / 2, surface.height / 2);

  const newShip = new Ship({
    position: spawnPosition,
    velocity: new Vector2(),
  });

  world.spawn(newShip);

  ship = newShip;

  previousPosition = ship.position;
  previousAngle = ship.angle;

  fireCooldown = 0;
  respawnTimer = 0;

  centerMessage.classList.add('hidden');
}

// Випадкова позиція в межах арени.
function randomPosition() {
  return new Vector2(
    Math.random() * surface.width,
    Math.random() * surface.height,
  );
}

// Пошук безпечного місця для відродження.
function findSafeSpawnPosition() {
  const minDistance = 140;
  const maxAttempts = 30;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const position = randomPosition();

    const isSafe = [...world].every((entity) => {
      if (
        entity.dead ||
        entity.kind === 'bullet' ||
        entity.kind === 'explosion'
      ) {
        return true;
      }

      const distance = position.sub(entity.position).length();

      return distance > minDistance + entity.radius;
    });

    if (isSafe) {
      return position;
    }
  }

  return new Vector2(surface.width / 2, surface.height / 2);
}

// Створення астероїда.

function spawnAsteroid() {
  const position = randomPosition();

  const asteroid = new Asteroid({
    position,
    velocity: new Vector2(
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100,
    ),
    radius: 20 + Math.random() * 20,
    hp: 50,
  });

  // Кожен третій астероїд отримує homing-поведінку.
  const isHoming = Math.random() < 0.33;

  if (isHoming) {
    attachHoming(asteroid, {
      speed: 90,
      turnRate: 1.5,
      getTarget: () => {
        return ship && !ship.dead ? ship : null;
      },
    });
  }

  world.spawn(asteroid);

  return asteroid;
}

// Створення бонуса.
function spawnPickup() {
  const pickup = new Pickup({
    position: randomPosition(),
    type: 'health',
    value: 25,
  });

  world.spawn(pickup);

  return pickup;
}

// Створення кулі.
function fireBullet() {
  if (!ship || ship.dead) {
    return;
  }

  const direction = Vector2.fromAngle(ship.angle);

  const bullet = new Bullet({
    position: ship.position.add(direction.scale(ship.radius + 8)),
    velocity: ship.velocity.add(direction.scale(BULLET_SPEED)),
    damage: 25,
    ttl: 1.5,
  });

  world.spawn(bullet);
}

// Переміщення об'єктів через межі арени.
function wrapEntity(entity) {
  const width = surface.width;
  const height = surface.height;

  let x = entity.position.x;
  let y = entity.position.y;

  if (x < 0) x += width;
  if (x >= width) x -= width;

  if (y < 0) y += height;
  if (y >= height) y -= height;

  if (x !== entity.position.x || y !== entity.position.y) {
    entity.position = new Vector2(x, y);
  }
}

// Створення вибуху.
function createExplosion(position) {
  world.spawn(
    new Explosion({
      position,
      particleCount: 12,
      duration: 0.6,
      radius: 30,
    }),
  );
}

// Обробка знищених сутностей.
function handleRemovedEntities(removedEntities) {
  for (const entity of removedEntities) {
    if (entity.kind === 'asteroid') {
      createExplosion(entity.position);
      score += ASTEROID_SCORE;
    }

    if (entity.kind === 'ship') {
      createExplosion(entity.position);
    }
  }
}

// Ініціалізація гри.
spawnShip();

for (let i = 0; i < 6; i++) {
  spawnAsteroid();
}

spawnPickup();

// Основна симуляція.
function simulate(dt) {
  // Зберігаємо попередню позицію корабля.
  if (ship && !ship.dead) {
    previousPosition = ship.position;
    previousAngle = ship.angle;

    // Перевірка стрільби.
    fireCooldown -= dt;

    if (input.isDown('Space') && fireCooldown <= 0) {
      fireBullet();
      fireCooldown = FIRE_INTERVAL;
    }
  }

  // Оновлюємо світ.
  // Корабель отримує керування через input.
  const removedEntities = world.step(dt, ship, input);

  // Обробляємо знищені об'єкти.
  handleRemovedEntities(removedEntities);

  // Переміщуємо всі сутності через межі арени.
  for (const entity of world) {
    wrapEntity(entity);
  }

  // Автоматичне створення астероїдів.
  asteroidSpawnTimer += dt;

  if (asteroidSpawnTimer >= 3) {
    asteroidSpawnTimer = 0;

    if ([...world.ofKind('asteroid')].length < MAX_ASTEROIDS) {
      spawnAsteroid();
    }
  }

  // Періодичне створення бонусів.
  pickupSpawnTimer += dt;

  if (pickupSpawnTimer >= 12) {
    pickupSpawnTimer = 0;

    if ([...world.ofKind('pickup')].length < 3) {
      spawnPickup();
    }
  }

  // Відродження корабля після знищення.
  if (ship && ship.dead) {
    respawnTimer += dt;

    if (respawnTimer >= RESPAWN_DELAY) {
      const safePosition = findSafeSpawnPosition();

      spawnShip(safePosition);
    }
  }

  // Оновлення стану введення.
  input.endStep();
}

// Відображення гри.
function render(alpha, stats) {
  let shipForRender = null;

  if (ship && !ship.dead) {
    shipForRender = {
      x: previousPosition.x + (ship.position.x - previousPosition.x) * alpha,

      y: previousPosition.y + (ship.position.y - previousPosition.y) * alpha,

      angle: previousAngle + (ship.angle - previousAngle) * alpha,

      thrust: ship.thrust,
      hp: ship.hp,
    };
  }

  // Малювання всієї сцени.
  drawScene(
    surface.ctx,
    surface.width,
    surface.height,
    shipForRender,
    stats,
    [...world],
    score,
  );

  // Оновлення HUD.
  stepsElement.textContent = stats.stepsPerSecond;
  fpsElement.textContent = stats.framesPerSecond;
  frameTimeElement.textContent = stats.frameTime.toFixed(2);

  if (centerMessage) {
    if (!ship || ship.dead) {
      centerMessage.classList.remove('hidden');
      centerMessage.textContent = 'SHIP DESTROYED';
    } else if (ship.thrust) {
      centerMessage.classList.add('hidden');
    }
  }
}

// Запуск ігрового циклу.
const gameLoop = createLoop({
  simulate,
  render,
});

gameLoop.start();

// Очищення ресурсів.
window.addEventListener('beforeunload', () => {
  gameLoop.stop();
  input.destroy();
  surface.destroy();
});
