
import { PVRecord } from '../types';

/**
 * 模擬擴展數據產生器
 */
const generateMockData = (ingredient: string, id: string) => {
  const seeds: Record<string, any> = {
    "1": {
      title: `Serious bullous drug eruption associated with ${ingredient}: A rare clinical observation`,
      abstract: `A 54-year-old female developed generalized bullous lesions 10 days after starting ${ingredient}. Skin biopsy confirmed toxic epidermal necrolysis. Naranjo score: 7 (Probable).`,
      full_text: `[SCIENTIFIC RECORD - CLINICAL CASE ARCHIVE]\nTITLE: Serious bullous drug eruption associated with ${ingredient}\n\nCASE DESCRIPTION: A 54-year-old female patient presented with painful erythema and extensive bullous lesions (35% BSA) on Day 10 of treatment. Immediate cessation led to recovery.`,
      doi: `10.1016/j.pv.${id}`,
      date: "2025-05-12",
      journal: "Global Pharmacovigilance Quarterly"
    },
    "2": {
      title: `Potential signal of acute bradycardia and hypotension induced by intravenous ${ingredient}`,
      abstract: `Post-marketing surveillance identified cases of acute cardiovascular collapse in patients receiving ${ingredient} infusion for supraventricular tachycardia.`,
      full_text: `[SIGNAL DETECTION REPORT]\nSUBJECT: Cardiovascular risk associated with IV ${ingredient}.\n\nOBSERVATIONS: Symptomatic bradycardia (heart rate < 40 bpm) observed in emergency setting. Potential dosage-related toxicity suspected.`,
      doi: `10.1111/j.re.2025.${id}`,
      date: "2025-08-20",
      journal: "Circulation Safety Reviews"
    },
    "3": {
      title: `${ingredient}-induced Rhabdomyolysis: A systematic review of 12 case reports`,
      abstract: `Meta-analysis shows that the combination of ${ingredient} and high-dose statins increases the risk of muscle injury significantly. CPK levels reached >10,000 U/L in 4 patients.`,
      full_text: `[SYSTEMATIC REVIEW]\nOBJECTIVE: To assess the risk of myopathy associated with ${ingredient}.\n\nRESULTS: Synergistic toxicity with HMG-CoA reductase inhibitors is a critical safety consideration for PV reporting.`,
      doi: `10.2222/sr.${id}`,
      date: "2025-03-15",
      journal: "The Lancet (Simulation Archive)"
    },
    "4": {
      title: `Chronic interstitial nephritis following long-term exposure to ${ingredient}`,
      abstract: `This study explores renal safety profiles. Two elderly patients presented with progressive renal decline (eGFR drop >30%) after 2 years on ${ingredient}.`,
      full_text: `[RENAL SAFETY REPORT]\nPATIENT POPULATION: Geriatric patients (>65 years).\n\nFINDINGS: Potential for cumulative renal toxicity. Monitoring of creatinine levels every 6 months is suggested.`,
      doi: `10.3333/rn.${id}`,
      date: "2025-01-10",
      journal: "Nephrology Safety Communications"
    },
    "5": {
      title: `Anaphylactic shock following the first dose of generic ${ingredient}`,
      abstract: `A rare case of immediate hypersensitivity reaction to excipients or the active ingredient ${ingredient} in a 32-year-old male.`,
      full_text: `[EMERGENCY CASE REPORT]\nEVENT: Anaphylaxis.\n\nDESCRIPTION: Patient developed stridor and urticaria within 15 minutes of oral administration. Successfully treated with epinephrine.`,
      doi: `10.4444/hy.${id}`,
      date: "2025-07-04",
      journal: "Allergy & Safety Archive"
    }
  };
  
  return seeds[id] || {
    title: `General safety update and literature review for ${ingredient}`,
    abstract: `An overview of the current safety profile of ${ingredient}. No new safety signals detected in this period.`,
    full_text: `[ANNUAL SUMMARY] Routine monitoring shows no significant deviations from established safety data for ${ingredient}.`,
    doi: `10.9999/null.${id}`,
    date: "2025-01-01",
    journal: "Medical Safety Journal"
  };
};

