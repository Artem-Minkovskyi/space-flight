import { SpatialHash } from './spatial-hash.js';

export function checkCircleCollision(a, b) {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;

  const distanceSquared = dx * dx + dy * dy;
  const radiusSum = a.radius + b.radius;

  return distanceSquared <= radiusSum * radiusSum;
}

export function resolveCollisions(world, emit = () => {}) {
  const entities = [...world].filter((entity) => !entity.dead);

  const grid = new SpatialHash(128);
  for (const entity of entities) {
    grid.insert(entity, entity.position.x, entity.position.y, entity.radius ?? 0);
  }
  const indices = new Map(entities.map((entity, index) => [entity, index]));
  const pairs = [];
  const seen = new Set();
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    const candidates = grid.nearby(a.position.x, a.position.y, a.radius ?? 0);
    for (const b of candidates) {
      const j = indices.get(b);
      if (j === undefined || j <= i) continue;
      const pairKey = `${i}:${j}`;
      if (!seen.has(pairKey)) { seen.add(pairKey); pairs.push([a, b]); }
    }
  }

  for (const [a, b] of pairs) {

      if (a.dead || b.dead) {
        continue;
      }

      if (!checkCircleCollision(a, b)) {
        continue;
      }

      // Куля зіткнулася з астероїдом.
      if (a.kind === 'bullet' && b.kind === 'asteroid') {
        b.takeDamage(a.damage);
        a.destroy();
        emit('hit', { target: b, source: a });
      } else if (b.kind === 'bullet' && a.kind === 'asteroid') {
        a.takeDamage(b.damage);
        b.destroy();
        emit('hit', { target: a, source: b });
      }

      // Куля зіткнулася з кораблем.
      else if (a.kind === 'bullet' && b.kind === 'ship') {
        b.takeDamage(a.damage);
        a.destroy();
        emit('hit', { target: b, source: a });
      } else if (b.kind === 'bullet' && a.kind === 'ship') {
        a.takeDamage(b.damage);
        b.destroy();
        emit('hit', { target: a, source: b });
      }

      // Корабель зіткнувся з астероїдом.
      else if (a.kind === 'ship' && b.kind === 'asteroid') {
        if (a.damageCooldown <= 0) {
          a.takeDamage(25);
          a.damageCooldown = 1;
          emit('hit', { target: a, source: b });
        }
      } else if (b.kind === 'ship' && a.kind === 'asteroid') {
        if (b.damageCooldown <= 0) {
          b.takeDamage(25);
          b.damageCooldown = 1;
          emit('hit', { target: b, source: a });
        }
      }

      // Корабель підібрав бонус.
      else if (a.kind === 'ship' && b.kind === 'pickup') {
        b.applyTo(a);
      } else if (b.kind === 'ship' && a.kind === 'pickup') {
        a.applyTo(b);
      }
  }
}
