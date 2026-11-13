/* global process, console, setTimeout, clearTimeout, setInterval, clearInterval, performance */
import WebSocket from 'ws';

const url = process.env.WS_URL ?? 'ws://127.0.0.1:3000/ws';
const groups = (process.argv.slice(2).map(Number).filter(Number.isFinite));
const loads = groups.length ? groups : [8, 32, 64, 128];
const durationMs = Number(process.env.LOAD_DURATION_MS ?? 5000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runLoad(count) {
  const sockets = [];
  const intervals = [];
  const lastSnapshot = new Map();
  let ready = 0;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Only ${ready}/${count} clients connected`)), 15000);
    for (let i = 0; i < count; i++) {
      const socket = new WebSocket(url);
      sockets.push(socket);
      socket.on('open', () => {
        socket.send(JSON.stringify({ type: 'join', roomId: 'normal', nickname: `Load-${count}-${i}`, protocol: 'json' }));
      });
      socket.on('message', (raw) => {
        let message; try { message = JSON.parse(raw.toString()); } catch { return; }
        if (message.type === 'joined' && !socket.joined) { socket.joined = true; ready++; if (ready === count) { clearTimeout(timeout); resolve(); } }
        if (message.type === 'snapshot') {
          const now = performance.now(); const previous = lastSnapshot.get(socket);
          if (previous !== undefined) intervals.push(now - previous);
          lastSnapshot.set(socket, now);
        }
      });
      socket.on('error', reject);
    }
  });
  const start = performance.now();
  let seq = 0;
  const inputTimer = setInterval(() => {
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', input: { seq: ++seq, throttle: 1, turn: 0.2, fire: false } }));
  }, 100);
  await sleep(durationMs);
  clearInterval(inputTimer);
  const elapsed = performance.now() - start;
  for (const socket of sockets) socket.close();
  intervals.sort((a, b) => a - b);
  const percentile = (p) => intervals.length ? intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * p))] : 0;
  const p50 = percentile(.50), p95 = percentile(.95), p99 = percentile(.99);
  console.log(JSON.stringify({ clients: count, durationMs: Math.round(elapsed), snapshotIntervalMs: { p50: +p50.toFixed(2), p95: +p95.toFixed(2), p99: +p99.toFixed(2) }, warning: p99 > 33 ? 'snapshot interval exceeded 33ms' : 'no >33ms snapshot interval observed' }, null, 2));
}

for (const count of loads) {
  console.log(`\n=== ${count} clients ===`);
  await runLoad(count);
}
