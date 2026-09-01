import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyMetricBoxUvs, createCalibratedPbrMaterial } from './pbr-material-factory';
import type { AssetRecipe } from '@/engine/types';

const textureAsset = (id: string, semantic: 'base-color' | 'normal' | 'roughness'): AssetRecipe => ({
  id,
  name: id,
  kind: 'material',
  description: 'test',
  prompt: 'test',
  source: `/${id}.png`,
  usage: 'runtime-texture',
  state: 'ready',
  physicalSize: { x: .5, y: .25 },
  pivot: { x: .5, y: .5 },
  texture: { semantic, tileable: true, colorSpace: semantic === 'base-color' ? 'srgb' : 'linear', metersPerTile: { x: .5, y: .25 } },
});

describe('calibrated PBR materials', () => {
  it('does not multiply a generated base-color by a hidden dark tint', () => {
    const loader = { load: () => new THREE.Texture() } as unknown as THREE.TextureLoader;
    const assets = [textureAsset('base', 'base-color'), textureAsset('normal', 'normal'), textureAsset('rough', 'roughness')];
    const material = createCalibratedPbrMaterial(loader, assets, {
      baseColorAsset: 'base', normalAsset: 'normal', roughnessAsset: 'rough', roughness: .8,
    }, 4);
    expect(material.color.getHex()).toBe(0xffffff);
    expect(material.userData.baseColorFactorPolicy).toBe('neutral-white');
    expect(material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(material.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
  });

  it('projects box UVs in metres instead of stretching every mesh to one tile', () => {
    const geometry = applyMetricBoxUvs(new THREE.BoxGeometry(2, 1, .4), { x: .5, y: .25 });
    const uv = geometry.getAttribute('uv');
    let maxU = -Infinity;
    let minU = Infinity;
    let maxV = -Infinity;
    let minV = Infinity;
    for (let index = 0; index < uv.count; index += 1) {
      maxU = Math.max(maxU, uv.getX(index));
      minU = Math.min(minU, uv.getX(index));
      maxV = Math.max(maxV, uv.getY(index));
      minV = Math.min(minV, uv.getY(index));
    }
    expect(maxU - minU).toBeGreaterThanOrEqual(4);
    expect(maxV - minV).toBeGreaterThanOrEqual(4);
  });
});
