// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../worker/index.js';

const domain = 'test.cloudflareaccess.com';
const env = { ACCESS_TEAM_DOMAIN: domain, ACCESS_AUD: 'test-aud' };
let pair: CryptoKeyPair;
let jwk: JsonWebKey;
beforeAll(async () => {
  pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function check(overrides = {}, headerOverrides = {}) {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'test-key' }] })));
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = encode({ alg: 'RS256', kid: 'test-key', ...headerOverrides });
  const payload = encode({ iss: `https://${domain}`, aud: 'test-aud', exp: Math.floor(Date.now() / 1000) + 60, ...overrides });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return worker.fetch(new Request('https://example.test/api', { method: 'POST', body: '{}', headers: { 'Cf-Access-Jwt-Assertion': `${header}.${payload}.${Buffer.from(signature).toString('base64url')}` } }), env);
}
describe('Access JWT verification', () => {
  it('accepts a valid signed token through the authentication boundary', async () => {
    expect((await check()).status).toBe(400); // authenticated; missing prompt
  });
  it.each([{ exp: undefined }, { exp: 0 }, { exp: '9999999999' }, { iss: undefined }, { iss: 'https://other.test' }, { nbf: 'tomorrow' }, { nbf: 9999999999 }, { aud: 'wrong' }, { aud: undefined }, { exp: null }, { nbf: null }])('rejects invalid required claims %j', async (claims) => {
    expect((await check(claims)).status).toBe(401);
  });
  it('rejects an algorithm label inconsistent with the configured verifier', async () => {
    expect((await check({}, { alg: 'HS256' })).status).toBe(401);
  });
  it.each([{ ACCESS_TEAM_DOMAIN: domain }, { ACCESS_AUD: 'test-aud' }])('fails closed for incomplete Access settings', async (settings) => {
    expect((await worker.fetch(new Request('https://example.test/api', { method: 'POST', body: '{}' }), settings)).status).toBe(503);
  });
});
