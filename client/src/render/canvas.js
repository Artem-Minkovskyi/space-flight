/**
 * Налаштовує Canvas з урахуванням devicePixelRatio.
 */
export function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Ваш браузер не підтримує Canvas 2D.');
  }

  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();

    dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = rect.width;
    height = rect.height;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const observer = new ResizeObserver(resize);

  observer.observe(canvas);
  resize();

  return {
    ctx,

    get width() {
      return width;
    },

    get height() {
      return height;
    },

    destroy() {
      observer.disconnect();
    },
  };
}
