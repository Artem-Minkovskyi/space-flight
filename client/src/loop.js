export function createLoop({ step = 1 / 60, simulate, render }) {
  const maxFrameDelta = 0.25;

  let animationId = null;
  let running = false;

  let lastTime = null;
  let accumulator = 0;

  let steps = 0;
  let frames = 0;
  let sampleTime = 0;

  let stepsPerSecond = 0;
  let framesPerSecond = 0;
  let frameTime = 0;

  function getStats() {
    return {
      stepsPerSecond,
      framesPerSecond,
      frameTime,
    };
  }

  function frame(now) {
    if (!running) return;

    const frameStart = performance.now();

    if (lastTime === null) {
      lastTime = now;
    }

    const delta = Math.min((now - lastTime) / 1000, maxFrameDelta);

    lastTime = now;
    accumulator += delta;

    // Фіксований крок симуляції.
    while (accumulator >= step) {
      simulate(step);
      accumulator -= step;
      steps++;
    }

    frames++;

    if (sampleTime === 0) {
      sampleTime = now;
    }

    if (now - sampleTime >= 1000) {
      const elapsed = (now - sampleTime) / 1000;

      stepsPerSecond = Math.round(steps / elapsed);
      framesPerSecond = Math.round(frames / elapsed);

      steps = 0;
      frames = 0;
      sampleTime = now;
    }

    const alpha = accumulator / step;

    render(alpha, getStats());

    frameTime = performance.now() - frameStart;

    animationId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;

    running = true;
    lastTime = null;
    accumulator = 0;
    sampleTime = 0;

    animationId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;

    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  return {
    start,
    stop,
    getStats,
  };
}
