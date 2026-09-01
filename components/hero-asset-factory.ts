import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type HeroAssetMaterials = {
  walnut: THREE.Material;
  leather: THREE.Material;
  upholstery: THREE.Material;
  brass: THREE.Material;
  darkMetal: THREE.Material;
  stone: THREE.Material;
  sage: THREE.Material;
  fabric: THREE.Material;
  porcelain: THREE.Material;
  fire: THREE.Material;
};

const finish = <T extends THREE.Mesh>(mesh: T, cast = true) => {
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
};

const hardBox = (
  size: [number, number, number],
  material: THREE.Material,
  radius = 0.008,
) => finish(new THREE.Mesh(
  new RoundedBoxGeometry(...size, 2, Math.min(radius, Math.min(...size) * 0.3)),
  material,
));

const addPart = <T extends THREE.Object3D>(
  parent: THREE.Object3D,
  part: T,
  position: [number, number, number],
) => {
  part.position.set(...position);
  parent.add(part);
  return part;
};

const turnedPart = (height: number, radius: number, material: THREE.Material, slender = false) => {
  const profile = slender
    ? [[0, .42], [.05, .48], [.12, .34], [.22, .28], [.34, .43], [.46, .25], [.62, .24], [.76, .38], [.9, .31], [1, .4]]
    : [[0, .58], [.06, .68], [.13, .46], [.25, .42], [.34, .72], [.43, .78], [.52, .48], [.7, .4], [.84, .63], [.94, .5], [1, .58]];
  const points = profile.map(([y, r]) => new THREE.Vector2(radius * r, height * y));
  return finish(new THREE.Mesh(new THREE.LatheGeometry(points, 18), material));
};

const cylinderBetween = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radialSegments = 12,
) => {
  const direction = end.clone().sub(start);
  const mesh = finish(new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments),
    material,
  ));
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
};

const ovalSlab = (width: number, depth: number, thickness: number, material: THREE.Material, bevel = .012) => {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, width / 2, depth / 2, 0, Math.PI * 2, false, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 48,
  });
  geometry.center();
  geometry.rotateX(Math.PI / 2);
  return finish(new THREE.Mesh(geometry, material));
};

const shapedChairSeat = (width: number, depth: number, thickness: number, material: THREE.Material) => {
  const front = width / 2;
  const back = width * .42;
  const halfDepth = depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-front, halfDepth * .82);
  shape.quadraticCurveTo(-front * 1.02, halfDepth, -front * .83, halfDepth);
  shape.lineTo(front * .83, halfDepth);
  shape.quadraticCurveTo(front * 1.02, halfDepth, front, halfDepth * .82);
  shape.lineTo(back, -halfDepth * .92);
  shape.quadraticCurveTo(back, -halfDepth, back * .82, -halfDepth);
  shape.lineTo(-back * .82, -halfDepth);
  shape.quadraticCurveTo(-back, -halfDepth, -back, -halfDepth * .92);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: .008,
    bevelSize: .008,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geometry.center();
  geometry.rotateX(Math.PI / 2);
  return finish(new THREE.Mesh(geometry, material));
};

const addInsetPanel = (
  parent: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
  position: [number, number, number],
  material: THREE.Material,
) => {
  const panel = new THREE.Group();
  addPart(panel, hardBox([width, height, depth * .42], material, .004), [0, 0, 0]);
  const rail = Math.min(width, height) * .095;
  addPart(panel, hardBox([width + rail * .65, rail, depth], material, .004), [0, height / 2 - rail / 2, depth * .24]);
  addPart(panel, hardBox([width + rail * .65, rail, depth], material, .004), [0, -height / 2 + rail / 2, depth * .24]);
  addPart(panel, hardBox([rail, height - rail * 1.15, depth], material, .004), [-width / 2 + rail / 2, 0, depth * .24]);
  addPart(panel, hardBox([rail, height - rail * 1.15, depth], material, .004), [width / 2 - rail / 2, 0, depth * .24]);
  return addPart(parent, panel, position);
};

