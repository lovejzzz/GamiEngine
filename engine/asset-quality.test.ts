import { describe, expect, it } from 'vitest';
import { assetRecipes, buildingScene } from './demo-scene';
import { auditAssetQuality, auditSceneQuality } from './asset-quality';
import type { AssetRecipe } from './types';

describe('asset quality bridge', () => {
  it('accepts the sofa only after asset-specific current-revision browser evidence', () => {
    const sofa = assetRecipes.find((asset) => asset.id === 'prop.sofa')!;
    const reviewed: AssetRecipe = {
      ...sofa,
      quality: {
        ...sofa.quality!,
        status: 'production',
        craft: {
          ...sofa.quality!.craft!,
          review: {
            status: 'passed',
            evidence: ['browser:prop.sofa:golden-room-close', 'revision:prop.sofa:test-sha'],
            checks: {
              silhouette: true, proportion: true, construction: true,
              materialResponse: true, interaction: true, collision: true,
            },
          },
        },
      },
    };
    expect(auditAssetQuality(reviewed, assetRecipes)).toMatchObject({ tier: 'hero', ready: true, score: 100 });
  });

  it('rejects a semantically correct hero asset that still uses generic construction shortcuts', () => {
    const sofa = assetRecipes.find((asset) => asset.id === 'prop.sofa')!;
    const candySofa: AssetRecipe = {
      ...sofa,
      id: 'prop.candy-sofa',
      quality: {
        ...sofa.quality!,
        craft: {
          ...sofa.quality!.craft!,
          signatureParts: ['seat-deck'],
          topologyTechniques: ['capsule'],
          prohibitedShortcuts: [],
          review: { ...sofa.quality!.craft!.review, status: 'pending' },
        },
      },
    };
    const audit = auditAssetQuality(candySofa, assetRecipes);
    expect(audit.ready).toBe(false);
    expect(audit.issues).toContain('标志性构造没有全部落实到独立部件');
    expect(audit.issues).toContain('仍缺少构造特有的非通用拓扑');
    expect(audit.issues).toContain('未声明需要禁止的粗糙建模捷径');
    expect(audit.issues).toContain('缺少独立的运行时近景审查');
  });

  it('keeps the whole demo honestly below production while critical craft areas remain unfinished', () => {
    const audit = auditSceneQuality(buildingScene);
    expect(audit).toMatchObject({ score: 52, productionReady: false, stage: 'prototype' });
    expect(audit.heroAssets).toEqual({ passed: 0, total: 4 });
    expect(audit.blockers).toContain('Hero 资产门禁：0/4 通过');
    expect(audit.blockers.some((blocker) => blocker.includes('非玩具化造型语言'))).toBe(true);
    expect(audit.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining('角色造型可信度'),
      expect.stringContaining('动作表演质量'),
    ]));
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
