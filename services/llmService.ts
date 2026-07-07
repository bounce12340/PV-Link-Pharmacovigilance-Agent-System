
// Provider 無關的 LLM 服務：所有推論走 OpenAI 相容的 Chat Completions 介面，
// 因此 OpenAI 官方、Azure OpenAI、Ollama、OpenRouter、Kimi 等任何 OpenAI-compatible
// 端點都能接，只靠環境變數切換。
//
// 兩種執行模式：
//   1) 有設定 VITE_PV_PROXY_ENDPOINT → 前端只把 prompt 送給後端 proxy，金鑰留在後端（公開/多人用）。
//   2) 未設定 → 前端直連 VITE_LLM_BASE_URL（僅供本機開發，金鑰會進前端）。
const env = (import.meta as any).env || {};
const PROXY_ENDPOINT: string = env.VITE_PV_PROXY_ENDPOINT || '';
// 選填：與後端 proxy 共享的密鑰，隨每次請求送出，避免 proxy 成為開放式代理
const PROXY_TOKEN: string = env.VITE_PV_PROXY_TOKEN || '';
const LLM_BASE_URL: string = (env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const LLM_API_KEY: string = env.VITE_LLM_API_KEY || '';
const LLM_MODEL: string = env.VITE_LLM_MODEL || 'gpt-4o-mini';
// 部分 OpenAI 相容服務（某些 Ollama/OpenRouter 模型）不支援 response_format，
// 設 VITE_LLM_JSON_MODE=0 可關閉，改由 parseJsonLoose 容錯解析。
const JSON_MODE: boolean = env.VITE_LLM_JSON_MODE !== '0';

// NCBI E-utilities API key（可選）。設定後可放寬速率限制至 10 req/s。
const NCBI_API_KEY: string = env.VITE_NCBI_API_KEY || '';

// 評分/摘要每批文獻數上限，避免單一 prompt 超出 token 上限或漏 pmid。
const BATCH_SIZE = 8;

export class PVLLMService {
  /**
   * 統一的 LLM 呼叫入口，回傳解析後的 JSON。
   * 有 PROXY_ENDPOINT → 走後端；否則本機直連 OpenAI 相容端點。
   */
  private async callModel(prompt: string): Promise<any> {
    const raw = PROXY_ENDPOINT ? await this.viaProxy(prompt) : await this.viaDirect(prompt);
    return parseJsonLoose(raw);
  }

  private async viaProxy(prompt: string): Promise<string> {
    const res = await fetch(PROXY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(PROXY_TOKEN ? { 'X-PV-Token': PROXY_TOKEN } : {})
      },
      body: JSON.stringify({ prompt })
    });
    if (!res.ok) throw new Error(`Proxy 回應 ${res.status}`);
    const data = await res.json();
    return data.content ?? '';
  }

  private async viaDirect(prompt: string): Promise<string> {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        ...(JSON_MODE ? { response_format: { type: 'json_object' } } : {})
      })
    });
    if (!res.ok) throw new Error(`LLM 端點回應 ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  /** 將 items 切成固定大小的批次序列處理，回傳攤平後的結果。
   *  單一批次失敗不影響其他批次；缺漏的 pmid 由上層 reconcile 補上。 */
  private async runBatched<T>(items: any[], fn: (batch: any[]) => Promise<T[]>): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      try {
        out.push(...await fn(items.slice(i, i + BATCH_SIZE)));
      } catch {
        // 該批失敗，略過；reconcile 會以 fallback 補齊
      }
    }
    return out;
  }

  private ncbiFetch(url: string): Promise<Response> {
    return fetch(NCBI_API_KEY ? `${url}&api_key=${NCBI_API_KEY}` : url);
  }

  /**
   * 使用 NCBI E-utilities API 進行精確且一致的 PubMed 搜尋
   */
  async performPubMedSearch(query: string, ingredient: string, dateWindow: { from: string, to: string }) {
    // 1. 使用 esearch 取得 PMIDs
    const minDate = dateWindow.from.replace(/-/g, '/');
    const maxDate = dateWindow.to.replace(/-/g, '/');
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&mindate=${minDate}&maxdate=${maxDate}&datetype=pdat&retmode=json&retmax=50`;

    const searchRes = await this.ncbiFetch(searchUrl);
    if (!searchRes.ok) throw new Error(`PubMed esearch 失敗 (HTTP ${searchRes.status})`);
    const searchData = await searchRes.json();
    const pmids = searchData.esearchresult?.idlist || [];
    if (pmids.length === 0) return [];

    // NCBI 建議：無金鑰 3 req/s、有金鑰 10 req/s。序列呼叫間補最小間隔。
    await new Promise(r => setTimeout(r, NCBI_API_KEY ? 110 : 350));

    // 2. 使用 efetch 取得文獻詳細資料 (XML 格式包含摘要)
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;
    const fetchRes = await this.ncbiFetch(fetchUrl);
    if (!fetchRes.ok) throw new Error(`PubMed efetch 失敗 (HTTP ${fetchRes.status})`);
    const xmlText = await fetchRes.text();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
      throw new Error("PubMed 回傳的 XML 無法解析");
    }
    const articles = xmlDoc.getElementsByTagName("PubmedArticle");

    const results = [];
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const pmid = article.querySelector("PMID")?.textContent?.trim();
      const title = article.querySelector("ArticleTitle")?.textContent?.trim();

      // 組合摘要（有些摘要會分段，保留 label 讓段落更清楚）
      const abstractTexts = article.getElementsByTagName("AbstractText");
      let abstract = "";
      for (let j = 0; j < abstractTexts.length; j++) {
        const label = abstractTexts[j].getAttribute("Label");
        const text = abstractTexts[j].textContent?.trim() || "";
        abstract += (label ? `${label}: ` : "") + text + " ";
      }

      // 期刊名：明確取 Journal > Title，避免抓到 MeSH 等其他 <Title>
      const journal = article.querySelector("Journal > Title")?.textContent?.trim()
        || article.querySelector("MedlineJournalInfo > MedlineTA")?.textContent?.trim()
        || "";

      const date = extractPubDate(article);

      if (pmid && title) {
        results.push({
          pmid,
          title,
          date,
          journal,
          summary: abstract.trim(),
          url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
        });
      }
    }
    return results;
  }

  async scoreRelevance(records: any[]) {
    const slim = records.map(r => ({ pmid: r.pmid, title: r.title, abstract: r.abstract }));
    try {
      const scored = await this.runBatched(slim, async (batch) => {
        const res = await this.callModel(
          `You are a pharmacovigilance analyst. For each record, evaluate PV relevance (0-100) based on potential adverse events. ` +
          `Return ONLY a JSON object shaped {"items":[{"pmid":string,"score":number,"reason":string}]} with exactly one entry per input pmid. ` +
          `Records: ${JSON.stringify(batch)}`
        );
        const arr = res?.items ?? res;
        return Array.isArray(arr) ? arr : [];
      });
      return reconcile(records, scored, (r) => ({ pmid: r.pmid, score: 50, reason: "AI 未回傳此筆評分，暫給保守分數" }));
    } catch (e) {
      return records.map(r => ({ pmid: r.pmid, score: 50, reason: "AI 評分暫時無法使用" }));
    }
  }

  async generateSummaries(records: any[]) {
    const slim = records.map(r => ({ pmid: r.pmid, title: r.title, abstract: r.abstract }));
    try {
      const summarized = await this.runBatched(slim, async (batch) => {
        const res = await this.callModel(
          `請將以下文獻進行專業藥物警戒(PV)分析。回傳格式必須是 JSON 物件 {"items":[{"pmid":string,"summary_zh":string,"conclusion_zh":string}]}，每個輸入 pmid 對應一筆：\n` +
          `- summary_zh: 譯為繁體中文摘要，重點放在病例描述或研究方法。\n` +
          `- conclusion_zh: 獨立提煉該文獻的「結論」或「臨床建議」（對藥物安全監測最重要）。\n` +
          `只輸出 JSON，不要多餘文字。文獻資料： ${JSON.stringify(batch)}`
        );
        const arr = res?.items ?? res;
        return Array.isArray(arr) ? arr : [];
      });
      return reconcile(records, summarized, (r) => ({ pmid: r.pmid, summary_zh: "（AI 未回傳此筆摘要）", conclusion_zh: "AI 未回傳此筆結論" }));
    } catch (e) {
      return records.map(r => ({ pmid: r.pmid, summary_zh: "摘要生成失敗", conclusion_zh: "待重新分析" }));
    }
  }

  async extractPVData(record: any) {
    try {
      const data = await this.callModel(
        `從以下內容抽取結構化 PV 數據，只回傳 JSON 物件，鍵為：` +
        `product, ingredient, ae_verbatim, meddra_pt_candidate, meddra_confidence(0-100 數字), seriousness, population, dosage_route, tto, outcome, causality, completeness(Complete|Partial|Missing)。\n` +
        `內容：${record.summary || record.abstract || record.title}`
      );
      return data || { product: "N/A", completeness: "Missing" };
    } catch (e) {
      return { product: "N/A", completeness: "Missing" };
    }
  }
}

