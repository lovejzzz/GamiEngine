import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createHumanTorsoGeometry } from './humanoid-asset-factory';

export type CharacterMotion = 'idle' | 'walk' | 'stairs' | 'crouch' | 'interact' | 'push';
export type CharacterKind = 'operator' | 'resident';

export type GltfCharacterRuntime = {
  root: THREE.Group;
  setMotion: (motion: CharacterMotion) => void;
  update: (dt: number) => void;
};

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const characterAlbedoPromises = new Map<string, Promise<THREE.Texture>>();
let assetPromise: Promise<{
  body: THREE.Group;
  clips: THREE.AnimationClip[];
}> | null = null;
let cachedSources = '';

const sideName = (side: string) => side === 'L' ? 'l' : 'r';

/** Maps the CC0 animation-library skeleton onto Gami's replaceable humanoid base. */
export function retargetBoneName(sourceName: string) {
  const source = sourceName.replace(/^DEF-/, '');
  const direct: Record<string, string> = {
    head: 'Head',
    neck: 'neck_01',
    hips: 'pelvis',
    spine001: 'spine_01',
    spine002: 'spine_02',
    spine003: 'spine_03',
  };
  const compact = source.replaceAll('.', '');
  if (direct[compact]) return direct[compact];

  const limb = compact.match(/^(shoulder|upper_arm|forearm|hand|thigh|shin|foot|toe)([LR])$/);
  if (limb) {
    const part: Record<string, string> = {
      shoulder: 'clavicle',
      upper_arm: 'upperarm',
      forearm: 'lowerarm',
      hand: 'hand',
      thigh: 'thigh',
      shin: 'calf',
      foot: 'foot',
      toe: 'ball',
    };
    return `${part[limb[1]]}_${sideName(limb[2])}`;
  }

  const finger = compact.match(/^(?:f_)?(index|middle|pinky|ring|thumb)(0[1-3])([LR])$/);
  if (finger) return `${finger[1]}_${finger[2]}_${sideName(finger[3])}`;
  if (sourceName === 'root') return 'root';
  return null;
}

export function retargetClip(source: THREE.AnimationClip) {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const sourceTrack of source.tracks) {
    const propertyIndex = sourceTrack.name.lastIndexOf('.');
    if (propertyIndex < 0) continue;
    const sourceBone = sourceTrack.name.slice(0, propertyIndex);
    const property = sourceTrack.name.slice(propertyIndex + 1);
    // Engine root motion owns translation. Keeping source bone positions would
    // also import the mannequin's limb lengths and distort the target body.
    if (property !== 'quaternion') continue;
    const targetBone = retargetBoneName(sourceBone);
    if (!targetBone) continue;
    const track = sourceTrack.clone();
    track.name = `${targetBone}.quaternion`;
    tracks.push(track);
  }
  return new THREE.AnimationClip(source.name, source.duration, tracks);
}

function loadAssets(bodySource: string, animationSource: string) {
  const sources = `${bodySource}|${animationSource}`;
  if (cachedSources !== sources) {
    cachedSources = sources;
    assetPromise = null;
  }
  assetPromise ??= Promise.all([
    loader.loadAsync(bodySource),
    loader.loadAsync(animationSource),
  ]).then(([body, animation]) => ({
    body: body.scene,
    clips: animation.animations.map(retargetClip),
  }));
  return assetPromise;
}

function loadCharacterAlbedo(kind: CharacterKind, source: string) {
  const existing = characterAlbedoPromises.get(source);
  if (existing) return existing;
  const promise = textureLoader.loadAsync(source).then((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.anisotropy = 8;
    texture.name = `gami-${kind}-clothed-albedo-v1`;
    return texture;
  });
  characterAlbedoPromises.set(source, promise);
  return promise;
}

function addOperatorEquipment(model: THREE.Group) {
  const helmetMaterial = new THREE.MeshStandardMaterial({ color: 0x1c2925, roughness: .92, metalness: .03 });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x151b1a, roughness: .58, metalness: .42 });
  const carrierMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x34483e,
    roughness: .96,
    metalness: 0,
    sheen: .06,
    sheenColor: new THREE.Color(0x718177),
    sheenRoughness: .95,
  });
  const spine = model.getObjectByName('spine_02');
  if (spine) {
    const carrier = new THREE.Mesh(createHumanTorsoGeometry('operator'), carrierMaterial);
    carrier.name = 'operator-fitted-plate-carrier';
    carrier.scale.set(.88, .76, .94);
    carrier.position.set(0, 1.34, .008);
    carrier.castShadow = true;
    carrier.receiveShadow = true;
    model.add(carrier);
    model.updateMatrixWorld(true);
    spine.attach(carrier);
  }
  const head = model.getObjectByName('Head');
  if (head) {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(.148, 24, 12, 0, Math.PI * 2, 0, Math.PI * .62), helmetMaterial);
    helmet.scale.set(1.02, .72, 1.06);
    helmet.position.set(0, .085, 0);
    helmet.name = 'operator-helmet';
    helmet.castShadow = true;
    head.add(helmet);
  }
  const hand = model.getObjectByName('hand_r');
  if (hand) {
    const rifle = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(.055, .24, .065), metalMaterial);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(.072, .15, .075), helmetMaterial);
    stock.position.y = -.18;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.012, .014, .33, 12), metalMaterial);
    barrel.position.y = .285;
    const optic = new THREE.Mesh(new THREE.BoxGeometry(.035, .055, .04), metalMaterial);
    optic.position.set(0, .05, .055);
    rifle.add(receiver, stock, barrel, optic);
    rifle.position.set(.01, -.02, .035);
    rifle.rotation.set(.18, -.1, -.22);
    rifle.name = 'operator-rifle';
    rifle.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
    hand.add(rifle);
  }
}

