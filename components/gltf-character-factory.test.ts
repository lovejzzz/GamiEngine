import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { retargetBoneName, retargetClip } from './gltf-character-factory';

describe('glTF character retargeting', () => {
  it('maps the animation-library skeleton to the engine humanoid', () => {
    expect(retargetBoneName('DEF-hips')).toBe('pelvis');
    expect(retargetBoneName('DEF-spine.003')).toBe('spine_03');
    expect(retargetBoneName('DEF-upper_arm.L')).toBe('upperarm_l');
    expect(retargetBoneName('DEF-f_index.02.R')).toBe('index_02_r');
  });

  it('keeps rotations but rejects mannequin positions and root motion', () => {
    const clip = new THREE.AnimationClip('Walk_Loop', 1, [
      new THREE.QuaternionKeyframeTrack('DEF-thigh.L.quaternion', [0, 1], [0, 0, 0, 1, 0, .2, 0, .98]),
      new THREE.VectorKeyframeTrack('DEF-thigh.L.position', [0, 1], [0, 0, 0, 0, .1, 0]),
      new THREE.VectorKeyframeTrack('root.position', [0, 1], [0, 0, 0, 0, 0, 1]),
    ]);
    const retargeted = retargetClip(clip);
    expect(retargeted.tracks.map((track) => track.name)).toEqual(['thigh_l.quaternion']);
  });
});
