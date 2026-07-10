// PV-Link LLM Proxy — Cloudflare Worker
//
// 前端把 { prompt } POST 到這裡，Worker 用後端保存的金鑰呼叫任何 OpenAI 相容
// 的 Chat Completions 端點（OpenAI 官方 / Azure OpenAI / Ollama / OpenRouter / Kimi…），
// 再把模型回傳的 JSON 字串以 { content } 回給前端。金鑰永不進前端 bundle。
//
// 存取控制：本 Worker 掛在受 Cloudflare Access 保護的網域下（pvlink.uic-ai.com/api/*）。
// 請求須帶 Access 於登入後注入的 JWT（Cf-Access-Jwt-Assertion），Worker 驗證其簽章、
// aud、iss、exp 才放行——取代「前端持有共享密鑰」這種必然外洩的作法。
//
// 環境設定（見 wrangler.toml 與 README）：
//   LLM_BASE_URL        例 https://ollama.com/v1 、 https://api.openai.com/v1
//   LLM_MODEL           例 deepseek-v4-pro 、 gpt-4o-mini
//   LLM_API_KEY         （secret）呼叫上游服務用的金鑰
//   LLM_JSON_MODE       （選填）設 "0" 可關閉 response_format（相容不支援的服務）
//   ALLOW_ORIGIN        （選填）允許的前端網域；同源部署下非必要
//   ACCESS_TEAM_DOMAIN  Access team 網域，例 uic-ai.cloudflareaccess.com
//   ACCESS_AUD          此 Access application 的 Audience (AUD) tag
//   （未設 ACCESS_TEAM_DOMAIN/ACCESS_AUD 時跳過驗證，僅供本機開發）

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// ── Cloudflare Access JWT 驗證 ───────────────────────────────────────────────
// JWKS 於 isolate 存活期間快取，避免每次請求都打 certs 端點。
let _jwks = { domain: null, keys: null, at: 0 };
async function getJwks(teamDomain) {
  const now = Date.now();
  if (_jwks.domain === teamDomain && _jwks.keys && now - _jwks.at < 3600000) return _jwks.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`fetch certs failed ${res.status}`);
  const { keys } = await res.json();
  _jwks = { domain: teamDomain, keys, at: now };
  return keys;
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  if (s.length % 4) s += '='.repeat(4 - (s.length % 4));
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

// 驗證成功回 payload，否則丟出錯誤。
async function verifyAccessJwt(token, teamDomain, aud) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed jwt');
  const [h, p, s] = parts;
  const header = b64urlToJson(h);
  const jwk = (await getJwks(teamDomain)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('signing key not found');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('bad signature');
  const payload = b64urlToJson(p);
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) throw new Error('expired');
  if (payload.nbf && now < payload.nbf) throw new Error('not yet valid');
  if (payload.iss && payload.iss !== `https://${teamDomain}`) throw new Error('issuer mismatch');
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (aud && !auds.includes(aud)) throw new Error('aud mismatch');
  return payload;
}

// 以 KV 做「固定時間窗」速率限制（每 IP 每分鐘 N 次）。
// 需綁定 KV namespace（binding 名 RATE_LIMIT，見 wrangler.toml）；未綁定則自動略過。
// 回傳 true 表示「已超限，應擋下」。
async function isRateLimited(request, env) {
  if (!env.RATE_LIMIT) return false; // 未設定 KV → 不啟用（本機/未綁定時仍可運作）
  const max = Number(env.RATE_LIMIT_MAX || '30');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const windowStart = Math.floor(Date.now() / 60000); // 每 60 秒一個窗
  const key = `rl:${ip}:${windowStart}`;
  const current = Number((await env.RATE_LIMIT.get(key)) || '0');
  if (current >= max) return true;
  // 寫回計數，TTL 120 秒讓窗自然過期（KV 最小 TTL 為 60）
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 120 });
  return false;
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

    // Cloudflare Access 驗證（有設定 team domain + aud 才啟用）。
    // Access 於登入後注入 Cf-Access-Jwt-Assertion；亦支援 CF_Authorization cookie 作為後備。
    if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
      const jwt = request.headers.get('Cf-Access-Jwt-Assertion')
        || (request.headers.get('Cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];
      if (!jwt) return json({ error: 'unauthorized: missing Access token' }, 401, cors);
      try {
        await verifyAccessJwt(jwt, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
      } catch (e) {
        console.log('access jwt verify failed:', e.message);
        return json({ error: 'unauthorized' }, 401, cors);
      }
    }

    // 速率限制（有綁定 RATE_LIMIT KV 才啟用）：擋濫用、保護金鑰額度
    try {
      if (await isRateLimited(request, env)) {
        return json({ error: 'rate limit exceeded, please retry later' }, 429, cors);
      }
    } catch (e) {
      console.log('rate limit check failed (fail-open):', e); // KV 異常時放行，不阻斷正常使用
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
