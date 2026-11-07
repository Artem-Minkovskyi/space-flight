import "./style.css";

import { createLoop } from "./loop.js";
import { createInput } from "./input.js";

import { createShip, integrate, interpolateShip } from "./sim/ship.js";

import { wrapShip } from "./sim/arena.js";

import { setupCanvas } from "./render/canvas.js";
import { drawScene } from "./render/draw.js";

const canvas = document.querySelector("#game");

const stepsElement = document.querySelector("#steps");
const fpsElement = document.querySelector("#fps");
const frameTimeElement = document.querySelector("#frame-time");
const centerMessage = document.querySelector("#center-message");

const surface = setupCanvas(canvas);
const input = createInput(window);

let current = createShip(surface.width / 2, surface.height / 2);

let previous = { ...current };
let hasMoved = false;

// Дані для експерименту №3.
let experimentStartedAt = null;
let experimentStartPosition = null;
let experimentFinished = false;

function simulate(dt) {
  previous = { ...current };

  // Початок вимірювання після натискання W або стрілки вгору.
  const isThrusting = input.isDown("ArrowUp") || input.isDown("KeyW");

  if (isThrusting && experimentStartedAt === null) {
    experimentStartedAt = performance.now();

    experimentStartPosition = {
      x: current.x,
      y: current.y,
    };

    console.log("Експеримент №3 розпочато.");
    console.log("Утримуйте W протягом 5 секунд.");
  }

  // Фізика корабля зі змінним timestep.
  current = integrate(current, input, dt);

  current = wrapShip(current, surface.width, surface.height);

  if (current.thrust) {
    hasMoved = true;
    centerMessage.classList.add("hidden");
  }

  // Перевірка завершення п'яти секунд.
  if (
    experimentStartedAt !== null &&
    !experimentFinished &&
    performance.now() - experimentStartedAt >= 5000
  ) {
    experimentFinished = true;

    const elapsed = (performance.now() - experimentStartedAt) / 1000;

    const displacementX = current.x - experimentStartPosition.x;

    const displacementY = current.y - experimentStartPosition.y;

    const distance = Math.hypot(displacementX, displacementY);

    console.log("Експеримент №3 завершено.");
    console.log("Час:", elapsed.toFixed(2), "секунд");
    console.log("Початкова позиція:", experimentStartPosition);
    console.log("Кінцева позиція:", {
      x: current.x.toFixed(2),
      y: current.y.toFixed(2),
    });
    console.log("Зміщення по X:", displacementX.toFixed(2));
    console.log("Зміщення по Y:", displacementY.toFixed(2));
    console.log("Відстань між позиціями:", distance.toFixed(2));
  }

  input.endStep();
}

function render(alpha, stats) {
  const shipForRender = interpolateShip(previous, current, alpha);

  // Корекція інтерполяції при переході через межі арени.
  if (Math.abs(current.x - previous.x) > surface.width / 2) {
    shipForRender.x = current.x;
  }

  if (Math.abs(current.y - previous.y) > surface.height / 2) {
    shipForRender.y = current.y;
  }

  drawScene(surface.ctx, surface.width, surface.height, shipForRender, stats);

  // Оновлення HUD.
  stepsElement.textContent = stats.stepsPerSecond;
  fpsElement.textContent = stats.framesPerSecond;
  frameTimeElement.textContent = stats.frameTime.toFixed(2);

  if (hasMoved) {
    centerMessage.classList.add("hidden");
  }
}

// Запуск циклу зі змінним timestep.
const gameLoop = createLoop({
  simulate,
  render,
});

gameLoop.start();

// Очищення ресурсів.
window.addEventListener("beforeunload", () => {
  gameLoop.stop();
  input.destroy();
  surface.destroy();
});
