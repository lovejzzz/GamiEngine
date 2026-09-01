import { describe, expect, it } from 'vitest';
import { buildingScene } from './demo-scene';

describe('Gami Engine demo manifest', () => {
  const assets = new Map(buildingScene.assets.map((asset) => [asset.id, asset]));

  it('uses the 3D renderer and four connected streamed floors', () => {
    expect(buildingScene.version).toBe(2);
    expect(buildingScene.renderer).toMatchObject({ mode: '3d', engine: 'three', floorStreaming: true });
    expect(buildingScene.floors.map((floor) => floor.id)).toEqual(['b1', 'f1', 'f2', 'f3']);
    for (const floor of buildingScene.floors) {
      for (const target of [floor.stairs.toUp, floor.stairs.toDown].filter(Boolean)) {
        expect(buildingScene.floors.some((candidate) => candidate.id === target)).toBe(true);
      }
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
      expect(character.animation?.skeleton).toBeTruthy();
      expect(character.animation?.rootMotion).toBe('engine');
      expect(character.animation?.clips.some((clip) => clip.id === 'idle' && clip.status === 'implemented')).toBe(true);
      expect(character.animation?.clips.some((clip) => clip.id === 'walk' && clip.status === 'implemented')).toBe(true);
    }
  });
});
