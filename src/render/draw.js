const TAU = Math.PI * 2;

let stars = [];
let starWidth = 0;
let starHeight = 0;

// Генерація зоряного тла.
function createStars(width, height) {
  let seed = 9173;

  function random() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  return Array.from(
    {
      length: Math.max(70, Math.floor((width * height) / 6500)),
    },
    () => ({
      x: random() * width,
      y: random() * height,
      radius: 0.4 + random() * 1.25,
      alpha: 0.25 + random() * 0.65,
    }),
  );
}

// Малювання всієї сцени.
export function drawScene(ctx, width, height, ship, stats) {
  if (width !== starWidth || height !== starHeight) {
    stars = createStars(width, height);

    starWidth = width;
    starHeight = height;
  }

  ctx.clearRect(0, 0, width, height);

  // Фон.
  const gradient = ctx.createLinearGradient(0, 0, width, height);

  gradient.addColorStop(0, "#071329");
  gradient.addColorStop(1, "#080b1b");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Сітка арени.
  ctx.save();

  ctx.strokeStyle = "rgba(72, 130, 190, 0.075)";
  ctx.lineWidth = 1;

  const grid = 60;

  for (let x = 0; x < width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();

  // Малювання зірок.
  for (const star of stars) {
    ctx.beginPath();

    ctx.fillStyle = `rgba(190, 220, 255, ${star.alpha})`;

    ctx.arc(star.x, star.y, star.radius, 0, TAU);

    ctx.fill();
  }

  // Малювання корабля.
  drawShip(ctx, ship);

  void stats;
}

// Малювання космічного корабля.
export function drawShip(ctx, ship) {
  ctx.save();

  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Полум'я двигуна.
  if (ship.thrust) {
    ctx.beginPath();

    ctx.moveTo(-13, -5);
    ctx.lineTo(-35, 0);
    ctx.lineTo(-13, 5);

    ctx.closePath();

    ctx.fillStyle = "#ffad52";
    ctx.shadowColor = "#ff7b35";
    ctx.shadowBlur = 16;

    ctx.fill();

    ctx.shadowBlur = 0;
  }

  // Корпус корабля.
  ctx.beginPath();

  ctx.moveTo(19, 0);
  ctx.lineTo(-13, -11);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-13, 11);

  ctx.closePath();

  ctx.fillStyle = "#b8eaff";
  ctx.strokeStyle = "#50d7ff";
  ctx.lineWidth = 2;

  ctx.shadowColor = "#37bfff";
  ctx.shadowBlur = 18;

  ctx.fill();
  ctx.stroke();

  ctx.restore();
}
