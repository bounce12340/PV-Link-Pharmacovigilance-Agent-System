// 工作台的行為測試：在 jsdom 裡真的 render、點擊、等 effect 跑完。
//
// caseWork.ui.test.ts 用 renderToStaticMarkup 只看得到首次 render（effect 不會跑），
// 個案列表、儲存後的訊息這些「資料載入之後」才出現的東西都測不到。這裡 mock 掉
// service 層，讓元件走完 refresh → 顯示列表 → 開啟 → 儲存 的完整路徑。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

vi.mock('../services/aeApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/aeApi')>()),
  hasRemoteEndpoint: () => true,
}));

const work = (over: Record<string, unknown> = {}) => ({
  version: 3, status: 'in-progress', assignee: 'alice@example.com', nextAction: '', workDueDate: '2026-09-30',
  items: [{ id: 'i1', title: '補實驗室數據', status: 'cancelled' }], contacts: [], ...over,
});

vi.mock('../services/caseWork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/caseWork')>();
  return {
    ...actual,
    workUsers: vi.fn(async () => ['alice@example.com', 'bob@example.com']),
    getWorkbench: vi.fn(async (scope: string) => ({
      timezone: 'Asia/Taipei', today: '2026-10-03', weekStart: '2026-09-28', weekEnd: '2026-10-04', scope,
      from: '2026-10-03', to: '2026-10-03',
      items: [
        { caseId: 'c-1', caseNumber: 'AE-2026-0012', version: 3, status: 'in-progress', assignee: 'alice@example.com', workDueDate: '2026-09-30', overdue: true },
        { caseId: 'c-2', caseNumber: 'AE-2026-0013', version: 1, status: 'todo', assignee: '', workDueDate: '2026-10-05', overdue: false },
      ],
    })),
    getNotifications: vi.fn(async () => ({ notifications: [
      { id: 'n1', kind: 'work_due', caseId: 'c-1', createdAt: '2026-10-03T02:11:00.000Z', readAt: null },
    ] })),
    getCaseWork: vi.fn(async () => ({ work: work(), audit: [
      { version: 3, at: '2026-10-02T16:30:00.000Z', actor: 'alice@example.com', action: 'work_saved' },
    ] })),
    saveCaseWork: vi.fn(async () => ({ work: work({ version: 4 }), audit: [] })),
    readNotifications: vi.fn(async () => ({})),
  };
});

const { default: CaseWorkBoard } = await import('../components/CaseWorkBoard');
const { LangProvider } = await import('../i18n/LangContext');
const { formatTaipeiDateTime } = await import('../services/caseWork');

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

/** 等所有 promise 與 effect 落地。 */
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(LangProvider, null, React.createElement(CaseWorkBoard, { cases: [], actor: 'alice@example.com' })));
  });
  await settle();
}

