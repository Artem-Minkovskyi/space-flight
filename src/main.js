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

import { GameEvents } from './events.js';
import { AudioManager, connectAudio } from './audio.js';
import { loadAll } from './assets/assetManager.js';

import { Lobby } from './lobby/Lobby.js';
import { createLobbyDOM } from './lobby/dom.js';

// DOM-елементи гри.
const canvas = document.querySelector('#game');

const stepsElement = document.querySelector('#steps');
const fpsElement = document.querySelector('#fps');
const frameTimeElement = document.querySelector('#frame-time');
const centerMessage = document.querySelector('#center-message');

// DOM-елементи завантаження.
const loadingScreen = document.querySelector('#loading-screen');
const loadingStatus = document.querySelector('#loading-status');
const loadingProgress = document.querySelector('#loading-progress');
const loadingCount = document.querySelector('#loading-count');
const loadingPercent = document.querySelector('#loading-percent');
const loadingError = document.querySelector('#loading-error');

const startButton = document.querySelector('#start-loading');
const retryButton = document.querySelector('#retry-loading');
const cancelButton = document.querySelector('#cancel-loading');

// DOM-елементи Lobby.
const lobbyScreen = document.querySelector('#lobby-screen');
const lobbyContainer = document.querySelector('#lobby-container');

// Ініціалізація Canvas та керування.
const surface = setupCanvas(canvas);
const input = createInput(window);

const world = new World();

// Система подій та аудіо.
const events = new GameEvents();
const audio = new AudioManager();

connectAudio(events, audio);

// Ініціалізація Lobby.
const lobby = new Lobby({
  roomsUrl: '/api/rooms.json',
  pollInterval: 5000,
});

const lobbyDOM = createLobbyDOM(lobbyContainer, lobby);

// Завантажені ресурси.
let images = {};
let audioBuffers = {};

// Контролер скасування завантаження.
let loadingController = null;
let loadingInProgress = false;
let gameStarted = false;

// Налаштування гри.
const FIRE_INTERVAL = 0.2;
const BULLET_SPEED = 550;
const RESPAWN_DELAY = 2;
const ASTEROID_SCORE = 100;

// Налаштування поточної кімнати.
let maxAsteroids = 10;
let asteroidSpeedMultiplier = 1;

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
  const asteroid = new Asteroid({
    position: randomPosition(),
    velocity: new Vector2(
      (Math.random() - 0.5) * 100 * asteroidSpeedMultiplier,
      (Math.random() - 0.5) * 100 * asteroidSpeedMultiplier,
    ),
    radius: 20 + Math.random() * 20,
    hp: 50,
  });

  if (Math.random() < 0.33) {
    attachHoming(asteroid, {
      speed: 90 * asteroidSpeedMultiplier,
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

  events.emit('fired', { bullet });
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
      events.emit('exploded', { entity });
    }

    if (entity.kind === 'ship') {
      createExplosion(entity.position);
      events.emit('exploded', { entity });
    }
  }
}

