import type { AssetRecipe } from './types';

export type AssetQualityAudit = {
  tier: NonNullable<AssetRecipe['geometry']>['qualityTier'];
  ready: boolean;
  score: number;
  issues: string[];
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
  if (!tier) return { tier, ready: false, score: 0, issues: ['未声明质量等级'] };

  const issues: string[] = [];
  const views = new Set(asset.referenceStudy?.views ?? []);
  const hasGeometryBridge = asset.geometry?.source === 'gltf'
    ? Boolean(asset.geometry.meshSource)
    : Boolean(asset.geometry?.blueprintId);

  if (tier === 'hero') {
    if (views.size < 4) issues.push('Hero 资产至少需要四个一致视角');
    if (!hasGeometryBridge) issues.push('参考图尚未连接到 GLB 或参数化蓝图');
    if ((asset.geometry?.independentlyModeledParts?.length ?? 0) < 6) issues.push('独立建模部件不足');
    if (!hasRuntimeMap(assets, asset.pbr?.baseColorAsset, 'base-color')) issues.push('缺少可运行的 base-color');
    if (!hasRuntimeMap(assets, asset.pbr?.normalAsset, 'normal')) issues.push('缺少可运行的 normal');
    if (!hasRuntimeMap(assets, asset.pbr?.roughnessAsset, 'roughness')) issues.push('缺少可运行的 roughness');
    if ((asset.pbr?.texelDensityPxPerMeter ?? 0) < 256) issues.push('纹素密度低于 Hero 标准');
    if ((asset.quality?.minBevelRadiusM ?? 0) <= 0) issues.push('未声明最小倒角');
    if ((asset.quality?.triangleBudget ?? 0) <= 0) issues.push('未声明三角面预算');
    if ((asset.quality?.maxDrawCalls ?? 0) <= 0) issues.push('未声明 Draw Call 预算');
    if ((asset.quality?.lods ?? 0) < 1) issues.push('Hero 资产至少需要一个运行时 LOD');
    if (asset.quality?.status !== 'production') issues.push('资产仍处于 fallback 状态');
  }

  const checks = 11;
  const score = Math.max(0, Math.round((checks - issues.length) / checks * 100));
  return { tier, ready: issues.length === 0, score, issues };
}
