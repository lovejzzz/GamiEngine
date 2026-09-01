'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createParametricSofa } from './parametric-asset-factory';
import {
  createTownhouseBed,
  createVictorianBookcase,
  createVictorianDiningChair,
  createVictorianDiningTable,
  createVictorianFireplace,
  type HeroAssetMaterials,
} from './hero-asset-factory';
import {
  createHumanHeadGeometry,
  createHumanPelvisGeometry,
  createHumanTorsoGeometry,
  createTaperedLimbGeometry,
} from './humanoid-asset-factory';
import {
  createGltfCharacter,
  type CharacterMotion,
  type GltfCharacterRuntime,
} from './gltf-character-factory';
import {
  applyMetricBoxUvs,
  createCalibratedBaseColorMaterial,
  createCalibratedPbrMaterial,
  getMaterialMetersPerTile,
} from './pbr-material-factory';
import { buildingScene } from '@/engine/demo-scene';
import { resolveRuntimeSource } from '@/engine/asset-registry';
import {
  createVisualIntelligenceReport,
  measureVisualFrame,
  type VisualIntelligenceReport,
} from '@/engine/visual-intelligence';
import type { FloorSpec, InteractionProfile, OccupantSpec, PropSpec, RectSpec, Vec2 } from '@/engine/types';
import {
  circleHitsRect,
  interactionScore,
  moveCircleWithSliding,
  pointToDoor,
  pushDoor,
  stairProgress,
  stairTraversalDirection,
  toggleDoorMotor,
  updateDoor,
  type CircleCollider,
  type RuntimeDoor,
} from '@/engine/runtime';

export type CameraMode = 'editor' | 'follow';

type Props = {
  floorIndex: number;
  paused: boolean;
  showPhysics: boolean;
  nightVision: boolean;
  cameraMode: CameraMode;
  cinematic: boolean;
  onFloorChange: (index: number) => void;
  onStatus: (label: string) => void;
  onVisualReport: (report: VisualIntelligenceReport) => void;
};

type Rig = {
  root: THREE.Group;
  visual: THREE.Group;
  torso: THREE.Object3D;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftShin: THREE.Group;
  rightShin: THREE.Group;
  locomotionWeight: number;
  forearmReady: number;
  authored?: GltfCharacterRuntime;
};

type OccupantMemory = {
  position: Vec2;
  facing: number;
  waypointIndex: number;
  waypointDirection: 1 | -1;
};

type FloorMemory = {
  doors: Record<string, number>;
  props: Record<string, string>;
  parts: Record<string, string>;
  offsets: Record<string, Vec2>;
  occupants: Record<string, OccupantMemory>;
};

const keys = new Set<string>();
const memories = new Map<string, FloorMemory>();
let pendingFloorSpawn: { floorId: string; position: Vec2; facing: number } | null = null;
const ppm = buildingScene.world.pixelsPerMeter;
const toMeters = (value: number) => value / ppm;
const toWorld = (point: Vec2) => new THREE.Vector3(
  toMeters(point.x - buildingScene.world.width / 2),
  0,
  toMeters(point.y - buildingScene.world.height / 2),
);