function addResidentHair(model: THREE.Group, styleIndex: number) {
  const colors = [0x241f1a, 0x171615, 0x4a3428, 0x302a25];
  const material = new THREE.MeshStandardMaterial({ color: colors[styleIndex % colors.length], roughness: .96 });
  const head = model.getObjectByName('Head');
  if (!head) return;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.108, 24, 12, 0, Math.PI * 2, 0, Math.PI * .56), material);
  cap.scale.set(1.02, .72, 1.05);
  cap.position.set(0, .078, -.006);
  cap.rotation.z = styleIndex % 2 ? -.04 : .04;
  cap.castShadow = true;
  head.add(cap);
}

function addFootwear(model: THREE.Group, kind: CharacterKind) {
  const material = new THREE.MeshStandardMaterial({
    color: kind === 'operator' ? 0x111715 : 0x211b18,
    roughness: kind === 'operator' ? .82 : .7,
    metalness: .02,
  });
  for (const side of ['l', 'r']) {
    const foot = model.getObjectByName(`foot_${side}`);
    const toe = model.getObjectByName(`ball_${side}`);
    if (!foot || !toe || toe.parent !== foot) continue;
    const direction = toe.position.clone();
    if (direction.length() < .01) continue;
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .105, 6, 16), material);
    shoe.name = `${kind}-shoe-${side}`;
    shoe.position.copy(direction).multiplyScalar(.52);
    shoe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    shoe.scale.set(.86, 1, 1.06);
    shoe.castShadow = true;
    shoe.receiveShadow = true;
    foot.add(shoe);
  }
}

export async function createGltfCharacter(
  kind: CharacterKind,
  _tint: number,
  styleIndex: number,
  bodySource: string,
  animationSource: string,
  albedoSource: string,
) {
  const [assets, authoredAlbedo] = await Promise.all([
    loadAssets(bodySource, animationSource),
    loadCharacterAlbedo(kind, albedoSource),
  ]);
  const container = new THREE.Group();
  const model = cloneSkeleton(assets.body) as THREE.Group;
  model.name = `gami-${kind}-authored-body`;
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const materials = sourceMaterials.map((sourceMaterial) => {
      const cloned = sourceMaterial.clone();
      if (cloned instanceof THREE.MeshStandardMaterial) {
        cloned.roughness = Math.max(cloned.roughness, kind === 'operator' ? .78 : .9);
        cloned.metalness = 0;
        if (cloned.name.includes('Superhero')) {
          cloned.color.setHex(0xffffff);
          cloned.map = authoredAlbedo;
        }
      }
      return cloned;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });
  container.add(model);
  model.updateMatrixWorld(true);
  const initialBounds = new THREE.Box3().setFromObject(model);
  const height = initialBounds.max.y - initialBounds.min.y;
  const targetHeight = kind === 'operator' ? 1.8 : 1.72 + (styleIndex % 3 - 1) * .035;
  model.scale.setScalar(targetHeight / Math.max(height, .01));
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  model.position.set(
    -(bounds.min.x + bounds.max.x) / 2,
    -bounds.min.y,
    -(bounds.min.z + bounds.max.z) / 2,
  );

  // UV-registered outfits stay on the skin-weighted body through every animation.
  // Only genuinely rigid equipment remains separate geometry.
  addFootwear(model, kind);
  if (kind === 'operator') addOperatorEquipment(model);
  else addResidentHair(model, styleIndex);

  const mixer = new THREE.AnimationMixer(model);
  const clips = new Map(assets.clips.map((clip) => [clip.name, clip]));
  const actionNames: Record<CharacterMotion, string> = {
    idle: kind === 'operator' ? 'Pistol_Idle_Loop' : 'Idle_Loop',
    walk: 'Walk_Loop',
    stairs: 'Walk_Loop',
    crouch: 'Crouch_Idle_Loop',
    interact: 'Interact',
    push: 'Interact',
  };
  const actions = new Map<CharacterMotion, THREE.AnimationAction>();
  for (const motion of Object.keys(actionNames) as CharacterMotion[]) {
    const clip = clips.get(actionNames[motion]) ?? clips.get('Idle_Loop');
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.enabled = true;
    const oneShot = motion === 'interact' || motion === 'push';
    action.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
    action.clampWhenFinished = oneShot;
    action.timeScale = motion === 'stairs' ? .82 : 1;
    actions.set(motion, action);
  }
  let currentMotion: CharacterMotion | null = null;
  let currentAction: THREE.AnimationAction | null = null;
  const setMotion = (motion: CharacterMotion) => {
    if (motion === currentMotion) return;
    const next = actions.get(motion) ?? actions.get('idle');
    if (!next) return;
    next.reset().fadeIn(.16).play();
    currentAction?.fadeOut(.16);
    currentMotion = motion;
    currentAction = next;
  };
  setMotion('idle');
  return {
    root: container,
    setMotion,
    update: (dt: number) => mixer.update(dt),
  } satisfies GltfCharacterRuntime;
}
