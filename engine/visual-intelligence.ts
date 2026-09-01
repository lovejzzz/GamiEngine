export type VisualCheckStatus = 'pass' | 'warning' | 'fail' | 'human-required';
export type VisualCheckOwner = 'composition' | 'lighting' | 'materials' | 'geometry' | 'characters';

export type VisualFrameMetrics = {
  meanLuma: number;
  medianLuma: number;
  blackRatio: number;
  midtoneRatio: number;
  highlightRatio: number;
  meanSaturation: number;
  edgeDensity: number;
  contentCoverage: number;
};

export type VisualProbeCheck = {
  id: string;
  label: string;
  status: VisualCheckStatus;
  owner: VisualCheckOwner;
  measured?: number;
  target: string;
  reason: string;
};

export type VisualIntelligenceReport = {
  version: 'gami-visual-ci-v1';
  capturedAt: string;
  referenceId: string;
  floorId: string;
  cameraMode: string;
  variant: 'cinematic' | 'editor' | 'night-vision';
  metrics: VisualFrameMetrics;
  checks: VisualProbeCheck[];
  automatedScore: number;
  productionCertifiable: false;
  blockers: string[];
};

export type PixelBuffer = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export const TOWNHOUSE_VISUAL_CONTRACT = {
  referenceId: 'reference.townhouse-art-direction-v1',
  meanLuma: [0.07, 0.24] as const,
  blackRatio: [0.05, 0.58] as const,
  midtoneRatio: [0.18, 0.62] as const,
  highlightRatio: [0, 0.1] as const,
  meanSaturation: [0.08, 0.56] as const,
  edgeDensity: [0.035, 0.3] as const,
  contentCoverage: [0.38, 0.94] as const,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const rounded = (value: number) => Number(value.toFixed(4));

/**
 * Samples the final rendered frame. This is intentionally a narrow instrument:
 * it can catch exposure/composition regressions, but cannot certify taste,
 * construction quality, anatomy, or reference fidelity.
 */
export function measureVisualFrame(buffer: PixelBuffer): VisualFrameMetrics {
  const { data, width, height } = buffer;
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    throw new Error('Visual probe received an invalid RGBA frame.');
  }

  const luminance = new Float32Array(width * height);
  const histogram = new Uint32Array(256);
  let lumaTotal = 0;
  let saturationTotal = 0;
  let blackPixels = 0;
  let midtonePixels = 0;
  let highlightPixels = 0;
  let contentPixels = 0;

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const red = data[offset] / 255;
    const green = data[offset + 1] / 255;
    const blue = data[offset + 2] / 255;
    const luma = clamp01(red * 0.2126 + green * 0.7152 + blue * 0.0722);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const saturation = max === 0 ? 0 : (max - min) / max;
    luminance[pixel] = luma;
    histogram[Math.min(255, Math.floor(luma * 255))] += 1;
    lumaTotal += luma;
    saturationTotal += saturation;
    if (luma < 0.025) blackPixels += 1;
    if (luma >= 0.08 && luma < 0.48) midtonePixels += 1;
    if (luma >= 0.86) highlightPixels += 1;
    if (luma >= 0.035) contentPixels += 1;
  }

  let medianBucket = 0;
  let cumulative = 0;
  const medianTarget = Math.ceil(width * height * 0.5);
  for (; medianBucket < histogram.length; medianBucket += 1) {
    cumulative += histogram[medianBucket];
    if (cumulative >= medianTarget) break;
  }

  let edgeCount = 0;
  let edgeComparisons = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (x + 1 < width) {
        edgeComparisons += 1;
        if (Math.abs(luminance[index] - luminance[index + 1]) > 0.075) edgeCount += 1;
      }
      if (y + 1 < height) {
        edgeComparisons += 1;
        if (Math.abs(luminance[index] - luminance[index + width]) > 0.075) edgeCount += 1;
      }
    }
  }

  const count = width * height;
  return {
    meanLuma: rounded(lumaTotal / count),
    medianLuma: rounded(medianBucket / 255),
    blackRatio: rounded(blackPixels / count),
    midtoneRatio: rounded(midtonePixels / count),
    highlightRatio: rounded(highlightPixels / count),
    meanSaturation: rounded(saturationTotal / count),
    edgeDensity: rounded(edgeComparisons ? edgeCount / edgeComparisons : 0),
    contentCoverage: rounded(contentPixels / count),
  };
}

