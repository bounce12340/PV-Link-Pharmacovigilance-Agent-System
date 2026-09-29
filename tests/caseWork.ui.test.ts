// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CaseWorkBoard from '../components/CaseWorkBoard';
import { LangProvider } from '../i18n/LangContext';
import { emptyWork } from '../services/caseWorkModel.js';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
describe('work UI and API service regression', () => {
 it('renders translated accessible workbench with internal deadline disclaimer and no automatic action', () => {
   const html = renderToStaticMarkup(React.createElement(LangProvider, null, React.createElement(CaseWorkBoard, { cases: [], actor: 'local-demo' })));
   expect(html).toContain('個案工作狀態、日期工作台與站內提醒'); expect(html).toContain('工作狀態與工作到期日均與法規個案狀態／法規到期日分開');
   expect(html).toContain('今日'); expect(html).toContain('本週'); expect(html).toContain('逾期');
   expect(html).toContain('aria-live="polite"'); expect(html).toContain('不寄信');
 });
 it('uses separate encoded endpoint with credentials and only work body', async () => {
   vi.stubEnv('VITE_AE_API_ENDPOINT', 'https://example.test/api/ae-reports'); vi.resetModules();
   const calls: any[] = [];
   vi.stubGlobal('fetch', async (url: string, init: any) => { calls.push({ url, init }); return new Response(JSON.stringify({ work: { ...emptyWork(), version: 1 }, audit: [] })); });
   const { saveCaseWork } = await import('../services/caseWork');
   expect((await saveCaseWork('case / one', emptyWork())).work.version).toBe(1);
   expect(calls[0].url).toBe('https://example.test/api/ae-reports/case%20%2F%20one/work');
   expect(calls[0].init.method).toBe('PUT'); expect(calls[0].init.credentials).toBe('same-origin');
   expect(JSON.parse(calls[0].init.body)).toEqual(emptyWork());
 });
 it('surfaces conflict and connection failure without local fallback', async () => {
   vi.stubEnv('VITE_AE_API_ENDPOINT', 'https://example.test/api/ae-reports'); vi.resetModules();
   vi.stubGlobal('fetch', async () => new Response('{}', { status: 409 }));
   const { saveCaseWork, getCaseWork } = await import('../services/caseWork');
   await expect(saveCaseWork('demo', emptyWork())).rejects.toThrow('WORK_CONFLICT');
   vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
   await expect(getCaseWork('demo')).rejects.toThrow('offline');
 });
 it('validates before network writes', async () => {
   vi.stubEnv('VITE_AE_API_ENDPOINT', 'https://example.test/api/ae-reports'); vi.resetModules();
   vi.stubGlobal('fetch', async () => { throw new Error('network must not be used'); });
   const { saveCaseWork } = await import('../services/caseWork');
   await expect(saveCaseWork('demo', { ...emptyWork(), workDueDate: 'not-date' })).rejects.toThrow('INVALID_WORK');
 });
});
