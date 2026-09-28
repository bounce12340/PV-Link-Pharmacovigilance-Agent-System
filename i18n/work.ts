export const workZh = {
 'work.title': '個案分派與待辦工作台', 'work.note': '僅供 PV 內部作業；工作到期日不是法規到期日。不寄信、不自動建立追蹤通報。',
 'work.all': '全部', 'work.mine': '我的待辦', 'work.unassigned': '未分派', 'work.overdue': '內部逾期',
 'work.owner': '負責人', 'work.next': '下一步（完成後請清空下一步與工作到期日）', 'work.due': '內部工作到期日',
 'work.items': '補件清單', 'work.addItem': '新增補件項目', 'work.pending': '待取得', 'work.received': '已取得', 'work.cancelled': '取消',
 'work.contacts': '聯絡紀錄', 'work.addContact': '新增聯絡紀錄', 'work.date': '聯絡日期', 'work.method': '聯絡方式', 'work.result': '聯絡結果', 'work.follow': '下次追蹤日期',
 'work.phone': '電話', 'work.email': '電子郵件', 'work.visit': '拜訪', 'work.other': '其他', 'work.save': '儲存工作', 'work.reload': '放棄編輯並重新載入',
 'work.loading': '載入中…', 'work.saved': '已儲存', 'work.error': '無法載入或儲存。請確認連線、權限及 schema；您的編輯尚未儲存。',
 'work.conflict': '其他人已修改。您的編輯仍保留，請先複製需要保留的內容，再放棄編輯並重新載入最新版後重填。',
 'work.invalid': '請檢查必填欄位、日期、長度及負責人；補件最多 50 項，聯絡紀錄最多 100 筆。',
 'work.audit': '伺服器稽核（本機試用為裝置時間）', 'work.dirty': '有未儲存編輯，請先儲存或放棄編輯。', 'work.empty': '沒有符合的個案', 'work.demo': '本機試用：同一瀏覽器保存，無正式身分或安全隔離；請勿輸入真實個資。'
};
export const workEn: Record<keyof typeof workZh, string> = {
 'work.title': 'Case assignment & workbench', 'work.note': 'PV internal only. Internal due dates are NOT regulatory deadlines. No emails or regulatory follow-up cases are created.',
 'work.all': 'All', 'work.mine': 'My work', 'work.unassigned': 'Unassigned', 'work.overdue': 'Internally overdue',
 'work.owner': 'Assignee', 'work.next': 'Next action (clear action and internal due date when complete)', 'work.due': 'Internal work due date',
 'work.items': 'Information requests', 'work.addItem': 'Add request', 'work.pending': 'Pending', 'work.received': 'Received', 'work.cancelled': 'Cancelled',
 'work.contacts': 'Contact history', 'work.addContact': 'Add contact', 'work.date': 'Contact date', 'work.method': 'Method', 'work.result': 'Outcome', 'work.follow': 'Next follow-up date',
 'work.phone': 'Phone', 'work.email': 'Email', 'work.visit': 'Visit', 'work.other': 'Other', 'work.save': 'Save work', 'work.reload': 'Discard edits and reload',
 'work.loading': 'Loading…', 'work.saved': 'Saved', 'work.error': 'Load/save failed. Check connection, permission and schema. Edits are not saved.',
 'work.conflict': 'Another user changed this work. Your edits are retained. Copy anything needed, discard and reload, then reapply your changes.',
 'work.invalid': 'Check required fields, dates, lengths and assignee; maximum 50 requests and 100 contacts.',
 'work.audit': 'Server audit (device time in demo)', 'work.dirty': 'Unsaved edits: save or discard first.', 'work.empty': 'No matching cases', 'work.demo': 'Local demo: this browser only; no authenticated isolation. Do not enter real personal data.'
};
