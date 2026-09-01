export type Vec2 = { x: number; y: number };

export type AssetKind =
  | 'tile'
  | 'wall-face'
  | 'door-face'
  | 'prop'
  | 'character'
  | 'material';

export type InteractionAction =
  | 'inspect'
  | 'open'
  | 'search'
  | 'push'
  | 'move'
  | 'hide'
  | 'traverse';

export type InteractionState = {
  id: string;
  label: string;
  asset?: string;
};

export type InteractionProfile = {
  prompt: string;
  actions: InteractionAction[];
  defaultState: string;
  states: InteractionState[];
  motion: 'none' | 'swap' | 'translate' | 'hinge' | 'portal';
  exclusiveGroup?: string;
  maxDistance?: number;
  facingDot?: number;
  durationMs?: number;
};

export type AssetRecipe = {
  id: string;
  name: string;
  kind: AssetKind;
  description: string;
  prompt: string;
  source?: string;
  usage?: 'runtime-texture' | 'reference-study' | 'runtime-sprite';
  state: 'ready' | 'recipe';
  side?: 'front' | 'back' | 'top';
  physicalSize: Vec2;
  pivot: Vec2;
  atlas?: {
    columns: number;
    rows: number;
    fps: number;
    directions: Array<'north' | 'east' | 'south' | 'west'>;
  };
  material?: {
    penetration: 'soft' | 'medium' | 'hard';
    occlusion: number;
    friction: number;
  };
  texture?: {
    semantic: 'base-color' | 'normal' | 'roughness' | 'metalness' | 'emissive';
    tileable: boolean;
    colorSpace: 'srgb' | 'linear';
    metersPerTile: Vec2;
  };
  referenceStudy?: {
    source: string;
    learn: Array<'silhouette' | 'proportion' | 'material-zones' | 'wear-language' | 'color-palette'>;
    runtimeRule: 'never-render-directly';
  };
  geometry?: {
    source: 'procedural' | 'gltf';
    primitiveFamily?: string;
    meshSource?: string;
    independentlyModeledParts?: string[];
  };
  animation?: {
    skeleton: string;
    rootMotion: 'engine' | 'clip';
    clips: Array<{
      id: string;
      loop: boolean;
      duration: number;
      status: 'implemented' | 'required';
    }>;
  };
  interaction?: InteractionProfile;
};

export type RectSpec = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RoomSpec = RectSpec & {
  name: string;
  floorAsset: string;
  tint: string;
  purpose: string;
};

export type DoorSpec = {
  id: string;
  name: string;
  hinge: Vec2;
  length: number;
  width: number;
  closedAngle: number;
  minAngle: number;
  maxAngle: number;
  frontAsset: string;
  backAsset: string;
  locked?: boolean;
};

export type OccupantSpec = {
  id: string;
  name: string;
  position: Vec2;
  facing: number;
  role: 'civilian' | 'unknown' | 'hostile';
  behavior: 'sleeping' | 'hiding' | 'patrol' | 'frozen' | 'investigate';
  asset: string;
  collider?: { radius: number; blocksMovement: boolean };
  navigation?: {
    speed: number;
    mode: 'loop' | 'ping-pong';
    waypoints: Vec2[];
  };
};

export type LightSpec = {
  id: string;
  position: Vec2;
  radius: number;
  intensity: number;
  enabled: boolean;
};

export type PropPartSpec = {
  id: string;
  name: string;
  position: Vec2;
  interaction: InteractionProfile;
};

export type PropSpec = {
  id: string;
  name: string;
  asset: string;
  position: Vec2;
  size: Vec2;
  rotation?: number;
  collider?: { width: number; height: number; blocksMovement?: boolean };
  interaction?: InteractionProfile;
  parts?: PropPartSpec[];
};

export type FloorSpec = {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  rooms: RoomSpec[];
  walls: RectSpec[];
  obstacles?: RectSpec[];
  doors: DoorSpec[];
  occupants: OccupantSpec[];
  props: PropSpec[];
  lights: LightSpec[];
  stairs: RectSpec & { toUp?: string; toDown?: string };
  spawn: Vec2;
};

export type BuildingScene = {
  version: 2;
  name: string;
  world: { width: number; height: number; pixelsPerMeter: number };
  renderer: {
    mode: '3d';
    engine: 'three';
    floorStreaming: boolean;
    defaultCamera: 'editor' | 'follow';
  };
  styleLock: {
    id: string;
    projection: string;
    lighting: string;
    palette: string;
    negative: string;
  };
  floors: FloorSpec[];
  assets: AssetRecipe[];
};