/** 從 PubmedArticle 節點解析出版日期，處理 MedlineDate / Season / 數字或英文月份 / 缺日等情況。 */
function extractPubDate(article: Element): string {
  const pubDate = article.querySelector("Article JournalIssue PubDate") || article.querySelector("PubDate");
  if (!pubDate) return "";

  // MedlineDate 例如 "2025 Jan-Feb" 或 "2025 Spring"：只可靠取到年份。
  const medline = pubDate.querySelector("MedlineDate")?.textContent?.trim();
  if (medline) {
    const y = medline.match(/\d{4}/)?.[0];
    return y ? `${y}-01-01` : "";
  }

  const year = pubDate.querySelector("Year")?.textContent?.trim();
  if (!year) return "";
  const monthRaw = pubDate.querySelector("Month")?.textContent?.trim() || "01";
  const dayRaw = pubDate.querySelector("Day")?.textContent?.trim() || "01";

  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const month = monthMap[monthRaw.slice(0, 3).toLowerCase()]
    || (/^\d{1,2}$/.test(monthRaw) ? monthRaw.padStart(2, '0') : '01');
  const day = /^\d{1,2}$/.test(dayRaw) ? dayRaw.padStart(2, '0') : '01';

  return `${year}-${month}-${day}`;
}

/** 確保輸出涵蓋每一筆輸入（依 pmid 對映），缺漏者以 fallback 補上，不靜默丟失。 */
function reconcile(records: any[], results: any[], fallback: (r: any) => any): any[] {
  const byPmid = new Map(results.filter(x => x && x.pmid != null).map(x => [String(x.pmid), x]));
  return records.map(r => byPmid.get(String(r.pmid)) || fallback(r));
}

/** 寬鬆解析 LLM 回傳：去除可能的 ```json 圍欄與前後雜訊。 */
function parseJsonLoose(raw: string): any {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    // 退而求其次：擷取第一個 { 或 [ 到對應結尾
    const start = s.search(/[{[]/);
    const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try { return JSON.parse(s.slice(start, end + 1)); } catch { /* fallthrough */ }
    }
    return null;
  }
}
