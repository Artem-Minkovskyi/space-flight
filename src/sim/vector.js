export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  // Додавання двох векторів.
  add(vector) {
    return new Vector2(this.x + vector.x, this.y + vector.y);
  }

  // Віднімання векторів.
  sub(vector) {
    return new Vector2(this.x - vector.x, this.y - vector.y);
  }

  // Множення вектора на число.
  scale(value) {
    return new Vector2(this.x * value, this.y * value);
  }

  // Довжина вектора.
  length() {
    return Math.hypot(this.x, this.y);
  }

  // Нормалізація вектора.
  normalize() {
    const magnitude = this.length();

    if (magnitude === 0) {
      return new Vector2(0, 0);
    }

    return this.scale(1 / magnitude);
  }

  // Поворот вектора на заданий кут у радіанах.
  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return new Vector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos,
    );
  }

  // Скалярний добуток.
  dot(vector) {
    return this.x * vector.x + this.y * vector.y;
  }

  // Створення вектора за кутом і довжиною.
  static fromAngle(angle, magnitude = 1) {
    return new Vector2(
      Math.cos(angle) * magnitude,
      Math.sin(angle) * magnitude,
    );
  }
}
