// Deterministic fixed-step ship simulation shared by browser and Node.js.
export const SIMULATION = Object.freeze({
  tickRate: 30,
  dt: 1 / 30,
  width: 1000,
  height: 700,
  rotationSpeed: 3.6,
  thrustPower: 250,
  reversePower: 115,
  drag: 0.985,
  maxSpeed: 420,
});

export function createShipState(x = SIMULATION.width / 2, y = SIMULATION.height / 2) {
  return { x, y, vx: 0, vy: 0, angle: 0, hp: 100, thrust: false, dead: false, seq: 0 };
}

export function integrateShip(state, input, dt = SIMULATION.dt, arena = SIMULATION) {
  if (state.dead) return { ...state, seq: input.seq ?? state.seq };
  const turn = Math.max(-1, Math.min(1, Number(input.turn) || 0));
  const throttle = Math.max(-1, Math.min(1, Number(input.throttle) || 0));
  const angle = state.angle + turn * SIMULATION.rotationSpeed * dt;
  let vx = state.vx;
  let vy = state.vy;
  if (throttle !== 0) {
    const power = throttle > 0 ? SIMULATION.thrustPower : SIMULATION.reversePower;
    vx += Math.cos(angle) * power * throttle * dt;
    vy += Math.sin(angle) * power * throttle * dt;
  }
  const damping = Math.pow(SIMULATION.drag, dt * 60);
  vx *= damping;
  vy *= damping;
  const speed = Math.hypot(vx, vy);
  if (speed > SIMULATION.maxSpeed) {
    vx = (vx / speed) * SIMULATION.maxSpeed;
    vy = (vy / speed) * SIMULATION.maxSpeed;
  }
  return {
    ...state,
    x: ((state.x + vx * dt) % arena.width + arena.width) % arena.width,
    y: ((state.y + vy * dt) % arena.height + arena.height) % arena.height,
    vx, vy, angle, thrust: throttle > 0, seq: input.seq ?? state.seq,
  };
}
