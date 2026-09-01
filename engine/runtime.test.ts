import { describe, expect, it } from 'vitest';
import { circleHitsRect, nearestFloorIndex, pointToDoor, pushDoor, updateDoor, type RuntimeDoor } from './runtime';

const makeDoor = (): RuntimeDoor => ({
  id: 'door',
  name: 'Test door',
  hinge: { x: 0, y: 0 },
  length: 80,
  width: 10,
  angle: 0,
  angularVelocity: 0,
  minAngle: -Math.PI / 2,
  maxAngle: Math.PI / 2,
  motorTarget: null,
});

describe('runtime geometry', () => {
  it('detects circle/rectangle contact without counting a tangent as penetration', () => {
    const rect = { id: 'wall', x: 10, y: 10, width: 20, height: 20 };
    expect(circleHitsRect({ x: 5, y: 20 }, 6, rect)).toBe(true);
    expect(circleHitsRect({ x: 5, y: 20 }, 5, rect)).toBe(false);
  });

  it('finds the nearest point on a rotated door leaf', () => {
    const door = makeDoor();
    door.angle = Math.PI / 2;
    const hit = pointToDoor({ x: 8, y: 40 }, door);
    expect(hit.nearest.x).toBeCloseTo(0, 5);
    expect(hit.nearest.y).toBeCloseTo(40, 5);
    expect(hit.distance).toBeCloseTo(8, 5);
  });

  it('applies player torque and keeps door motion inside hinge limits', () => {
    const door = makeDoor();
    expect(pushDoor(door, { x: 70, y: 8 }, { x: 0, y: 120 })).toBe(true);
    for (let index = 0; index < 300; index += 1) updateDoor(door, 1 / 60);
    expect(door.angle).toBeGreaterThanOrEqual(door.minAngle);
    expect(door.angle).toBeLessThanOrEqual(door.maxAngle);
  });

  it('clamps streamed floor navigation', () => {
    expect(nearestFloorIndex(0, -1, 4)).toBe(0);
    expect(nearestFloorIndex(1, 1, 4)).toBe(2);
    expect(nearestFloorIndex(3, 1, 4)).toBe(3);
  });
});
