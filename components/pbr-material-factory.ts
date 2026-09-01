import * as THREE from 'three';
import type { AssetRecipe, Vec2 } from '@/engine/types';

export type CalibratedPbrSpec = {
  baseColorAsset: string;
  normalAsset?: string;
  roughnessAsset?: string;
  roughness: number;
  metalness?: number;
  normalScale?: number;
  physical?: {
    sheen?: number;
    sheenColor?: number;
    sheenRoughness?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
  };
};

const runtimeTexture = (assets: AssetRecipe[], id: string | undefined) => {
  if (!id) return undefined;
  const asset = assets.find((candidate) => candidate.id === id);
  return asset?.usage === 'runtime-texture' && asset.state === 'ready' ? asset : undefined;
};

const loadMap = (
  loader: THREE.TextureLoader,
  asset: AssetRecipe | undefined,
  anisotropy: number,
) => {
  if (!asset?.source) return null;
  const texture = loader.load(asset.source);
  texture.colorSpace = asset.texture?.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = asset.texture?.tileable ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = asset.texture?.tileable ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.anisotropy = anisotropy;
  return texture;
};

/**
 * Creates a texture-led PBR material. Base-color maps keep a neutral white factor;
 * artistic darkening belongs in the source albedo or lighting, never a hidden second tint.
 */
export function createCalibratedPbrMaterial(
  loader: THREE.TextureLoader,
  assets: AssetRecipe[],
  spec: CalibratedPbrSpec,
  anisotropy: number,
) {
  const base = runtimeTexture(assets, spec.baseColorAsset);
  const normal = runtimeTexture(assets, spec.normalAsset);
  const roughness = runtimeTexture(assets, spec.roughnessAsset);
  const parameters: THREE.MeshPhysicalMaterialParameters = {
    color: 0xffffff,
    map: loadMap(loader, base, anisotropy),
    normalMap: loadMap(loader, normal, anisotropy),
    roughnessMap: loadMap(loader, roughness, anisotropy),
    roughness: spec.roughness,
    metalness: spec.metalness ?? 0,
    normalScale: new THREE.Vector2(spec.normalScale ?? 0.1, spec.normalScale ?? 0.1),
    ...spec.physical,
  };
  if (spec.physical?.sheenColor !== undefined) {
    parameters.sheenColor = new THREE.Color(spec.physical.sheenColor);
  }
  const material = new THREE.MeshPhysicalMaterial(parameters);
  material.userData.metersPerTile = base?.texture?.metersPerTile ?? { x: 1, y: 1 };
  material.userData.baseColorFactorPolicy = 'neutral-white';
  material.userData.assetIds = [spec.baseColorAsset, spec.normalAsset, spec.roughnessAsset].filter(Boolean);
  return material;
}

export function createCalibratedBaseColorMaterial(
  loader: THREE.TextureLoader,
  assets: AssetRecipe[],
  assetId: string,
  anisotropy: number,
  roughness: number,
) {
  return createCalibratedPbrMaterial(loader, assets, {
    baseColorAsset: assetId,
    roughness,
    normalScale: 0,
  }, anisotropy);
}

export function getMaterialMetersPerTile(material: THREE.Material | THREE.Material[]): Vec2 | null {
  const materials = Array.isArray(material) ? material : [material];
  for (const candidate of materials) {
    const scale = candidate.userData.metersPerTile as Vec2 | undefined;
    if (scale?.x && scale?.y) return scale;
  }
  return null;
}

/**
 * BoxGeometry starts every face at UV 0..1. Re-projecting each face in metres keeps
 * brick, grain and plaster at the same real-world scale across differently sized meshes.
 */
export function applyMetricBoxUvs(
  geometry: THREE.BufferGeometry,
  metersPerTile: Vec2,
) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uvs = geometry.getAttribute('uv');
  if (!positions || !normals || !uvs) return geometry;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const nx = Math.abs(normals.getX(index));
    const ny = Math.abs(normals.getY(index));
    const nz = Math.abs(normals.getZ(index));
    if (nx >= ny && nx >= nz) uvs.setXY(index, z / metersPerTile.x, y / metersPerTile.y);
    else if (ny >= nz) uvs.setXY(index, x / metersPerTile.x, z / metersPerTile.y);
    else uvs.setXY(index, x / metersPerTile.x, y / metersPerTile.y);
  }
  uvs.needsUpdate = true;
  return geometry;
}
