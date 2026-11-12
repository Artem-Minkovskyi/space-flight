/**
 * Переміщує корабель на протилежний край арени,
 * якщо він виходить за її межі.
 */
export function wrapShip(ship, width, height) {
  return {
    ...ship,

    x: ((ship.x % width) + width) % width,

    y: ((ship.y % height) + height) % height,
  };
}
