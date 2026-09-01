import { describe, expect, it } from 'vitest';
import { resolveRuntimeSource } from './asset-registry';
import type { AssetRecipe } from './types';

const base: Omit<AssetRecipe, 'id' | 'name' | 'usage' | 'source'> = {
  kind: 'material',
  description: 'test',
  prompt: 'test',
  state: 'ready',
  physicalSize: { x: 1, y: 1 },
  pivot: { x: 0.5, y: 0.5 },
};

describe('runtime asset boundary', () => {
  const assets: AssetRecipe[] = [
    { ...base, id: 'study', name: 'study', usage: 'reference-study', source: '/study.png' },
    { ...base, id: 'surface', name: 'surface', usage: 'runtime-texture', source: '/surface.png' },
    { ...base, id: 'sprite', name: 'sprite', usage: 'runtime-sprite', source: '/sprite.png' },
    { ...base, id: 'model', name: 'model', usage: 'runtime-model', source: '/model.glb' },
  ];

  it('never resolves a reference study for rendering', () => {
    expect(resolveRuntimeSource(assets, 'study', 'runtime-texture')).toBeNull();
    expect(resolveRuntimeSource(assets, 'study', 'runtime-sprite')).toBeNull();
  });

  it('requires the declared runtime role to match', () => {
    expect(resolveRuntimeSource(assets, 'surface', 'runtime-texture')).toBe('/surface.png');
    expect(resolveRuntimeSource(assets, 'surface', 'runtime-sprite')).toBeNull();
    expect(resolveRuntimeSource(assets, 'sprite', 'runtime-sprite')).toBe('/sprite.png');
    expect(resolveRuntimeSource(assets, 'model', 'runtime-model')).toBe('/model.glb');
    expect(resolveRuntimeSource(assets, 'model', 'runtime-texture')).toBeNull();
  });
});
