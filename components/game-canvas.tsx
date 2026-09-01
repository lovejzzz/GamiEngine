'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildingScene } from '@/engine/demo-scene';
import { resolveRuntimeSource } from '@/engine/asset-registry';
import type { FloorSpec, InteractionProfile, OccupantSpec, PropSpec, RectSpec, Vec2 } from '@/engine/types';
import {
  circleHitsRect,
  interactionScore,
  moveCircleWithSliding,
  pointToDoor,
  pushDoor,
  stairProgress,
  stairTraversalDirection,
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
  onFloorChange: (index: number) => void;
  onStatus: (label: string) => void;
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

function makeMemory(floor: FloorSpec): FloorMemory {
  const existing = memories.get(floor.id);
  if (existing) return existing;
  const memory: FloorMemory = { doors: {}, props: {}, parts: {}, offsets: {}, occupants: {} };
  for (const door of floor.doors) memory.doors[door.id] = door.closedAngle;
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
  onFloorChange,
  onStatus,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ paused, showPhysics, nightVision, cameraMode, onFloorChange, onStatus });
  useEffect(() => {
    stateRef.current = { paused, showPhysics, nightVision, cameraMode, onFloorChange, onStatus };
  }, [paused, showPhysics, nightVision, cameraMode, onFloorChange, onStatus]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const floor = buildingScene.floors[floorIndex];
    const memory = makeMemory(floor);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060b10);
    scene.fog = new THREE.FogExp2(0x081016, 0.018);

    const camera = new THREE.PerspectiveCamera(39, 1, 0.05, 60);
    camera.position.set(0.35, 10.1, 7.8);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.domElement.className = 'game-canvas';
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', 'Gami Engine 3D 房屋演示。WASD 移动，E 开门，Q 互动，沿楼梯行走自动上下楼。');
    mount.appendChild(renderer.domElement);
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
    controls.target.set(0, 0.4, 0);

    const textureLoader = new THREE.TextureLoader();
    const textureSource = (id: string) => resolveRuntimeSource(buildingScene.assets, id, 'runtime-texture');
    const makeTexture = (source: string, repeatX = 1, repeatY = 1) => {
      const texture = textureLoader.load(source);
      texture.colorSpace = THREE.SRGBColorSpace;
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
    const wallMaterial = material(0xeee2cc, textureSource('material.wallpaper.ivory'), 0.94, 0, 1.5, 1.2);
    const wallCapMaterial = material(0x55514a, undefined, 0.88);
    const wainscotMaterial = material(0x8d6d55, textureSource('material.walnut'), 0.8, 0, 2.1, 1.1);
    const walnutMaterial = material(0xb28e72, textureSource('material.walnut'), 0.74, 0, 1.4, 1.4);
    const upholsteryMaterial = material(0x71816d, textureSource('material.upholstery.olive'), 0.98, 0, 1.8, 1.8);
    const sageMaterial = material(0x8b9b89, textureSource('material.sage-paint'), 0.86, 0, 1.2, 1.2);
    const tacticalMaterial = material(0x1f2924, textureSource('material.tactical-fabric'), 0.95, 0, 2, 2);
    const brassMaterial = material(0x9a7138, undefined, 0.38, 0.68);
    const darkMetalMaterial = material(0x182025, undefined, 0.44, 0.72);
    const fabricMaterial = material(0x7b7064, undefined, 0.98);
    const oxbloodMaterial = material(0x542d2f, undefined, 0.94);
    const porcelainMaterial = material(0xd1cec3, undefined, 0.24);
    const floorSources: Record<string, string | null> = {
      'floor.herringbone': textureSource('floor.herringbone'),
      'floor.checker': textureSource('floor.checker'),
      'floor.carpet': textureSource('floor.carpet'),
      'floor.concrete': textureSource('floor.concrete'),
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
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), boxMaterial);
      mesh.position.set(...position);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
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
      new THREE.MeshStandardMaterial({ color: 0x0a1014, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.09;
    ground.receiveShadow = true;
    worldRoot.add(ground);

    for (const room of floor.rooms) {
      const center = toWorld({ x: room.x + room.width / 2, y: room.y + room.height / 2 });
      const width = toMeters(room.width);
      const depth = toMeters(room.height);
      const roomMaterial = material(
        room.floorAsset === 'floor.carpet' ? 0x77716b : room.floorAsset === 'floor.concrete' ? 0x7e8581 : 0xb8aa95,
        floorSources[room.floorAsset],
        room.floorAsset === 'floor.carpet' ? 1 : 0.76,
        0,
        Math.max(1, width / 1.55),
        Math.max(1, depth / 1.55),
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
      const wallHeight = isSouthCutaway ? 0.34 : isOuterSide ? 1.05 : 1.42;
      const wallMesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, wallHeight, depth),
        [wallMaterial, wallMaterial, wallCapMaterial, wallCapMaterial, wallMaterial, wallMaterial],
      );
      wallMesh.position.set(center.x, wallHeight / 2, center.z);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      worldRoot.add(wallMesh);
      if (!isSouthCutaway) {
        const wainscotHeight = Math.min(0.38, wallHeight * 0.42);
        addBox(worldRoot, [width + 0.018, wainscotHeight, depth + 0.018], [center.x, wainscotHeight / 2 + 0.01, center.z], wainscotMaterial);
        addBox(worldRoot, [width + 0.035, 0.055, depth + 0.035], [center.x, wainscotHeight + 0.04, center.z], brassMaterial, false);
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
      window.position.set(windowPoint.x, 0.91, windowPoint.z + 0.13);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.78), coolGlassMaterial);
      pane.receiveShadow = true;
      window.add(pane);
      addBox(window, [1.03, 0.065, 0.065], [0, 0.42, 0.025], darkMetalMaterial, false);
      addBox(window, [1.03, 0.065, 0.065], [0, -0.42, 0.025], darkMetalMaterial, false);
      addBox(window, [0.065, 0.9, 0.065], [-0.5, 0, 0.025], darkMetalMaterial, false);
      addBox(window, [0.065, 0.9, 0.065], [0.5, 0, 0.025], darkMetalMaterial, false);
      addBox(window, [0.045, 0.82, 0.05], [0, 0, 0.04], darkMetalMaterial, false);
      addBox(window, [0.96, 0.045, 0.05], [0, 0, 0.04], darkMetalMaterial, false);
      worldRoot.add(window);
    }

    const doors: RuntimeDoor[] = floor.doors.map((spec) => ({
      id: spec.id,
      name: spec.name,
      hinge: { ...spec.hinge },
      length: spec.length,
      width: spec.width,
      angle: memory.doors[spec.id] ?? spec.closedAngle,
      angularVelocity: 0,
      minAngle: spec.minAngle,
      maxAngle: spec.maxAngle,
      motorTarget: null,
    }));
    const doorGroups = new Map<string, THREE.Group>();
    const doorLeafMaterial = material(0x2d3a33, textureSource('material.sage-paint'), 0.78, 0, 1, 1.4);
    for (const door of doors) {
      const hinge = toWorld(door.hinge);
      const group = new THREE.Group();
      group.position.copy(hinge);
      group.rotation.y = -door.angle;
      const length = toMeters(door.length);
      addBox(group, [length, 1.58, 0.105], [length / 2, 0.79, 0], doorLeafMaterial);
      for (const y of [0.45, 1.11]) {
        addBox(group, [length * 0.68, 0.42, 0.035], [length * 0.51, y, 0.07], wainscotMaterial, false);
      }
      addBox(group, [0.045, 0.045, 0.12], [length - 0.13, 0.86, 0], brassMaterial);
      addBox(group, [0.07, 1.64, 0.13], [0, 0.82, 0], wainscotMaterial);
      worldRoot.add(group);
      doorGroups.set(door.id, group);
    }

    const createSofa = (prop: PropSpec) => {
      const group = new THREE.Group();
      const width = toMeters(prop.size.x);
      const depth = toMeters(prop.size.y);
      addBox(group, [width * 0.92, 0.36, depth * 0.72], [0, 0.3, 0.05], upholsteryMaterial);
      addBox(group, [width, 0.7, depth * 0.18], [0, 0.58, -depth * 0.38], upholsteryMaterial);
      addBox(group, [width * 0.07, 0.48, depth], [-width * 0.47, 0.4, 0], upholsteryMaterial);
      addBox(group, [width * 0.07, 0.48, depth], [width * 0.47, 0.4, 0], upholsteryMaterial);
      for (let index = -1; index <= 1; index += 1) {
        addBox(group, [width * 0.27, 0.12, depth * 0.58], [index * width * 0.29, 0.53, 0.07], upholsteryMaterial);
      }
      return group;
    };

    const createBed = (prop: PropSpec) => {
      const group = new THREE.Group();
      const width = toMeters(prop.size.x);
      const depth = toMeters(prop.size.y);
      addBox(group, [width, 0.22, depth], [0, 0.2, 0], walnutMaterial);
      addBox(group, [width * 0.94, 0.3, depth * 0.9], [0, 0.42, 0.04], fabricMaterial);
      addBox(group, [width, 0.7, 0.12], [0, 0.62, -depth * 0.47], upholsteryMaterial);
      addBox(group, [width * 0.36, 0.12, depth * 0.2], [-width * 0.23, 0.65, -depth * 0.28], material(0xd9d0c3, undefined, 1));
      addBox(group, [width * 0.36, 0.12, depth * 0.2], [width * 0.23, 0.65, -depth * 0.28], material(0xd9d0c3, undefined, 1));
      const drawer = addBox(group, [width * 0.58, 0.18, depth * 0.32], [0, 0.15, depth * 0.23], walnutMaterial);
      drawer.visible = false;
      propParts.set(`${prop.id}:searched`, drawer);
      bedDrawers.set(prop.id, { object: drawer, closedZ: drawer.position.z, openZ: drawer.position.z + depth * 0.48 });
      return group;
    };

    const createTable = (prop: PropSpec) => {
      const group = new THREE.Group();
      const width = toMeters(prop.size.x);
      const depth = toMeters(prop.size.y);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 48), walnutMaterial);
      top.scale.set(width, 1, depth);
      top.position.y = 0.78;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);
      addBox(group, [0.15, 0.72, 0.15], [-width * 0.28, 0.38, -depth * 0.22], walnutMaterial);
      addBox(group, [0.15, 0.72, 0.15], [width * 0.28, 0.38, -depth * 0.22], walnutMaterial);
      addBox(group, [0.15, 0.72, 0.15], [-width * 0.28, 0.38, depth * 0.22], walnutMaterial);
      addBox(group, [0.15, 0.72, 0.15], [width * 0.28, 0.38, depth * 0.22], walnutMaterial);
      return group;
    };

    const createChair = (prop: PropSpec) => {
      const group = new THREE.Group();
      const width = toMeters(prop.size.x);
      const depth = toMeters(prop.size.y);
      addBox(group, [width * 0.82, 0.12, depth * 0.82], [0, 0.48, 0], walnutMaterial);
      addBox(group, [width * 0.82, 0.72, 0.1], [0, 0.78, -depth * 0.38], walnutMaterial);
      for (const x of [-1, 1]) for (const z of [-1, 1]) {
        addBox(group, [0.07, 0.46, 0.07], [x * width * 0.34, 0.23, z * depth * 0.34], walnutMaterial);
      }
      return group;
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
      const postHeight = 0.54;
      for (const side of [-1, 1]) {
        for (const index of [0, 3, 6, 9, 11]) {
          const stepDepth = depth / steps;
          const stairHeight = 0.055 + (index + 1) / steps * rise;
          const z = depth / 2 - stepDepth * (index + 0.5);
          addBox(group, [0.065, postHeight, 0.065], [side * width * 0.47, stairHeight + postHeight / 2, z], wainscotMaterial);
        }
        const railLength = Math.hypot(depth, rise);
        const rail = addBox(group, [0.075, 0.085, railLength], [side * width * 0.47, rise / 2 + postHeight + 0.05, 0], wainscotMaterial);
        rail.rotation.x = -Math.atan2(rise, depth);
      }
      addBox(group, [width + 0.1, 0.12, 0.12], [0, rise + 0.08, -depth / 2 + 0.04], wainscotMaterial);
      return group;
    };

    const createKitchen = (prop: PropSpec) => {
      const group = new THREE.Group();
      const width = toMeters(prop.size.x);
      const depth = toMeters(prop.size.y);
      addBox(group, [width * 0.92, 0.88, depth * 0.3], [0.05, 0.44, -depth * 0.34], sageMaterial);
      addBox(group, [width * 0.28, 0.88, depth * 0.75], [-width * 0.34, 0.44, depth * 0.04], sageMaterial);
      addBox(group, [width * 0.96, 0.1, depth * 0.34], [0.02, 0.93, -depth * 0.34], darkMetalMaterial);
      addBox(group, [width * 0.32, 0.1, depth * 0.78], [-width * 0.34, 0.93, depth * 0.04], darkMetalMaterial);
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
          addBox(hinge, [0.34, 0.58, 0.055], [0.17, 0, 0], sageMaterial);
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
      const rugMaterial = (color: number) => material(color, textureSource('floor.carpet'), 1, 0, 1.4, 1.4);
      const addRug = (x: number, z: number, width: number, depth: number, color: number) => {
        const rug = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), rugMaterial(color));
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
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.22, 20), brassMaterial);
        base.position.set(x, 0.18, z);
        base.castShadow = true;
        worldRoot.add(base);
        const shade = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.25, 0.32, 20, 1, true),
          new THREE.MeshStandardMaterial({ color: 0xb79b73, emissive: 0x8a4e20, emissiveIntensity: 0.58, roughness: 0.86, side: THREE.DoubleSide }),
        );
        shade.position.set(x, 0.48, z);
        worldRoot.add(shade);
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
          addBox(worldRoot, [width * 0.62, 0.52, 0.72], [center.x, 0.26, center.z - depth * 0.27], porcelainMaterial);
          const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.62, 20), porcelainMaterial);
          basin.position.set(center.x + width * 0.26, 0.31, center.z + depth * 0.25);
          worldRoot.add(basin);
          addBox(worldRoot, [0.7, 0.64, 0.025], [center.x + width * 0.26, 1.02, center.z - depth * 0.5 + 0.16], darkMetalMaterial, false);
        }
        if (room.purpose === 'nursery') {
          const cribX = center.x - width * 0.28;
          addBox(worldRoot, [1.05, 0.18, 1.45], [cribX, 0.23, center.z - depth * 0.03], fabricMaterial);
          for (const side of [-1, 1]) for (let index = -3; index <= 3; index += 1) {
            addBox(worldRoot, [0.045, 0.62, 0.045], [cribX + index * 0.15, 0.53, center.z - depth * 0.03 + side * 0.69], wainscotMaterial);
          }
          for (let index = 0; index < 5; index += 1) {
            addBox(worldRoot, [0.16, 0.16, 0.16], [center.x + 0.45 + (index % 2) * 0.2, 0.08, center.z + (index - 2) * 0.14], material([0xc16f62, 0x7095a0, 0xd1ab5b][index % 3], undefined, 0.8));
          }
        }
        if (room.purpose === 'entry') {
          addRug(center.x, center.z + depth * 0.18, width * 0.55, depth * 0.35, 0x4f302f);
          addWallArt(center.x, center.z - depth / 2 + 0.18, 0.54, 0x4b5b51);
        }
        if (room.purpose === 'living') {
          addRug(center.x + width * 0.05, center.z + depth * 0.18, width * 0.64, depth * 0.42, 0x4b302f);
          addWallArt(center.x + width * 0.22, center.z - depth / 2 + 0.18, 0.74, 0x6c5140);
          addTableLamp(center.x + width * 0.38, center.z - depth * 0.22);
        }
        if (room.purpose === 'bedroom') {
          addRug(center.x, center.z + depth * 0.22, width * 0.58, depth * 0.32, 0x4b3437);
          addWallArt(center.x + width * 0.28, center.z - depth / 2 + 0.18, 0.5, 0x475764);
          addTableLamp(center.x + width * 0.34, center.z - depth * 0.16);
        }
        if (room.purpose === 'dining') {
          addRug(center.x + width * 0.08, center.z, width * 0.62, depth * 0.62, 0x403331);
          addWallArt(center.x + width * 0.28, center.z - depth / 2 + 0.18, 0.68, 0x66533f);
        }
        if (room.purpose === 'studio') {
          addRug(center.x - width * 0.12, center.z, width * 0.48, depth * 0.38, 0x35424a);
          addWallArt(center.x + width * 0.25, center.z - depth / 2 + 0.18, 0.82, 0x5b493b);
        }
      }
    };
    addRoomDetails();

    const makeRig = (kind: 'operator' | 'resident', tint = 0x7a756c): Rig => {
      const root = new THREE.Group();
      const visual = new THREE.Group();
      root.add(visual);
      const cloth = kind === 'operator' ? tacticalMaterial : material(tint, undefined, 0.92);
      const trouser = kind === 'operator' ? tacticalMaterial : material(0x4b504d, undefined, 0.95);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.31, 7, 14), cloth);
      torso.scale.set(0.95, 1, 0.68);
      torso.position.y = 1.14;
      visual.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), material(0xb18d70, undefined, 0.92));
      head.position.y = 1.53;
      visual.add(head);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.153, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.48), material(kind === 'operator' ? 0x252b28 : 0x40372f, undefined, 0.92));
      hair.position.y = 1.545;
      visual.add(hair);

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
        const upperMesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.08, upperLength - radius * 2), 5, 10), limbMaterial);
        upperMesh.position.y = -upperLength / 2;
        upper.add(upperMesh);
        const lower = new THREE.Group();
        lower.position.y = -upperLength;
        const lowerMesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.92, Math.max(0.08, lowerLength - radius * 1.84), 5, 10), limbMaterial);
        lowerMesh.position.y = -lowerLength / 2;
        lower.add(lowerMesh);
        upper.add(lower);
        visual.add(upper);
        return { upper, lower };
      };
      const leftArmRig = createJointedLimb(-0.25, 1.31, cloth, 0.27, 0.25, 0.06);
      const rightArmRig = createJointedLimb(0.25, 1.31, cloth, 0.27, 0.25, 0.06);
      const leftLegRig = createJointedLimb(-0.1, 0.91, trouser, 0.34, 0.34, 0.068);
      const rightLegRig = createJointedLimb(0.1, 0.91, trouser, 0.34, 0.34, 0.068);
      if (kind === 'operator') {
        addBox(visual, [0.42, 0.34, 0.12], [0, 1.12, 0.16], darkMetalMaterial);
        addBox(visual, [0.09, 0.92, 0.09], [0.23, 1.08, 0.22], darkMetalMaterial);
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
      };
    };

    const playerRig = makeRig('operator');
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
      const rig = makeRig('resident', palette[index % palette.length]);
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

    const ambient = new THREE.AmbientLight(0x71808a, 0.92);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0x8fa5b7, 0x2b1c15, 1.08);
    scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xa7c2df, 2.25);
    moon.position.set(-5, 9, 4);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -8;
    moon.shadow.camera.right = 8;
    moon.shadow.camera.top = 7;
    moon.shadow.camera.bottom = -7;
    scene.add(moon);
    const flashlightTarget = new THREE.Object3D();
    const flashlight = new THREE.SpotLight(0xe5e1d3, 10.5, 9.2, 0.42, 0.98, 1.9);
    flashlight.castShadow = true;
    flashlight.shadow.mapSize.set(1024, 1024);
    flashlight.shadow.camera.near = 0.2;
    flashlight.shadow.camera.far = 10;
    flashlight.shadow.radius = 3;
    flashlight.target = flashlightTarget;
    scene.add(flashlight, flashlightTarget);
    for (const light of floor.lights) {
      if (!light.enabled) continue;
      const position = toWorld(light.position);
      const point = new THREE.PointLight(0xffad68, light.intensity * 12, toMeters(light.radius) * 2.7, 1.8);
      point.position.set(position.x, 1.92, position.z);
      // Point-light shadows render six shadow views each. The directional moon
      // and player spotlight own dynamic shadows; room bulbs provide fill only.
      point.castShadow = false;
      scene.add(point);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffd8a7, emissive: 0xff8a3d, emissiveIntensity: 3.2, roughness: 0.4 }),
      );
      bulb.position.copy(point.position);
      scene.add(bulb);
      addBox(worldRoot, [0.035, 0.38, 0.035], [position.x, 2.16, position.z], darkMetalMaterial, false);
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
          const nearMin = Math.abs(door.angle - door.minAngle) < Math.abs(door.angle - door.maxAngle);
          door.motorTarget = nearMin ? door.maxAngle : door.minAngle;
          stateRef.current.onStatus(`${door.name}：${nearMin ? '打开' : '关闭'}`);
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
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const animateRig = (rig: Rig, phase: number, moving: boolean, dt: number, speed = 1) => {
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
      rig.leftForearm.rotation.x = -0.16 - Math.max(0, swing) * 0.3 * weight;
      rig.rightForearm.rotation.x = -0.16 - Math.max(0, -swing) * 0.3 * weight;
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
          if (resident.spec.behavior !== 'hiding') {
            animateRig(resident.rig, elapsed * 7 + resident.phase, resident.moving, dt, 1);
          }
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
      scene.fog = new THREE.FogExp2(state.nightVision ? 0x06140b : 0x081016, state.nightVision ? 0.021 : 0.018);
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
      animateRig(playerRig, elapsed * 8, player.moving, dt);
      if (playerOnStairs) {
        playerRig.torso.rotation.x -= 0.1;
        playerRig.leftShin.rotation.x += 0.16;
        playerRig.rightShin.rotation.x += 0.16;
      }
      const forward = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing));
      flashlight.position.copy(playerRig.root.position).add(new THREE.Vector3(0, 1.42, 0));
      flashlightTarget.position.copy(playerRig.root.position).addScaledVector(forward, 4.6).add(new THREE.Vector3(0, 0.52, 0));
      flashlight.intensity = state.nightVision ? 3.5 : 10.5;

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
        const desired = playerRig.root.position.clone().addScaledVector(forward, -4.2).add(new THREE.Vector3(0, 6.2, 0));
        camera.position.lerp(desired, 1 - Math.pow(0.002, dt));
        const target = playerRig.root.position.clone().add(new THREE.Vector3(0, 0.85, 0));
        camera.lookAt(target);
      } else {
        controls.update();
      }

      renderer.domElement.dataset.playerX = player.x.toFixed(1);
      renderer.domElement.dataset.playerY = player.y.toFixed(1);
      renderer.domElement.dataset.floor = floor.id;
      renderer.domElement.dataset.moving = String(player.moving);
      renderer.domElement.dataset.camera = state.cameraMode;
      renderer.domElement.dataset.renderer = 'three-webgl';
      renderer.domElement.dataset.interactions = JSON.stringify({ ...memory.props, ...memory.parts });
      renderer.domElement.dataset.focusedInteraction = focusedInteraction?.id ?? '';
      renderer.domElement.dataset.interactionBusy = String(now < interactionBusyUntil);
      renderer.domElement.dataset.stairProgress = playerOnStairs ? stairProgress(player, floor.stairs).toFixed(3) : '';
      renderer.domElement.dataset.stairTransition = String(transitioningFloor);
      renderer.domElement.dataset.occupants = JSON.stringify(Object.fromEntries(
        residentRigs.map((resident) => [resident.spec.id, {
          x: Number(resident.state.position.x.toFixed(1)),
          y: Number(resident.state.position.y.toFixed(1)),
          moving: resident.moving,
        }]),
      ));
      renderer.render(scene, camera);
      frameRequest = requestAnimationFrame(render);
    };
    frameRequest = requestAnimationFrame(render);

    return () => {
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
            if (entry instanceof THREE.MeshStandardMaterial) entry.map?.dispose();
            entry.dispose();
          };
          if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
          else disposeMaterial(object.material);
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      interactionPrompt.remove();
      floorTransition.remove();
    };
  }, [floorIndex]);

  return <div ref={mountRef} className="game-viewport" />;
}
