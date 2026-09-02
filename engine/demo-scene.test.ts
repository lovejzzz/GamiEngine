import { describe, expect, it } from 'vitest';
import { auditAssetQuality } from './asset-quality';
import { buildingScene } from './demo-scene';

describe('Gami Engine demo manifest', () => {
  const assets = new Map(buildingScene.assets.map((asset) => [asset.id, asset]));

  it('uses the 3D renderer and four connected streamed floors', () => {
    expect(buildingScene.version).toBe(2);
    expect(buildingScene.renderer).toMatchObject({
      mode: '3d',
      engine: 'gami',
      sceneGraph: 'three',
      backend: 'three-webgl',
      floorStreaming: true,
    });
    expect(buildingScene.renderer.backendPolicy).toMatchObject({
      preferred: 'three-webgpu',
      fallback: 'three-webgl',
    });
    expect(buildingScene.floors.map((floor) => floor.id)).toEqual(['b1', 'f1', 'f2', 'f3']);
    for (const floor of buildingScene.floors) {
      expect(floor.stairs.autoTraverse).toBe(true);
      expect(floor.stairs.rise).toBeGreaterThan(0);
      for (const target of [floor.stairs.toUp, floor.stairs.toDown].filter(Boolean)) {
        expect(buildingScene.floors.some((candidate) => candidate.id === target)).toBe(true);
      }
    }
  });

  it('keeps the art-direction study as modeling input only', () => {
    const study = assets.get('reference.townhouse-art-direction-v1');
    expect(study?.usage).toBe('reference-study');
    expect(study?.referenceStudy?.runtimeRule).toBe('never-render-directly');
    expect(study?.geometry?.independentlyModeledParts).toContain('stairs');
  });

  it('locks the reference-derived camera, material and set-dressing contract', () => {
    expect(buildingScene.styleLock.contract).toMatchObject({
      cameraElevationDegrees: 34,
      cameraAzimuthDegrees: -38,
      environmentIntensity: 0.24,
      edgeSoftness: 'mixed',
      hardSurfaceEdgeRadiusM: [.001, .012],
    });
    expect(buildingScene.styleLock.contract?.forbiddenFormLanguage).toContain('capsule-mannequin');
    expect(buildingScene.styleLock.contract?.setPiecesPerRoom[0]).toBeGreaterThanOrEqual(6);
    for (const id of [
      'material.plaster.greige.base',
      'material.plaster.greige.normal',
      'material.plaster.greige.roughness',
      'material.brick.soot.base',
      'material.brick.soot.normal',
      'material.brick.soot.roughness',
      'prop.rug.oxblood',
    ]) {
      expect(assets.get(id)).toMatchObject({ usage: 'runtime-texture', state: 'ready' });
    }
  });

  it('resolves every runtime cross-reference', () => {
    for (const floor of buildingScene.floors) {
      for (const room of floor.rooms) expect(assets.has(room.floorAsset)).toBe(true);
      for (const door of floor.doors) {
        expect(assets.has(door.frontAsset)).toBe(true);
        expect(assets.has(door.backAsset)).toBe(true);
        expect(door.closedAngle).toBeGreaterThanOrEqual(door.minAngle);
        expect(door.closedAngle).toBeLessThanOrEqual(door.maxAngle);
        if (door.initialAngle !== undefined) {
          expect(door.initialAngle).toBeGreaterThanOrEqual(door.minAngle);
          expect(door.initialAngle).toBeLessThanOrEqual(door.maxAngle);
        }
      }
      for (const prop of floor.props) expect(assets.has(prop.asset)).toBe(true);
      for (const occupant of floor.occupants) expect(assets.has(occupant.asset)).toBe(true);
    }
  });

  it('keeps generated studies out of runtime and gives them a geometry plan', () => {
    for (const asset of buildingScene.assets.filter((item) => item.usage === 'reference-study')) {
      expect(asset.referenceStudy?.runtimeRule).toBe('never-render-directly');
      expect(asset.referenceStudy?.learn.length).toBeGreaterThan(0);
      expect(asset.geometry?.source).toMatch(/procedural|gltf/);
    }
    for (const asset of buildingScene.assets.filter((item) => item.usage === 'runtime-texture' && item.state === 'ready')) {
      expect(asset.texture?.semantic).toBeTruthy();
      expect(asset.texture?.metersPerTile.x).toBeGreaterThan(0);
      expect(asset.texture?.metersPerTile.y).toBeGreaterThan(0);
    }
  });

  it('bridges hero furniture studies into construction-specific candidate assets', () => {
    for (const id of ['reference.dining-furniture-multiview-v1', 'reference.casework-multiview-v1']) {
      const study = assets.get(id);
      expect(study?.referenceStudy?.runtimeRule).toBe('never-render-directly');
      expect(new Set(study?.referenceStudy?.views).size).toBeGreaterThanOrEqual(4);
      expect(study?.referenceStudy?.learn).toContain('construction');
    }

    for (const id of ['prop.table', 'prop.chair', 'prop.kitchen']) {
      const asset = assets.get(id)!;
      expect(asset.geometry?.qualityTier).toBe('hero');
      expect(asset.geometry?.blueprintId).toBeTruthy();
      expect(asset.geometry?.independentlyModeledParts?.length).toBeGreaterThanOrEqual(5);
      expect(asset.quality?.minBevelRadiusM).toBeLessThanOrEqual(.004);
      expect(asset.quality?.status).toBe('candidate');
      expect(auditAssetQuality(asset, buildingScene.assets)).toMatchObject({ ready: false, score: 76 });
    }
  });

  it('models cabinet children as independent state machines', () => {
    const kitchen = buildingScene.floors[1].props.find((prop) => prop.id === 'f1-kitchen-units');
    expect(kitchen?.parts).toHaveLength(4);
    const ids = kitchen?.parts?.map((part) => part.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    for (const part of kitchen?.parts ?? []) {
      expect(part.interaction.defaultState).toBe('closed');
      expect(part.interaction.states.map((state) => state.id)).toContain('open');
    }
  });

  it('declares movement blockers and navigation rather than inferring them from art', () => {
    const firstFloor = buildingScene.floors[1];
    for (const id of ['f1-table', 'f1-chair-a', 'f1-chair-b']) {
      expect(firstFloor.props.find((prop) => prop.id === id)?.collider).toBeTruthy();
    }
    for (const occupant of buildingScene.floors.flatMap((floor) => floor.occupants)) {
      expect(occupant.collider).toBeTruthy();
      if (occupant.behavior === 'patrol' || occupant.behavior === 'investigate') {
        expect(occupant.navigation?.waypoints.length).toBeGreaterThan(1);
        expect(occupant.navigation?.speed).toBeGreaterThan(0);
      }
    }
    expect(buildingScene.floors[0].obstacles?.some((item) => item.id === 'b1-boiler-body')).toBe(true);
    expect(buildingScene.floors[2].obstacles?.some((item) => item.id === 'f2-nursery-crib')).toBe(true);
  });

  it('keeps a clip inventory for every articulated character asset', () => {
    for (const character of buildingScene.assets.filter((asset) => asset.kind === 'character')) {
      expect(character.usage).toBe('runtime-model');
      expect(character.geometry?.source).toBe('gltf');
      expect(character.geometry?.meshSource).toBe(character.source);
      expect(character.geometry?.fallbackPrimitiveFamily).toBeTruthy();
      expect(character.animation?.skeleton).toBeTruthy();
      expect(character.animation?.clipAsset).toBe('character.animation-library');
      expect(character.animation?.rootMotion).toBe('engine');
      expect(character.animation?.clips.some((clip) => clip.id === 'idle' && clip.status === 'implemented')).toBe(true);
      expect(character.animation?.clips.some((clip) => clip.id === 'walk' && clip.status === 'implemented')).toBe(true);
      expect(assets.get(character.pbr?.baseColorAsset ?? '')).toMatchObject({ usage: 'runtime-texture', state: 'ready' });
      expect(character.provenance?.license).toBe('CC0-1.0');
    }
    expect(buildingScene.assets.find((asset) => asset.id === 'character.animation-library')?.usage).toBe('runtime-model');
  });
});
