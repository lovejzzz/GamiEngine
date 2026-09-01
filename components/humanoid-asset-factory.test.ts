import { describe, expect, it } from 'vitest';
import {
  createHumanHeadGeometry,
  createHumanTorsoGeometry,
  createTaperedLimbGeometry,
} from './humanoid-asset-factory';

const ringWidths = (geometry: ReturnType<typeof createHumanTorsoGeometry>) => {
  const position = geometry.getAttribute('position');
  const widths = new Map<number, number>();
  for (let index = 0; index < position.count; index += 1) {
    const y = Number(position.getY(index).toFixed(3));
    widths.set(y, Math.max(widths.get(y) ?? 0, Math.abs(position.getX(index))));
  }
  return [...widths.values()].filter(Boolean);
};

describe('non-toy humanoid geometry', () => {
  it('uses changing shoulder and waist cross-sections instead of one capsule radius', () => {
    const widths = ringWidths(createHumanTorsoGeometry('resident'));
    expect(new Set(widths.map((width) => width.toFixed(3))).size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(.09);
  });

  it('tapers limbs toward hands and ankles', () => {
    const widths = ringWidths(createTaperedLimbGeometry(.36, .075, .04));
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) * 1.7);
  });

  it('builds a jaw, cheek and crown profile for the head', () => {
    const widths = ringWidths(createHumanHeadGeometry());
    expect(new Set(widths.map((width) => width.toFixed(3))).size).toBeGreaterThanOrEqual(4);
  });
});