export function createVictorianDiningTable(width: number, depth: number, materials: HeroAssetMaterials) {
  const group = new THREE.Group();
  group.name = 'hero.victorian-dining-table.v1';
  addPart(group, ovalSlab(width * 1.015, depth * 1.015, .045, materials.walnut, .008), [0, .805, 0]);
  addPart(group, ovalSlab(width, depth, .075, materials.walnut, .006), [0, .75, 0]);
  addPart(group, hardBox([width * .7, .13, .07], materials.walnut, .006), [0, .675, depth * .34]);
  addPart(group, hardBox([width * .7, .13, .07], materials.walnut, .006), [0, .675, -depth * .34]);
  addPart(group, hardBox([.07, .13, depth * .56], materials.walnut, .006), [width * .37, .675, 0]);
  addPart(group, hardBox([.07, .13, depth * .56], materials.walnut, .006), [-width * .37, .675, 0]);

  const legHeight = .66;
  const legX = width * .37;
  const legZ = depth * .31;
  for (const x of [-legX, legX]) for (const z of [-legZ, legZ]) {
    addPart(group, turnedPart(legHeight, .12, materials.walnut), [x, .02, z]);
  }
  const stretcherY = .19;
  group.add(cylinderBetween(new THREE.Vector3(-legX, stretcherY, legZ), new THREE.Vector3(legX, stretcherY, legZ), .026, materials.walnut));
  group.add(cylinderBetween(new THREE.Vector3(-legX, stretcherY, -legZ), new THREE.Vector3(legX, stretcherY, -legZ), .026, materials.walnut));
  group.add(cylinderBetween(new THREE.Vector3(-legX, stretcherY, -legZ), new THREE.Vector3(-legX, stretcherY, legZ), .026, materials.walnut));
  group.add(cylinderBetween(new THREE.Vector3(legX, stretcherY, -legZ), new THREE.Vector3(legX, stretcherY, legZ), .026, materials.walnut));
  const centerBlock = hardBox([.16, .13, .12], materials.walnut, .008);
  addPart(group, centerBlock, [0, stretcherY, 0]);
  group.userData = { blueprintId: 'victorian.dining-table.v1', referenceAssetId: 'reference.dining-furniture-multiview-v1' };
  return group;
}

export function createVictorianDiningChair(width: number, depth: number, materials: HeroAssetMaterials) {
  const group = new THREE.Group();
  group.name = 'hero.victorian-dining-chair.v1';
  const seatY = .49;
  addPart(group, shapedChairSeat(width * .88, depth * .82, .07, materials.walnut), [0, seatY, 0]);
  addPart(group, shapedChairSeat(width * .8, depth * .73, .055, materials.leather), [0, seatY + .065, .015]);

  const frontX = width * .36;
  const backX = width * .31;
  const frontZ = depth * .31;
  const backZ = -depth * .32;
  for (const x of [-frontX, frontX]) addPart(group, turnedPart(.47, .062, materials.walnut, true), [x, .02, frontZ]);
  for (const x of [-backX, backX]) {
    const post = turnedPart(1.08, .067, materials.walnut, true);
    post.rotation.z = x > 0 ? -.025 : .025;
    post.rotation.x = -.035;
    addPart(group, post, [x, .02, backZ]);
  }

  for (const z of [frontZ, backZ]) group.add(cylinderBetween(
    new THREE.Vector3(-width * .33, .2, z),
    new THREE.Vector3(width * .33, .2, z),
    .018,
    materials.walnut,
  ));
  for (const x of [-width * .33, width * .33]) group.add(cylinderBetween(
    new THREE.Vector3(x, .23, backZ),
    new THREE.Vector3(x, .23, frontZ),
    .017,
    materials.walnut,
  ));

  addPart(group, hardBox([width * .7, .075, .065], materials.walnut, .006), [0, .63, backZ]);
  for (let index = -2; index <= 2; index += 1) {
    const spindle = turnedPart(.38, .032, materials.walnut, true);
    addPart(group, spindle, [index * width * .115, .65, backZ]);
  }
  const crestCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-width * .35, 1.01, backZ),
    new THREE.Vector3(0, 1.11, backZ - .005),
    new THREE.Vector3(width * .35, 1.01, backZ),
  );
  const crest = finish(new THREE.Mesh(new THREE.TubeGeometry(crestCurve, 24, .042, 8, false), materials.walnut));
  group.add(crest);
  addPart(group, hardBox([width * .58, .11, .055], materials.walnut, .008), [0, 1.005, backZ]);

  for (let nail = -4; nail <= 4; nail += 1) {
    const stud = finish(new THREE.Mesh(new THREE.SphereGeometry(.009, 8, 6), materials.brass), false);
    addPart(group, stud, [nail * width * .075, seatY + .072, frontZ + .055]);
  }
  group.userData = { blueprintId: 'victorian.dining-chair.v1', referenceAssetId: 'reference.dining-furniture-multiview-v1' };
  return group;
}

