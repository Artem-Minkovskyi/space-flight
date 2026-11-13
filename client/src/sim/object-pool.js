/** Small reusable object pool for transient particles/effects. */
export class ObjectPool {
  constructor(factory, reset = (value) => value, initialSize = 0) {
    this.factory = factory;
    this.reset = reset;
    this.free = Array.from({ length: initialSize }, () => factory());
    this.inUse = new Set();
  }

  acquire(...args) {
    const value = this.free.pop() ?? this.factory();
    this.reset(value, ...args);
    this.inUse.add(value);
    return value;
  }

  release(value) {
    if (!this.inUse.delete(value)) return false;
    this.free.push(value);
    return true;
  }

  releaseAll() {
    for (const value of this.inUse) this.free.push(value);
    this.inUse.clear();
  }

  get stats() {
    return { free: this.free.length, inUse: this.inUse.size };
  }
}