// 只清呼叫紀錄、保留 mock 實作：各測試要能獨立數 saveCaseWork 被呼叫幾次
beforeEach(async () => { vi.clearAllMocks(); await mount(); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const row = (caseNumber: string) =>
  [...host.querySelectorAll('tbody tr')].find(tr => tr.textContent?.includes(caseNumber)) as HTMLTableRowElement;

const openCase = async (caseNumber: string) => {
  await act(async () => { (row(caseNumber).querySelector('button') as HTMLButtonElement).click(); });
  await settle();
};
const saveButton = () => [...host.querySelectorAll('button')].find(b => b.textContent === '儲存工作') as HTMLButtonElement;
/** React 受控元件要走原生 value setter + input 事件，直接改 .value 不會觸發 onChange。 */
const typeNextAction = async (text: string) => {
  const nextAction = host.querySelectorAll('fieldset textarea')[0] as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(nextAction, text);
    nextAction.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('work board list', () => {
  it('renders cases as a table with column headers instead of dot-joined strings', () => {
    const headers = [...host.querySelectorAll('thead th')].map(th => th.textContent);
    expect(headers).toEqual(['個案編號', '內部工作狀態', '負責人', '內部工作到期日']);
    const cells = [...row('AE-2026-0012').querySelectorAll('td')].map(td => td.textContent?.trim());
    expect(cells[0]).toBe('AE-2026-0012');
    expect(cells[1]).toBe('進行中');
    expect(cells[2]).toBe('alice@example.com');
    // 原本的列表文字是「AE-2026-0012 · 進行中 · alice · …」，這裡守住不再出現那種串接
    expect(host.querySelector('tbody')!.textContent).not.toContain(' · ');
  });

  it('marks internal overdue work with a word, not colour alone, and keeps rose for regulatory alarms', () => {
    const due = row('AE-2026-0012').querySelectorAll('td')[3];
    expect(due.textContent).toContain('逾期');
    // 內部工作逾期是 amber；rose 保留給後台左側的法規時鐘
    expect(due.innerHTML).toContain('amber');
    expect(due.innerHTML).not.toContain('rose');
    expect(row('AE-2026-0013').querySelectorAll('td')[3].textContent).not.toContain('逾期');
  });

  it('shows unassigned work explicitly', () => {
    expect(row('AE-2026-0013').querySelectorAll('td')[2].textContent).toBe('未分派');
  });

  it('exposes one real button per row, named by the case number', () => {
    const buttons = row('AE-2026-0012').querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('AE-2026-0012');
    // 窄寬英文版曾被斷成「AE-2026-」「0012」兩行；編號是識別碼，不能斷
    expect(buttons[0].className).toContain('whitespace-nowrap');
  });

  it('makes the selected scope visually distinct, not only aria-pressed', () => {
    const scopeButtons = [...host.querySelectorAll('button[aria-pressed]')] as HTMLButtonElement[];
    const pressed = scopeButtons.filter(b => b.getAttribute('aria-pressed') === 'true');
    const unpressed = scopeButtons.filter(b => b.getAttribute('aria-pressed') === 'false');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toBe('今日');
    // 原本選取與未選取共用同一個 class，畫面上看不出目前在哪個範圍
    unpressed.forEach(b => expect(b.className).not.toBe(pressed[0].className));
  });

  it('shows notification time in Asia/Taipei rather than raw ISO', () => {
    const li = host.querySelector('section li')!;
    expect(li.textContent).toContain('2026-10-03 10:11');
    expect(li.textContent).not.toContain('T02:11');
  });
});

describe('work board editor', () => {

  it('titles the editor with the human case number and marks the open row', async () => {
    await openCase('AE-2026-0012');
    expect(host.querySelector('legend')!.textContent).toContain('AE-2026-0012');
    expect(row('AE-2026-0012').querySelector('button')!.getAttribute('aria-current')).toBe('true');
  });

  it('labels a cancelled information request in words, not as a raw translation key', async () => {
    await openCase('AE-2026-0012');
    // 只看補件項目自己的下拉：工作狀態下拉也有「已取消」，混在一起看會讓這條斷言永遠成立
    const itemStatus = host.querySelector('select[aria-label="取得狀態 1"]') as HTMLSelectElement;
    expect(itemStatus.value).toBe('cancelled');
    expect(itemStatus.selectedOptions[0].textContent).toBe('已取消');
    const allOptions = [...host.querySelectorAll('fieldset option')].map(o => o.textContent);
    expect(allOptions.join('|')).not.toContain('work.');
  });

  it('associates editor fields with their visible labels', async () => {
    await openCase('AE-2026-0012');
    const selects = [...host.querySelectorAll('fieldset select')] as HTMLSelectElement[];
    const statusSelect = selects[0];
    // getElementById 而非 querySelector：useId 產生的 id 含選擇器特殊字元，jsdom 又沒有 CSS.escape
    const label = document.getElementById(statusSelect.getAttribute('aria-labelledby')!);
    expect(label?.textContent).toBe('內部工作狀態');
  });

  it('shows audit time in Asia/Taipei, crossing midnight correctly', async () => {
    await openCase('AE-2026-0012');
    // 2026-10-02T16:30Z 在台北已經是 10/03 00:30——照 ISO 原樣顯示會差一天
    const auditRow = host.querySelectorAll('[aria-labelledby$="-audit"] table tbody tr')[0];
    expect(auditRow.textContent).toContain('2026-10-03 00:30');
  });

  it('names audit actions in words, but shows an unknown action code verbatim', async () => {
    const { getCaseWork } = await import('../services/caseWork');
    vi.mocked(getCaseWork).mockResolvedValueOnce({ work: work() as any, audit: [
      { version: 3, at: '2026-10-02T16:30:00.000Z', actor: 'alice@example.com', action: 'work_saved' },
      { version: 2, at: '2026-10-01T16:30:00.000Z', actor: 'alice@example.com', action: 'work_archived' },
    ] });
    await openCase('AE-2026-0012');
    const actions = [...host.querySelectorAll('[aria-labelledby$="-audit"] table tbody tr')].map(tr => tr.lastElementChild!.textContent);
    // 未知代碼不能被「翻譯」成看似合理的字——稽核紀錄寧可露出原文
    expect(actions).toEqual(['儲存', 'work_archived']);
  });

  it('keeps the saved confirmation visible after the post-save refresh', async () => {
    await openCase('AE-2026-0012');
    await typeNextAction('電話追蹤藥師');
    expect(host.querySelector('legend')!.textContent).toContain('未儲存');

    const save = saveButton();
    expect(save.getAttribute('aria-disabled')).toBe('false');
    await act(async () => { save.click(); });
    await settle();

    // 原本儲存後會接著 refresh，而 refresh 成功時會清空訊息，「已儲存」一閃即逝
    const status = host.querySelector('[role="status"][aria-live="polite"]')!;
    expect(status.textContent).toBe('已儲存');
    expect(host.querySelector('legend')!.textContent).not.toContain('未儲存');
  });
});

describe('work board keyboard focus', () => {
  it('never natively disables the save button, so focus is not dropped to <body> while or after saving', async () => {
    const { saveCaseWork } = await import('../services/caseWork');
    let finish!: (v: any) => void;
    vi.mocked(saveCaseWork).mockImplementationOnce(() => new Promise(r => { finish = r; }));
    await openCase('AE-2026-0012');
    const save = saveButton();
    // 尚未修改：不能存，但仍可聚焦
    expect(save.disabled).toBe(false);
    expect(save.getAttribute('aria-disabled')).toBe('true');
    expect(save.closest('fieldset')).toBeNull();

    await typeNextAction('改');
    save.focus();
    await act(async () => { save.click(); });
    // 存檔進行中：欄位鎖住，按鈕標示不可用，但焦點還在按鈕上
    expect(host.querySelector('fieldset')!.disabled).toBe(true);
    expect(save.disabled).toBe(false);
    expect(save.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(save);
    // 存檔中再按一次不能送出第二次
    await act(async () => { save.click(); });
    expect(vi.mocked(saveCaseWork)).toHaveBeenCalledTimes(1);

    await act(async () => { finish({ work: { ...work(), version: 4 }, audit: [] }); });
    await settle();
    expect(document.activeElement).toBe(save);
  });
});

describe('formatTaipeiDateTime', () => {
  it('converts UTC to Asia/Taipei and drops seconds', () => {
    expect(formatTaipeiDateTime('2026-10-03T02:11:59.999Z')).toBe('2026-10-03 10:11');
  });
  it('rolls the date forward across midnight', () => {
    expect(formatTaipeiDateTime('2026-10-02T16:30:00.000Z')).toBe('2026-10-03 00:30');
  });
  it('returns unparseable input unchanged rather than inventing a time', () => {
    expect(formatTaipeiDateTime('not-a-date')).toBe('not-a-date');
    expect(formatTaipeiDateTime('')).toBe('');
  });
});
