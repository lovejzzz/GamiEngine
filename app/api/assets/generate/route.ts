export const runtime = 'edge';

type GenerateRequest = {
  assetId?: string;
  kind?: string;
  usage?: 'runtime-texture' | 'reference-study' | 'runtime-sprite';
  prompt?: string;
  styleLock?: {
    projection?: string;
    lighting?: string;
    palette?: string;
    negative?: string;
  };
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { message: '图片管线已准备好；请在服务端设置 OPENAI_API_KEY 后再生成。Key 不会进入浏览器。' },
      { status: 503 },
    );
  }
  const body = await request.json() as GenerateRequest;
  if (!body.prompt || body.prompt.length > 4000) {
    return Response.json({ message: '资产 prompt 缺失或过长。' }, { status: 400 });
  }
  const lock = body.styleLock ?? {};
  const workflowRule = body.usage === 'runtime-texture'
    ? 'Create one seamless, edge-to-edge material surface scan with neutral diffuse lighting. No object silhouette, folds, perspective, hardware, cast shadow, text, or scene context.'
    : body.usage === 'reference-study'
      ? 'Create one coherent 3D object design reference that clearly teaches silhouette, proportions, construction, material zones, palette, and wear. Keep all independently interactive doors, drawers, lids, cushions, or loose pieces visually separable. This is a modeling reference, never a runtime sprite.'
      : 'Create one isolated reusable sprite or atlas exactly matching the requested frame layout and alpha requirements.';
  const prompt = [
    `Game asset id: ${body.assetId ?? 'unnamed'}. Type: ${body.kind ?? 'asset'}.`,
    `Pipeline usage: ${body.usage ?? 'unspecified'}.`,
    body.prompt,
    `Projection: ${lock.projection ?? 'strict orthographic top-down'}.`,
    `Lighting: ${lock.lighting ?? 'neutral diffuse light'}.`,
    `Palette: ${lock.palette ?? 'natural restrained palette'}.`,
    `Must avoid: ${lock.negative ?? 'text, watermark, scene context'}.`,
    workflowRule,
  ].join('\n');
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt }),
  });
  const result = await response.json() as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
  if (!response.ok || !result.data?.[0]?.b64_json) {
    return Response.json({ message: result.error?.message ?? 'OpenAI 没有返回图片。' }, { status: response.status || 502 });
  }
  return Response.json({ image: `data:image/png;base64,${result.data[0].b64_json}` });
}
