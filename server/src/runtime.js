let ready = false;
let shuttingDown = false;
const metrics = {
  players: 0, rooms: 0, messages: 0, bytes: 0,
  tickDurationMs: 0, tickCount: 0,
};

export function setReady(value) { ready = Boolean(value); }
export function isReady() { return ready && !shuttingDown; }
export function beginShutdown() { shuttingDown = true; ready = false; }
export function updateRuntimeMetrics(values = {}) { Object.assign(metrics, values); }
export function recordMessage(bytes = 0) {
  metrics.messages += 1;
  metrics.bytes += bytes;
}
export function renderMetrics() {
  const memory = process.memoryUsage();
  const elu = performance.eventLoopUtilization();
  return [
    '# HELP spaceflight_players Connected players',
    '# TYPE spaceflight_players gauge',
    `spaceflight_players ${metrics.players}`,
    '# HELP spaceflight_rooms Active rooms',
    '# TYPE spaceflight_rooms gauge',
    `spaceflight_rooms ${metrics.rooms}`,
    '# HELP spaceflight_messages_total Messages received',
    '# TYPE spaceflight_messages_total counter',
    `spaceflight_messages_total ${metrics.messages}`,
    '# HELP spaceflight_bytes_total Bytes received',
    '# TYPE spaceflight_bytes_total counter',
    `spaceflight_bytes_total ${metrics.bytes}`,
    '# HELP spaceflight_tick_duration_ms Last server tick duration',
    '# TYPE spaceflight_tick_duration_ms gauge',
    `spaceflight_tick_duration_ms ${metrics.tickDurationMs}`,
    '# HELP spaceflight_event_loop_utilization Event loop utilization',
    '# TYPE spaceflight_event_loop_utilization gauge',
    `spaceflight_event_loop_utilization ${elu.utilization}`,
    '# HELP spaceflight_memory_bytes Process memory usage',
    '# TYPE spaceflight_memory_bytes gauge',
    `spaceflight_memory_bytes ${memory.rss}`,
    '',
  ].join('\n');
}