const GAMI_MOOD_GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + time * 0.17) * 43758.5453);
    }
    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      float luma = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 color = mix(vec3(luma), source.rgb, 0.94);
      color = (color - 0.5) * 1.025 + 0.5;
      vec2 centered = (vUv - 0.5) * vec2(1.08, 1.0);
      float vignette = 1.0 - smoothstep(0.19, 0.63, dot(centered, centered));
      color *= mix(0.965, 1.0, vignette);
      color += (hash(gl_FragCoord.xy) - 0.5) * 0.004;
      gl_FragColor = vec4(color, source.a);
    }
  `,
};

function makeMemory(floor: FloorSpec): FloorMemory {
  const existing = memories.get(floor.id);
  if (existing) return existing;
  const memory: FloorMemory = { doors: {}, props: {}, parts: {}, offsets: {}, occupants: {} };
  for (const door of floor.doors) memory.doors[door.id] = door.initialAngle ?? door.closedAngle;
  for (const prop of floor.props) {
    if (prop.interaction) memory.props[prop.id] = prop.interaction.defaultState;
    for (const part of prop.parts ?? []) memory.parts[`${prop.id}:${part.id}`] = part.interaction.defaultState;
  }
  for (const occupant of floor.occupants) {
    memory.occupants[occupant.id] = {
      position: { ...occupant.position },
      facing: occupant.facing,
      waypointIndex: occupant.navigation?.waypoints.length && occupant.navigation.waypoints.length > 1 ? 1 : 0,
      waypointDirection: 1,
    };
  }
  memories.set(floor.id, memory);
  return memory;
}

export function GameCanvas({
  floorIndex,
  paused,
  showPhysics,
  nightVision,
  cameraMode,
  cinematic,
  onFloorChange,
  onStatus,
  onVisualReport,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ paused, showPhysics, nightVision, cameraMode, onFloorChange, onStatus, onVisualReport });
  useEffect(() => {
    stateRef.current = { paused, showPhysics, nightVision, cameraMode, onFloorChange, onStatus, onVisualReport };
  }, [paused, showPhysics, nightVision, cameraMode, onFloorChange, onStatus, onVisualReport]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const floor = buildingScene.floors[floorIndex];
    const memory = makeMemory(floor);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060b10);
    scene.fog = new THREE.FogExp2(0x081016, 0.011);

    const camera = new THREE.PerspectiveCamera(cinematic ? 34 : 38, 1, 0.05, 60);
    camera.position.set(cinematic ? -6.45 : 0.35, cinematic ? 5.75 : 10.1, cinematic ? 8.2 : 7.8);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = cinematic ? 1.07 : 1.04;
    renderer.domElement.className = 'game-canvas';
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', 'Gami Engine 3D 房屋演示。WASD 移动，E 开门，Q 互动，沿楼梯行走自动上下楼。');
    mount.appendChild(renderer.domElement);
    const visualProbeCanvas = document.createElement('canvas');
    visualProbeCanvas.width = 256;
    visualProbeCanvas.height = 144;
    const visualProbeContext = visualProbeCanvas.getContext('2d', { willReadFrequently: true });
    let nextVisualProbeAt = 0;
    const composer = cinematic ? new EffectComposer(renderer) : null;
    let moodGrade: ShaderPass | null = null;
    if (composer) {
      composer.addPass(new RenderPass(scene, camera));
      const gtaoPass = new GTAOPass(scene, camera, 640, 360);
      gtaoPass.updateGtaoMaterial({
        radius: 0.22,
        distanceExponent: 1.6,
        thickness: 0.62,
        distanceFallOff: 0.7,
        scale: 0.68,
        samples: 16,
      });
      gtaoPass.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 2,
        normalPhi: 3,
        radius: 4,
        radiusExponent: 1.5,
        rings: 2,
        samples: 8,
      });
      composer.addPass(gtaoPass);
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(640, 360), 0.1, 0.34, 0.88));
      moodGrade = new ShaderPass(GAMI_MOOD_GRADE);
      composer.addPass(moodGrade);
      composer.addPass(new OutputPass());
    }
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    scene.environmentIntensity = Math.max(buildingScene.styleLock.contract?.environmentIntensity ?? 0.22, 0.27);
    const interactionPrompt = document.createElement('div');
    interactionPrompt.className = 'interaction-prompt';
    interactionPrompt.hidden = true;
    mount.appendChild(interactionPrompt);
    const floorTransition = document.createElement('div');
    floorTransition.className = 'floor-transition';
    floorTransition.innerHTML = '<span>STAIR PORTAL</span><b></b>';
    mount.appendChild(floorTransition);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.target.set(cinematic ? -0.2 : 0, cinematic ? 0.62 : 0.4, cinematic ? -0.08 : 0);

    const textureLoader = new THREE.TextureLoader();
    const textureSource = (id: string) => resolveRuntimeSource(buildingScene.assets, id, 'runtime-texture');
    const makeTexture = (
      source: string,
      repeatX = 1,
      repeatY = 1,
      colorSpace: 'srgb' | 'linear' = 'srgb',
    ) => {
      const texture = textureLoader.load(source);
      texture.colorSpace = colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return texture;
    };
    const material = (
      color: number,
      source?: string | null,
      roughness = 0.72,
      metalness = 0,
      repeatX = 1,
      repeatY = 1,
    ) => new THREE.MeshStandardMaterial({
      color,
      map: source ? makeTexture(source, repeatX, repeatY) : null,
      roughness,
      metalness,
    });
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const wallMaterial = createCalibratedPbrMaterial(textureLoader, buildingScene.assets, {
      baseColorAsset: 'material.plaster.greige.base',
      normalAsset: 'material.plaster.greige.normal',
      roughnessAsset: 'material.plaster.greige.roughness',
      normalScale: .1,
      roughness: .92,
      physical: { clearcoat: .012, clearcoatRoughness: .92 },
    }, maxAnisotropy);
    const brickMaterial = createCalibratedPbrMaterial(textureLoader, buildingScene.assets, {
      baseColorAsset: 'material.brick.soot.base',
      normalAsset: 'material.brick.soot.normal',
      roughnessAsset: 'material.brick.soot.roughness',
      normalScale: .24,
      roughness: .94,
    }, maxAnisotropy);
    const wallCapMaterial = material(0x55514a, undefined, 0.88);
    const wainscotMaterial = createCalibratedPbrMaterial(textureLoader, buildingScene.assets, {
      baseColorAsset: 'material.walnut', normalAsset: 'material.walnut.normal', roughnessAsset: 'material.walnut.roughness', normalScale: .055, roughness: .84,
    }, maxAnisotropy);
    const walnutMaterial = createCalibratedPbrMaterial(textureLoader, buildingScene.assets, {
      baseColorAsset: 'material.walnut', normalAsset: 'material.walnut.normal', roughnessAsset: 'material.walnut.roughness', normalScale: .075, roughness: .74,
      physical: { clearcoat: .018, clearcoatRoughness: .76 },
    }, maxAnisotropy);
    const upholsteryMaterial = createCalibratedBaseColorMaterial(textureLoader, buildingScene.assets, 'material.upholstery.olive', maxAnisotropy, .98);
    const sofaLeatherMaterial = createCalibratedPbrMaterial(textureLoader, buildingScene.assets, {
      baseColorAsset: 'material.leather.olive.base', normalAsset: 'material.leather.olive.normal', roughnessAsset: 'material.leather.olive.roughness', normalScale: .14, roughness: .78,
      physical: { sheen: .22, sheenColor: 0x68725e, sheenRoughness: .82, clearcoat: .02, clearcoatRoughness: .74 },
    }, maxAnisotropy);
    const sofaPipingMaterial = new THREE.LineBasicMaterial({ color: 0x2c2922, transparent: true, opacity: 0.82 });
    const sageMaterial = createCalibratedPbrMaterial(textureLoader, buildingScene.assets, {
      baseColorAsset: 'material.sage-paint', normalAsset: 'material.sage-paint.normal', roughnessAsset: 'material.sage-paint.roughness', normalScale: .045, roughness: .9,
    }, maxAnisotropy);
    const tacticalMaterial = createCalibratedBaseColorMaterial(textureLoader, buildingScene.assets, 'material.tactical-fabric', maxAnisotropy, .95);
    const brassMaterial = material(0x9a7138, undefined, 0.38, 0.68);
    const darkMetalMaterial = material(0x182025, undefined, 0.44, 0.72);
    const fabricMaterial = material(0x7b7064, undefined, 0.98);
    const oxbloodMaterial = material(0x542d2f, undefined, 0.94);
    const curtainMaterial = new THREE.MeshPhysicalMaterial({ color: 0x332927, roughness: 1, sheen: 0.18, sheenColor: new THREE.Color(0x8f654d) });
    const fireMaterial = new THREE.MeshStandardMaterial({ color: 0xffb15c, emissive: 0xff5b1e, emissiveIntensity: 4.6, roughness: 0.7 });
    const porcelainMaterial = material(0xd1cec3, undefined, 0.24);
    const stoneMaterial = createCalibratedBaseColorMaterial(textureLoader, buildingScene.assets, 'floor.concrete', maxAnisotropy, .96);
    const heroMaterials: HeroAssetMaterials = {
      walnut: walnutMaterial,
      leather: sofaLeatherMaterial,
      upholstery: upholsteryMaterial,
      brass: brassMaterial,
      darkMetal: darkMetalMaterial,
      stone: stoneMaterial,
      sage: sageMaterial,
      fabric: fabricMaterial,
      porcelain: porcelainMaterial,
      fire: fireMaterial,
    };
    const worldRoot = new THREE.Group();
    scene.add(worldRoot);
    const propGroups = new Map<string, THREE.Group>();
    const propParts = new Map<string, THREE.Object3D>();
    const partBases = new Map<string, { position: THREE.Vector3; rotationY: number }>();
    const bedDrawers = new Map<string, { object: THREE.Object3D; closedZ: number; openZ: number }>();
    const debugGroup = new THREE.Group();
    worldRoot.add(debugGroup);
    const interactionMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.31, 32),
      new THREE.MeshBasicMaterial({ color: 0x73f6ad, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthTest: false }),
    );
    interactionMarker.rotation.x = -Math.PI / 2;
    interactionMarker.position.y = 0.035;
    interactionMarker.renderOrder = 20;
    interactionMarker.visible = false;
    worldRoot.add(interactionMarker);

    const addBox = (
      parent: THREE.Object3D,
      size: [number, number, number],
      position: [number, number, number],
      boxMaterial: THREE.Material,
      cast = true,
    ) => {
      const geometry = new THREE.BoxGeometry(...size);
      const metersPerTile = getMaterialMetersPerTile(boxMaterial);
      if (metersPerTile) applyMetricBoxUvs(geometry, metersPerTile);
      const mesh = new THREE.Mesh(geometry, boxMaterial);
      mesh.position.set(...position);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const addRoundedBox = (
      parent: THREE.Object3D,
      size: [number, number, number],
      position: [number, number, number],
      boxMaterial: THREE.Material,
      radius = 0.035,
      cast = true,
    ) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 4, Math.min(radius, Math.min(...size) * 0.42)), boxMaterial);
      mesh.position.set(...position);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const addCylinderBetween = (
      parent: THREE.Object3D,
      start: THREE.Vector3,
      end: THREE.Vector3,
      radius: number,
      cylinderMaterial: THREE.Material,
      segments = 14,
    ) => {
      const direction = end.clone().sub(start);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), cylinderMaterial);
      mesh.position.copy(start).add(end).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const createDrapedPanel = (width: number, height: number, side: number) => {
      const geometry = new THREE.PlaneGeometry(width, height, 7, 14);
      const positions = geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const y = positions.getY(index);
        const normalizedY = y / height + .5;
        const gathered = .58 + normalizedY * .42;
        positions.setX(index, x * gathered + side * Math.sin(normalizedY * Math.PI) * .025);
        positions.setZ(index, Math.sin((x / width + .5) * Math.PI * 7) * .028);
      }
      geometry.computeVertexNormals();
      const panel = new THREE.Mesh(geometry, curtainMaterial);
      panel.castShadow = true;
      panel.receiveShadow = true;
      return panel;
    };

    const addColliderOutline = (rect: RectSpec, height = 0.12, color = 0x5df3a5) => {
      const center = toWorld({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
      const geometry = new THREE.BoxGeometry(toMeters(rect.width), height, toMeters(rect.height));
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }),
      );
      edges.position.set(center.x, height / 2 + 0.03, center.z);
      debugGroup.add(edges);
    };

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 13),
      new THREE.MeshBasicMaterial({ color: 0x03070a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.09;
    ground.receiveShadow = false;
    worldRoot.add(ground);

    for (const room of floor.rooms) {
      const center = toWorld({ x: room.x + room.width / 2, y: room.y + room.height / 2 });
      const width = toMeters(room.width);
      const depth = toMeters(room.height);
      const roomMaterial = createCalibratedBaseColorMaterial(
        textureLoader,
        buildingScene.assets,
        room.floorAsset,
        maxAnisotropy,
        room.floorAsset === 'floor.carpet' ? 1 : .76,
      );
      addBox(worldRoot, [width, 0.08, depth], [center.x, -0.04, center.z], roomMaterial, false);
      const edgeMaterial = material(room.floorAsset === 'floor.carpet' ? 0x302c2a : 0x443329, undefined, 0.88);
      addBox(worldRoot, [width, 0.035, 0.045], [center.x, 0.012, center.z - depth / 2 + 0.03], edgeMaterial, false);
    }

    for (const wall of floor.walls) {
      const center = toWorld({ x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 });
      const width = toMeters(wall.width);
      const depth = toMeters(wall.height);
      const isSouthCutaway = wall.id.startsWith('outer-s');
      const isOuterSide = wall.id === 'outer-w' || wall.id === 'outer-e';
      const isInteriorCrossWall = wall.id.includes('-h-');
      const wallHeight = isSouthCutaway ? 0.34 : wall.id === 'outer-n' ? 2.38 : isOuterSide ? 1.78 : isInteriorCrossWall ? 0.72 : 1.96;
      const wallGeometry = new THREE.BoxGeometry(width, wallHeight, depth);
      applyMetricBoxUvs(wallGeometry, wallMaterial.userData.metersPerTile);
      const wallMesh = new THREE.Mesh(
        wallGeometry,
        [wallMaterial, wallMaterial, wallCapMaterial, wallCapMaterial, wallMaterial, wallMaterial],
      );
      wallMesh.position.set(center.x, wallHeight / 2, center.z);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      worldRoot.add(wallMesh);
      if (wall.id === 'outer-n') {
        addBox(worldRoot, [width + 0.05, wallHeight - 0.04, 0.035], [center.x, wallHeight / 2, center.z - depth / 2 - 0.018], brickMaterial);
      }
      if (wall.id === 'outer-w' || wall.id === 'outer-e') {
        const side = wall.id === 'outer-w' ? -1 : 1;
        addBox(worldRoot, [0.035, wallHeight - 0.04, depth + 0.05], [center.x + side * (width / 2 + 0.018), wallHeight / 2, center.z], brickMaterial);
      }
      if (!isSouthCutaway) {
        const wainscotHeight = Math.min(0.68, wallHeight * 0.42);
        addBox(worldRoot, [width + 0.018, wainscotHeight, depth + 0.018], [center.x, wainscotHeight / 2 + 0.01, center.z], wainscotMaterial);
        addBox(worldRoot, [width + 0.035, 0.055, depth + 0.035], [center.x, wainscotHeight + 0.04, center.z], walnutMaterial, false);
        addBox(worldRoot, [width + 0.03, 0.07, depth + 0.03], [center.x, .055, center.z], walnutMaterial, false);
        const horizontal = width >= depth;
        const run = horizontal ? width : depth;
        const panelCount = Math.max(1, Math.floor(run / .58));
        for (let panel = 1; panel < panelCount; panel += 1) {
          const offset = -run / 2 + run * panel / panelCount;
          addBox(
            worldRoot,
            horizontal ? [.026, wainscotHeight * .72, depth + .034] : [width + .034, wainscotHeight * .72, .026],
            horizontal ? [center.x + offset, wainscotHeight * .39, center.z] : [center.x, wainscotHeight * .39, center.z + offset],
            walnutMaterial,
            false,
          );
        }
        addBox(worldRoot, [width + 0.025, 0.055, depth + 0.025], [center.x, wallHeight - 0.1, center.z], wallCapMaterial, false);
      }
      addColliderOutline(wall, wallHeight + 0.07);
    }
    for (const obstacle of floor.obstacles ?? []) addColliderOutline(obstacle, 0.92, 0xe39a62);

    const coolGlassMaterial = new THREE.MeshStandardMaterial({
      color: 0x64819a,
      emissive: 0x244b72,
      emissiveIntensity: 1.55,
      roughness: 0.3,
      metalness: 0.08,
    });
    for (const room of floor.rooms.filter((item) => item.y < 80 && item.width > 175 && item.purpose !== 'storage')) {
      const windowPoint = toWorld({ x: room.x + room.width * 0.52, y: 61 });
      const window = new THREE.Group();
      window.position.set(windowPoint.x, 1.34, windowPoint.z + 0.13);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), coolGlassMaterial);
      pane.receiveShadow = true;
      window.add(pane);
      addBox(window, [1.03, 0.065, 0.065], [0, 0.49, 0.025], darkMetalMaterial, false);
      addBox(window, [1.03, 0.065, 0.065], [0, -0.49, 0.025], darkMetalMaterial, false);
      addBox(window, [0.065, 1.04, 0.065], [-0.5, 0, 0.025], darkMetalMaterial, false);
      addBox(window, [0.065, 1.04, 0.065], [0.5, 0, 0.025], darkMetalMaterial, false);
      addBox(window, [0.045, 0.96, 0.05], [0, 0, 0.04], darkMetalMaterial, false);
      addBox(window, [0.96, 0.045, 0.05], [0, 0, 0.04], darkMetalMaterial, false);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.36, 12), brassMaterial);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, 0.61, 0.1);
      window.add(rod);
      for (const side of [-1, 1]) {
        const curtain = createDrapedPanel(.29, 1.24, side);
        curtain.position.set(side * .58, -.02, .13);
        curtain.rotation.z = side * .035;
        window.add(curtain);
      }
      const radiator = new THREE.Group();
      radiator.position.set(0, -0.76, 0.08);
      for (let rib = -4; rib <= 4; rib += 1) addRoundedBox(radiator, [0.07, 0.32, 0.12], [rib * 0.095, 0, 0], material(0x77746c, undefined, 0.84, 0.12), 0.025, false);
      window.add(radiator);
      worldRoot.add(window);
    }

    const doors: RuntimeDoor[] = floor.doors.map((spec) => ({
      id: spec.id,
      name: spec.name,
      hinge: { ...spec.hinge },
      length: spec.length,
      width: spec.width,
      closedAngle: spec.closedAngle,
      angle: memory.doors[spec.id] ?? spec.closedAngle,
      angularVelocity: 0,
      minAngle: spec.minAngle,
      maxAngle: spec.maxAngle,
      motorTarget: null,
    }));
    const doorGroups = new Map<string, THREE.Group>();
    // Doors are a dominant full-height silhouette. A pale painted slab read as a
    // toy block in the cutaway view; the reference uses dense, aged joinery.
    const doorLeafMaterial = wainscotMaterial;
    for (const door of doors) {
      const hinge = toWorld(door.hinge);
      const group = new THREE.Group();
      group.position.copy(hinge);
      group.rotation.y = -door.angle;
      const length = toMeters(door.length);
      addBox(group, [length, 2.02, 0.105], [length / 2, 1.01, 0], doorLeafMaterial);
      for (const y of [0.56, 1.43]) {
        addBox(group, [length * 0.68, 0.55, 0.035], [length * 0.51, y, 0.07], wainscotMaterial, false);
      }
      addBox(group, [0.045, 0.045, 0.12], [length - 0.13, 1.02, 0], brassMaterial);
      addBox(group, [0.07, 2.08, 0.13], [0, 1.04, 0], wainscotMaterial);
      worldRoot.add(group);
      doorGroups.set(door.id, group);
    }

    const createSofa = (prop: PropSpec) => {
      const width = toMeters(prop.size.x);
      const depth = toMeters(prop.size.y);
      return createParametricSofa(width, depth, {
        leather: sofaLeatherMaterial,
        walnut: walnutMaterial,
        piping: sofaPipingMaterial,
      });
    };

    const createBed = (prop: PropSpec) => {
      const width = toMeters(prop.size.x);
      const depth = toMeters(prop.size.y);
      const group = createTownhouseBed(width, depth, heroMaterials);
      const drawer = addRoundedBox(group, [width * 0.58, 0.18, depth * 0.32], [0, 0.15, depth * 0.23], walnutMaterial, 0.008);
      drawer.visible = false;
      propParts.set(`${prop.id}:searched`, drawer);
      bedDrawers.set(prop.id, { object: drawer, closedZ: drawer.position.z, openZ: drawer.position.z + depth * 0.48 });
      return group;
    };

    const createTable = (prop: PropSpec) => {
      const width = toMeters(prop.size.x);
      const depth = toMeters(prop.size.y);
      const group = createVictorianDiningTable(width, depth, heroMaterials);
      for (const [index, side] of [-1, 1].entries()) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.018, 24), porcelainMaterial);
        plate.position.set(side * width * 0.23, 0.855, index ? .035 : -.055);
        group.add(plate);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.12, 16), new THREE.MeshPhysicalMaterial({ color: 0xa9bfca, transmission: 0.35, transparent: true, opacity: 0.52, roughness: 0.18 }));
        glass.position.set(side * width * (index ? .18 : .27), 0.92, -depth * (index ? .16 : .22));
        group.add(glass);
      }
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.1, 24), brassMaterial);
      bowl.position.set(width * .03, 0.9, depth * .045);
      group.add(bowl);
      const napkin = addRoundedBox(group, [.23, .018, .16], [-width * .08, .872, depth * .2], fabricMaterial, .004, false);
      napkin.rotation.y = -.22;
      const letter = addBox(group, [.2, .008, .13], [width * .12, .866, depth * .2], material(0xc6bca8, undefined, .96), false);
      letter.rotation.y = .16;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(.026, .03, .24, 14), material(0xbeb49d, undefined, .92));
      candle.position.set(-width * .04, 1.0, -depth * .16);
      group.add(candle);
      return group;
    };

    const createChair = (prop: PropSpec) => {
      const width = toMeters(prop.size.x);
      const depth = toMeters(prop.size.y);
      return createVictorianDiningChair(width, depth, heroMaterials);
    };

    const createStairs = (prop: PropSpec) => {
      const group = new THREE.Group();
      const width = toMeters(prop.size.x);
      const depth = toMeters(prop.size.y);
      const steps = 12;
      const rise = floor.stairs.rise;
      for (let index = 0; index < steps; index += 1) {
        const stepDepth = depth / steps;
        const height = 0.055 + (index + 1) / steps * rise;
        const z = depth / 2 - stepDepth * (index + 0.5);
        addBox(group, [width, height, stepDepth * 0.98], [0, height / 2, z], walnutMaterial);
        addBox(group, [width * 0.48, 0.018, stepDepth * 0.72], [0, height + 0.012, z], oxbloodMaterial, false);
      }
      const postHeight = 0.58;
      const stepDepth = depth / steps;
      for (const side of [-1, 1]) {
        for (let index = 0; index < steps; index += 2) {
          const stairHeight = 0.055 + (index + 1) / steps * rise;
          const z = depth / 2 - stepDepth * (index + 0.5);
          const baluster = new THREE.Mesh(new THREE.CylinderGeometry(.018, .024, postHeight, 12), wainscotMaterial);
          baluster.position.set(side * width * .47, stairHeight + postHeight / 2, z);
          baluster.castShadow = true;
          group.add(baluster);
        }
        const lower = new THREE.Vector3(side * width * .47, .055 + rise / steps + postHeight, depth / 2 - stepDepth * .5);
        const upper = new THREE.Vector3(side * width * .47, rise + postHeight, -depth / 2 + stepDepth * .5);
        addCylinderBetween(group, lower, upper, .038, wainscotMaterial, 16);
        for (const index of [0, 11]) {
          const stairHeight = .055 + (index + 1) / steps * rise;
          const z = depth / 2 - stepDepth * (index + .5);
          const newel = new THREE.Mesh(new THREE.CylinderGeometry(.042, .052, postHeight + .18, 14), wainscotMaterial);
          newel.position.set(side * width * .47, stairHeight + (postHeight + .18) / 2, z);
          group.add(newel);
          const finial = new THREE.Mesh(new THREE.SphereGeometry(.065, 14, 10), brassMaterial);
          finial.position.set(side * width * .47, stairHeight + postHeight + .2, z);
          group.add(finial);
        }
      }
      addBox(group, [width + 0.1, 0.12, 0.12], [0, rise + 0.08, -depth / 2 + 0.04], wainscotMaterial);
      return group;
    };

    const createKitchen = (prop: PropSpec) => {
      const group = new THREE.Group();
      const width = toMeters(prop.size.x);
      const depth = toMeters(prop.size.y);
      const addCabinetPanel = (parent: THREE.Object3D, panelWidth: number, panelHeight: number, x: number, y: number, z: number) => {
        addRoundedBox(parent, [panelWidth, panelHeight, .035], [x, y, z], sageMaterial, .004);
        const rail = Math.min(panelWidth, panelHeight) * .1;
        addBox(parent, [panelWidth * .82, rail, .025], [x, y + panelHeight * .37, z + .027], sageMaterial, false);
        addBox(parent, [panelWidth * .82, rail, .025], [x, y - panelHeight * .37, z + .027], sageMaterial, false);
        addBox(parent, [rail, panelHeight * .68, .025], [x - panelWidth * .36, y, z + .027], sageMaterial, false);
        addBox(parent, [rail, panelHeight * .68, .025], [x + panelWidth * .36, y, z + .027], sageMaterial, false);
      };
      addBox(group, [width * 0.92, 0.88, depth * 0.3], [0.05, 0.44, -depth * 0.34], sageMaterial);
      addBox(group, [width * 0.28, 0.88, depth * 0.75], [-width * 0.34, 0.44, depth * 0.04], sageMaterial);
      addBox(group, [width * .96, .11, depth * .34], [.02, .93, -depth * .34], stoneMaterial);
      addBox(group, [width * .32, .11, depth * .78], [-width * .34, .93, depth * .04], stoneMaterial);
      addBox(group, [width * .96, .1, depth * .32], [.02, .05, -depth * .34], sageMaterial);
      addBox(group, [width * .3, .1, depth * .76], [-width * .34, .05, depth * .04], sageMaterial);
      const tileMaterial = material(0xc8bca8, undefined, 0.7);
      addBox(group, [width * 0.88, 0.55, 0.035], [width * 0.04, 1.28, -depth * 0.5], tileMaterial, false);
      for (let seam = -4; seam <= 4; seam += 1) addBox(group, [0.012, 0.52, 0.012], [seam * width * 0.1, 1.28, -depth * 0.515], darkMetalMaterial, false);
      for (let seam = -1; seam <= 1; seam += 1) addBox(group, [width * 0.86, 0.012, 0.012], [width * 0.04, 1.28 + seam * 0.18, -depth * 0.515], darkMetalMaterial, false);
      for (const x of [-0.28, 0.12, 0.34]) {
        addRoundedBox(group, [width * 0.2, 0.56, 0.25], [width * x, 1.57, -depth * 0.39], sageMaterial, 0.005);
        addCabinetPanel(group, width * .16, .46, width * x, 1.57, -depth * .248);
        addBox(group, [0.025, 0.25, 0.04], [width * x + width * 0.07, 1.57, -depth * 0.245], brassMaterial, false);
      }
      addBox(group, [width * .9, .07, depth * .3], [width * .04, 1.9, -depth * .39], sageMaterial);
      addBox(group, [width * .94, .05, depth * .34], [width * .04, 1.95, -depth * .39], sageMaterial);
      const sink = new THREE.Mesh(new THREE.BoxGeometry(width * 0.25, 0.055, depth * 0.19), darkMetalMaterial);
      sink.position.set(width * 0.05, 0.995, -depth * 0.34);
      group.add(sink);
      const faucet = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 10, 20, Math.PI), brassMaterial);
      faucet.rotation.x = Math.PI / 2;
      faucet.position.set(width * 0.05, 1.13, -depth * 0.41);
      group.add(faucet);
      for (const x of [width * 0.25, width * 0.36]) for (const z of [-depth * 0.39, -depth * 0.28]) {
        const burner = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 20), darkMetalMaterial);
        burner.rotation.x = Math.PI / 2;
        burner.position.set(x, 0.995, z);
        group.add(burner);
      }
      for (let panel = -2; panel <= 2; panel += 1) addCabinetPanel(group, width * .15, .52, panel * width * .17, .49, -depth * .505);
      for (const part of prop.parts ?? []) {
        const local = new THREE.Vector3(
          toMeters(part.position.x - prop.position.x),
          0,
          toMeters(part.position.y - prop.position.y),
        );
        const id = `${prop.id}:${part.id}`;
        if (part.interaction.motion === 'hinge') {
          const hinge = new THREE.Group();
          hinge.position.set(local.x, 0.48, local.z);
          addRoundedBox(hinge, [0.34, 0.58, 0.055], [0.17, 0, 0], sageMaterial, 0.004);
          addCabinetPanel(hinge, .26, .46, .17, 0, .035);
          addBox(hinge, [0.035, 0.035, 0.075], [0.29, 0, 0.02], brassMaterial);
          group.add(hinge);
          propParts.set(id, hinge);
          partBases.set(id, { position: hinge.position.clone(), rotationY: hinge.rotation.y });
        } else {
          const drawer = new THREE.Group();
          drawer.position.set(local.x, 0.56, local.z);
          addBox(drawer, [0.42, 0.18, 0.5], [0, 0, 0.22], walnutMaterial);
          addBox(drawer, [0.46, 0.22, 0.06], [0, 0, 0.5], sageMaterial);
          group.add(drawer);
          propParts.set(id, drawer);
          partBases.set(id, { position: drawer.position.clone(), rotationY: drawer.rotation.y });
        }
      }
      return group;
    };

    for (const prop of floor.props) {
      let group: THREE.Group;
      if (prop.asset === 'prop.sofa') group = createSofa(prop);
      else if (prop.asset === 'prop.bed') group = createBed(prop);
      else if (prop.asset === 'prop.kitchen') group = createKitchen(prop);
      else if (prop.asset === 'prop.table') group = createTable(prop);
      else if (prop.asset === 'prop.chair') group = createChair(prop);
      else if (prop.asset === 'prop.stairs') group = createStairs(prop);
      else group = new THREE.Group();
      const position = toWorld(prop.position);
      const offset = memory.offsets[prop.id] ?? { x: 0, y: 0 };
      group.position.set(position.x + toMeters(offset.x), 0, position.z + toMeters(offset.y));
      group.rotation.y = -(prop.rotation ?? 0);
      worldRoot.add(group);
      propGroups.set(prop.id, group);
      if (prop.collider) {
        addColliderOutline({
          id: prop.id,
          x: prop.position.x - prop.collider.width / 2,
          y: prop.position.y - prop.collider.height / 2,
          width: prop.collider.width,
          height: prop.collider.height,
        }, 0.95, 0xf0c66e);
      }
    }

    const propColliderRects = (blockingOnly = true): RectSpec[] => floor.props.flatMap((prop) => {
      if (!prop.collider || (blockingOnly && prop.collider.blocksMovement === false)) return [];
      const offset = memory.offsets[prop.id] ?? { x: 0, y: 0 };
      return [{
        id: prop.id,
        x: prop.position.x + offset.x - prop.collider.width / 2,
        y: prop.position.y + offset.y - prop.collider.height / 2,
        width: prop.collider.width,
        height: prop.collider.height,
      }];
    });

    // Re-apply engine-owned save state after a streamed floor rebuild. Generated
    // reference images never carry interaction state themselves.
    for (const prop of floor.props) {
      const propState = prop.interaction
        ? memory.props[prop.id] ?? prop.interaction.defaultState
        : undefined;
      const bedDrawer = propParts.get(`${prop.id}:searched`);
      if (bedDrawer) {
        bedDrawer.visible = propState === 'searched';
        const binding = bedDrawers.get(prop.id);
        if (binding) bedDrawer.position.z = propState === 'searched' ? binding.openZ : binding.closedZ;
      }
      for (const partSpec of prop.parts ?? []) {
        const id = `${prop.id}:${partSpec.id}`;
        const object = propParts.get(id);
        if (!object) continue;
        const state = memory.parts[id] ?? partSpec.interaction.defaultState;
        const base = partBases.get(id);
        if (!base) continue;
        if (partSpec.interaction.motion === 'hinge') object.rotation.y = base.rotationY + (state === 'open' ? -1.08 : 0);
        if (partSpec.interaction.motion === 'translate') object.position.z = base.position.z + (state === 'open' ? 0.46 : 0);
      }
    }

    const addRoomDetails = () => {
      const rugTexture = textureLoader.load(textureSource('prop.rug.oxblood')!);
      rugTexture.colorSpace = THREE.SRGBColorSpace;
      rugTexture.wrapS = THREE.ClampToEdgeWrapping;
      rugTexture.wrapT = THREE.ClampToEdgeWrapping;
      rugTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const rugSurface = new THREE.MeshStandardMaterial({ map: rugTexture, color: 0xc4a59a, transparent: true, alphaTest: 0.035, roughness: 1, side: THREE.DoubleSide });
      const addRug = (x: number, z: number, width: number, depth: number) => {
        const rug = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), rugSurface);
        rug.rotation.x = -Math.PI / 2;
        rug.position.set(x, 0.016, z);
        rug.receiveShadow = true;
        worldRoot.add(rug);
      };
      const addWallArt = (x: number, z: number, width = 0.6, color = 0x634542) => {
        addBox(worldRoot, [width + 0.08, 0.58, 0.045], [x, 0.98, z], wainscotMaterial, false);
        addBox(worldRoot, [width, 0.48, 0.025], [x, 0.98, z + 0.035], material(color, undefined, 0.82), false);
      };
      const addTableLamp = (x: number, z: number) => {
        const sideTable = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(.25, .27, .055, 24), walnutMaterial);
        top.position.y = .52;
        sideTable.add(top);
        for (const [legIndex, offset] of [[0, -.13], [1, .13]] as const) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(.025, .036, .48, 12), walnutMaterial);
          leg.position.set(offset, .25, legIndex ? -.08 : .08);
          leg.rotation.z = offset * .08;
          sideTable.add(leg);
        }
        sideTable.position.set(x, 0, z);
        worldRoot.add(sideTable);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 0.2, 20), brassMaterial);
        base.position.set(x, 0.65, z);
        base.castShadow = true;
        worldRoot.add(base);
        addCylinderBetween(worldRoot, new THREE.Vector3(x, .72, z), new THREE.Vector3(x, .89, z), .018, brassMaterial, 12);
        const shade = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.22, 0.25, 20, 1, true),
          new THREE.MeshStandardMaterial({ color: 0xb79b73, emissive: 0x8a4e20, emissiveIntensity: 0.58, roughness: 0.86, side: THREE.DoubleSide }),
        );
        shade.position.set(x, 1.0, z);
        worldRoot.add(shade);
      };
      const addBookcase = (x: number, z: number, rotationY = 0, width = 0.92) => {
        const group = createVictorianBookcase(width, 1.52, .3, heroMaterials);
        group.position.set(x, 0, z);
        group.rotation.y = rotationY;
        worldRoot.add(group);
      };
      const addPlant = (x: number, z: number) => {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.14, 0.32, 18), material(0x584133, undefined, 0.92));
        pot.position.set(x, 0.16, z);
        worldRoot.add(pot);
        for (let leaf = 0; leaf < 8; leaf += 1) {
          const blade = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), material(0x314d34 + (leaf % 2) * 0x081108, undefined, 0.96));
          const angle = leaf / 8 * Math.PI * 2;
          blade.scale.set(0.58, 1.75, 0.35);
          blade.rotation.z = Math.sin(angle) * 0.65;
          blade.position.set(x + Math.cos(angle) * 0.16, 0.45 + (leaf % 3) * 0.08, z + Math.sin(angle) * 0.16);
          worldRoot.add(blade);
        }
      };
      const addBookStack = (x: number, z: number, rotation = 0) => {
        const colors = [0x4f302b, 0x2d4640, 0x74603c];
        for (let book = 0; book < 3; book += 1) {
          const mesh = addRoundedBox(worldRoot, [.24 - book * .018, .035, .16 + book * .012], [x, .03 + book * .037, z], material(colors[book], undefined, .94), .002, false);
          mesh.rotation.y = rotation + (book - 1) * .07;
        }
      };
      const addShoesAndUmbrella = (x: number, z: number) => {
        for (const [index, offset] of [-.1, .1].entries()) {
          const shoe = new THREE.Mesh(new THREE.SphereGeometry(.1, 14, 8), material(0x30251f, undefined, .8));
          shoe.scale.set(.62, .34, 1.22);
          shoe.position.set(x + offset, .05, z + (index ? .025 : -.03));
          shoe.rotation.y = (index ? -.12 : .08);
          worldRoot.add(shoe);
        }
        addCylinderBetween(worldRoot, new THREE.Vector3(x + .3, .04, z), new THREE.Vector3(x + .31, .88, z + .02), .014, darkMetalMaterial, 10);
        const handle = new THREE.Mesh(new THREE.TorusGeometry(.055, .012, 8, 14, Math.PI), brassMaterial);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(x + .255, .89, z + .02);
        worldRoot.add(handle);
      };
      const addLoosePapers = (x: number, z: number, rotation = 0) => {
        for (let paper = 0; paper < 3; paper += 1) {
          const page = addBox(worldRoot, [.2, .006, .15], [x + paper * .035, .012 + paper * .003, z - paper * .025], material(0xbeb5a4 - paper * 0x080604, undefined, .98), false);
          page.rotation.y = rotation + paper * .09;
        }
      };
      const addFireplace = () => {
        const point = toWorld({ x: 556, y: 87 });
        const group = createVictorianFireplace(1.12, 1.18, .28, heroMaterials);
        group.position.set(point.x, 0, point.z);
        worldRoot.add(group);
      };
      for (const room of floor.rooms) {
        const center = toWorld({ x: room.x + room.width / 2, y: room.y + room.height / 2 });
        const width = toMeters(room.width);
        const depth = toMeters(room.height);
        if (room.purpose === 'utility') {
          const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.35, 24), darkMetalMaterial);
          boiler.position.set(center.x - width * 0.25, 0.68, center.z - depth * 0.18);
          boiler.castShadow = true;
          worldRoot.add(boiler);
          for (const offset of [-0.18, 0.18]) addBox(worldRoot, [0.08, 1.42, 0.08], [center.x + offset, 0.72, center.z - depth * 0.42], darkMetalMaterial);
        }
        if (room.purpose === 'storage') {
          for (let index = -1; index <= 1; index += 1) {
            addBox(worldRoot, [0.55, 0.52 + (index + 1) * 0.08, 0.55], [center.x + index * 0.72, 0.28, center.z - depth * 0.26], walnutMaterial);
          }
        }
        if (room.purpose === 'bathroom') {
          const tub = addRoundedBox(worldRoot, [width * .6, .48, .76], [center.x - width * .08, .24, center.z - depth * .27], porcelainMaterial, .055);
          tub.name = 'bathroom-rolltop-bath';
          addRoundedBox(worldRoot, [width * .49, .07, .58], [center.x - width * .08, .475, center.z - depth * .27], material(0x566a72, undefined, .38), .035, false);
          for (const x of [-1, 1]) for (const z of [-1, 1]) {
            const foot = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8), brassMaterial);
            foot.scale.set(.8, .7, 1.1);
            foot.position.set(center.x - width * .08 + x * width * .23, .04, center.z - depth * .27 + z * .27);
            worldRoot.add(foot);
          }
          const pedestalProfile = [
            new THREE.Vector2(.13, 0), new THREE.Vector2(.15, .06), new THREE.Vector2(.09, .16),
            new THREE.Vector2(.075, .42), new THREE.Vector2(.13, .55), new THREE.Vector2(.18, .6),
          ];
          const pedestal = new THREE.Mesh(new THREE.LatheGeometry(pedestalProfile, 24), porcelainMaterial);
          pedestal.position.set(center.x + width * .27, 0, center.z + depth * .24);
          pedestal.castShadow = true;
          worldRoot.add(pedestal);
          const basin = new THREE.Mesh(new THREE.CylinderGeometry(.23, .16, .1, 28), porcelainMaterial);
          basin.position.set(center.x + width * .27, .63, center.z + depth * .24);
          worldRoot.add(basin);
          const basinWell = new THREE.Mesh(new THREE.CylinderGeometry(.17, .14, .018, 28), material(0x76868a, undefined, .42));
          basinWell.position.set(center.x + width * .27, .685, center.z + depth * .24);
          worldRoot.add(basinWell);
          addBox(worldRoot, [0.7, 0.64, 0.025], [center.x + width * 0.26, 1.02, center.z - depth * 0.5 + 0.16], darkMetalMaterial, false);
        }
        if (room.purpose === 'nursery') {
          const cribX = center.x - width * 0.28;
          const cribZ = center.z - depth * .03;
          addRoundedBox(worldRoot, [.92, .12, 1.28], [cribX, .34, cribZ], fabricMaterial, .028);
          for (const x of [-.5, .5]) for (const z of [-.7, .7]) {
            addCylinderBetween(worldRoot, new THREE.Vector3(cribX + x, .03, cribZ + z), new THREE.Vector3(cribX + x, .93, cribZ + z), .03, walnutMaterial, 14);
            const finial = new THREE.Mesh(new THREE.SphereGeometry(.052, 12, 9), brassMaterial);
            finial.position.set(cribX + x, .97, cribZ + z);
            worldRoot.add(finial);
          }
          for (const x of [-.5, .5]) {
            addCylinderBetween(worldRoot, new THREE.Vector3(cribX + x, .78, cribZ - .7), new THREE.Vector3(cribX + x, .78, cribZ + .7), .025, walnutMaterial, 12);
            for (let spindle = -5; spindle <= 5; spindle += 1) {
              const z = cribZ + spindle * .115;
              addCylinderBetween(worldRoot, new THREE.Vector3(cribX + x, .39, z), new THREE.Vector3(cribX + x, .77, z), .012, walnutMaterial, 10);
            }
          }
          for (const z of [-.7, .7]) {
            addCylinderBetween(worldRoot, new THREE.Vector3(cribX - .5, .78, cribZ + z), new THREE.Vector3(cribX + .5, .78, cribZ + z), .026, walnutMaterial, 12);
            for (let spindle = -3; spindle <= 3; spindle += 1) {
              const x = cribX + spindle * .13;
              addCylinderBetween(worldRoot, new THREE.Vector3(x, .39, cribZ + z), new THREE.Vector3(x, .77, cribZ + z), .012, walnutMaterial, 10);
            }
          }
          for (let index = 0; index < 5; index += 1) {
            addBox(worldRoot, [0.16, 0.16, 0.16], [center.x + 0.45 + (index % 2) * 0.2, 0.08, center.z + (index - 2) * 0.14], material([0xc16f62, 0x7095a0, 0xd1ab5b][index % 3], undefined, 0.8));
          }
        }
        if (room.purpose === 'entry') {
          addRug(center.x, center.z + depth * 0.18, width * 0.55, depth * 0.35);
          addWallArt(center.x, center.z - depth / 2 + 0.18, 0.54, 0x4b5b51);
          addRoundedBox(worldRoot, [width * 0.68, 0.72, 0.28], [center.x, 0.36, center.z - depth * 0.38], walnutMaterial, 0.025);
          for (const hook of [-0.28, 0, 0.28]) addBox(worldRoot, [0.025, 0.38, 0.025], [center.x + hook, 1.12, center.z - depth * 0.43], brassMaterial, false);
          addShoesAndUmbrella(center.x - width * .25, center.z + depth * .31);
        }
        if (room.purpose === 'living') {
          addRug(center.x + width * 0.05, center.z + depth * 0.18, width * 0.64, depth * 0.42);
          addWallArt(center.x + width * 0.22, center.z - depth / 2 + 0.18, 0.74, 0x6c5140);
          addTableLamp(center.x + width * 0.38, center.z - depth * 0.22);
          if (floor.id === 'f1') {
            addFireplace();
            addBookcase(center.x - width * 0.37, center.z + depth * 0.35, Math.PI / 2, 0.82);
            addPlant(center.x + width * 0.38, center.z + depth * 0.28);
            addBookStack(center.x - width * .14, center.z + depth * .32, -.15);
          }
        }
        if (room.purpose === 'bedroom') {
          addRug(center.x, center.z + depth * 0.22, width * 0.58, depth * 0.32);
          addWallArt(center.x + width * 0.28, center.z - depth / 2 + 0.18, 0.5, 0x475764);
          addTableLamp(center.x + width * 0.34, center.z - depth * 0.16);
        }
        if (room.purpose === 'dining') {
          addRug(center.x + width * 0.08, center.z, width * 0.62, depth * 0.62);
          addWallArt(center.x + width * 0.28, center.z - depth / 2 + 0.18, 0.68, 0x66533f);
          addBookcase(center.x + width * 0.43, center.z - depth * 0.3, Math.PI / 2, 0.72);
          addLoosePapers(center.x - width * .3, center.z + depth * .34, .22);
        }
        if (room.purpose === 'studio') {
          addRug(center.x - width * 0.12, center.z, width * 0.48, depth * 0.38);
          addWallArt(center.x + width * 0.25, center.z - depth / 2 + 0.18, 0.82, 0x5b493b);
        }
      }
    };
    addRoomDetails();

    let effectDisposed = false;
    let authoredCharacterCount = 0;
    let authoredCharacterFailed = false;

    const makeRig = (kind: 'operator' | 'resident', tint = 0x7a756c, styleIndex = 0): Rig => {
      const root = new THREE.Group();
      const visual = new THREE.Group();
      root.add(visual);
      const residentCloth = new THREE.MeshPhysicalMaterial({
        color: tint,
        roughness: .92,
        sheen: .16,
        sheenColor: new THREE.Color(0x857365),
        sheenRoughness: .9,
      });
      const cloth = kind === 'operator' ? tacticalMaterial : residentCloth;
      const trouserColors = [0x3f4745, 0x4b403a, 0x343b43, 0x514b43];
      const trouser = kind === 'operator' ? tacticalMaterial : material(trouserColors[styleIndex % trouserColors.length], undefined, 0.96);
      const skinColors = [0xaa8569, 0x8d674f, 0xbe9272, 0x76503e];
      const skin = material(skinColors[styleIndex % skinColors.length], undefined, 0.82);
      const torso = new THREE.Mesh(createHumanTorsoGeometry(kind), cloth);
      torso.position.y = 1.22;
      visual.add(torso);
      const pelvis = new THREE.Mesh(createHumanPelvisGeometry(kind), trouser);
      pelvis.position.y = .86;
      visual.add(pelvis);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.074, 0.11, 14), skin);
      neck.position.y = 1.56;
      visual.add(neck);
      const head = new THREE.Mesh(createHumanHeadGeometry(), skin);
      head.position.y = 1.69;
      visual.add(head);
      const hairColors = [0x2f2823, 0x181715, 0x554034, 0x302c29];
      const hairMaterial = material(kind === 'operator' ? 0x202724 : hairColors[styleIndex % hairColors.length], undefined, 0.98);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.116, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.54), hairMaterial);
      hair.scale.set(1, .78, 1.02);
      hair.position.y = 1.78;
      visual.add(hair);
      if (kind === 'resident') {
        const fringe = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8), hairMaterial);
        fringe.scale.set(1.35, .55, .5);
        fringe.position.set(styleIndex % 2 ? .05 : -.05, 1.765, .085);
        fringe.rotation.z = styleIndex % 2 ? -.25 : .25;
        visual.add(fringe);
      }
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(.019, 10, 7), skin);
        ear.scale.set(.55, 1.15, .7);
        ear.position.set(side * .108, 1.69, 0);
        visual.add(ear);
      }
      const nose = new THREE.Mesh(new THREE.ConeGeometry(.022, .055, 8), skin);
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 1.69, .115);
      visual.add(nose);

      const createJointedLimb = (
        x: number,
        y: number,
        limbMaterial: THREE.Material,
        upperLength: number,
        lowerLength: number,
        radius: number,
      ) => {
        const upper = new THREE.Group();
        upper.position.set(x, y, 0);
        const upperMesh = new THREE.Mesh(createTaperedLimbGeometry(upperLength, radius, radius * .78), limbMaterial);
        upper.add(upperMesh);
        const lower = new THREE.Group();
        lower.position.y = -upperLength;
        const lowerMesh = new THREE.Mesh(createTaperedLimbGeometry(lowerLength, radius * .82, radius * .62), limbMaterial);
        lower.add(lowerMesh);
        upper.add(lower);
        visual.add(upper);
        return { upper, lower };
      };
      const leftArmRig = createJointedLimb(-0.225, 1.43, cloth, 0.31, 0.285, 0.06);
      const rightArmRig = createJointedLimb(0.225, 1.43, cloth, 0.31, 0.285, 0.06);
      const leftLegRig = createJointedLimb(-0.09, 0.82, trouser, 0.37, 0.39, 0.076);
      const rightLegRig = createJointedLimb(0.09, 0.82, trouser, 0.37, 0.39, 0.076);
      for (const [side, arm] of [[-1, leftArmRig], [1, rightArmRig]] as const) {
        const hand = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 9), skin);
        hand.scale.set(.68, 1.15, .58);
        hand.position.set(0, -.315, .006);
        arm.lower.add(hand);
        arm.upper.rotation.z = side * (kind === 'operator' ? -.26 : -.035);
      }
      for (const leg of [leftLegRig, rightLegRig]) {
        const shoe = new THREE.Mesh(new THREE.SphereGeometry(.09, 14, 9), kind === 'operator' ? darkMetalMaterial : material(0x3a2b22, undefined, .72));
        shoe.scale.set(.82, .52, 1.45);
        shoe.position.set(0, -.405, .075);
        leg.lower.add(shoe);
      }
      if (kind === 'resident') {
        const shirtColors = [0xb8b0a1, 0x8d9a91, 0x9d8577, 0x7c8d94];
        const shirt = material(shirtColors[styleIndex % shirtColors.length], undefined, .94);
        for (const side of [-1, 1]) {
          const lapel = new THREE.Mesh(new THREE.PlaneGeometry(.105, .22), shirt);
          lapel.position.set(side * .052, 1.39, .132);
          lapel.rotation.z = side * .33;
          visual.add(lapel);
        }
        for (let button = 0; button < 3; button += 1) {
          const buttonMesh = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, .008, 10), brassMaterial);
          buttonMesh.rotation.x = Math.PI / 2;
          buttonMesh.position.set(0, 1.29 - button * .105, .137);
          visual.add(buttonMesh);
        }
      }
      if (kind === 'operator') {
        addRoundedBox(visual, [.34, .36, .065], [0, 1.23, .165], tacticalMaterial, .008);
        addRoundedBox(visual, [.28, .34, .09], [0, 1.22, -.16], tacticalMaterial, .012);
        for (const side of [-1, 1]) addBox(visual, [.045, .46, .035], [side * .14, 1.3, .17], darkMetalMaterial, false);
        for (let pouch = -1; pouch <= 1; pouch += 1) addRoundedBox(visual, [.095, .105, .055], [pouch * .105, 1.05, .215], tacticalMaterial, .006);
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.132, 22, 11, 0, Math.PI * 2, 0, Math.PI * 0.6), tacticalMaterial);
        helmet.scale.set(1, .72, 1.05);
        helmet.position.set(0, 1.79, 0);
        visual.add(helmet);
        addRoundedBox(visual, [.055, .035, .075], [0, 1.86, .015], darkMetalMaterial, .004);
        const rifle = new THREE.Group();
        addRoundedBox(rifle, [.075, .32, .075], [0, 0, 0], darkMetalMaterial, .008);
        addRoundedBox(rifle, [.095, .18, .085], [0, -.22, 0], tacticalMaterial, .01);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .39, 10), darkMetalMaterial);
        barrel.position.y = .35;
        rifle.add(barrel);
        addRoundedBox(rifle, [.04, .07, .035], [0, .08, .055], darkMetalMaterial, .004);
        rifle.position.set(.11, 1.18, .245);
        rifle.rotation.z = -.48;
        rifle.rotation.x = -.16;
        visual.add(rifle);
      }
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      return {
        root,
        visual,
        torso,
        leftArm: leftArmRig.upper,
        rightArm: rightArmRig.upper,
        leftForearm: leftArmRig.lower,
        rightForearm: rightArmRig.lower,
        leftLeg: leftLegRig.upper,
        rightLeg: rightLegRig.upper,
        leftShin: leftLegRig.lower,
        rightShin: rightLegRig.lower,
        locomotionWeight: 0,
        forearmReady: kind === 'operator' ? .58 : 0,
      };
    };

    const hydrateRig = (rig: Rig, kind: 'operator' | 'resident', tint: number, styleIndex = 0) => {
      const characterAsset = buildingScene.assets.find((asset) => asset.id === `character.${kind}`);
      const bodySource = resolveRuntimeSource(buildingScene.assets, characterAsset?.id ?? '', 'runtime-model');
      const animationSource = resolveRuntimeSource(buildingScene.assets, characterAsset?.animation?.clipAsset ?? '', 'runtime-model');
      const albedoSource = resolveRuntimeSource(buildingScene.assets, characterAsset?.pbr?.baseColorAsset ?? '', 'runtime-texture');
      if (!bodySource || !animationSource || !albedoSource) {
        authoredCharacterFailed = true;
        return;
      }
      void createGltfCharacter(kind, tint, styleIndex, bodySource, animationSource, albedoSource).then((authored) => {
        if (effectDisposed) return;
        rig.authored = authored;
        rig.root.add(authored.root);
        rig.visual.visible = false;
        authoredCharacterCount += 1;
      }).catch((error: unknown) => {
        authoredCharacterFailed = true;
        console.warn('Gami authored character failed; keeping procedural fallback.', error);
      });
    };

    const playerRig = makeRig('operator');
    hydrateRig(playerRig, 'operator', 0x53635b);
    const arrival = pendingFloorSpawn?.floorId === floor.id ? pendingFloorSpawn : null;
    const player = {
      ...(arrival?.position ?? floor.spawn),
      radius: 15,
      moving: false,
      facing: arrival?.facing ?? Math.PI,
    };
    if (arrival) pendingFloorSpawn = null;
    playerRig.root.position.copy(toWorld(player));
    worldRoot.add(playerRig.root);
    type ResidentRuntime = {
      rig: Rig;
      spec: OccupantSpec;
      state: OccupantMemory;
      phase: number;
      moving: boolean;
      colliderOutline?: THREE.LineLoop;
    };
    const residentRigs: ResidentRuntime[] = [];
    floor.occupants.forEach((occupant, index) => {
      const palette = [0x77766e, 0x66747b, 0x7b665d, 0x59665c];
      const rig = makeRig('resident', palette[index % palette.length], index);
      hydrateRig(rig, 'resident', palette[index % palette.length], index);
      const actorState = memory.occupants[occupant.id];
      rig.root.position.copy(toWorld(actorState.position));
      rig.root.rotation.y = actorState.facing;
      if (occupant.behavior === 'sleeping') {
        rig.root.rotation.x = -Math.PI / 2;
        rig.root.position.y = 0.76;
        rig.leftArm.rotation.z = -0.22;
        rig.rightArm.rotation.z = 0.22;
      }
      if (occupant.behavior === 'hiding') {
        rig.root.scale.setScalar(0.86);
        rig.visual.position.y = -0.18;
        rig.leftLeg.rotation.x = -0.7;
        rig.rightLeg.rotation.x = -0.7;
        rig.leftShin.rotation.x = 1.1;
        rig.rightShin.rotation.x = 1.1;
      }
      worldRoot.add(rig.root);
      let colliderOutline: THREE.LineLoop | undefined;
      if (occupant.collider) {
        const radius = toMeters(occupant.collider.radius);
        const points = Array.from({ length: 32 }, (_, pointIndex) => {
          const angle = pointIndex / 32 * Math.PI * 2;
          return new THREE.Vector3(Math.cos(angle) * radius, 0.055, Math.sin(angle) * radius);
        });
        colliderOutline = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: 0xff8a72, transparent: true, opacity: 0.85 }),
        );
        colliderOutline.position.copy(toWorld(actorState.position));
        debugGroup.add(colliderOutline);
      }
      residentRigs.push({ rig, spec: occupant, state: actorState, phase: index * 1.7, moving: false, colliderOutline });
    });

    const ambient = new THREE.AmbientLight(0x788087, cinematic ? 0.2 : 0.24);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0x8295a7, 0x241915, cinematic ? 0.34 : 0.4);
    scene.add(hemi);
    const moon = new THREE.DirectionalLight(0x94b2ce, cinematic ? .94 : 1.08);
    moon.position.set(-6, 8, 4);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -8;
    moon.shadow.camera.right = 8;
    moon.shadow.camera.top = 7;
    moon.shadow.camera.bottom = -7;
    scene.add(moon);
    const flashlightTarget = new THREE.Object3D();
    const flashlight = new THREE.SpotLight(0xe0ddd2, 5.6, 7.8, 0.31, 0.88, 1.9);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(1024, 1024);
    flashlight.shadow.camera.near = 0.2;
    flashlight.shadow.camera.far = 10;
    flashlight.shadow.radius = 3;
    flashlight.target = flashlightTarget;
    scene.add(flashlight, flashlightTarget);
    let shadowLightCount = 0;
    for (const light of floor.lights) {
      if (!light.enabled) continue;
      const position = toWorld(light.position);
      const isSconce = light.id.includes('sconce');
      const isKitchen = light.id.includes('kitchen');
      const isDining = light.id.includes('dining');
      const fixtureY = isSconce ? 1.62 : isKitchen ? 2.12 : 2.2;
      const point = new THREE.PointLight(0xffa364, light.intensity * (isSconce ? 7.2 : 8.6), toMeters(light.radius) * 2.05, 2.0);
      point.position.set(position.x, fixtureY, position.z);
      point.castShadow = cinematic && shadowLightCount < 2;
      if (point.castShadow) {
        point.shadow.mapSize.set(512, 512);
        point.shadow.camera.near = 0.12;
        point.shadow.camera.far = toMeters(light.radius) * 2.25;
        point.shadow.bias = -0.0015;
        point.shadow.radius = 2;
        shadowLightCount += 1;
      }
      scene.add(point);
      // Cheap indirect-light proxy: practicals illuminate the ceiling first, then return
      // a broad, shadowless warm fill. It lifts interior midtones without flattening contact shadows.
      const bounce = new THREE.PointLight(
        0xc98258,
        light.intensity * (isSconce ? .45 : .72),
        toMeters(light.radius) * 2.65,
        1.45,
      );
      bounce.position.set(position.x, .62, position.z);
      scene.add(bounce);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(isSconce ? .045 : .06, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffd8a7, emissive: 0xff8a3d, emissiveIntensity: 3.2, roughness: 0.4 }),
      );
      bulb.position.copy(point.position);
      scene.add(bulb);
      if (isSconce) {
        addCylinderBetween(worldRoot, new THREE.Vector3(position.x, fixtureY, position.z), new THREE.Vector3(position.x, fixtureY + .18, position.z - .12), .018, brassMaterial, 12);
      } else {
        addCylinderBetween(worldRoot, new THREE.Vector3(position.x, fixtureY + .08, position.z), new THREE.Vector3(position.x, 2.72, position.z), .012, darkMetalMaterial, 10);
      }
      const shadeTop = isSconce ? .07 : isDining ? .16 : isKitchen ? .1 : .12;
      const shadeBottom = isSconce ? .14 : isDining ? .3 : isKitchen ? .2 : .23;
      const shadeHeight = isSconce ? .16 : isDining ? .2 : .18;
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(shadeTop, shadeBottom, shadeHeight, 24, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x221b18, emissive: 0x5b2f16, emissiveIntensity: 0.28, roughness: 0.94, side: THREE.DoubleSide }),
      );
      shade.position.set(position.x, fixtureY + (isSconce ? .035 : .1), position.z);
      if (isSconce) shade.rotation.x = -.28;
      scene.add(shade);
    }

    let transitioningFloor = false;
    let transitionTimer: ReturnType<typeof setTimeout> | undefined;
    const traverseStairs = (direction: 1 | -1) => {
      if (transitioningFloor) return;
      const targetId = direction === 1 ? floor.stairs.toUp : floor.stairs.toDown;
      if (!circleHitsRect(player, 40, floor.stairs)) {
        stateRef.current.onStatus('走进楼梯并沿踏步方向移动；R/F 也可作为辅助键');
        return;
      }
      if (!targetId) {
        stateRef.current.onStatus(direction === 1 ? '上方没有楼层' : '下方没有楼层');
        return;
      }
      const target = buildingScene.floors.find((candidate) => candidate.id === targetId);
      if (!target) return;
      transitioningFloor = true;
      const label = floorTransition.querySelector('b');
      if (label) label.textContent = `${floor.name}  →  ${target.name}`;
      floorTransition.classList.add('active');
      stateRef.current.onStatus(`楼梯通行：${floor.name} → ${target.name} · 保存本层状态`);
      transitionTimer = setTimeout(() => {
        pendingFloorSpawn = {
          floorId: target.id,
          position: {
            x: target.stairs.x + target.stairs.width + 38,
            y: target.stairs.y + target.stairs.height * 0.56,
          },
          facing: Math.PI / 2,
        };
        stateRef.current.onFloorChange(target.index);
      }, 320);
    };

    const toggleProfile = (
      id: string,
      name: string,
      profile: InteractionProfile,
      stateRecord: Record<string, string>,
      position: Vec2,
      prop?: PropSpec,
    ) => {
      const current = stateRecord[id] ?? profile.defaultState;
      const index = Math.max(0, profile.states.findIndex((item) => item.id === current));
      const next = profile.states[(index + 1) % profile.states.length];
      stateRecord[id] = next.id;
      if (prop && profile.motion === 'translate') {
        const pullingChair = prop.asset === 'prop.chair';
        const dx = pullingChair ? player.x - position.x : position.x - player.x;
        const dy = pullingChair ? player.y - position.y : position.y - player.y;
        const length = Math.hypot(dx, dy) || 1;
        const offset = next.id === profile.defaultState ? { x: 0, y: 0 } : { x: dx / length * 28, y: dy / length * 28 };
        if (pullingChair && next.id !== profile.defaultState) {
          const backedUp = moveCircleWithSliding(
            player,
            offset,
            player.radius,
            [...floor.walls, ...(floor.obstacles ?? []), ...propColliderRects().filter((rect) => rect.id !== prop.id)],
            occupantCircles(),
          );
          player.x = backedUp.x;
          player.y = backedUp.y;
        }
        memory.offsets[id] = offset;
        const group = propGroups.get(id);
        if (group) {
          const base = toWorld(prop.position);
          group.position.set(base.x + toMeters(offset.x), 0, base.z + toMeters(offset.y));
        }
      }
      stateRef.current.onStatus(`${name}：${next.label} · 独立 3D 子部件`);
    };

    type InteractionCandidate = {
      id: string;
      name: string;
      prompt: string;
      position: Vec2;
      score: number;
      durationMs: number;
      run: () => void;
    };
    const getInteractionCandidate = (): InteractionCandidate | undefined => {
      const candidates: InteractionCandidate[] = [];
      for (const prop of floor.props) {
        for (const part of prop.parts ?? []) {
          const id = `${prop.id}:${part.id}`;
          const parentOffset = memory.offsets[prop.id] ?? { x: 0, y: 0 };
          const position = { x: part.position.x + parentOffset.x, y: part.position.y + parentOffset.y };
          const score = interactionScore(
            player,
            player.facing,
            position,
            [...floor.walls, ...(floor.obstacles ?? [])],
            part.interaction.maxDistance,
            part.interaction.facingDot,
          );
          if (score === null) continue;
          candidates.push({
            id,
            name: part.name,
            prompt: part.interaction.prompt,
            position,
            score,
            durationMs: part.interaction.durationMs ?? 480,
            run: () => toggleProfile(id, part.name, part.interaction, memory.parts, position),
          });
        }
        if (prop.interaction) {
          const offset = memory.offsets[prop.id] ?? { x: 0, y: 0 };
          const position = { x: prop.position.x + offset.x, y: prop.position.y + offset.y };
          const score = interactionScore(
            player,
            player.facing,
            position,
            [...floor.walls, ...(floor.obstacles ?? [])],
            prop.interaction.maxDistance,
            prop.interaction.facingDot,
          );
          if (score === null) continue;
          candidates.push({
            id: prop.id,
            name: prop.name,
            prompt: prop.interaction.prompt,
            position,
            score,
            durationMs: prop.interaction.durationMs ?? 420,
            run: () => toggleProfile(prop.id, prop.name, prop.interaction!, memory.props, position, prop),
          });
        }
      }
      return candidates.sort((a, b) => a.score - b.score)[0];
    };

    let interactionBusyUntil = 0;
    let activeInteractionName = '';
    let playerActionUntil = 0;
    let playerAction: CharacterMotion | null = null;
    const interact = () => {
      const now = performance.now();
      if (now < interactionBusyUntil) {
        stateRef.current.onStatus(`${activeInteractionName}：动作尚未完成`);
        return;
      }
      const candidate = getInteractionCandidate();
      if (!candidate) {
        stateRef.current.onStatus('请靠近并面向要互动的物品');
        return;
      }
      interactionBusyUntil = now + candidate.durationMs;
      playerActionUntil = interactionBusyUntil;
      playerAction = candidate.prompt.includes('推') ? 'push' : 'interact';
      activeInteractionName = candidate.name;
      candidate.run();
    };

    let stairCooldown = false;
    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'e', 'q', 'r', 'f'].includes(key)) event.preventDefault();
      keys.add(key);
      if (event.repeat) return;
      if (key === 'e') {
        const nearby = doors
          .map((door) => ({ door, distance: Math.hypot(player.x - door.hinge.x, player.y - door.hinge.y) }))
          .filter(({ distance }) => distance < 105)
          .sort((a, b) => a.distance - b.distance)[0];
        if (!nearby) stateRef.current.onStatus('附近没有可操作的门');
        else {
          const door = nearby.door;
          const action = toggleDoorMotor(door);
          playerAction = 'push';
          playerActionUntil = performance.now() + 520;
          stateRef.current.onStatus(`${door.name}：${action === 'open' ? '打开' : '关闭'}`);
        }
      }
      if (key === 'q') interact();
      if (!stairCooldown && key === 'r') { stairCooldown = true; traverseStairs(1); }
      if (!stairCooldown && key === 'f') { stairCooldown = true; traverseStairs(-1); }
    };
    const keyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
      if (event.key.toLowerCase() === 'r' || event.key.toLowerCase() === 'f') stairCooldown = false;
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    let frameRequest = 0;
    let previous = performance.now();
    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      composer?.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const animateRig = (
      rig: Rig,
      phase: number,
      moving: boolean,
      dt: number,
      speed = 1,
      forcedMotion?: CharacterMotion,
    ) => {
      if (rig.authored) {
        rig.authored.setMotion(forcedMotion ?? (moving ? 'walk' : 'idle'));
        rig.authored.update(dt);
        return;
      }
      rig.locomotionWeight = THREE.MathUtils.damp(rig.locomotionWeight, moving ? 1 : 0, moving ? 9 : 12, dt);
      const weight = rig.locomotionWeight;
      const cycle = phase * speed;
      const swing = Math.sin(cycle);
      const opposite = Math.sin(cycle + Math.PI);
      rig.leftLeg.rotation.x = swing * 0.72 * weight;
      rig.rightLeg.rotation.x = opposite * 0.72 * weight;
      rig.leftShin.rotation.x = Math.max(0, -swing) * 0.78 * weight;
      rig.rightShin.rotation.x = Math.max(0, -opposite) * 0.78 * weight;
      rig.leftArm.rotation.x = -swing * 0.5 * weight;
      rig.rightArm.rotation.x = swing * 0.5 * weight;
      rig.leftForearm.rotation.x = -0.16 - rig.forearmReady - Math.max(0, swing) * 0.3 * weight;
      rig.rightForearm.rotation.x = -0.16 - rig.forearmReady - Math.max(0, -swing) * 0.3 * weight;
      rig.visual.position.y = Math.abs(Math.sin(cycle * 2)) * 0.026 * weight;
      rig.torso.rotation.x = -0.055 * weight;
      rig.torso.rotation.z = Math.sin(cycle) * 0.025 * weight;
    };

    const updateInteractiveParts = (dt: number) => {
      for (const prop of floor.props) {
        const propState = prop.interaction
          ? memory.props[prop.id] ?? prop.interaction.defaultState
          : undefined;
        const bedBinding = bedDrawers.get(prop.id);
        if (bedBinding) {
          const open = propState === 'searched';
          bedBinding.object.visible = open || Math.abs(bedBinding.object.position.z - bedBinding.closedZ) > 0.01;
          bedBinding.object.position.z = THREE.MathUtils.damp(
            bedBinding.object.position.z,
            open ? bedBinding.openZ : bedBinding.closedZ,
            10,
            dt,
          );
        }
        for (const partSpec of prop.parts ?? []) {
          const id = `${prop.id}:${partSpec.id}`;
          const object = propParts.get(id);
          const base = partBases.get(id);
          if (!object || !base) continue;
          const open = (memory.parts[id] ?? partSpec.interaction.defaultState) === 'open';
          if (partSpec.interaction.motion === 'hinge') {
            object.rotation.y = THREE.MathUtils.damp(object.rotation.y, base.rotationY + (open ? -1.08 : 0), 11, dt);
          }
          if (partSpec.interaction.motion === 'translate') {
            object.position.z = THREE.MathUtils.damp(object.position.z, base.position.z + (open ? 0.46 : 0), 11, dt);
          }
        }
      }
    };

    const occupantCircles = (excludeId?: string): CircleCollider[] => residentRigs.flatMap((resident) => {
      const collider = resident.spec.collider;
      if (!collider?.blocksMovement || resident.spec.id === excludeId) return [];
      return [{ id: resident.spec.id, position: resident.state.position, radius: collider.radius }];
    });

    const advanceWaypoint = (resident: ResidentRuntime) => {
      const navigation = resident.spec.navigation;
      if (!navigation || navigation.waypoints.length < 2) return;
      if (navigation.mode === 'loop') {
        resident.state.waypointIndex = (resident.state.waypointIndex + 1) % navigation.waypoints.length;
        return;
      }
      const next = resident.state.waypointIndex + resident.state.waypointDirection;
      if (next >= navigation.waypoints.length || next < 0) {
        resident.state.waypointDirection = resident.state.waypointDirection === 1 ? -1 : 1;
      }
      resident.state.waypointIndex += resident.state.waypointDirection;
    };

    const updateResidents = (dt: number, elapsed: number, pausedNow: boolean) => {
      const blockingRects = [...floor.walls, ...(floor.obstacles ?? []), ...propColliderRects()];
      for (const resident of residentRigs) {
        const navigation = resident.spec.navigation;
        resident.moving = false;
        if (!pausedNow && navigation?.waypoints.length) {
          const target = navigation.waypoints[resident.state.waypointIndex] ?? navigation.waypoints[0];
          const dx = target.x - resident.state.position.x;
          const dy = target.y - resident.state.position.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 5) {
            advanceWaypoint(resident);
          } else {
            const step = Math.min(navigation.speed * dt, distance);
            const delta = { x: dx / distance * step, y: dy / distance * step };
            const circles = occupantCircles(resident.spec.id);
            circles.push({ id: 'player', position: player, radius: player.radius });
            const radius = resident.spec.collider?.radius ?? 14;
            const next = moveCircleWithSliding(resident.state.position, delta, radius, blockingRects, circles);
            resident.moving = next.x !== resident.state.position.x || next.y !== resident.state.position.y;
            resident.state.position = next;
            if (resident.moving) resident.state.facing = Math.atan2(delta.x, delta.y);
          }
        }
        const world = toWorld(resident.state.position);
        if (resident.spec.behavior !== 'sleeping') {
          resident.rig.root.position.set(world.x, 0, world.z);
          resident.rig.root.rotation.y = resident.state.facing;
          animateRig(
            resident.rig,
            elapsed * 7 + resident.phase,
            resident.moving,
            dt,
            1,
            resident.spec.behavior === 'hiding' ? 'crouch' : undefined,
          );
        } else if (resident.rig.authored) {
          resident.rig.authored.update(dt * .18);
        }
        if (resident.colliderOutline) resident.colliderOutline.position.set(world.x, 0, world.z);
      }
    };

    const render = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.035);
      previous = now;
      const elapsed = now / 1000;
      const state = stateRef.current;
      controls.enabled = state.cameraMode === 'editor';
      debugGroup.visible = state.showPhysics;
      renderer.domElement.style.filter = state.nightVision
        ? 'sepia(.7) hue-rotate(72deg) saturate(1.45) brightness(1.18)'
        : 'none';
      scene.background = new THREE.Color(state.nightVision ? 0x041109 : 0x060b10);
      scene.fog = new THREE.FogExp2(state.nightVision ? 0x06140b : 0x081016, state.nightVision ? 0.016 : 0.011);
      hemi.color.setHex(state.nightVision ? 0x83d59a : 0x718aa1);
      moon.color.setHex(state.nightVision ? 0x6bdc88 : 0x9cb8d4);
      updateResidents(dt, elapsed, state.paused);
      updateInteractiveParts(dt);

      if (!state.paused && !transitioningFloor) {
        let x = 0;
        let y = 0;
        if (keys.has('w') || keys.has('arrowup')) y -= 1;
        if (keys.has('s') || keys.has('arrowdown')) y += 1;
        if (keys.has('a') || keys.has('arrowleft')) x -= 1;
        if (keys.has('d') || keys.has('arrowright')) x += 1;
        const requestedMovement = Boolean(x || y);
        const length = Math.hypot(x, y) || 1;
        const velocity = { x: x / length * 145, y: y / length * 145 };
        if (requestedMovement) player.facing = Math.atan2(velocity.x, velocity.y);
        const proposed = moveCircleWithSliding(
          player,
          { x: velocity.x * dt, y: velocity.y * dt },
          player.radius,
          [...floor.walls, ...(floor.obstacles ?? []), ...propColliderRects()],
          occupantCircles(),
        );
        let pushed = false;
        for (const door of doors) {
          if (requestedMovement) pushed = pushDoor(door, proposed, velocity) || pushed;
          updateDoor(door, dt);
          memory.doors[door.id] = door.angle;
          const group = doorGroups.get(door.id);
          if (group) group.rotation.y = -door.angle;
        }
        const blockedDoor = doors.some((door) => pointToDoor(proposed, door).distance < player.radius + door.width / 2 - 1);
        const moved = proposed.x !== player.x || proposed.y !== player.y;
        if (!blockedDoor || pushed) {
          player.x = proposed.x;
          player.y = proposed.y;
        }
        player.moving = moved && (!blockedDoor || pushed);
        const stairDirection = stairTraversalDirection(player, velocity, floor.stairs);
        if (stairDirection) traverseStairs(stairDirection);
      } else {
        player.moving = false;
        for (const door of doors) {
          updateDoor(door, dt);
          memory.doors[door.id] = door.angle;
          const group = doorGroups.get(door.id);
          if (group) group.rotation.y = -door.angle;
        }
      }

      const playerWorld = toWorld(player);
      const playerOnStairs = circleHitsRect(player, 0.01, floor.stairs);
      const stairLift = playerOnStairs ? stairProgress(player, floor.stairs) * floor.stairs.rise : 0;
      playerRig.root.position.set(playerWorld.x, stairLift, playerWorld.z);
      playerRig.root.rotation.y = player.facing;
      const actionMotion = now < playerActionUntil ? playerAction ?? undefined : undefined;
      animateRig(playerRig, elapsed * 8, player.moving, dt, 1, actionMotion ?? (playerOnStairs ? 'stairs' : undefined));
      if (playerOnStairs) {
        playerRig.torso.rotation.x -= 0.1;
        playerRig.leftShin.rotation.x += 0.16;
        playerRig.rightShin.rotation.x += 0.16;
      }
      const forward = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
      flashlight.position.copy(playerRig.root.position).add(new THREE.Vector3(0, 1.42, 0));
      flashlightTarget.position.copy(playerRig.root.position).addScaledVector(forward, 4.6).add(new THREE.Vector3(0, 0.52, 0));
      flashlight.intensity = state.nightVision ? 2.8 : 5.6;

      const focusedInteraction = getInteractionCandidate();
      interactionMarker.visible = Boolean(focusedInteraction);
      interactionPrompt.hidden = !focusedInteraction && !playerOnStairs;
      if (focusedInteraction) {
        const markerPosition = toWorld(focusedInteraction.position);
        interactionMarker.position.set(markerPosition.x, 0.035, markerPosition.z);
        interactionMarker.rotation.z = elapsed * 0.5;
        const busy = now < interactionBusyUntil;
        interactionPrompt.textContent = busy
          ? `${activeInteractionName} · 动作中`
          : `Q · ${focusedInteraction.name}`;
      } else if (playerOnStairs) {
        const options = [floor.stairs.toUp ? 'W 向上通行' : '', floor.stairs.toDown ? 'S 向下通行' : ''].filter(Boolean);
        interactionPrompt.textContent = options.join('  ·  ');
      }

      if (state.cameraMode === 'follow') {
        const distanceToBuildingEdge = Math.min(
          player.x - 90,
          buildingScene.world.width - 90 - player.x,
          player.y - 50,
          buildingScene.world.height - 50 - player.y,
        );
        const edgeLift = 1 - THREE.MathUtils.clamp((distanceToBuildingEdge - 20) / 110, 0, 1);
        const followHeight = 4.15 + edgeLift * 1.28;
        const followDistance = 4.2 - edgeLift * .62;
        const desired = playerRig.root.position.clone().addScaledVector(forward, -followDistance).add(new THREE.Vector3(0, followHeight, 0));
        camera.position.lerp(desired, 1 - Math.pow(0.002, dt));
        const gameplayTarget = playerRig.root.position.clone().addScaledVector(forward, .78).add(new THREE.Vector3(0, .98, 0));
        const inwardTarget = playerRig.root.position.clone().lerp(new THREE.Vector3(0, playerRig.root.position.y, 0), .42).add(new THREE.Vector3(0, 1.02, 0));
        const target = gameplayTarget.lerp(inwardTarget, edgeLift);
        camera.lookAt(target);
      } else {
        controls.update();
      }
      const desiredFov = state.cameraMode === 'follow' ? 41 : cinematic ? 34 : 38;
      const nextFov = THREE.MathUtils.damp(camera.fov, desiredFov, 8, dt);
      if (Math.abs(nextFov - camera.fov) > .001) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }

      renderer.domElement.dataset.playerX = player.x.toFixed(1);
      renderer.domElement.dataset.playerY = player.y.toFixed(1);
      renderer.domElement.dataset.floor = floor.id;
      renderer.domElement.dataset.moving = String(player.moving);
      renderer.domElement.dataset.camera = state.cameraMode;
      renderer.domElement.dataset.cinematic = String(cinematic);
      renderer.domElement.dataset.renderer = 'three-webgl';
      renderer.domElement.dataset.interactions = JSON.stringify({ ...memory.props, ...memory.parts });
      renderer.domElement.dataset.doors = JSON.stringify(Object.fromEntries(
        doors.map((door) => [door.id, Number(door.angle.toFixed(3))]),
      ));
      renderer.domElement.dataset.focusedInteraction = focusedInteraction?.id ?? '';
      renderer.domElement.dataset.interactionBusy = String(now < interactionBusyUntil);
      renderer.domElement.dataset.stairProgress = playerOnStairs ? stairProgress(player, floor.stairs).toFixed(3) : '';
      renderer.domElement.dataset.stairTransition = String(transitioningFloor);
      renderer.domElement.dataset.characterAssets = authoredCharacterFailed
        ? `fallback:${authoredCharacterCount}`
        : authoredCharacterCount === residentRigs.length + 1 ? `gltf-ready:${authoredCharacterCount}` : `loading:${authoredCharacterCount}`;
      renderer.domElement.dataset.occupants = JSON.stringify(Object.fromEntries(
        residentRigs.map((resident) => [resident.spec.id, {
          x: Number(resident.state.position.x.toFixed(1)),
          y: Number(resident.state.position.y.toFixed(1)),
          moving: resident.moving,
        }]),
      ));
      if (moodGrade) moodGrade.uniforms.time.value = elapsed;
      if (composer) composer.render();
      else renderer.render(scene, camera);
      if (visualProbeContext && now >= nextVisualProbeAt) {
        nextVisualProbeAt = now + 2400;
        try {
          visualProbeContext.drawImage(renderer.domElement, 0, 0, visualProbeCanvas.width, visualProbeCanvas.height);
          const frame = visualProbeContext.getImageData(0, 0, visualProbeCanvas.width, visualProbeCanvas.height);
          const report = createVisualIntelligenceReport(measureVisualFrame(frame), {
            floorId: floor.id,
            cameraMode: state.cameraMode,
            cinematic,
            nightVision: state.nightVision,
          });
          renderer.domElement.dataset.visualCi = report.version;
          renderer.domElement.dataset.visualScore = String(report.automatedScore);
          renderer.domElement.dataset.visualBlockers = JSON.stringify(report.blockers);
          state.onVisualReport(report);
        } catch {
          renderer.domElement.dataset.visualCi = 'capture-unavailable';
        }
      }
      frameRequest = requestAnimationFrame(render);
    };
    frameRequest = requestAnimationFrame(render);

    return () => {
      effectDisposed = true;
      cancelAnimationFrame(frameRequest);
      if (transitionTimer) clearTimeout(transitionTimer);
      observer.disconnect();
      controls.dispose();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      keys.clear();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const disposeMaterial = (entry: THREE.Material) => {
            if (entry instanceof THREE.MeshStandardMaterial) {
              entry.map?.dispose();
              entry.normalMap?.dispose();
              entry.roughnessMap?.dispose();
              entry.metalnessMap?.dispose();
              entry.aoMap?.dispose();
            }
            entry.dispose();
          };
          if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
          else disposeMaterial(object.material);
        }
      });
      environment.dispose();
      pmremGenerator.dispose();
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      interactionPrompt.remove();
      floorTransition.remove();
    };
  }, [cinematic, floorIndex]);

  return <div ref={mountRef} className="game-viewport" />;
}
