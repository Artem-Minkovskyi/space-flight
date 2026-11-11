const TAU = Math.PI * 2;

let stars = [];
let starWidth = 0;
let starHeight = 0;

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

export function drawScene(
  ctx,
  width,
  height,
  ship,
  stats,
  entities = [],
  score = 0,
) {
  if (width !== starWidth || height !== starHeight) {
    stars = createStars(width, height);
    starWidth = width;
    starHeight = height;
  }

  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);

  gradient.addColorStop(0, '#071329');
  gradient.addColorStop(1, '#080b1b');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Сітка арени.
  ctx.save();

  ctx.strokeStyle = 'rgba(72, 130, 190, 0.075)';
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

  // Зоряне тло.
  for (const star of stars) {
    ctx.beginPath();
    ctx.fillStyle = `rgba(190, 220, 255, ${star.alpha})`;
    ctx.arc(star.x, star.y, star.radius, 0, TAU);
    ctx.fill();
  }

  // Ігрові сутності.
  for (const entity of entities) {
    if (entity.dead) continue;

    switch (entity.kind) {
      case 'asteroid':
        drawAsteroid(ctx, entity);
        break;

      case 'bullet':
        drawBullet(ctx, entity);
        break;

      case 'pickup':
        drawPickup(ctx, entity);
        break;

      case 'explosion':
        drawExplosion(ctx, entity);
        break;
    }
  }

  // Корабель.
  if (ship) {
    drawShip(ctx, ship);
  }

  // HUD.
  drawHUD(ctx, width, height, score, ship);

  void stats;
}

export function drawShip(ctx, ship) {
  ctx.save();

  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  if (ship.thrust) {
    ctx.beginPath();
    ctx.moveTo(-13, -5);
    ctx.lineTo(-35, 0);
    ctx.lineTo(-13, 5);
    ctx.closePath();

    ctx.fillStyle = '#ffad52';
    ctx.shadowColor = '#ff7b35';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-13, -11);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-13, 11);
  ctx.closePath();

  ctx.fillStyle = '#b8eaff';
  ctx.strokeStyle = '#50d7ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#37bfff';
  ctx.shadowBlur = 18;

  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawAsteroid(ctx, asteroid) {
  ctx.save();

  ctx.translate(asteroid.position.x, asteroid.position.y);

  const radius = asteroid.radius;

  ctx.beginPath();

  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * TAU;
    const variation = i % 2 === 0 ? 1 : 0.78;
    const x = Math.cos(angle) * radius * variation;
    const y = Math.sin(angle) * radius * variation;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.closePath();

  ctx.fillStyle = '#66758d';
  ctx.strokeStyle = '#a6bad0';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#819bb5';
  ctx.shadowBlur = 10;

  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawBullet(ctx, bullet) {
  ctx.save();

  ctx.beginPath();
  ctx.arc(bullet.position.x, bullet.position.y, bullet.radius, 0, TAU);

  ctx.fillStyle = '#ffe58a';
  ctx.shadowColor = '#ffcc4d';
  ctx.shadowBlur = 15;

  ctx.fill();

  ctx.restore();
}

function drawPickup(ctx, pickup) {
  ctx.save();

  ctx.translate(pickup.position.x, pickup.position.y);

  ctx.beginPath();
  ctx.arc(0, 0, pickup.radius, 0, TAU);

  ctx.fillStyle = 'rgba(50, 255, 150, 0.2)';
  ctx.strokeStyle = '#55ffad';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#35ff9a';
  ctx.shadowBlur = 15;

  ctx.fill();
  ctx.stroke();

  // Символ плюса.
  ctx.fillStyle = '#aaffcc';
  ctx.fillRect(-2, -7, 4, 14);
  ctx.fillRect(-7, -2, 14, 4);

  ctx.restore();
}

function drawExplosion(ctx, explosion) {
  ctx.save();

  const alpha = explosion.progress;

  for (const particle of explosion.particles) {
    const x = explosion.position.x + particle.position.x;
    const y = explosion.position.y + particle.position.y;

    ctx.beginPath();

    ctx.arc(x, y, 2 + 3 * alpha, 0, TAU);

    ctx.fillStyle = `rgba(255, 150, 65, ${alpha})`;
    ctx.fill();
  }

  ctx.restore();
}

function drawHUD(ctx, width, height, score, ship) {
  ctx.save();

  ctx.font = 'bold 16px Arial';
  ctx.textBaseline = 'top';

  // Рахунок у нижньому лівому куті.
  ctx.fillStyle = '#b8eaff';
  ctx.fillText(`SCORE: ${score}`, 20, height - 40);

  // Здоров'я у верхньому правому куті.
  if (ship) {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`HP: ${ship.hp}`, width - 100, 20);

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(width - 100, 45, 80, 8);

    ctx.fillStyle = '#55ffad';
    ctx.fillRect(width - 100, 45, 80 * (ship.hp / 100), 8);
  }

  ctx.restore();
}
