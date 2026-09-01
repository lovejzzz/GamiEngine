import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createParametricSofa } from './parametric-asset-factory';
import {
  createVictorianBookcase,
  createVictorianDiningChair,
  createVictorianDiningTable,
  type HeroAssetMaterials,
} from './hero-asset-factory';

const standard = new THREE.MeshStandardMaterial();
const line = new THREE.LineBasicMaterial();
const materials: HeroAssetMaterials = {
  walnut: standard,
  leather: standard,
  upholstery: standard,
  brass: standard,
  darkMetal: standard,
  stone: standard,
  sage: standard,
  fabric: standard,
  porcelain: standard,
  fire: standard,
};

const geometryTypes = (root: THREE.Object3D) => {
  const types = new Set<string>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) types.add(object.geometry.type);
  });
  return types;
};

describe('hero furniture construction topology', () => {
  it('uses extruded profiles and lathed joinery for the dining table', () => {
    const table = createVictorianDiningTable(2.1, 1.05, materials);
    expect([...geometryTypes(table)]).toEqual(expect.arrayContaining(['ExtrudeGeometry', 'LatheGeometry', 'CylinderGeometry']));
    expect(table.children.length).toBeGreaterThanOrEqual(14);
  });

  it('uses shaped, turned and curved topology for the dining chair', () => {
    const chair = createVictorianDiningChair(.58, .62, materials);
    expect([...geometryTypes(chair)]).toEqual(expect.arrayContaining(['ExtrudeGeometry', 'LatheGeometry', 'TubeGeometry']));
    expect(chair.children.length).toBeGreaterThanOrEqual(20);
  });

  it('keeps soft upholstery attached to a detailed frame instead of one inflated box', () => {
    const sofa = createParametricSofa(2.2, .9, { leather: standard, walnut: standard, piping: line });
    expect([...geometryTypes(sofa)]).toEqual(expect.arrayContaining(['LatheGeometry', 'CapsuleGeometry', 'RoundedBoxGeometry']));
    expect(sofa.getObjectByName('carved-front-rail')).toBeTruthy();
    expect(sofa.getObjectByName('walnut-crest-rail')).toBeTruthy();
    expect(sofa.children.filter((child) => child.name.startsWith('tuft-button')).length).toBe(12);
  });

  it('builds casework from carcass, shelves, mouldings, panels and hardware', () => {
    const bookcase = createVictorianBookcase(1.1, 2.1, .38, materials);
    expect(bookcase.children.length).toBeGreaterThanOrEqual(35);
    expect([...geometryTypes(bookcase)]).toContain('RoundedBoxGeometry');
    expect(bookcase.userData.blueprintId).toBe('victorian.bookcase.v1');
  });
});
