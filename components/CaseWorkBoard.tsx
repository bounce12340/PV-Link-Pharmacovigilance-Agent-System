import React, { useEffect, useState } from 'react';
import { AEReport } from '../services/aeReport';
import { CaseWork, WorkResult, getCaseWork, saveCaseWork, workUsers } from '../services/caseWork';
import { matchesWork } from '../services/caseWorkModel.js';
import { hasRemoteEndpoint } from '../services/aeApi';
import { useT } from '../i18n/LangContext';
const inputClass = 'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-sm';
const buttonClass = 'rounded-lg px-3 py-2 bg-indigo-600 text-white text-sm disabled:opacity-40';
export default function CaseWorkBoard({ cases, actor }: { cases: AEReport[]; actor: string }) {
  const t = useT();
  const [records, setRecords] = useState<Record<string, WorkResult>>({});
  const [users, setUsers] = useState<string[]>([]);
  const [id, setId] = useState('');
  const [draft, setDraft] = useState<CaseWork | null>(null);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const caseIds = cases.map(c => c.id).join('|');
  const error = (e: any) => setMessage(t(e.message === 'WORK_CONFLICT' ? 'work.conflict' : e.message === 'INVALID_WORK' ? 'work.invalid' : 'work.error'));
  useEffect(() => {
    let active = true; setLoaded(false);
    (async () => {
      try {
        const options = await workUsers();
        const next: Record<string, WorkResult> = {};
        // Bounded concurrency: avoid launching hundreds of requests at once.
        for (const c of cases) next[c.id] = await getCaseWork(c.id);
        if (active) { setRecords(next); setUsers(options); setLoaded(true); }
      } catch (e) { if (active) error(e); }
    })();
    return () => { active = false; };
  }, [caseIds]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const edit = (patch: Partial<CaseWork>) => { setDraft({ ...draft!, ...patch }); setDirty(true); setMessage(''); };
  const open = (next: string) => {
    if (dirty) { setMessage(t('work.dirty')); return; }
    setId(next); setDraft(structuredClone(records[next].work)); setMessage('');
  };
  const reload = async () => {
    setBusy(true);
    try {
      if (id) { const result = await getCaseWork(id); setRecords(v => ({ ...v, [id]: result })); setDraft(result.work); }
      else { const next: Record<string, WorkResult> = {}; for (const c of cases) next[c.id] = await getCaseWork(c.id); setRecords(next); setUsers(await workUsers()); setLoaded(true); }
      setDirty(false); setMessage('');
    } catch (e) { error(e); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try { const result = await saveCaseWork(id, draft!); setRecords(v => ({ ...v, [id]: { ...result, audit: [...new Map([...result.audit, ...(v[id]?.audit || [])].map(a => [a.version, a])).values()].sort((a, b) => b.version - a.version).slice(0, 100) } })); setDraft(result.work); setDirty(false); setMessage(t('work.saved')); }
    catch (e) { error(e); } finally { setBusy(false); }
  };
  const shown = cases.filter(c => records[c.id] && matchesWork(records[c.id].work, filter, hasRemoteEndpoint() ? actor : 'local-demo', new Date().toLocaleDateString('sv-SE')));
  return <details className="m-3 rounded-xl border border-indigo-200 dark:border-indigo-800 p-3">
    <summary className="font-bold cursor-pointer">{t('work.title')}</summary>
    <p className="text-xs my-2">{t('work.note')}</p>
    {!hasRemoteEndpoint() && <p className="text-amber-700 text-xs">{t('work.demo')}</p>}
    <div role="status" aria-live="polite" className="text-sm my-2">{message}</div>
    <div className="flex gap-2 flex-wrap">
      {(['all', 'mine', 'unassigned', 'overdue'] as const).map(f => <button key={f} aria-pressed={filter === f} className={buttonClass} onClick={() => setFilter(f)}>{t(`work.${f}`)}</button>)}
      <button disabled={busy} className={buttonClass} onClick={reload}>{t('work.reload')}</button>
    </div>
    {!loaded ? <p>{t('work.loading')}</p> : <div className="flex gap-2 flex-wrap my-3">{shown.length ? shown.map(c => <button disabled={busy} key={c.id} className={buttonClass} onClick={() => open(c.id)}>{c.caseNumber || c.id} · {records[c.id].work.assignee || t('work.unassigned')} · {records[c.id].work.workDueDate}</button>) : <p>{t('work.empty')}</p>}</div>}
    {draft && cases.some(c => c.id === id) && <fieldset disabled={busy} className="space-y-3">
      <legend className="font-bold">{cases.find(c => c.id === id)?.caseNumber || id} · v{draft.version}{dirty ? ' *' : ''}</legend>
      <label className="block">{t('work.owner')}<select className={inputClass} value={draft.assignee} onChange={e => edit({ assignee: e.target.value })}><option value="">{t('work.unassigned')}</option>{[...new Set([...users, ...(draft.assignee ? [draft.assignee] : [])])].map(u => <option key={u}>{u}</option>)}</select></label>
      <label className="block">{t('work.next')}<textarea maxLength={1000} className={inputClass} value={draft.nextAction} onChange={e => edit({ nextAction: e.target.value })}/></label>
      <label className="block">{t('work.due')}<input type="date" className={inputClass} value={draft.workDueDate} onChange={e => edit({ workDueDate: e.target.value })}/></label>
      <h4 className="font-bold">{t('work.items')}</h4>
      {draft.items.map((item, i) => <div key={item.id} className="flex gap-2"><input aria-label={t('work.items')} maxLength={300} className={inputClass} value={item.title} onChange={e => edit({ items: draft.items.map((v, j) => j === i ? { ...v, title: e.target.value } : v) })}/><select aria-label={t('work.items')} className={inputClass} value={item.status} onChange={e => edit({ items: draft.items.map((v, j) => j === i ? { ...v, status: e.target.value } : v) })}>{(['pending', 'received', 'cancelled'] as const).map(s => <option key={s} value={s}>{t(`work.${s}`)}</option>)}</select></div>)}
      <button className={buttonClass} disabled={draft.items.length >= 50} onClick={() => edit({ items: [...draft.items, { id: crypto.randomUUID(), title: '', status: 'pending' }] })}>{t('work.addItem')}</button>
      <h4 className="font-bold">{t('work.contacts')}</h4>
      {draft.contacts.map((contact, i) => <div key={contact.id} className="border rounded-lg p-2 space-y-2">
        {(['date', 'result', 'nextFollowUp'] as const).map(key => <label key={key} className="block">{t(key === 'nextFollowUp' ? 'work.follow' : `work.${key}`)}<input className={inputClass} type={key === 'result' ? 'text' : 'date'} maxLength={1000} value={contact[key]} onChange={e => edit({ contacts: draft.contacts.map((v, j) => j === i ? { ...v, [key]: e.target.value } : v) })}/></label>)}
        <label className="block">{t('work.method')}<select className={inputClass} value={contact.method} onChange={e => edit({ contacts: draft.contacts.map((v, j) => j === i ? { ...v, method: e.target.value } : v) })}>{(['phone', 'email', 'visit', 'other'] as const).map(m => <option key={m} value={m}>{t(`work.${m}`)}</option>)}</select></label>
      </div>)}
      <button className={buttonClass} disabled={draft.contacts.length >= 100} onClick={() => edit({ contacts: [...draft.contacts, { id: crypto.randomUUID(), date: new Date().toLocaleDateString('sv-SE'), method: 'phone', result: '', nextFollowUp: '' }] })}>{t('work.addContact')}</button>
      <button className={`${buttonClass} ml-2`} disabled={!dirty} onClick={save}>{t('work.save')}</button>
      <h4>{t('work.audit')}</h4><ul className="text-xs">{records[id]?.audit.map(a => <li key={a.version}>v{a.version} · {a.at} · {a.actor}</li>)}</ul>
    </fieldset>}
  </details>;
}
