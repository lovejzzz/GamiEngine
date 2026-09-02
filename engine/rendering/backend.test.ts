import { describe, expect, it } from 'vitest';
import {
  evaluateBackendCapabilities,
  frameStatsToDebugState,
  type RenderBackendCapabilities,
} from './backend';

const capabilities: RenderBackendCapabilities = {
  api: 'webgl2',
  features: new Set([
    'post-processing',
    'screen-space-ambient-occlusion',
    'hdr-tone-mapping',
    'shadow-maps',
    'frame-capture',
  ]),
  maxAnisotropy: 16,
  maxTextureSize: 16384,
};

describe('Gami render backend contract', () => {
  it('accepts a backend that satisfies a scene capability policy', () => {
    expect(evaluateBackendCapabilities(capabilities, [
      'post-processing',
      'shadow-maps',
      'frame-capture',
    ])).toEqual({ ready: true, missing: [] });
  });

  it('reports the exact capabilities blocking a replacement backend', () => {
    const result = evaluateBackendCapabilities(
      { ...capabilities, features: new Set(['shadow-maps']) },
      ['shadow-maps', 'hdr-tone-mapping', 'frame-capture'],
    );
    expect(result).toEqual({
      ready: false,
      missing: ['hdr-tone-mapping', 'frame-capture'],
    });
  });

  it('serializes renderer telemetry without exposing a vendor renderer', () => {
    expect(frameStatsToDebugState({
      drawCalls: 84,
      triangles: 120_000,
      lines: 32,
      points: 0,
      geometries: 67,
      textures: 24,
    })).toMatchObject({
      renderDrawCalls: '84',
      renderTriangles: '120000',
      renderGeometries: '67',
      renderTextures: '24',
    });
  });
});