export function createTownhouseBed(width: number, depth: number, materials: HeroAssetMaterials) {
  const group = new THREE.Group();
  group.name = 'hero.iron-bed.v1';
  addPart(group, hardBox([width * .94, .2, depth * .9], materials.fabric, .035), [0, .42, .02]);
  addPart(group, hardBox([width * .9, .08, depth * .84], materials.upholstery, .022), [0, .56, .02]);
  const railY = .28;
  for (const x of [-width * .47, width * .47]) {
    group.add(cylinderBetween(new THREE.Vector3(x, .05, -depth * .46), new THREE.Vector3(x, .05, depth * .46), .028, materials.darkMetal));
  }
  for (const z of [-depth * .47, depth * .47]) {
    group.add(cylinderBetween(new THREE.Vector3(-width * .47, railY, z), new THREE.Vector3(width * .47, railY, z), .028, materials.darkMetal));
  }
  const headZ = -depth * .47;
  for (const x of [-width * .47, width * .47]) {
    group.add(cylinderBetween(new THREE.Vector3(x, .02, headZ), new THREE.Vector3(x, 1.16, headZ), .035, materials.darkMetal));
    const finial = finish(new THREE.Mesh(new THREE.SphereGeometry(.065, 14, 10), materials.brass));
    addPart(group, finial, [x, 1.2, headZ]);
  }
  group.add(cylinderBetween(new THREE.Vector3(-width * .47, 1.04, headZ), new THREE.Vector3(width * .47, 1.04, headZ), .032, materials.darkMetal));
  for (let spindle = -3; spindle <= 3; spindle += 1) {
    const x = spindle * width * .115;
    group.add(cylinderBetween(new THREE.Vector3(x, .58, headZ), new THREE.Vector3(x, 1.03, headZ), .014, materials.darkMetal, 10));
  }
  const pillowMaterial = materials.porcelain;
  addPart(group, hardBox([width * .37, .11, depth * .19], pillowMaterial, .045), [-width * .22, .66, -depth * .31]);
  addPart(group, hardBox([width * .37, .11, depth * .19], pillowMaterial, .045), [width * .22, .66, -depth * .31]);
  group.userData = { blueprintId: 'townhouse.iron-bed.v1' };
  return group;
}

