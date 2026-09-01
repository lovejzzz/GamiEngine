import type { AssetRecipe } from './types';

export type RuntimeUsage = Extract<NonNullable<AssetRecipe['usage']>, 'runtime-texture' | 'runtime-sprite' | 'runtime-model'>;

/** Resolve a renderer-safe file without ever leaking a modeling reference into runtime. */
export function resolveRuntimeSource(
  assets: AssetRecipe[],
  id: string,
  expectedUsage: RuntimeUsage,
): string | null {
  const asset = assets.find((candidate) => candidate.id === id);
  if (!asset?.source || asset.state !== 'ready') return null;
  if (asset.usage !== expectedUsage) return null;
  return asset.source;
}

export function assetRoleLabel(asset: AssetRecipe) {
  if (asset.usage === 'reference-study') return '造型参考图';
  if (asset.usage === 'runtime-texture') return '运行时材质';
  if (asset.usage === 'runtime-sprite') return '运行时动画';
  if (asset.usage === 'runtime-model') return '运行时模型';
  return '待分类配方';
}
