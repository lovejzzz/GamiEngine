import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type {
  GamiRenderBackend,
  RenderBackendCapability,
  RenderBackendCapabilities,
  RenderBackendFrameStats,
  RenderFrame,
} from '@/engine/rendering/backend';

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

type Options = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cinematic: boolean;
  exposure: number;
  environmentIntensity: number;
  pixelRatio: number;
};

export class ThreeWebGLBackend implements GamiRenderBackend {
  readonly id = 'three-webgl' as const;
  readonly canvas: HTMLCanvasElement;
  readonly capabilities: RenderBackendCapabilities;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null;
  private readonly moodGrade: ShaderPass | null;
  private readonly pmremGenerator: THREE.PMREMGenerator;
  private readonly environment: THREE.Texture;
  private readonly captureCanvas = document.createElement('canvas');
  private readonly captureContext: CanvasRenderingContext2D | null;
  private frameStats: RenderBackendFrameStats = {
    drawCalls: 0,
    triangles: 0,
    lines: 0,
    points: 0,
    geometries: 0,
    textures: 0,
  };

  constructor(private readonly options: Options) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(options.pixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = options.exposure;
    renderer.info.autoReset = false;
    renderer.domElement.className = 'game-canvas';
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute(
      'aria-label',
      'Gami Engine 3D 房屋演示。WASD 移动，E 开门，Q 互动，沿楼梯行走自动上下楼。',
    );
    this.renderer = renderer;
    this.canvas = renderer.domElement;

    const features = new Set<RenderBackendCapability>([
      'post-processing',
      'screen-space-ambient-occlusion',
      'hdr-tone-mapping',
      'shadow-maps',
      'frame-capture',
    ]);
    this.capabilities = {
      api: renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl1',
      features,
      maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
      maxTextureSize: renderer.capabilities.maxTextureSize,
    };

    this.composer = options.cinematic ? new EffectComposer(renderer) : null;
    let moodGrade: ShaderPass | null = null;
    if (this.composer) {
      this.composer.addPass(new RenderPass(options.scene, options.camera));
      const gtaoPass = new GTAOPass(options.scene, options.camera, 640, 360);
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
      this.composer.addPass(gtaoPass);
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(640, 360), 0.1, 0.34, 0.88));
      moodGrade = new ShaderPass(GAMI_MOOD_GRADE);
      this.composer.addPass(moodGrade);
      this.composer.addPass(new OutputPass());
    }
    this.moodGrade = moodGrade;

    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.environment = this.pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    options.scene.environment = this.environment;
    options.scene.environmentIntensity = options.environmentIntensity;
    this.captureContext = this.captureCanvas.getContext('2d', { willReadFrequently: true });
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
  }

  render(frame: RenderFrame) {
    this.renderer.info.reset();
    if (this.moodGrade) this.moodGrade.uniforms.time.value = frame.elapsedSeconds;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.options.scene, this.options.camera);
    const { render, memory } = this.renderer.info;
    this.frameStats = {
      drawCalls: render.calls,
      triangles: render.triangles,
      lines: render.lines,
      points: render.points,
      geometries: memory.geometries,
      textures: memory.textures,
    };
  }

  setVisualFilter(filter: string) {
    this.canvas.style.filter = filter;
  }

  setDebugState(values: Readonly<Record<string, string>>) {
    for (const [key, value] of Object.entries(values)) this.canvas.dataset[key] = value;
  }

  captureFrame(width: number, height: number) {
    if (!this.captureContext) return null;
    this.captureCanvas.width = width;
    this.captureCanvas.height = height;
    try {
      this.captureContext.drawImage(this.canvas, 0, 0, width, height);
      return this.captureContext.getImageData(0, 0, width, height);
    } catch {
      return null;
    }
  }

  getFrameStats(): RenderBackendFrameStats {
    return this.frameStats;
  }

  dispose() {
    this.options.scene.environment = null;
    this.environment.dispose();
    this.pmremGenerator.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
