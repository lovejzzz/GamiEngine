import type { RectSpec, Vec2 } from './types';

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
