import type { AssetRecipe, BuildingScene } from './types';

export type AssetQualityDimension = {
  id: 'reference' | 'construction' | 'materials' | 'runtime';
  label: string;
  score: number;
  ready: boolean;
};

export type AssetQualityAudit = {
  tier: NonNullable<AssetRecipe['geometry']>['qualityTier'];
  ready: boolean;
  score: number;
  issues: string[];
  dimensions: AssetQualityDimension[];
  checks: { passed: number; total: number };
};

export type SceneQualityAudit = {
  score: number;
  productionReady: boolean;
  stage: 'prototype' | 'candidate' | 'production';
  threshold: number;
  blockers: string[];
  heroAssets: { passed: number; total: number };
  dimensions: BuildingScene['qualityGate']['dimensions'];
};

const hasRuntimeMap = (
  assets: AssetRecipe[],
  id: string | undefined,
  semantic: NonNullable<AssetRecipe['texture']>['semantic'],
) => {
  if (!id) return false;
  const map = assets.find((asset) => asset.id === id);
  return map?.usage === 'runtime-texture'
    && map.state === 'ready'
    && map.texture?.semantic === semantic;
};

/** A deterministic gate between a beautiful study and a shippable runtime asset. */
export function auditAssetQuality(asset: AssetRecipe, assets: AssetRecipe[]): AssetQualityAudit {
  const tier = asset.geometry?.qualityTier;
  if (!tier) return { tier, ready: false, score: 0, issues: ['未声明质量等级'], dimensions: [], checks: { passed: 0, total: 0 } };

  const issues: string[] = [];
  const counters = new Map<AssetQualityDimension['id'], { passed: number; total: number }>();
  const check = (dimension: AssetQualityDimension['id'], condition: boolean, issue: string) => {
    const counter = counters.get(dimension) ?? { passed: 0, total: 0 };
    counter.total += 1;
    if (condition) counter.passed += 1;
    else issues.push(issue);
    counters.set(dimension, counter);
  };
  const views = new Set(asset.referenceStudy?.views ?? []);
  const hasGeometryBridge = asset.geometry?.source === 'gltf'
    ? Boolean(asset.geometry.meshSource)
    : Boolean(asset.geometry?.blueprintId);

  if (tier === 'hero') {
    const modeledParts = new Set(asset.geometry?.independentlyModeledParts ?? []);
    const craft = asset.quality?.craft;
    check('reference', views.size >= 4, 'Hero 资产至少需要四个一致视角');
    check('reference', asset.referenceStudy?.runtimeRule === 'never-render-directly', '参考图必须禁止直接进入运行时');
    check('construction', hasGeometryBridge, '参考图尚未连接到 GLB 或参数化蓝图');
    check('construction', modeledParts.size >= 6, '独立建模部件不足');
    check('construction', Boolean(craft && craft.signatureParts.length >= 3 && craft.signatureParts.every((part) => modeledParts.has(part))), '标志性构造没有全部落实到独立部件');
    check('construction', (craft?.topologyTechniques.length ?? 0) >= 2, '仍缺少构造特有的非通用拓扑');
    check('construction', (craft?.prohibitedShortcuts.length ?? 0) >= 2, '未声明需要禁止的粗糙建模捷径');
    check('construction', craft?.surfaceClass === 'soft' || (craft?.hardSurfaceMaxBevelRadiusM ?? Infinity) <= .02, '硬质表面的最大倒角过大，可能产生玩具感');
    check('materials', hasRuntimeMap(assets, asset.pbr?.baseColorAsset, 'base-color'), '缺少可运行的 base-color');
    check('materials', hasRuntimeMap(assets, asset.pbr?.normalAsset, 'normal'), '缺少可运行的 normal');
    check('materials', hasRuntimeMap(assets, asset.pbr?.roughnessAsset, 'roughness'), '缺少可运行的 roughness');
    check('materials', (asset.pbr?.texelDensityPxPerMeter ?? 0) >= 256, '纹素密度低于 Hero 标准');
    check('runtime', (asset.quality?.minBevelRadiusM ?? 0) > 0, '未声明最小倒角');
    check('runtime', (asset.quality?.triangleBudget ?? 0) > 0, '未声明三角面预算');
    check('runtime', (asset.quality?.maxDrawCalls ?? 0) > 0, '未声明 Draw Call 预算');
    check('runtime', (asset.quality?.lods ?? 0) >= 1, 'Hero 资产至少需要一个运行时 LOD');
    check('runtime', asset.quality?.status === 'production', '资产仍处于 fallback 状态');
    check('runtime', craft?.review.status === 'passed', '缺少独立的运行时近景审查');
    check('runtime', (craft?.review.evidence.length ?? 0) >= 2, '运行时审查证据不足');
    check('runtime', Boolean(craft && Object.values(craft.review.checks).every(Boolean)), '轮廓、构造、材质、交互或碰撞仍有未通过项');
  }

  const labels: Record<AssetQualityDimension['id'], string> = {
    reference: '参考保真', construction: '构造可信', materials: '材质响应', runtime: '运行实证',
  };
  const dimensions = ([...counters.entries()] as Array<[AssetQualityDimension['id'], { passed: number; total: number }]>).map(([id, counter]) => ({
    id,
    label: labels[id],
    score: counter.total ? Math.round(counter.passed / counter.total * 100) : 0,
    ready: counter.passed === counter.total,
  }));
  const passed = [...counters.values()].reduce((sum, counter) => sum + counter.passed, 0);
  const total = [...counters.values()].reduce((sum, counter) => sum + counter.total, 0);
  const score = total ? Math.round(passed / total * 100) : 0;
  return { tier, ready: issues.length === 0, score, issues, dimensions, checks: { passed, total } };
}

/** Scene-level evidence gate. In-progress work receives only 25% credit and can never satisfy a critical gate. */
export function auditSceneQuality(scene: BuildingScene): SceneQualityAudit {
  const multipliers = { passed: 1, 'in-progress': .25, failed: 0 } as const;
  const dimensions = scene.qualityGate.dimensions;
  const totalWeight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0) || 1;
  const weighted = dimensions.reduce((sum, dimension) => sum + dimension.weight * multipliers[dimension.status], 0);
  const score = Math.round(weighted / totalWeight * 100);
  const productionAssets = scene.assets.filter((asset) => asset.geometry?.qualityTier === 'hero' && asset.quality);
  const passedAssets = productionAssets.filter((asset) => auditAssetQuality(asset, scene.assets).ready).length;
  const blockers = dimensions
    .filter((dimension) => dimension.critical && dimension.status !== 'passed')
    .map((dimension) => `${dimension.label}：${dimension.note}`);
  if (passedAssets !== productionAssets.length) blockers.push(`Hero 资产门禁：${passedAssets}/${productionAssets.length} 通过`);
  const productionReady = score >= scene.qualityGate.productionThreshold && blockers.length === 0;
  return {
    score,
    productionReady,
    stage: productionReady ? 'production' : score >= 75 ? 'candidate' : 'prototype',
    threshold: scene.qualityGate.productionThreshold,
    blockers,
    heroAssets: { passed: passedAssets, total: productionAssets.length },
    dimensions,
  };
}
