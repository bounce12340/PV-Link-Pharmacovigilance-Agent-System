// MedDRA 對照層（種子詞典）。
//
// ⚠️ 完整 MedDRA 是 ICH 授權的專有詞典，無法內建於開源前端。
// 本模組提供「常見 PV 首選術語(PT) → 系統器官分類(SOC)」的種子對照，用途：
//   1) 離線校驗 AI 猜測的 meddra_pt_candidate 是否為已知詞條（matched 標記）；
//   2) 補上對應的 SOC，讓訊號聚合能按器官系統分群。
// 使用者可自行擴充 MEDDRA_SEED，或改接授權的 MedDRA API / MSSO 詞典檔。

export interface MeddraSeedEntry {
  pt: string;         // 首選術語 (Preferred Term)
  soc: string;        // 系統器官分類 (System Organ Class)
  synonyms?: string[]; // 常見別名 / LLT 級別的口語說法
}

export interface MeddraLookupResult {
  input: string;
  pt: string;         // 命中時為標準 PT，未命中回原字串
  soc: string | null;
  matched: boolean;   // 是否命中種子詞典
}

// 種子集：涵蓋常見 PV 事件與 fibrate/statin 類藥物重點事件。
export const MEDDRA_SEED: MeddraSeedEntry[] = [
  // 肌肉骨骼
  { pt: 'Rhabdomyolysis', soc: 'Musculoskeletal and connective tissue disorders', synonyms: ['橫紋肌溶解'] },
  { pt: 'Myalgia', soc: 'Musculoskeletal and connective tissue disorders', synonyms: ['muscle pain', '肌肉疼痛', '肌痛'] },
  { pt: 'Myopathy', soc: 'Musculoskeletal and connective tissue disorders', synonyms: ['肌病變'] },
  { pt: 'Muscular weakness', soc: 'Musculoskeletal and connective tissue disorders', synonyms: ['肌無力'] },
  // 肝膽
  { pt: 'Hepatotoxicity', soc: 'Hepatobiliary disorders', synonyms: ['liver toxicity', '肝毒性'] },
  { pt: 'Hepatic failure', soc: 'Hepatobiliary disorders', synonyms: ['liver failure', '肝衰竭'] },
  { pt: 'Cholelithiasis', soc: 'Hepatobiliary disorders', synonyms: ['gallstones', '膽結石'] },
  { pt: 'Cholestasis', soc: 'Hepatobiliary disorders', synonyms: ['膽汁鬱積'] },
  { pt: 'Jaundice', soc: 'Hepatobiliary disorders', synonyms: ['黃疸'] },
  // 檢驗
  { pt: 'Blood creatine phosphokinase increased', soc: 'Investigations', synonyms: ['cpk increased', 'ck increased', 'creatine kinase increased', 'cpk 上升'] },
  { pt: 'Hepatic enzyme increased', soc: 'Investigations', synonyms: ['increased hepatic enzymes', 'elevated liver enzymes', 'alt increased', 'ast increased', '肝酵素上升'] },
  { pt: 'Blood creatinine increased', soc: 'Investigations', synonyms: ['creatinine increased', '肌酸酐上升'] },
  { pt: 'Transaminases increased', soc: 'Investigations', synonyms: ['transaminitis'] },
  // 腸胃
  { pt: 'Pancreatitis', soc: 'Gastrointestinal disorders', synonyms: ['胰臟炎', '胰腺炎'] },
  { pt: 'Nausea', soc: 'Gastrointestinal disorders', synonyms: ['噁心'] },
  { pt: 'Vomiting', soc: 'Gastrointestinal disorders', synonyms: ['嘔吐'] },
  { pt: 'Diarrhoea', soc: 'Gastrointestinal disorders', synonyms: ['diarrhea', '腹瀉'] },
  { pt: 'Abdominal pain', soc: 'Gastrointestinal disorders', synonyms: ['腹痛'] },
  { pt: 'Gastrointestinal haemorrhage', soc: 'Gastrointestinal disorders', synonyms: ['gi bleeding', 'gastrointestinal hemorrhage', '腸胃道出血'] },
  // 皮膚
  { pt: 'Rash', soc: 'Skin and subcutaneous tissue disorders', synonyms: ['皮疹', '紅疹'] },
  { pt: 'Pruritus', soc: 'Skin and subcutaneous tissue disorders', synonyms: ['itching', '搔癢'] },
  { pt: 'Stevens-Johnson syndrome', soc: 'Skin and subcutaneous tissue disorders', synonyms: ['sjs', '史蒂芬強生症候群'] },
  { pt: 'Toxic epidermal necrolysis', soc: 'Skin and subcutaneous tissue disorders', synonyms: ['ten'] },
  { pt: 'Angioedema', soc: 'Skin and subcutaneous tissue disorders', synonyms: ['血管性水腫'] },
  // 免疫
  { pt: 'Anaphylactic reaction', soc: 'Immune system disorders', synonyms: ['anaphylaxis', '過敏性休克', '過敏反應'] },
  { pt: 'Hypersensitivity', soc: 'Immune system disorders', synonyms: ['過敏', '超敏反應'] },
  // 血液
  { pt: 'Thrombocytopenia', soc: 'Blood and lymphatic system disorders', synonyms: ['血小板低下', '血小板減少'] },
  { pt: 'Agranulocytosis', soc: 'Blood and lymphatic system disorders', synonyms: ['顆粒球缺乏'] },
  { pt: 'Anaemia', soc: 'Blood and lymphatic system disorders', synonyms: ['anemia', '貧血'] },
  { pt: 'Neutropenia', soc: 'Blood and lymphatic system disorders', synonyms: ['嗜中性球低下'] },
  // 心臟
  { pt: 'Electrocardiogram QT prolonged', soc: 'Investigations', synonyms: ['qt prolongation', 'qt prolonged', 'qt 延長'] },
  { pt: 'Torsade de pointes', soc: 'Cardiac disorders', synonyms: ['尖端扭轉性心室頻脈'] },
  { pt: 'Myocardial infarction', soc: 'Cardiac disorders', synonyms: ['heart attack', '心肌梗塞'] },
  { pt: 'Bradycardia', soc: 'Cardiac disorders', synonyms: ['心搏過緩'] },
  { pt: 'Tachycardia', soc: 'Cardiac disorders', synonyms: ['心搏過速'] },
  // 血管
  { pt: 'Hypertension', soc: 'Vascular disorders', synonyms: ['高血壓'] },
  { pt: 'Hypotension', soc: 'Vascular disorders', synonyms: ['低血壓'] },
  { pt: 'Deep vein thrombosis', soc: 'Vascular disorders', synonyms: ['dvt', '深部靜脈栓塞'] },
  { pt: 'Pulmonary embolism', soc: 'Respiratory, thoracic and mediastinal disorders', synonyms: ['pe', '肺栓塞'] },
  // 腎
  { pt: 'Acute kidney injury', soc: 'Renal and urinary disorders', synonyms: ['aki', 'acute renal failure', '急性腎損傷'] },
  { pt: 'Renal failure', soc: 'Renal and urinary disorders', synonyms: ['腎衰竭'] },
  // 神經
  { pt: 'Headache', soc: 'Nervous system disorders', synonyms: ['頭痛'] },
  { pt: 'Dizziness', soc: 'Nervous system disorders', synonyms: ['頭暈'] },
  { pt: 'Seizure', soc: 'Nervous system disorders', synonyms: ['convulsion', '癲癇發作', '抽搐'] },
  { pt: 'Syncope', soc: 'Nervous system disorders', synonyms: ['暈厥'] },
  // 代謝 / 呼吸
  { pt: 'Hyperglycaemia', soc: 'Metabolism and nutrition disorders', synonyms: ['hyperglycemia', '高血糖'] },
  { pt: 'Hypoglycaemia', soc: 'Metabolism and nutrition disorders', synonyms: ['hypoglycemia', '低血糖'] },
  { pt: 'Interstitial lung disease', soc: 'Respiratory, thoracic and mediastinal disorders', synonyms: ['ild', '間質性肺病'] },
  { pt: 'Dyspnoea', soc: 'Respiratory, thoracic and mediastinal disorders', synonyms: ['dyspnea', '呼吸困難'] },
];

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