export function createVictorianBookcase(width: number, height: number, depth: number, materials: HeroAssetMaterials) {
  const group = new THREE.Group();
  group.name = 'hero.victorian-bookcase.v1';
  addPart(group, hardBox([width, height, depth * .35], materials.walnut, .006), [0, height / 2, -depth * .32]);
  addPart(group, hardBox([width * .1, height, depth], materials.walnut, .006), [-width * .45, height / 2, 0]);
  addPart(group, hardBox([width * .1, height, depth], materials.walnut, .006), [width * .45, height / 2, 0]);
  addPart(group, hardBox([width * 1.12, .1, depth * 1.15], materials.walnut, .006), [0, height - .02, 0]);
  addPart(group, hardBox([width * 1.04, .07, depth * 1.05], materials.walnut, .005), [0, height - .1, 0]);
  addPart(group, hardBox([width * 1.08, .11, depth * 1.1], materials.walnut, .006), [0, .055, 0]);
  const cabinetHeight = height * .35;
  addPart(group, hardBox([width * .92, .065, depth], materials.walnut, .005), [0, cabinetHeight, 0]);
  for (const shelfY of [height * .48, height * .64, height * .8]) {
    addPart(group, hardBox([width * .9, .045, depth * .92], materials.walnut, .004), [0, shelfY, .02]);
  }
  addInsetPanel(group, width * .36, cabinetHeight * .66, .055, [-width * .22, cabinetHeight * .48, depth * .38], materials.walnut);
  addInsetPanel(group, width * .36, cabinetHeight * .66, .055, [width * .22, cabinetHeight * .48, depth * .38], materials.walnut);
  for (const x of [-width * .05, width * .05]) {
    const knob = finish(new THREE.Mesh(new THREE.SphereGeometry(.025, 10, 8), materials.brass));
    addPart(group, knob, [x, cabinetHeight * .48, depth * .45]);
  }
  const colors = [0x4c302d, 0x2d4740, 0x6c5738, 0x273744, 0x716047];
  for (const shelfY of [height * .48, height * .64, height * .8]) for (let book = 0; book < 7; book += 1) {
    const bookMaterial = new THREE.MeshStandardMaterial({ color: colors[book % colors.length], roughness: .92 });
    const bookHeight = .13 + (book % 3) * .022;
    addPart(group, hardBox([.045 + (book % 2) * .008, bookHeight, depth * .38], bookMaterial, .002), [-width * .33 + book * width * .1, shelfY + bookHeight / 2 + .025, .08]);
  }
  group.userData = { blueprintId: 'victorian.bookcase.v1', referenceAssetId: 'reference.casework-multiview-v1' };
  return group;
}

export function createVictorianFireplace(width: number, height: number, depth: number, materials: HeroAssetMaterials) {
  const group = new THREE.Group();
  group.name = 'hero.victorian-fireplace.v1';
  addPart(group, hardBox([width * 1.18, .09, depth * 1.8], materials.stone, .006), [0, .045, .05]);
  addPart(group, hardBox([width, height * .82, depth * .65], materials.walnut, .006), [0, height * .43, 0]);
  addPart(group, hardBox([width * .58, height * .58, depth * .72], materials.darkMetal, .012), [0, height * .32, depth * .03]);
  for (const x of [-width * .4, width * .4]) {
    addPart(group, hardBox([width * .18, height * .7, depth], materials.walnut, .006), [x, height * .4, 0]);
    addPart(group, hardBox([width * .23, .1, depth * 1.08], materials.walnut, .005), [x, height * .74, 0]);
    addPart(group, hardBox([width * .22, .12, depth * 1.04], materials.walnut, .005), [x, .12, 0]);
    for (const flute of [-.035, 0, .035]) addPart(group, hardBox([.018, height * .46, depth * .08], materials.walnut, .003), [x + flute, height * .43, depth * .53]);
  }
  addPart(group, hardBox([width * .9, .22, depth * .8], materials.walnut, .006), [0, height * .75, 0]);
  addInsetPanel(group, width * .48, .15, .04, [0, height * .77, depth * .43], materials.walnut);
  addPart(group, hardBox([width * 1.16, .1, depth * 1.25], materials.walnut, .006), [0, height * .9, 0]);
  addPart(group, hardBox([width * 1.3, .1, depth * 1.42], materials.walnut, .007), [0, height, 0]);
  const medallion = finish(new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .025, 24), materials.brass));
  medallion.rotation.x = Math.PI / 2;
  addPart(group, medallion, [0, height * .78, depth * .5]);
  addPart(group, hardBox([width * .44, .045, depth * .42], materials.fire, .012), [0, .17, depth * .48]);
  for (const x of [-.18, 0, .18]) {
    const log = finish(new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, width * .36, 10), materials.walnut));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = x;
    addPart(group, log, [x * .5, .13, depth * .48]);
  }
  const fireLight = new THREE.PointLight(0xff6d2a, 4.4, 2.6, 2);
  addPart(group, fireLight, [0, .38, depth * .72]);
  group.userData = { blueprintId: 'victorian.fireplace.v1', referenceAssetId: 'reference.casework-multiview-v1' };
  return group;
}
