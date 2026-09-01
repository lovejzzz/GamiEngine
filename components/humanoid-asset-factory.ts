import * as THREE from 'three';

export type BodySection = {
  y: number;
  halfWidth: number;
  halfDepth: number;
};

/**
 * Builds an authored elliptical cross-section shell instead of inflating one
 * primitive. The changing shoulder, waist, jaw and calf widths are what keep
 * a distant character silhouette from reading as a capsule toy.
 */
export function createSectionedBodyGeometry(sections: BodySection[], radialSegments = 14) {
  if (sections.length < 2) throw new Error('A sectioned body needs at least two cross-sections');
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const minY = sections[0].y;
  const height = sections.at(-1)!.y - minY || 1;

  sections.forEach((section) => {
    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const u = segment / radialSegments;
      const angle = u * Math.PI * 2;
      positions.push(
        Math.cos(angle) * section.halfWidth,
        section.y,
        Math.sin(angle) * section.halfDepth,
      );
      uvs.push(u, (section.y - minY) / height);
    }
  });

  const stride = radialSegments + 1;
  for (let ring = 0; ring < sections.length - 1; ring += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const a = ring * stride + segment;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const addCap = (sectionIndex: number, top: boolean) => {
    const section = sections[sectionIndex];
    const center = positions.length / 3;
    positions.push(0, section.y, 0);
    uvs.push(.5, .5);
    const ring = sectionIndex * stride;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      if (top) indices.push(center, ring + segment + 1, ring + segment);
      else indices.push(center, ring + segment, ring + segment + 1);
    }
  };
  addCap(0, false);
  addCap(sections.length - 1, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createHumanTorsoGeometry(kind: 'operator' | 'resident') {
  const shoulder = kind === 'operator' ? .245 : .215;
  const depth = kind === 'operator' ? .145 : .12;
  return createSectionedBodyGeometry([
    { y: -.32, halfWidth: .155, halfDepth: depth * .78 },
    { y: -.19, halfWidth: .165, halfDepth: depth * .84 },
    { y: .02, halfWidth: shoulder * .86, halfDepth: depth },
    { y: .22, halfWidth: shoulder, halfDepth: depth * 1.03 },
    { y: .31, halfWidth: .105, halfDepth: depth * .68 },
  ], 16);
}

export function createHumanPelvisGeometry(kind: 'operator' | 'resident') {
  const width = kind === 'operator' ? .18 : .165;
  return createSectionedBodyGeometry([
    { y: -.13, halfWidth: width * .8, halfDepth: .105 },
    { y: -.02, halfWidth: width, halfDepth: .12 },
    { y: .13, halfWidth: width * .94, halfDepth: .115 },
  ], 14);
}

export function createHumanHeadGeometry() {
  return createSectionedBodyGeometry([
    { y: -.16, halfWidth: .075, halfDepth: .078 },
    { y: -.1, halfWidth: .102, halfDepth: .095 },
    { y: .02, halfWidth: .112, halfDepth: .108 },
    { y: .12, halfWidth: .101, halfDepth: .1 },
    { y: .17, halfWidth: .055, halfDepth: .06 },
  ], 18);
}

export function createTaperedLimbGeometry(
  length: number,
  topWidth: number,
  endWidth: number,
  depthRatio = .82,
) {
  return createSectionedBodyGeometry([
    { y: -length, halfWidth: endWidth, halfDepth: endWidth * depthRatio },
    { y: -length * .56, halfWidth: (topWidth + endWidth) * .47, halfDepth: (topWidth + endWidth) * .47 * depthRatio },
    { y: 0, halfWidth: topWidth, halfDepth: topWidth * depthRatio },
  ], 12);
}
