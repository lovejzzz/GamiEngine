import { describe, expect, it } from 'vitest';
import { assetRecipes } from './demo-scene';
import { auditAssetQuality } from './asset-quality';
import type { AssetRecipe } from './types';

describe('asset quality bridge', () => {
  it('accepts the sofa only after reference, geometry and PBR are connected', () => {
    const sofa = assetRecipes.find((asset) => asset.id === 'prop.sofa');
    expect(sofa).toBeTruthy();
    expect(auditAssetQuality(sofa!, assetRecipes)).toMatchObject({ tier: 'hero', ready: true, score: 100 });
  });

  it('rejects a beautiful study with no production bridge', () => {
    const studyOnly: AssetRecipe = {
      id: 'study-only',
      name: 'study-only',
      kind: 'prop',
      description: 'test',
      prompt: 'test',
      source: '/study.png',
      usage: 'reference-study',
      state: 'ready',
      physicalSize: { x: 1, y: 1 },
      pivot: { x: 0.5, y: 0.5 },
      referenceStudy: {
        source: '/study.png',
        views: ['front', 'left', 'back', 'top'],
        learn: ['silhouette', 'proportion'],
        runtimeRule: 'never-render-directly',
      },
      geometry: { source: 'procedural', qualityTier: 'hero' },
    };
    const audit = auditAssetQuality(studyOnly, [studyOnly]);
    expect(audit.ready).toBe(false);
    expect(audit.issues).toContain('参考图尚未连接到 GLB 或参数化蓝图');
    expect(audit.issues).toContain('缺少可运行的 normal');
  });
});