// Основна симуляція.
function simulate(dt) {
  if (ship && !ship.dead) {
    previousPosition = ship.position;
    previousAngle = ship.angle;

    fireCooldown -= dt;

    if (input.isDown('Space') && fireCooldown <= 0) {
      fireBullet();
      fireCooldown = FIRE_INTERVAL;
    }
  }

  const removedEntities = world.step(dt, ship, input, (name, detail) =>
    events.emit(name, detail),
  );

  handleRemovedEntities(removedEntities);

  for (const entity of world) {
    wrapEntity(entity);
  }

  asteroidSpawnTimer += dt;

  if (asteroidSpawnTimer >= 3) {
    asteroidSpawnTimer = 0;

    if ([...world.ofKind('asteroid')].length < maxAsteroids) {
      spawnAsteroid();
    }
  }

  pickupSpawnTimer += dt;

  if (pickupSpawnTimer >= 12) {
    pickupSpawnTimer = 0;

    if ([...world.ofKind('pickup')].length < 3) {
      spawnPickup();
    }
  }

  if (ship && ship.dead) {
    respawnTimer += dt;

    if (respawnTimer >= RESPAWN_DELAY) {
      spawnShip(findSafeSpawnPosition());
    }
  }

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

  drawScene(
    surface.ctx,
    surface.width,
    surface.height,
    shipForRender,
    stats,
    [...world],
    score,
    images,
  );

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

// Створення ігрового циклу.
let gameLoop = null;

// Запуск гри з конфігурацією вибраної кімнати.
function startGame(config = {}) {
  if (gameStarted) {
    return;
  }

  maxAsteroids = Math.max(1, Number(config.asteroids) || 6);
  asteroidSpeedMultiplier = Math.max(0.1, Number(config.asteroidSpeed) || 1);

  score = 0;
  asteroidSpawnTimer = 0;
  pickupSpawnTimer = 0;

  spawnShip();

  for (let i = 0; i < maxAsteroids; i++) {
    spawnAsteroid();
  }

  spawnPickup();

  gameLoop = createLoop({
    simulate,
    render,
  });

  gameLoop.start();

  gameStarted = true;

  console.log('Гру запущено з конфігурацією:', config);
}

// Оновлення індикатора завантаження.
function updateProgress(progress) {
  loadingProgress.style.width = `${progress.percent}%`;
  loadingCount.textContent = `${progress.loaded} / ${progress.total}`;
  loadingPercent.textContent = `${progress.percent}%`;

  if (progress.current) {
    loadingStatus.textContent = `Завантаження: ${progress.current}`;
  }
}

// Відкриття Lobby після завантаження ресурсів.
function showLobby() {
  loadingScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');

  lobby.show();
}

// Обробка вибору кімнати.
lobby.addEventListener('join', (event) => {
  const { playerName, room, config } = event.detail;

  console.log('Гравець:', playerName);
  console.log('Вибрана кімната:', room.name);
  console.log('Конфігурація арени:', config);

  lobbyScreen.classList.add('hidden');

  startGame(config);
});

// Обробка помилок Lobby.
lobby.addEventListener('error', (event) => {
  console.error('Помилка Lobby:', event.detail.error);
});

// Завантаження всіх ресурсів.
async function startLoading() {
  if (loadingInProgress || gameStarted) {
    return;
  }

  loadingInProgress = true;
  loadingController = new AbortController();

  startButton.hidden = true;
  retryButton.hidden = true;
  cancelButton.hidden = false;

  loadingError.textContent = '';
  loadingStatus.textContent = 'Ініціалізація аудіо...';

  try {
    // AudioContext створюється після натискання користувача.
    await audio.initialize();

    loadingStatus.textContent = 'Завантаження ресурсів...';

    const assets = await loadAll({
      manifestUrl: '/manifest.json',
      audioContext: audio.context,
      signal: loadingController.signal,
      onProgress: updateProgress,
    });

    images = assets.images;
    audioBuffers = assets.audio;

    audio.setBuffers(audioBuffers);

    // Після завантаження відкриваємо Lobby.
    showLobby();
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      loadingStatus.textContent = 'Завантаження скасовано';
      loadingError.textContent = 'Можна повторити завантаження.';
    } else {
      console.error('Asset loading error:', error);

      loadingStatus.textContent = 'Не вдалося завантажити ресурси';
      loadingError.textContent = error.message;
    }

    retryButton.hidden = false;
  } finally {
    loadingInProgress = false;
    loadingController = null;
    cancelButton.hidden = true;
  }
}

// Скасування завантаження.
function cancelLoading() {
  if (loadingController) {
    loadingController.abort();
  }
}

// Обробники кнопок.
startButton.addEventListener('click', startLoading);
retryButton.addEventListener('click', startLoading);
cancelButton.addEventListener('click', cancelLoading);

// Очищення ресурсів.
window.addEventListener('beforeunload', () => {
  loadingController?.abort();

  lobby.destroy();
  lobbyDOM.destroy();

  gameLoop?.stop();
  input.destroy();
  surface.destroy();
  audio.destroy();
});
