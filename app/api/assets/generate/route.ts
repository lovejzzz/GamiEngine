export const runtime = 'edge';

type GenerateRequest = {
  assetId?: string;
  kind?: string;
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
  const prompt = [
    `Game asset id: ${body.assetId ?? 'unnamed'}. Type: ${body.kind ?? 'asset'}.`,
    body.prompt,
    `Projection: ${lock.projection ?? 'strict orthographic top-down'}.`,
    `Lighting: ${lock.lighting ?? 'neutral diffuse light'}.`,
    `Palette: ${lock.palette ?? 'natural restrained palette'}.`,
    `Must avoid: ${lock.negative ?? 'text, watermark, scene context'}.`,
    'Return exactly one isolated production-ready game asset. Keep scale and camera rules exact.',
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