// 預先建索引：pt 與所有 synonyms 都指向該詞條。
const INDEX: Map<string, MeddraSeedEntry> = (() => {
  const m = new Map<string, MeddraSeedEntry>();
  for (const e of MEDDRA_SEED) {
    m.set(norm(e.pt), e);
    for (const syn of e.synonyms || []) m.set(norm(syn), e);
  }
  return m;
})();

/** 校驗並標準化一個 AI 猜測的 PT。命中種子詞典回標準 PT + SOC；否則 matched=false。 */
export function lookupMeddra(candidate: string | null | undefined): MeddraLookupResult {
  const input = (candidate || '').trim();
  if (!input) return { input, pt: '', soc: null, matched: false };
  const key = norm(input);
  const exact = INDEX.get(key);
  if (exact) return { input, pt: exact.pt, soc: exact.soc, matched: true };
  // 寬鬆比對：只接受「候選片語『包含』某個已知詞條」單一方向（候選較具體），
  // 不做反向（避免 "increased" 之類泛詞誤命中最長詞條）。多命中時取最長詞條（最具體）。
  if (key.length >= 5) {
    let best: { term: string; entry: MeddraSeedEntry } | null = null;
    for (const [term, entry] of INDEX) {
      if (term.length >= 5 && key.includes(term) && (!best || term.length > best.term.length)) {
        best = { term, entry };
      }
    }
    if (best) return { input, pt: best.entry.pt, soc: best.entry.soc, matched: true };
  }
  return { input, pt: input, soc: null, matched: false };
}
