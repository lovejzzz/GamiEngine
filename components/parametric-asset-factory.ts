import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { lateCenturySofaBlueprint } from '@/engine/asset-blueprints';

export type SofaMaterials = {
  leather: THREE.Material;
  walnut: THREE.Material;
  piping: THREE.Material;
};

const finishMesh = <T extends THREE.Mesh>(mesh: T) => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const roundedPart = (
  size: [number, number, number],
  radius: number,
  material: THREE.Material,
  position: [number, number, number],
  segments = 4,
) => {
  const safeRadius = Math.min(radius, Math.min(...size) * 0.48);
  const mesh = finishMesh(new THREE.Mesh(new RoundedBoxGeometry(...size, segments, safeRadius), material));
  mesh.position.set(...position);
  return mesh;
};

const addPiping = (cushion: THREE.Mesh, material: THREE.Material) => {
  const piping = new THREE.LineSegments(new THREE.EdgesGeometry(cushion.geometry, 26), material);
  piping.renderOrder = 2;
  cushion.add(piping);
};

const turnedLeg = (height: number, material: THREE.Material) => {
  const profile = [
    [0, 0.072], [0.04, 0.069], [0.08, 0.058], [0.16, 0.052],
    [0.37, 0.042], [0.68, 0.032], [0.9, 0.024], [1, 0.022],
  ] as const;
  const points = profile.map(([y, radius]) => new THREE.Vector2(radius, y * height));
  return finishMesh(new THREE.Mesh(new THREE.LatheGeometry(points, 20), material));
};

/** Compile the approved sofa blueprint into real geometry; no study pixels are rendered. */
export function createParametricSofa(width: number, depth: number, materials: SofaMaterials) {
  const group = new THREE.Group();
  group.name = lateCenturySofaBlueprint.id;
  const p = lateCenturySofaBlueprint.proportions;
  const armWidth = width * p.armInset;
  const usableWidth = width - armWidth * 2.35;
  const gap = width * p.cushionGap;
  const cushionWidth = (usableWidth - gap * 2) / 3;
  const legY = p.legHeight / 2;

  group.add(roundedPart(
    [width * 0.9, p.baseHeight, depth * 0.78],
    0.035,
    materials.walnut,
    [0, p.legHeight + p.baseHeight / 2, 0.025],
    3,
  ));
  group.add(roundedPart(
    [usableWidth + gap * 1.5, 0.13, depth * 0.67],
    0.045,
    materials.leather,
    [0, p.seatHeight - 0.1, 0.045],
  ));

  for (const side of [-1, 1]) {
    const x = side * (width / 2 - armWidth * 0.72);
    const support = roundedPart(
      [armWidth * 1.3, 0.38, depth * 0.82],
      0.07,
      materials.leather,
      [x, p.seatHeight + 0.01, 0.01],
    );
    support.name = side < 0 ? 'left-arm-support' : 'right-arm-support';
    group.add(support);
    const roll = finishMesh(new THREE.Mesh(
      new THREE.CapsuleGeometry(p.armRadius, Math.max(0.08, depth * 0.64 - p.armRadius * 2), 10, 20),
      materials.leather,
    ));
    roll.rotation.x = Math.PI / 2;
    roll.position.set(x, p.seatHeight + 0.22, 0.005);
    roll.name = side < 0 ? 'left-arm-roll' : 'right-arm-roll';
    group.add(roll);
  }

  const backFrame = roundedPart(
    [width * 0.84, 0.67, depth * 0.13],
    0.045,
    materials.walnut,
    [0, p.backHeight - 0.18, -depth * 0.39],
    3,
  );
  backFrame.rotation.x = -0.08;
  group.add(backFrame);

  for (let index = -1; index <= 1; index += 1) {
    const x = index * (cushionWidth + gap);
    const seat = roundedPart(
      [cushionWidth, 0.17, depth * 0.61],
      0.055,
      materials.leather,
      [x, p.seatHeight, depth * 0.045],
      5,
    );
    seat.name = `seat-cushion-${index + 2}`;
    seat.rotation.y = index * 0.008;
    seat.scale.y = index === 0 ? 0.92 : 1;
    addPiping(seat, materials.piping);
    group.add(seat);

    const back = roundedPart(
      [cushionWidth * 0.98, 0.5, depth * 0.2],
      0.065,
      materials.leather,
      [x, p.backHeight - 0.08, -depth * 0.29],
      5,
    );
    back.name = `back-cushion-${index + 2}`;
    back.rotation.x = -0.13;
    back.rotation.z = index * -0.012;
    addPiping(back, materials.piping);
    group.add(back);
  }

  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const leg = turnedLeg(p.legHeight, materials.walnut);
    leg.position.set(x * width * 0.39, legY, z * depth * 0.31);
    leg.rotation.z = x * 0.04;
    leg.rotation.x = z * -0.04;
    leg.name = `leg-${x < 0 ? 'left' : 'right'}-${z < 0 ? 'back' : 'front'}`;
    group.add(leg);
  }

  group.userData = {
    blueprintId: lateCenturySofaBlueprint.id,
    referenceAssetId: lateCenturySofaBlueprint.referenceAssetId,
    productionBridge: 'multi-view-reference -> parametric-blueprint -> PBR-runtime',
  };
  return group;
}
