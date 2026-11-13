import { describe, expect, it } from 'vitest';
import { Vector2 } from '../../client/src/sim/vector.js';
import { checkCircleCollision } from '../../client/src/sim/collision.js';
import { integrate } from '../../client/src/sim/ship.js';

describe('Vector2', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i))('vector length is non-negative (%i)', (i) => {
    expect(new Vector2(i - 10, 10 - i).length()).toBeGreaterThanOrEqual(0);
  });
  it('adds vectors', () => expect(new Vector2(1, 2).add(new Vector2(3, 4))).toMatchObject({ x: 4, y: 6 }));
  it('subtracts vectors', () => expect(new Vector2(5, 7).sub(new Vector2(2, 3))).toMatchObject({ x: 3, y: 4 }));
  it('normalizes a zero vector safely', () => expect(new Vector2().normalize()).toMatchObject({ x: 0, y: 0 }));
  it('normalizes a unit direction', () => expect(new Vector2(3, 4).normalize().length()).toBeCloseTo(1));
  it('rotates by a quarter turn', () => { const v = new Vector2(1, 0).rotate(Math.PI / 2); expect(v.x).toBeCloseTo(0); expect(v.y).toBeCloseTo(1); });
  it('computes dot product', () => expect(new Vector2(1, 2).dot(new Vector2(3, 4))).toBe(11));
  it('scales vector', () => expect(new Vector2(2, 3).scale(3)).toMatchObject({ x: 6, y: 9 }));
  it('creates vector from angle', () => expect(Vector2.fromAngle(0, 5).x).toBeCloseTo(5));
});

describe('collision detection', () => {
  const circle = (x: number, y: number, radius: number) => ({ position: { x, y }, radius });
  it('detects overlapping circles', () => expect(checkCircleCollision(circle(0, 0, 5), circle(8, 0, 5))).toBe(true));
  it('detects tangent circles', () => expect(checkCircleCollision(circle(0, 0, 5), circle(10, 0, 5))).toBe(true));
  it('rejects separated circles', () => expect(checkCircleCollision(circle(0, 0, 5), circle(11, 0, 5))).toBe(false));
  it('detects identical centers', () => expect(checkCircleCollision(circle(0, 0, 1), circle(0, 0, 1))).toBe(true));
  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('collision symmetry %i', (n) => {
    const a = circle(0, 0, n); const b = circle(n, n, n);
    expect(checkCircleCollision(a, b)).toBe(checkCircleCollision(b, a));
  });
});

describe('client ship integration', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i))('keeps finite position after step %i', (i) => {
    const ship = { x: 100, y: 100, vx: 0, vy: 0, angle: 0 };
    const keys = new Set<string>(i % 2 ? ['KeyW'] : ['KeyA']);
    const result = integrate(ship, { isDown: (key: string) => keys.has(key) }, 1 / 60);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

import { ObjectPool } from '../../client/src/sim/object-pool.js';
import { SpatialHash } from '../../client/src/sim/spatial-hash.js';

describe('performance helpers', () => {
  it('reuses released objects', () => {
    const pool = new ObjectPool(() => ({ value: 0 }), (item, value = 0) => { item.value = value; }, 1);
    const first = pool.acquire(42); pool.release(first);
    expect(pool.acquire(7)).toBe(first);
    expect(first.value).toBe(7);
  });
  it('does not release an object twice', () => {
    const pool = new ObjectPool(() => ({})); const item = pool.acquire();
    expect(pool.release(item)).toBe(true); expect(pool.release(item)).toBe(false);
  });
  it('releases all active objects', () => {
    const pool = new ObjectPool(() => ({})); pool.acquire(); pool.acquire(); pool.releaseAll();
    expect(pool.stats).toEqual({ free: 2, inUse: 0 });
  });
  it('finds nearby items across cell borders', () => {
    const grid = new SpatialHash(100); const item = {};
    grid.insert(item, 99, 50, 5);
    expect(grid.nearby(104, 50, 5)).toContain(item);
  });
  it('does not return distant items', () => {
    const grid = new SpatialHash(100); const item = {};
    grid.insert(item, 0, 0, 1);
    expect(grid.nearby(500, 500, 1)).not.toContain(item);
  });
  it('clears all spatial buckets', () => {
    const grid = new SpatialHash(); grid.insert({}, 0, 0, 1); grid.clear();
    expect(grid.nearby(0, 0, 1)).toHaveLength(0);
  });
});

import { Explosion } from '../../client/src/sim/explosion.js';
describe('explosion particle reuse', () => {
  it('updates particle vectors in place', () => {
    const explosion = new Explosion({ particleCount: 2 });
    const particle = explosion.particles.at(0)!;
    const position = particle.position;
    explosion.update(1 / 60);
    expect(particle.position).toBe(position);
    explosion.destroy();
    expect(explosion.particles).toHaveLength(0);
  });
});
