import type * as THREE from 'three';
import type { GamiRenderBackend, RenderBackendId } from '@/engine/rendering/backend';
import { ThreeWebGLBackend } from './three-webgl-backend';

type Options = {
  backend: RenderBackendId;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cinematic: boolean;
  exposure: number;
  environmentIntensity: number;
  pixelRatio: number;
};

/** The only place where Gami selects a concrete renderer adapter. */
export function createGamiRenderBackend(options: Options): GamiRenderBackend {
  if (options.backend === 'three-webgl') return new ThreeWebGLBackend(options);
  throw new Error(`Render backend is not installed: ${options.backend}`);
}
