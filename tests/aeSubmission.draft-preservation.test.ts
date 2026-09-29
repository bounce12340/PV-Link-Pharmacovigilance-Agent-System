import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeFormSubmission } from '../services/aeSubmission';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', undefined);
  localStorage.clear();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function submitIn(mode: 'remote' | 'queue' | 'conflict' | 'remote_5xx' | 'storage_failure' | 'local' | 'local_storage_failure') {
  const local = mode === 'local' || mode === 'local_storage_failure';
  vi.stubEnv('VITE_AE_API_ENDPOINT', local ? '' : 'https://synthetic.invalid/api/ae-reports');
  if (mode === 'remote') vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: 1 }), { status: 200 })));
  if (mode === 'queue' || mode === 'storage_failure') vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
  if (mode === 'remote_5xx') vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
  if (mode === 'conflict') vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 409 })));
  if (mode === 'storage_failure' || mode === 'local_storage_failure') vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const { emptyAEReport } = await import('../services/aeReport');
  const { submitAEReport } = await import('../services/aeApi');
  return submitAEReport(emptyAEReport('2026-09-29'));
}

describe('AE form submission draft-preservation contract', () => {
  it.each([
    ['confirmed remote delivery', 'remote', 'remote_delivered'],
    ['local demo save (not remote delivery)', 'local', 'local_saved'],
    ['network failure durably queued pending', 'queue', 'queued_pending'],
    ['remote 5xx durably queued pending', 'remote_5xx', 'queued_pending'],
    ['HTTP 409 durably queued conflict', 'conflict', 'queued_conflict'],
  ] as const)('%s clears the form draft only after an alternate durable copy', async (_name, mode, state) => {
    const actual = await submitIn(mode);
    const removeDraft = vi.fn(async () => undefined);
    await expect(finalizeFormSubmission(actual, removeDraft)).resolves.toMatchObject({ state, mayClearDraft: true });
    expect(removeDraft).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['network/5xx path and outbox double storage failure', 'storage_failure'],
    ['local demo save storage failure', 'local_storage_failure'],
  ] as const)('%s remains unconfirmed and preserves draft', async (_name, mode) => {
    const actual = await submitIn(mode);
    expect(actual).toMatchObject({ ok: false, channel: 'unconfirmed' });
    expect(actual.message).toContain('佇列寫入失敗');
    const removeDraft = vi.fn(async () => undefined);
    await expect(finalizeFormSubmission(actual, removeDraft)).resolves.toMatchObject({
      state: 'unconfirmed', mayClearDraft: false,
    });
    expect(removeDraft).not.toHaveBeenCalled();
  });

  it('reports remote success when clearing the draft itself fails instead of reaching Done', async () => {
    const actual = await submitIn('remote');
    const removeDraft = vi.fn(async () => { throw new Error('storage delete failure'); });
    await expect(finalizeFormSubmission(actual, removeDraft)).rejects.toThrow('storage delete failure');
    expect(removeDraft).toHaveBeenCalledTimes(1);
  });
});
