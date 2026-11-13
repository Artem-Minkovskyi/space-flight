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
import { WebSocketClient } from './network/WebSocketClient.ts';
import { encodeInput, decodeSnapshot } from '@space-flight/shared/protocol';
import { integrateShip } from '@space-flight/shared/simulation';

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

// DOM-елементи мережевої гри.
const networkPanel = document.querySelector('#network-panel');
const networkRoomName = document.querySelector('#network-room-name');
const connectionDot = document.querySelector('#connection-dot');
const connectionStatus = document.querySelector('#connection-status');

const chatMessages = document.querySelector('#chat-messages');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');

const playersList = document.querySelector('#players-list');
const leaveRoomButton = document.querySelector('#leave-room');

// DOM-елементи Replay.
const replayLoadButton = document.querySelector('#replay-load');
const replayPlayButton = document.querySelector('#replay-play');
const replayPauseButton = document.querySelector('#replay-pause');
const replaySpeedSelect = document.querySelector('#replay-speed');
const replayProgress = document.querySelector('#replay-progress');
const replayCurrentTime = document.querySelector('#replay-current-time');
const replayDurationElement = document.querySelector('#replay-duration');
const replayStatus = document.querySelector('#replay-status');

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
  roomsUrl: '/api/rooms',
  pollInterval: 5000,
});

const lobbyDOM = createLobbyDOM(lobbyContainer, lobby);

// WebSocket-клієнт.
let networkClient = null;
let currentPlayerName = null;
let currentRoomId = null;
let currentRoomName = null;

// Стан кораблів інших гравців.
const remoteShips = new Map();
const playerIdToNickname = new Map();
let inputSequence = 0;
let playerId = null;
const protocolMode =
  new URLSearchParams(location.search).get('protocol') === 'json'
    ? 'json'
    : 'binary';
let pendingInputs = [];
let correctionMagnitude = 0;
let bytesReceived = 0;
let bytesSent = 0;
let bandwidthSampleAt = performance.now();
let bytesPerSecond = 0;

// Стан системи Replay.
let replayEvents = [];
let replayEventsByPlayer = new Map();
let replayLoaded = false;
let replayPlaying = false;
let replayPosition = 0;
let replayDurationMs = 0;
let replayStartTimestamp = 0;
let replayLastFrameTime = 0;
let replayLastUiUpdate = 0;
let replaySpeed = 1;
let replayRoomId = null;

