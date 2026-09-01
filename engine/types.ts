export type Vec2 = { x: number; y: number };

export type AssetKind =
  | 'tile'
  | 'wall-face'
  | 'door-face'
  | 'prop'
  | 'character';

export type AssetRecipe = {
  id: string;
  name: string;
  kind: AssetKind;
  description: string;
  prompt: string;
  source?: string;
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
};

export type LightSpec = {
  id: string;
  position: Vec2;
  radius: number;
  intensity: number;
  enabled: boolean;
};

export type FloorSpec = {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  rooms: RoomSpec[];
  walls: RectSpec[];
  doors: DoorSpec[];
  occupants: OccupantSpec[];
  lights: LightSpec[];
  stairs: RectSpec & { toUp?: string; toDown?: string };
  spawn: Vec2;
};

export type BuildingScene = {
  version: 1;
  name: string;
  world: { width: number; height: number; pixelsPerMeter: number };
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
