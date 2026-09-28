import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', undefined);
  vi.stubEnv('VITE_AE_API_ENDPOINT', '');
  localStorage.clear();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('AE durable storage failure reporting', () => {
  it('falls back to localStorage when IndexedDB is unavailable', async () => {
    const { saveValue, loadValue, AE_OUTBOX_KEY } = await import('../services/storage');
    await saveValue(AE_OUTBOX_KEY, [{ id: 'case1' }]);
    expect(await loadValue(AE_OUTBOX_KEY)).toEqual([{ id: 'case1' }]);
  });
  it('rejects outbox and case writes when both storage mechanisms fail', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    const { saveValue, saveRecords, AE_CASES_KEY, AE_OUTBOX_KEY } = await import('../services/storage');
    await expect(saveValue(AE_OUTBOX_KEY, [])).rejects.toThrow('quota');
    await expect(saveRecords(AE_CASES_KEY, [])).rejects.toThrow('quota');
  });
  it('never reports successful local submission after a quota failure', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { submitAEReport } = await import('../services/aeApi');
    const { emptyAEReport } = await import('../services/aeReport');
    const result = await submitAEReport(emptyAEReport('2026-09-28'));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('佇列寫入失敗');
  });
  it('settles an aborted IDB write by attempting fallback instead of hanging', async () => {
    const tx: any = { objectStore: () => ({ put: () => { queueMicrotask(() => tx.onabort()); } }), error: null };
    vi.stubGlobal('indexedDB', { open: () => {
      const req: any = { result: { transaction: () => tx } };
      queueMicrotask(() => req.onsuccess()); return req;
    } });
    const { saveValue, AE_OUTBOX_KEY } = await import('../services/storage');
    await saveValue(AE_OUTBOX_KEY, [{ id: 'aborted' }]);
    expect(JSON.parse(localStorage.getItem('pv_ae_outbox')!)).toEqual([{ id: 'aborted' }]);
  });
});