const rangeCheck = (
  id: string,
  label: string,
  owner: VisualCheckOwner,
  measured: number,
  range: readonly [number, number],
  reason: string,
): VisualProbeCheck => {
  const distance = measured < range[0] ? range[0] - measured : measured > range[1] ? measured - range[1] : 0;
  const tolerance = Math.max((range[1] - range[0]) * 0.2, 0.025);
  const status: VisualCheckStatus = distance === 0 ? 'pass' : distance <= tolerance ? 'warning' : 'fail';
  return {
    id,
    label,
    status,
    owner,
    measured,
    target: `${range[0].toFixed(2)}–${range[1].toFixed(2)}`,
    reason,
  };
};

export function createVisualIntelligenceReport(
  metrics: VisualFrameMetrics,
  context: {
    floorId: string;
    cameraMode: string;
    cinematic: boolean;
    nightVision: boolean;
    capturedAt?: string;
  },
): VisualIntelligenceReport {
  const contract = TOWNHOUSE_VISUAL_CONTRACT;
  const automatedChecks = [
    rangeCheck('luma', '曝光中枢', 'lighting', metrics.meanLuma, contract.meanLuma, '防止黑位吞没或整体漂白。'),
    rangeCheck('black-crush', '黑位保留', 'lighting', metrics.blackRatio, contract.blackRatio, '夜景需要黑色，但不能丢失室内层次。'),
    rangeCheck('midtone', '中间调层次', 'materials', metrics.midtoneRatio, contract.midtoneRatio, '家具材质依赖足够的中间调才能可读。'),
    rangeCheck('highlight', '高光克制', 'lighting', metrics.highlightRatio, contract.highlightRatio, '限制灯具与白墙的过曝面积。'),
    rangeCheck('saturation', '色彩密度', 'materials', metrics.meanSaturation, contract.meanSaturation, '维持低饱和年代感，避免灰泥或糖果色。'),
    rangeCheck('edges', '构造信息量', 'geometry', metrics.edgeDensity, contract.edgeDensity, '只检测画面边缘密度，不等同于真实建模质量。'),
    rangeCheck('coverage', '主体占屏', 'composition', metrics.contentCoverage, contract.contentCoverage, '避免房屋缩成桌面模型或裁切失控。'),
  ];
  const humanChecks: VisualProbeCheck[] = [
    {
      id: 'reference-silhouette', label: '参考轮廓与比例', status: 'human-required', owner: 'geometry',
      target: '双图对照', reason: '像素统计无法判断家具是否真正学习了参考构造。',
    },
    {
      id: 'hero-construction', label: '英雄资产构造', status: 'human-required', owner: 'geometry',
      target: '近景 / 侧面 / 互动状态', reason: '必须检查厚度、接缝、五金与独立运动部件。',
    },
    {
      id: 'garment-continuity', label: '人物着装与动作连续性', status: 'human-required', owner: 'characters',
      target: '静止 / 行走 / 转身 / 楼梯', reason: '自动亮度分数不能发现穿模、裸体缝隙或僵硬步态。',
    },
    {
      id: 'material-response', label: '材质物理响应', status: 'human-required', owner: 'materials',
      target: '暖灯 / 冷窗 / 近景', reason: '必须肉眼确认木、布、金属和灰泥不共享同一种塑料高光。',
    },
  ];
  const weighted = automatedChecks.reduce((total, check) => total + (check.status === 'pass' ? 1 : check.status === 'warning' ? 0.5 : 0), 0);
  const checks = [...automatedChecks, ...humanChecks];
  return {
    version: 'gami-visual-ci-v1',
    capturedAt: context.capturedAt ?? new Date().toISOString(),
    referenceId: contract.referenceId,
    floorId: context.floorId,
    cameraMode: context.cameraMode,
    variant: context.nightVision ? 'night-vision' : context.cinematic ? 'cinematic' : 'editor',
    metrics,
    checks,
    automatedScore: Math.round(weighted / automatedChecks.length * 100),
    productionCertifiable: false,
    blockers: checks.filter((check) => check.status === 'fail' || check.status === 'human-required').map((check) => check.label),
  };
}

