import type { FloorSpec, RectSpec, Vec2 } from './types';

export type CircleCollider = {
  id: string;
  position: Vec2;
  radius: number;
};

export type RuntimeDoor = {
  id: string;
  name: string;
  hinge: Vec2;
  length: number;
  width: number;
  angle: number;
  angularVelocity: number;
  minAngle: number;
  maxAngle: number;
  motorTarget: number | null;
};

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function circleHitsRect(point: Vec2, radius: number, rect: RectSpec) {
  const nearX = clamp(point.x, rect.x, rect.x + rect.width);
  const nearY = clamp(point.y, rect.y, rect.y + rect.height);
  const dx = point.x - nearX;
  const dy = point.y - nearY;
  return dx * dx + dy * dy < radius * radius;
}

export function circleHitsCircle(a: Vec2, aRadius: number, b: Vec2, bRadius: number) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const radius = aRadius + bRadius;
  return dx * dx + dy * dy < radius * radius;
}

export function segmentHitsRect(from: Vec2, to: Vec2, rect: RectSpec) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let near = 0;
  let far = 1;
  for (const [origin, delta, min, max] of [
    [from.x, dx, rect.x, rect.x + rect.width],
    [from.y, dy, rect.y, rect.y + rect.height],
  ] as const) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return false;
  }
  return far > 0.03 && near < 0.97;
}

export function interactionScore(
  player: Vec2,
  facing: number,
  target: Vec2,
  blockers: RectSpec[],
  maxDistance = 92,
  minimumFacingDot = -0.05,
) {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance > maxDistance || distance < 1e-6) return null;
  const forward = { x: Math.sin(facing), y: Math.cos(facing) };
  const facingDot = (dx * forward.x + dy * forward.y) / distance;
  if (facingDot < minimumFacingDot) return null;
  if (blockers.some((rect) => segmentHitsRect(player, target, rect))) return null;
  return distance + (1 - facingDot) * 24;
}

export function moveCircleWithSliding(
  origin: Vec2,
  delta: Vec2,
  radius: number,
  rects: RectSpec[],
  circles: CircleCollider[] = [],
) {
  const blocked = (point: Vec2) =>
    rects.some((rect) => circleHitsRect(point, radius, rect)) ||
    circles.some((circle) => circleHitsCircle(point, radius, circle.position, circle.radius));
  const full = { x: origin.x + delta.x, y: origin.y + delta.y };
  if (!blocked(full)) return full;
  const xOnly = { x: full.x, y: origin.y };
  if (!blocked(xOnly)) return xOnly;
  const yOnly = { x: origin.x, y: full.y };
  if (!blocked(yOnly)) return yOnly;
  return { ...origin };
}

export function pointToDoor(point: Vec2, door: RuntimeDoor) {
  const end = {
    x: door.hinge.x + Math.cos(door.angle) * door.length,
    y: door.hinge.y + Math.sin(door.angle) * door.length,
  };
  const vx = end.x - door.hinge.x;
  const vy = end.y - door.hinge.y;
  const wx = point.x - door.hinge.x;
  const wy = point.y - door.hinge.y;
  const t = clamp((wx * vx + wy * vy) / (door.length * door.length), 0, 1);
  const nearest = { x: door.hinge.x + vx * t, y: door.hinge.y + vy * t };
  return { distance: Math.hypot(point.x - nearest.x, point.y - nearest.y), nearest, t };
}

export function updateDoor(door: RuntimeDoor, dt: number) {
  if (door.motorTarget !== null) {
    const delta = door.motorTarget - door.angle;
    door.angularVelocity += delta * 20 * dt;
    if (Math.abs(delta) < 0.012 && Math.abs(door.angularVelocity) < 0.04) {
      door.angle = door.motorTarget;
      door.angularVelocity = 0;
      door.motorTarget = null;
    }
  }
  door.angularVelocity *= Math.pow(0.07, dt);
  door.angle += door.angularVelocity * dt;
  if (door.angle <= door.minAngle) {
    door.angle = door.minAngle;
    door.angularVelocity = Math.max(0, door.angularVelocity) * 0.16;
  }
  if (door.angle >= door.maxAngle) {
    door.angle = door.maxAngle;
    door.angularVelocity = Math.min(0, door.angularVelocity) * 0.16;
  }
}

export function pushDoor(door: RuntimeDoor, player: Vec2, velocity: Vec2) {
  const hit = pointToDoor(player, door);
  if (hit.distance > door.width / 2 + 19 || hit.t < 0.08) return false;
  const armX = hit.nearest.x - door.hinge.x;
  const armY = hit.nearest.y - door.hinge.y;
  const torque = armX * velocity.y - armY * velocity.x;
  door.angularVelocity += (torque / Math.max(door.length * door.length, 1)) * 8;
  door.motorTarget = null;
  return true;
}

export function nearestFloorIndex(current: number, direction: 1 | -1, count: number) {
  return clamp(current + direction, 0, count - 1);
}

type StairSpec = FloorSpec['stairs'];

/** 0 is the low landing and 1 is the high landing, independent of stair orientation. */
export function stairProgress(point: Vec2, stairs: StairSpec) {
  const horizontal = stairs.upDirection === 'east' || stairs.upDirection === 'west';
  const position = horizontal ? point.x : point.y;
  const start = horizontal ? stairs.x : stairs.y;
  const length = horizontal ? stairs.width : stairs.height;
  const positive = stairs.upDirection === 'east' || stairs.upDirection === 'south';
  const local = clamp((position - start) / length, 0, 1);
  return positive ? local : 1 - local;
}

/**
 * Return a floor direction only after the actor has walked to the matching end
 * of the stair flight while still moving along its axis.
 */
export function stairTraversalDirection(
  point: Vec2,
  velocity: Vec2,
  stairs: StairSpec,
  edgeFraction = 0.1,
): 1 | -1 | null {
  const inside = point.x >= stairs.x && point.x <= stairs.x + stairs.width &&
    point.y >= stairs.y && point.y <= stairs.y + stairs.height;
  if (!stairs.autoTraverse || !inside) return null;
  const horizontal = stairs.upDirection === 'east' || stairs.upDirection === 'west';
  const axisVelocity = horizontal ? velocity.x : velocity.y;
  const positive = stairs.upDirection === 'east' || stairs.upDirection === 'south';
  const uphillVelocity = positive ? axisVelocity : -axisVelocity;
  const progress = stairProgress(point, stairs);
  if (progress >= 1 - edgeFraction && uphillVelocity > 0) return stairs.toUp ? 1 : null;
  if (progress <= edgeFraction && uphillVelocity < 0) return stairs.toDown ? -1 : null;
  return null;
}
