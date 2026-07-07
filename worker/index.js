// PV-Link LLM Proxy — Cloudflare Worker
//
// 前端把 { prompt } POST 到這裡，Worker 用後端保存的金鑰呼叫任何 OpenAI 相容
// 的 Chat Completions 端點（OpenAI 官方 / Azure OpenAI / Ollama / OpenRouter / Kimi…），
// 再把模型回傳的 JSON 字串以 { content } 回給前端。金鑰永不進前端 bundle。
//
// 需要的環境設定（見 wrangler.toml 與 README）：
//   LLM_BASE_URL  例 https://api.openai.com/v1 、 https://openrouter.ai/api/v1
//   LLM_MODEL     例 gpt-4o-mini 、 moonshotai/kimi-k2
//   LLM_API_KEY   （secret）呼叫上游服務用的金鑰
//   ALLOW_ORIGIN  （選填）允許的前端網域，預設 * ；正式環境建議鎖定

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
      return json({ error: 'proxy not configured (LLM_BASE_URL / LLM_API_KEY)' }, 500, cors);
    }

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
          response_format: { type: 'json_object' },
        }),
      });
    } catch (e) {
      return json({ error: `upstream fetch failed: ${e}` }, 502, cors);
    }

    if (!upstream.ok) {
      return json({ error: `upstream ${upstream.status}`, detail: await upstream.text() }, 502, cors);
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
