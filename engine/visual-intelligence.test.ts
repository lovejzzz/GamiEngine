import { describe, expect, it } from 'vitest';
import { createVisualIntelligenceReport, measureVisualFrame } from './visual-intelligence';

const solidFrame = (red: number, green: number, blue: number, width = 8, height = 8) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set([red, green, blue, 255], index * 4);
  }
  return { data, width, height };
};

describe('visual intelligence loop', () => {
  it('detects a crushed-black render', () => {
    const metrics = measureVisualFrame(solidFrame(1, 2, 3));
    const report = createVisualIntelligenceReport(metrics, {
      floorId: '1f', cameraMode: 'editor', cinematic: true, nightVision: false,
    });
    expect(metrics.blackRatio).toBe(1);
    expect(report.checks.find((check) => check.id === 'black-crush')?.status).toBe('fail');
  });

  it('measures spatial edge density rather than only average colour', () => {
    const frame = solidFrame(35, 35, 35, 8, 8);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        if ((x + y) % 2 === 0) frame.data.set([150, 105, 70, 255], (y * 8 + x) * 4);
      }
    }
    expect(measureVisualFrame(frame).edgeDensity).toBeGreaterThan(0.8);
  });

  it('never turns automated image statistics into a production certificate', () => {
    const metrics = {
      meanLuma: 0.14,
      medianLuma: 0.12,
      blackRatio: 0.2,
      midtoneRatio: 0.5,
      highlightRatio: 0.02,
      meanSaturation: 0.24,
      edgeDensity: 0.12,
      contentCoverage: 0.76,
    };
    const report = createVisualIntelligenceReport(metrics, {
      floorId: '1f', cameraMode: 'editor', cinematic: true, nightVision: false,
    });
    expect(report.automatedScore).toBe(100);
    expect(report.productionCertifiable).toBe(false);
    expect(report.checks.filter((check) => check.status === 'human-required')).toHaveLength(4);
    expect(report.blockers).toContain('人物着装与动作连续性');
  });
});
