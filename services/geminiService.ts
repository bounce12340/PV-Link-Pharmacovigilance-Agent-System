
import { GoogleGenAI, Type } from "@google/genai";

export class PVGeminiService {
  private get ai() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  /**
   * 使用 NCBI E-utilities API 進行精確且一致的 PubMed 搜尋
   */
  async performPubMedSearch(query: string, ingredient: string, dateWindow: { from: string, to: string }) {
    try {
      // 1. 使用 esearch 取得 PMIDs
      // 將 YYYY-MM-DD 轉換為 YYYY/MM/DD 格式供 PubMed 使用
      const minDate = dateWindow.from.replace(/-/g, '/');
      const maxDate = dateWindow.to.replace(/-/g, '/');
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&mindate=${minDate}&maxdate=${maxDate}&datetype=pdat&retmode=json&retmax=50`;
      
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();
      const pmids = searchData.esearchresult?.idlist || [];

      if (pmids.length === 0) {
        return [];
      }

      // 2. 使用 efetch 取得文獻詳細資料 (XML 格式包含摘要)
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;
      const fetchRes = await fetch(fetchUrl);
      const xmlText = await fetchRes.text();
      
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const articles = xmlDoc.getElementsByTagName("PubmedArticle");
      
      const results = [];
      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        const pmid = article.getElementsByTagName("PMID")[0]?.textContent;
        const title = article.getElementsByTagName("ArticleTitle")[0]?.textContent;
        
        // 組合摘要 (有些摘要會分段)
        const abstractTexts = article.getElementsByTagName("AbstractText");
        let abstract = "";
        for (let j = 0; j < abstractTexts.length; j++) {
          abstract += abstractTexts[j].textContent + " ";
        }
        
        const journal = article.getElementsByTagName("Title")[0]?.textContent;
        
        // 提取出版日期
        const pubDate = article.getElementsByTagName("PubDate")[0];
        const year = pubDate?.getElementsByTagName("Year")[0]?.textContent || "";
        let month = pubDate?.getElementsByTagName("Month")[0]?.textContent || "01";
        const day = pubDate?.getElementsByTagName("Day")[0]?.textContent || "01";
        
        // 簡單的月份轉換 (Jan -> 01)
        const monthMap: Record<string, string> = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
        if (monthMap[month]) month = monthMap[month];
        
        const date = year ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : "";

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
    } catch (e) {
      console.error("PubMed API Error:", e);
      throw e;
    }
  }

  async scoreRelevance(records: any[]) {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Evaluate Pharmacovigilance (PV) relevance (score 0-100) for these records based on potential adverse events: ${JSON.stringify(records)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pmid: { type: Type.STRING },
                score: { type: Type.NUMBER },
                reason: { type: Type.STRING }
              },
              required: ["pmid", "score", "reason"]
            }
          }
        }
      });
      return JSON.parse(response.text || '[]');
    } catch (e) {
      return records.map(r => ({ pmid: r.pmid, score: 50, reason: "AI 評分暫時無法使用" }));
    }
  }

  async generateSummaries(records: any[]) {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `請將以下文獻進行專業 PV 分析。
        1. summary_zh: 將內容翻譯為繁體中文摘要，重點放在病例描述或研究方法。
        2. conclusion_zh: 獨立提煉出該文獻的「結論」或「臨床建議」，這對藥物安全監測最重要。
        文獻資料： ${JSON.stringify(records)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pmid: { type: Type.STRING },
                summary_zh: { type: Type.STRING },
                conclusion_zh: { type: Type.STRING }
              },
              required: ["pmid", "summary_zh", "conclusion_zh"]
            }
          }
        }
      });
      return JSON.parse(response.text || '[]');
    } catch (e) {
      return records.map(r => ({ pmid: r.pmid, summary_zh: "摘要生成中...", conclusion_zh: "待分析" }));
    }
  }

  async extractPVData(record: any) {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `從以下內容抽取結構化 PV 數據: ${record.summary || record.title}.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              product: { type: Type.STRING },
              ingredient: { type: Type.STRING },
              ae_verbatim: { type: Type.STRING },
              meddra_pt_candidate: { type: Type.STRING },
              meddra_confidence: { type: Type.NUMBER },
              seriousness: { type: Type.STRING },
              population: { type: Type.STRING },
              dosage_route: { type: Type.STRING },
              tto: { type: Type.STRING },
              outcome: { type: Type.STRING },
              causality: { type: Type.STRING },
              completeness: { type: Type.STRING }
            }
          }
        }
      });
      return JSON.parse(response.text || '{}');
    } catch (e) {
      return { product: "N/A", completeness: "Missing" };
    }
  }
}