export const pubmed_build_rss_url = (query: string, limit: number = 100) => {
  const encodedQuery = encodeURIComponent(query);
  return { 
    search_run_id: `PV-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
    rss_url: `https://pubmed.ncbi.nlm.nih.gov/rss/search/1${encodedQuery}/`,
    pubmed_query: query
  };
};

export const pubmed_fetch_rss = async (rss_url: string, query: string) => {
  const ingredientMatch = query.match(/\("([^"]+)"\)|"([^"]+)"|(\b\w+\b)/);
  const ingredient = ingredientMatch ? (ingredientMatch[1] || ingredientMatch[2] || ingredientMatch[3]) : 'Drug';
  
  await new Promise(r => setTimeout(r, 500));
  // 增加回傳數量至 5 筆
  const mockIds = ["1", "2", "3", "4", "5"];
  return {
    items: mockIds.map(id => ({
      title: generateMockData(ingredient, id).title,
      link: `https://pubmed.ncbi.nlm.nih.gov/3880000${id}/`, 
      pubDate: generateMockData(ingredient, id).date,
      guid: `3880000${id}`
    }))
  };
};

export const pubmed_efetch = async (pmids: string[], query: string) => {
  const ingredientMatch = query.match(/\("([^"]+)"\)|"([^"]+)"|(\b\w+\b)/);
  const ingredient = ingredientMatch ? (ingredientMatch[1] || ingredientMatch[2] || ingredientMatch[3]) : 'Drug';

  await new Promise(r => setTimeout(r, 800));
  return {
    records: pmids.map(id => {
      const seedId = id.slice(-1);
      const data = generateMockData(ingredient, seedId);
      return {
        pmid: id,
        doi: data.doi,
        title: data.title,
        authors: ["PV Audited Expert", "Research Lead"],
        journal: data.journal,
        year: "2025",
        dp: data.date,
        edat: data.date,
        abstract: data.abstract,
        full_text: data.full_text,
        pubmed_url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        journal_url: `https://publisher.com/article/${id}`
      };
    })
  };
};

export const google_search = async (query: string) => {
  const ingredientMatch = query.match(/\("([^"]+)"\)|"([^"]+)"|(\b\w+\b)/);
  const ingredient = ingredientMatch ? (ingredientMatch[1] || ingredientMatch[2] || ingredientMatch[3]) : 'Drug';
  
  // 增加回傳數量至 2-3 筆
  return {
    items: [
      { 
        title: `TFDA Safety Update: Monitoring of ${ingredient} related myopathy`, 
        url: `https://www.tfda.gov.tw/safety/alert-${ingredient.toLowerCase()}-1`, 
        snippet: `TFDA has received reports of liver injury associated with ${ingredient} use. Healthcare providers are advised to monitor LFTs...`, 
        displayLink: "tfda.gov.tw", 
        date: "2025-06-01",
        full_text: `[稽核系統快照 - TFDA]\n公告日期：2025-06-01\n成分：${ingredient}\n\n說明：接獲通報指出使用 ${ingredient} 可能導致肌肉痠痛與轉胺酶上升，建議醫師加強監測。`
      },
      { 
        title: `FDA Drug Safety Communication: New warnings for ${ingredient} packaging`, 
        url: `https://www.fda.gov/safety/alert-${ingredient.toLowerCase()}-2`, 
        snippet: `FDA is requiring updates to the label of ${ingredient} to include information about potential hypersensitivity in specific populations.`, 
        displayLink: "fda.gov", 
        date: "2025-09-12",
        full_text: `[AUDITED SNAPSHOT - FDA.GOV]\nDATE: 2025-09-12\n\nThe FDA is alerting health care professionals about new labeling requirements for ${ingredient} following post-marketing surveillance data indicating rare but severe skin reactions.`
      }
    ]
  };
};

export const db_upsert = async (records_json: any) => ({ ok: true, inserted: records_json.length });
export const db_mark_excluded = async (record_ids: string[], reason: string) => ({ ok: true });
export const export_csv_ingredient_view = async () => ({ csv_path_or_data: "CSV_DATA" });
export const now = () => ({ iso_datetime: new Date().toISOString() });