function formatReplayTime(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateReplayControls() {
  if (replayPlayButton) replayPlayButton.disabled = !replayLoaded;
  if (replayPauseButton)
    replayPauseButton.disabled = !replayLoaded || !replayPlaying;
  if (replaySpeedSelect) replaySpeedSelect.disabled = !replayLoaded;
  if (replayProgress) replayProgress.disabled = !replayLoaded;
}

function updateReplayTimeline() {
  if (replayCurrentTime) {
    replayCurrentTime.textContent = formatReplayTime(replayPosition);
  }

  if (replayDurationElement) {
    replayDurationElement.textContent = formatReplayTime(replayDurationMs);
  }

  if (replayProgress) {
    replayProgress.value =
      replayDurationMs > 0
        ? String((replayPosition / replayDurationMs) * 100)
        : '0';
  }
}

function getReplayShipsAt(position) {
  const targetTimestamp = replayStartTimestamp + position;
  const ships = [];

  for (const [nickname, events] of replayEventsByPlayer) {
    // Знаходимо першу подію гравця, час якої більший за поточний.
    let low = 0;
    let high = events.length;

    while (low < high) {
      const middle = Math.floor((low + high) / 2);

      if (events[middle].time <= targetTimestamp) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    const previousEvent = events[low - 1];
    const nextEvent = events[low];

    if (!previousEvent) {
      continue;
    }

    const previous = previousEvent.state;
    const next = nextEvent?.state ?? previous;
    const interval = nextEvent ? nextEvent.time - previousEvent.time : 0;
    const alpha =
      interval > 0
        ? Math.max(
            0,
            Math.min(1, (targetTimestamp - previousEvent.time) / interval),
          )
        : 0;

    const previousAngle = Number(previous.angle) || 0;
    const nextAngle = Number(next.angle) || previousAngle;
    const angleDifference = Math.atan2(
      Math.sin(nextAngle - previousAngle),
      Math.cos(nextAngle - previousAngle),
    );

    ships.push({
      nickname,
      x:
        (Number(previous.x) || 0) +
        ((Number(next.x) || 0) - (Number(previous.x) || 0)) * alpha,
      y:
        (Number(previous.y) || 0) +
        ((Number(next.y) || 0) - (Number(previous.y) || 0)) * alpha,
      angle: previousAngle + angleDifference * alpha,
      thrust: alpha < 1 ? Boolean(previous.thrust) : Boolean(next.thrust),
      hp: alpha < 1 ? previous.hp : next.hp,
      dead: alpha < 1 ? Boolean(previous.dead) : Boolean(next.dead),
    });
  }

  return ships;
}

async function loadReplay() {
  if (!replayLoadButton) return;

  replayLoadButton.disabled = true;
  if (replayStatus) replayStatus.textContent = 'Завантаження запису...';

  try {
    const response = await fetch('/api/replay');

    if (!response.ok) {
      throw new Error(`Помилка сервера: HTTP ${response.status}`);
    }

    const data = await response.json();
    const stateEvents = Array.isArray(data.events)
      ? data.events.filter(
          (event) =>
            event.type === 'player:state' &&
            event.roomId &&
            event.nickname &&
            event.state &&
            Number.isFinite(Date.parse(event.timestamp)),
        )
      : [];

    if (stateEvents.length === 0) {
      throw new Error('У журналі немає записаних станів кораблів.');
    }

    // Обираємо поточну кімнату, якщо в ній є записи; інакше — кімнату
    // з найпізнішими записаними подіями.
    const roomIds = [...new Set(stateEvents.map((event) => event.roomId))];
    replayRoomId = roomIds.includes(currentRoomId)
      ? currentRoomId
      : stateEvents[stateEvents.length - 1].roomId;

    replayEvents = stateEvents
      .filter((event) => event.roomId === replayRoomId)
      .map((event) => ({
        ...event,
        time: Date.parse(event.timestamp),
      }))
      .sort((a, b) => a.time - b.time);

    replayEventsByPlayer = new Map();

    for (const event of replayEvents) {
      if (!replayEventsByPlayer.has(event.nickname)) {
        replayEventsByPlayer.set(event.nickname, []);
      }

      replayEventsByPlayer.get(event.nickname).push(event);
    }

    replayStartTimestamp = replayEvents[0].time;
    replayDurationMs = Math.max(
      0,
      replayEvents[replayEvents.length - 1].time - replayStartTimestamp,
    );
    replayPosition = 0;
    replayPlaying = false;
    replayLastFrameTime = 0;
    replayLoaded = true;

    if (replayStatus) {
      replayStatus.textContent = `Запис завантажено · кімната ${replayRoomId} · ${replayEvents.length} подій`;
    }

    updateReplayControls();
    updateReplayTimeline();
  } catch (error) {
    console.error('Replay loading error:', error);
    replayLoaded = false;
    replayPlaying = false;

    if (replayStatus) {
      replayStatus.textContent =
        error.message || 'Не вдалося завантажити запис';
    }

    updateReplayControls();
  } finally {
    replayLoadButton.disabled = false;
  }
}

function playReplay() {
  if (!replayLoaded) return;

  if (replayPosition >= replayDurationMs) {
    replayPosition = 0;
  }

  replayPlaying = true;
  replayLastFrameTime = performance.now();

  if (replayStatus) replayStatus.textContent = `Відтворення · ${replayRoomId}`;
  updateReplayControls();
  updateReplayTimeline();
}

function pauseReplay() {
  replayPlaying = false;
  replayLastFrameTime = 0;

  if (replayLoaded && replayStatus) {
    replayStatus.textContent = `Пауза · ${replayRoomId}`;
  }

  updateReplayControls();
  updateReplayTimeline();
}

function seekReplay(value) {
  if (!replayLoaded) return;

  replayPosition = replayDurationMs * (Number(value) / 100);
  replayLastFrameTime = performance.now();
  updateReplayTimeline();
}

// Таймер відправлення стану корабля.
let networkStateTimer = 0;

const NETWORK_UPDATE_INTERVAL = 1 / 30;

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

// --------------------------------------------------
// МЕРЕЖЕВА ВЗАЄМОДІЯ
// --------------------------------------------------

// Оновлення індикатора WebSocket.
function updateConnectionStatus(status) {
  if (!connectionStatus || !connectionDot) return;

  const statuses = {
    connecting: 'Підключення...',
    connected: 'Підключено',
    disconnected: 'Відключено',
    reconnecting: 'Повторне підключення...',
    'queue-full': 'Черга повідомлень переповнена',
  };

  connectionStatus.textContent = statuses[status] ?? status;

  connectionDot.classList.remove('connected', 'disconnected');

  if (status === 'connected') {
    connectionDot.classList.add('connected');
  } else if (status === 'disconnected' || status === 'queue-full') {
    connectionDot.classList.add('disconnected');
  }
}

// Додавання повідомлення до чату.
function appendChatMessage(nickname, text, type = 'chat') {
  if (!chatMessages) return;

  const emptyMessage = chatMessages.querySelector('.chat-empty');
  emptyMessage?.remove();

  const messageElement = document.createElement('p');
  messageElement.className = 'chat-message';

  if (type === 'system') {
    messageElement.textContent = text;
    messageElement.style.color = '#8290a8';
  } else {
    const nameElement = document.createElement('strong');
    nameElement.textContent = `${nickname}: `;

    const textElement = document.createElement('span');
    textElement.textContent = text;

    messageElement.append(nameElement, textElement);
  }

  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Обмежуємо кількість повідомлень у DOM.
  while (chatMessages.children.length > 100) {
    chatMessages.firstElementChild.remove();
  }
}

// Оновлення інформації про учасників.

function updatePlayersList(players = []) {
  if (!playersList) return;

  playersList.replaceChildren();

  if (!Array.isArray(players)) {
    players = [];
  }

  players.forEach((player) => {
    const playerItem = document.createElement('li');

    const nickname =
      typeof player === 'string' ? player : (player.nickname ?? 'Гравець');

    playerItem.textContent =
      nickname === currentPlayerName ? `${nickname} (ви)` : nickname;

    playersList.appendChild(playerItem);
  });

  const countItem = document.createElement('li');
  countItem.textContent = `Усього гравців: ${players.length}`;
  countItem.style.fontWeight = 'bold';

  playersList.appendChild(countItem);
}

function handleNetworkMessage(message) {
  switch (message.type) {
    case 'joined': {
      currentRoomName = message.room?.name ?? currentRoomName;

      networkRoomName.textContent = currentRoomName ?? 'Кімната';

      updatePlayersList(message.room?.players ?? []);
      playerId = message.playerId ?? null;
      for (const player of message.room?.players ?? [])
        if (player.id) playerIdToNickname.set(player.id, player.nickname);

      appendChatMessage(
        'Система',
        `Ви приєдналися до кімнати "${currentRoomName}"`,
        'system',
      );

      break;
    }

    case 'room:update': {
      const room = message.room;

      if (room) {
        const players = room.players ?? [];
        updatePlayersList(players);

        // Видаляємо кораблі гравців, яких більше немає в кімнаті.
        const activeNicknames = new Set(
          players.map((player) =>
            typeof player === 'string' ? player : player.nickname,
          ),
        );

        for (const nickname of remoteShips.keys()) {
          if (!activeNicknames.has(nickname)) {
            remoteShips.delete(nickname);
          }
        }
      }

      break;
    }

    case 'snapshot': {
      processSnapshot(message);
      break;
    }

    case 'player:state': {
      if (
        !message.nickname ||
        message.nickname === currentPlayerName ||
        !message.state
      ) {
        break;
      }

      const previous = remoteShips.get(message.nickname);

      remoteShips.set(message.nickname, {
        nickname: message.nickname,
        previous: previous?.current ?? message.state,
        current: message.state,
        receivedAt: performance.now(),
      });

      break;
    }

    case 'chat': {
      appendChatMessage(message.nickname, message.text);
      break;
    }

    case 'system': {
      appendChatMessage('Система', message.message, 'system');
      break;
    }

    case 'error': {
      appendChatMessage('Помилка', message.message, 'system');
      console.error('WebSocket server error:', message.message);
      break;
    }

    case 'left': {
      appendChatMessage('Система', 'Ви покинули кімнату', 'system');
      break;
    }

    default: {
      console.warn('Unknown WebSocket message:', message);
    }
  }
}

function processSnapshot(snapshot) {
  const now = performance.now();
  const players = snapshot.players ?? [];
  for (const player of players) {
    const nickname = player.nickname ?? playerIdToNickname.get(player.id);
    if (!nickname) continue;
    if (player.id) playerIdToNickname.set(player.id, nickname);
    if (player.id === playerId && ship && !ship.dead) {
      const serverState = player.state;
      correctionMagnitude = Math.hypot(
        ship.position.x - serverState.x,
        ship.position.y - serverState.y,
      );
      pendingInputs = pendingInputs.filter(
        (entry) => entry.seq > (serverState.seq ?? 0),
      );
      let corrected = { ...serverState };
      for (const entry of pendingInputs)
        corrected = integrateShip(corrected, entry);
      ship.position = new Vector2(corrected.x, corrected.y);
      ship.velocity = new Vector2(corrected.vx, corrected.vy);
      ship.angle = corrected.angle;
      continue;
    }
    if (nickname === currentPlayerName) continue;
    const previous = remoteShips.get(nickname);
    remoteShips.set(nickname, {
      nickname,
      previous: previous?.current ?? player.state,
      current: player.state,
      receivedAt: now,
    });
  }
  if (now - bandwidthSampleAt >= 1000) {
    bytesPerSecond = bytesReceived + bytesSent;
    bytesReceived = 0;
    bytesSent = 0;
    bandwidthSampleAt = now;
  }
  const graph = document.querySelector('#netgraph-values');
  if (graph)
    graph.textContent = `RTT: — ms · Snapshot age: 0 ms · Traffic: ${bytesPerSecond} B/s · Input queue: ${pendingInputs.length} · Correction: ${correctionMagnitude.toFixed(1)} px`;
}

function handleBinaryMessage(buffer) {
  bytesReceived += buffer.byteLength;
  try {
    processSnapshot(decodeSnapshot(new Uint8Array(buffer)));
  } catch (error) {
    console.error('Invalid binary snapshot:', error);
  }
}

// Створення WebSocket-підключення.
function connectToRoom(playerName, room) {
  if (networkClient) {
    networkClient.disconnect();
    networkClient = null;
  }

  currentPlayerName = playerName;
  currentRoomId = room.id;
  currentRoomName = room.name;

  networkPanel.classList.remove('hidden');
  networkRoomName.textContent = room.name;

  remoteShips.clear();
  networkStateTimer = 0;

  chatMessages.replaceChildren();

  updatePlayersList(1);
  updateConnectionStatus('connecting');

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  networkClient = new WebSocketClient({
    url: wsUrl,

    onMessage: handleNetworkMessage,
    onBinary: handleBinaryMessage,

    onStatusChange: (status) => {
      updateConnectionStatus(status);

      // Після кожного успішного підключення
      // приєднуємося до вибраної кімнати.
      if (status === 'connected' && networkClient) {
        networkClient.send({
          type: 'join',
          roomId: currentRoomId,
          nickname: currentPlayerName,
          protocol: protocolMode,
        });
      }
    },
  });

  networkClient.connect();
}

// Надсилання повідомлення чату.
function sendChatMessage(event) {
  event.preventDefault();

  const text = chatInput.value.trim();

  if (!text || !networkClient) {
    return;
  }

  const accepted = networkClient.send({
    type: 'chat',
    text,
  });

  if (accepted) {
    chatInput.value = '';
  } else {
    appendChatMessage(
      'Система',
      'Не вдалося надіслати повідомлення. Черга переповнена.',
      'system',
    );
  }
}

// Вихід із кімнати.
function leaveRoom() {
  if (networkClient) {
    networkClient.disconnect();
    networkClient = null;
  }

  networkPanel.classList.add('hidden');

  currentPlayerName = null;
  currentRoomId = null;
  currentRoomName = null;
  remoteShips.clear();
  networkStateTimer = 0;

  updateConnectionStatus('disconnected');

  appendChatMessage('Система', "З'єднання закрито", 'system');
}

// Обробники мережевого інтерфейсу.
chatForm.addEventListener('submit', sendChatMessage);
leaveRoomButton.addEventListener('click', leaveRoom);

// Обробники Replay.
replayLoadButton?.addEventListener('click', loadReplay);
replayPlayButton?.addEventListener('click', playReplay);
replayPauseButton?.addEventListener('click', pauseReplay);
replaySpeedSelect?.addEventListener('change', () => {
  replaySpeed = Number(replaySpeedSelect.value) || 1;
});
replayProgress?.addEventListener('input', () => {
  if (replayPlaying) {
    pauseReplay();
  }
  seekReplay(replayProgress.value);
});

updateReplayControls();

// --------------------------------------------------
// ІГРОВА ЛОГІКА
// --------------------------------------------------

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

  // Надсилаємо лише команди керування; координати обчислює сервер.
  networkStateTimer += dt;
  if (
    networkStateTimer >= NETWORK_UPDATE_INTERVAL &&
    networkClient &&
    currentRoomId &&
    ship
  ) {
    networkStateTimer = 0;
    const throttle =
      Number(input.isDown('ArrowUp') || input.isDown('KeyW')) -
      Number(input.isDown('ArrowDown') || input.isDown('KeyS'));
    const turn =
      Number(input.isDown('ArrowRight') || input.isDown('KeyD')) -
      Number(input.isDown('ArrowLeft') || input.isDown('KeyA'));
    const command = {
      seq: ++inputSequence,
      throttle,
      turn,
      fire: input.isDown('Space'),
    };
    pendingInputs.push(command);
    if (pendingInputs.length > 120) pendingInputs.shift();
    if (protocolMode === 'binary') {
      const packet = encodeInput(command);
      if (networkClient.sendBinary(packet)) bytesSent += packet.byteLength;
    } else {
      networkClient.send({ type: 'input', input: command });
      bytesSent += 48;
    }
  }

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

  // Під час Replay не показуємо поточний корабель локальної симуляції.
  if (replayLoaded) {
    shipForRender = null;
  }

  // Під час Replay показуємо записані стани, інакше — поточних мережевих гравців.
  const now = performance.now();
  let remoteShipsToRender = [];

  if (replayLoaded) {
    if (replayPlaying) {
      const delta = Math.max(0, now - replayLastFrameTime);
      replayPosition = Math.min(
        replayDurationMs,
        replayPosition + delta * replaySpeed,
      );
      replayLastFrameTime = now;

      if (replayPosition >= replayDurationMs) {
        replayPlaying = false;
        replayLastFrameTime = 0;
        if (replayStatus)
          replayStatus.textContent = `Завершено · ${replayRoomId}`;
        updateReplayControls();
      }
    }

    remoteShipsToRender = getReplayShipsAt(replayPosition);

    if (now - replayLastUiUpdate >= 100 || !replayPlaying) {
      updateReplayTimeline();
      replayLastUiUpdate = now;
    }
  } else {
    for (const [nickname, remote] of remoteShips) {
      // Видаляємо застарілі стани, якщо клієнт перестав надсилати оновлення.
      if (now - remote.receivedAt > 5000) {
        remoteShips.delete(nickname);
        continue;
      }

      const elapsed = now - remote.receivedAt;
      const interpolationAlpha = Math.min(
        elapsed / (NETWORK_UPDATE_INTERVAL * 1000),
        1,
      );
      const previous = remote.previous;
      const current = remote.current;

      const angleDifference = Math.atan2(
        Math.sin(current.angle - previous.angle),
        Math.cos(current.angle - previous.angle),
      );

      remoteShipsToRender.push({
        nickname,
        x: previous.x + (current.x - previous.x) * interpolationAlpha,
        y: previous.y + (current.y - previous.y) * interpolationAlpha,
        angle: previous.angle + angleDifference * interpolationAlpha,
        thrust: current.thrust,
        hp: current.hp,
        dead: current.dead,
      });
    }
  }

  drawScene(
    surface.ctx,
    surface.width,
    surface.height,
    shipForRender,
    stats,
    replayLoaded ? [] : [...world],
    score,
    images,
    remoteShipsToRender,
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

  // Підключаємося до WebSocket та кімнати.
  connectToRoom(playerName, room);

  // Запускаємо локальну гру.
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

  // Закриваємо мережеве з'єднання.
  networkClient?.disconnect();

  lobby.destroy();
  lobbyDOM.destroy();

  gameLoop?.stop();
  input.destroy();
  surface.destroy();
  audio.destroy();
});
