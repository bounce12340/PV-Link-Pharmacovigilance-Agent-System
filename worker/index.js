// PV-Link LLM Proxy — Cloudflare Worker
//
// 前端把 { prompt } POST 到這裡，Worker 用後端保存的金鑰呼叫任何 OpenAI 相容
// 的 Chat Completions 端點（OpenAI 官方 / Azure OpenAI / Ollama / OpenRouter / Kimi…），
// 再把模型回傳的 JSON 字串以 { content } 回給前端。金鑰永不進前端 bundle。
//
// 環境設定（見 wrangler.toml 與 README）：
//   LLM_BASE_URL  例 https://api.openai.com/v1 、 https://openrouter.ai/api/v1
//   LLM_MODEL     例 gpt-4o-mini 、 moonshotai/kimi-k2
//   LLM_API_KEY   （secret）呼叫上游服務用的金鑰
//   LLM_JSON_MODE （選填）設 "0" 可關閉 response_format（相容不支援的服務）
//   ALLOW_ORIGIN  （強烈建議）允許的前端網域；正式環境務必設定
//   PROXY_TOKEN   （強烈建議，secret）共享密鑰；設定後前端須帶 X-PV-Token，
//                  否則此 Worker 等於開放式代理，任何人都能燒你的金鑰

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-PV-Token',
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }

    // 共享密鑰驗證（有設定 PROXY_TOKEN 才啟用）
    if (env.PROXY_TOKEN && request.headers.get('X-PV-Token') !== env.PROXY_TOKEN) {
      return json({ error: 'unauthorized' }, 401, cors);
    }

    let prompt;
    try {
      ({ prompt } = await request.json());
    } catch {
      return json({ error: 'invalid JSON body' }, 400, cors);
    }
    if (!prompt || typeof prompt !== 'string') {
      return json({ error: 'missing prompt' }, 400, cors);
    }

    const base = (env.LLM_BASE_URL || '').replace(/\/$/, '');
    if (!base || !env.LLM_API_KEY) {
      return json({ error: 'proxy not configured' }, 500, cors);
    }

    const jsonMode = (env.LLM_JSON_MODE ?? '1') !== '0';

    let upstream;
    try {
      upstream = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.LLM_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } catch (e) {
      // 對外只回通用訊息，細節寫 log 以免洩漏內部/上游資訊
      console.log('upstream fetch failed:', e);
      return json({ error: 'upstream request failed' }, 502, cors);
    }

    if (!upstream.ok) {
      console.log('upstream error', upstream.status, await upstream.text());
      return json({ error: `upstream ${upstream.status}` }, 502, cors);
    }

    const data = await upstream.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    return json({ content }, 200, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
