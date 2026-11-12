export function attachHoming(
  entity,
  { speed = 120, turnRate = 3, getTarget } = {},
) {
  entity.homing = {
    speed,
    turnRate,
    getTarget,
  };

  return entity;
}

export function updateHoming(entity, deltaTime) {
  const behavior = entity.homing;

  if (!behavior || entity.dead) {
    return;
  }

  const target = behavior.getTarget?.(entity);

  if (!target || target.dead) {
    return;
  }

  const direction = target.position.sub(entity.position);

  if (direction.length() === 0) {
    return;
  }

  const desiredVelocity = direction.normalize().scale(behavior.speed);

  const blend = Math.min(1, behavior.turnRate * deltaTime);

  entity.velocity = entity.velocity
    .scale(1 - blend)
    .add(desiredVelocity.scale(blend));

  if (entity.velocity.length() > 0) {
    entity.velocity = entity.velocity.normalize().scale(behavior.speed);
  }
}
