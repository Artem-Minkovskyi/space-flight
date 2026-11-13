/** Uniform-grid broad phase. Insert circles by their full AABB, so large radii remain safe. */
export class SpatialHash {
  constructor(cellSize = 128) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('cellSize must be positive');
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() { this.cells.clear(); }

  #key(x, y) { return `${x},${y}`; }

  insert(item, x, y, radius = 0) {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = this.#key(cx, cy);
        let bucket = this.cells.get(key);
        if (!bucket) this.cells.set(key, (bucket = new Set()));
        bucket.add(item);
      }
    }
  }

  nearby(x, y, radius = 0) {
    const found = new Set();
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        for (const item of this.cells.get(this.#key(cx, cy)) ?? []) found.add(item);
      }
    }
    return [...found];
  }
}
