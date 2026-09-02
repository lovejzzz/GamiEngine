export type RenderBackendId = 'three-webgl' | 'three-webgpu';

export type RenderBackendApi = 'webgl2' | 'webgl1' | 'webgpu';

export type RenderBackendCapability =
  | 'post-processing'
  | 'screen-space-ambient-occlusion'
  | 'hdr-tone-mapping'
  | 'shadow-maps'
  | 'frame-capture';

export type RenderBackendCapabilities = {
  api: RenderBackendApi;
  features: ReadonlySet<RenderBackendCapability>;
  maxAnisotropy: number;
  maxTextureSize: number;
};

export type RenderBackendFrameStats = {
  drawCalls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
};

export type RenderFrame = {
  elapsedSeconds: number;
};

/**
 * Gami's renderer boundary. Gameplay and scene manifests communicate with this
 * contract rather than owning a WebGL context or a vendor post-processing chain.
 */
export interface GamiRenderBackend {
  readonly id: RenderBackendId;
  readonly canvas: HTMLCanvasElement;
  readonly capabilities: RenderBackendCapabilities;
  resize(width: number, height: number): void;
  render(frame: RenderFrame): void;
  setVisualFilter(filter: string): void;
  setDebugState(values: Readonly<Record<string, string>>): void;
  captureFrame(width: number, height: number): ImageData | null;
  getFrameStats(): RenderBackendFrameStats;
  dispose(): void;
}

export type RenderBackendRequirement = {
  preferred: RenderBackendId;
  fallback: RenderBackendId;
  requiredCapabilities: RenderBackendCapability[];
};

export function evaluateBackendCapabilities(
  capabilities: RenderBackendCapabilities,
  required: readonly RenderBackendCapability[],
) {
  const missing = required.filter((feature) => !capabilities.features.has(feature));
  return { ready: missing.length === 0, missing };
}

export function frameStatsToDebugState(stats: RenderBackendFrameStats): Record<string, string> {
  return {
    renderDrawCalls: String(stats.drawCalls),
    renderTriangles: String(stats.triangles),
    renderGeometries: String(stats.geometries),
    renderTextures: String(stats.textures),
  };
}
