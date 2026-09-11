[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: Pharmacovigilance Agent System

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20D1%20%7C%20R2-orange.svg) ![OpenAI-compatible](https://img.shields.io/badge/AI-OpenAI--compatible-green.svg) ![Tests](https://img.shields.io/badge/tests-148-brightgreen.svg)

**PV-Link** covers both halves of ICSR intake for a marketing authorisation holder: **literature monitoring** (what the published record says about your products) and **spontaneous reporting** (what your field team hears from clinicians). Both feed one case database, one audit trail, and one signal-aggregation view.

---

## System at a glance

```
 ┌─ Literature channel ──────────┐   ┌─ Spontaneous channel ────────────┐
 │  PubMed E-utilities           │   │  Field rep on a phone  #/report  │
 │       ↓                       │   │       ↓ (offline outbox)         │
 │  AI scoring & summarisation   │   │  POST /api/ae-reports            │
 │       ↓                       │   │       ↓                          │
 │  Structured extraction        │   │  PV intake console (7 gates)     │
 └───────────┬───────────────────┘   └───────────┬──────────────────────┘
             └──────────────┬────────────────────┘
                            ↓
        Master database · audit trail · Ingredient × MedDRA PT signals
                            ↓
              CIOMS-I draft · E2B(R3) mapping · CSV export
```

Everything runs on one origin (`pvlink.uic-ai.com`) behind one Cloudflare Access check: a static React front end, plus a single Worker serving both the LLM proxy and the case-intake API.

---

## Literature monitoring

*   🔍 **Deterministic search** — the **NCBI PubMed E-utilities** API directly, so results are precise and reproducible. Multiple ingredients at once (`Fenofibrate, Aspirin`), custom date ranges, and pagination with a configurable result cap.
*   🤖 **AI scoring & summarisation** — relevance score (0–100), plain-language summary of the abstract, and a separately extracted **key conclusion**. Batched in parallel with a live progress bar.
*   📊 **Structured extraction** — ingredient, adverse-event verbatim, MedDRA candidate terms, seriousness, causality.
*   🧬 **MedDRA mapping layer** — a built-in **PT → SOC seed dictionary** validates AI-guessed PTs offline and fills in the System Organ Class. ⚠️ The full MedDRA dictionary is licensed; extend the seed or connect a licensed source.
*   💾 **Master database** — multi-field fuzzy search, date filtering, CSV export, IndexedDB persistence (auto-migrated from localStorage).

## Adverse event case reporting

The reporting channel has two interfaces, one per audience.

### 📱 Field reporting (mobile-first, `#/report`)

*   Fields mapped to all 26 numbered items of **CIOMS Form I** (field numbers shown inline), plus **lot number, expiry and marketing authorisation number** required in local practice.
*   A six-step wizard rather than one 40-input page; 16px inputs (stops iOS auto-zoom), ≥44px touch targets, chip selectors instead of native dropdowns.
*   **Auto-saved drafts** (600ms debounce), an **offline outbox** that retries on reconnect, and **on-device photo compression** (1600px long edge).
*   Validation splits into errors and warnings: only hard gaps such as the four minimum criteria block submission; the rest becomes a follow-up checklist — **an incomplete case beats a case never reported**.
*   **Reporter details are entered once.** On first sign-in the rep fills in name, employee ID, phone and company (CIOMS 26 / 24a); every later report is pre-filled, turning the form's first screen from six inputs into a summary card.
*   **My reports** — a read-only list of the cases that rep submitted, and their current status.

### 🗂️ PV intake console

*   Inbox sorted by **regulatory time pressure** (overdue → days remaining → newest), not first-in-first-out.
*   Seven gates: intake → validity (four ICSR criteria) → **duplicate detection** → seriousness (with audited manual override) → MedDRA coding / expectedness / causality → follow-up → submission and closure.
*   **Regulatory clock** — 15-day countdown from first awareness for serious cases; red when overdue, amber within five days.
*   **Follow-up reports** — created from the initial case in one click (numbered `PARENT-F1`), Day 0 set to when the new information arrived. Significant new information restarts the 15-day clock; otherwise there is no new expedited deadline and the case goes into the periodic report. Follow-up chains are excluded from duplicate detection.
*   **Foreign cases** — country of occurrence captured on the form (CIOMS 1a), flagged in the console, mapped into CIOMS and E2B `E.i.9`.
*   One-click **CIOMS-I text form** and **E2B(R3) element mapping**; CSV export; a full **audit trail** (who, when, what) across the workflow.
*   Cases join literature records in the **Ingredient × MedDRA PT** signal aggregation.

> 📖 Field derivation, regulatory notes and the back-office workflow: [`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md) (Traditional Chinese).

---

## Access control and roles

Sign-in is **Cloudflare Access Email OTP** with a company mailbox — no passwords to leak, share, or reset. Offboarding is automatic: a disabled mailbox cannot receive the one-time code, so access ends even if nobody remembers to prune the policy.

Access answers "is this person one of us". What they may *see* is decided in D1:

| Role | Can do |
|---|---|
| `rep` (field rep) | Submit cases; read **only their own** |
| `pv` (PV staff) | Read and write every case |

An email absent from `ae_users` is a `rep`. A missing entry then means someone *cannot* see all cases (they will complain) rather than someone who *can* (nobody complains). Bootstrap the first PV user with `wrangler secret put AE_PV_EMAILS`.

> ⚠️ List individual addresses in the Access policy. An `Emails ending in @yourcompany.com` rule means **everyone in the company** — finance, HR, interns — can read patient adverse-event data. Use an Access Group if the list grows, not a domain rule.

> ⚠️ Enforcement lives in the Worker, not the UI. Hash routes (`#/report`) cannot be split by Access path rules — the fragment never reaches the server — so the front end's role check is presentation only. Every API route checks the role itself, the case list is filtered in SQL rather than in JS, and a case you may not read returns 404 rather than 403 (403 would confirm the id exists).

---

## The AI model

### What is deployed

| | Value | Where |
|---|---|---|
| Endpoint | `https://ollama.com/v1` (Ollama Cloud) | `LLM_BASE_URL` in `worker/wrangler.toml` |
| Model | `deepseek-v4-pro` | `LLM_MODEL` in `worker/wrangler.toml` |
| JSON mode | off — the upstream is inconsistent about `response_format`, so replies are parsed with `parseJsonLoose` | `LLM_JSON_MODE = "0"` |
| Temperature | `0.2` | `services/llmService.ts` |
| API key | server-side secret, never in the bundle | `wrangler secret put LLM_API_KEY` |

The AI layer (`services/llmService.ts`) speaks plain **OpenAI Chat Completions** with no vendor SDK, so switching providers is two environment variables and no code:

| Provider | Base URL | Example model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `moonshotai/kimi-k2` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |

### What the model does — and does not

The model handles **reading**: relevance scoring, abstract summarisation, key-conclusion extraction, and structured extraction of adverse-event data from free text.

Everything with a regulatory consequence is a **pure function with unit tests, and never touches the model**:

*   seriousness assessment and the 15-day regulatory clock
*   the four ICSR minimum criteria and the rest of validation
*   duplicate detection
*   CIOMS-I and E2B(R3) mapping
*   role and permission checks

This split is deliberate. Swapping the model, or the model having a bad day, changes summary quality — it cannot change a statutory deadline, let a case through that fails the minimum criteria, or show one rep another rep's patients.

> ⚠️ Every AI output is a **draft for review**. CIOMS-I output in particular must be checked and completed by qualified PV staff before submission.

---

## Where data lives

| Data | Store | Notes |
|---|---|---|
| AE cases | **D1** (`ae_cases`) | Case body as a JSON payload plus extracted index columns for querying and sorting |
| Audit trail | **D1** (`ae_audit`) | Separate table, **append-only enforced by database triggers** — not by application discipline |
| Attachments | **R2** | A compressed medicine-box photo is 0.3–1.5MB; keeping it in the payload would drag it into every list query |
| Users and roles | **D1** (`ae_users`) | Email → role, plus the reporter profile |
| Rate limiting | **KV** | Fixed window, per IP per minute |
| Literature database | **IndexedDB** | Browser-side; the literature channel has no server component yet |

> ⚠️ Without `VITE_AE_API_ENDPOINT`, the reporting form and the console share **one browser's** IndexedDB — single-device trial only. Production needs the backend.

---

## Tech stack

*   **Front end** — React 19, TypeScript 5.8, Vite 6, Tailwind CSS 3.4, Heroicons; hash routing (static hosting, no server rewrites)
*   **Back end** — Cloudflare Workers (LLM proxy + case intake API), D1 (SQLite), R2, KV
*   **Auth** — Cloudflare Access (Email OTP), JWT verified in the Worker against the team JWKS
*   **AI** — any OpenAI-compatible Chat Completions API, provider-agnostic, no vendor SDK
*   **Data source** — NCBI PubMed E-utilities
*   **Tests** — vitest 3 + jsdom; CI runs typecheck, tests and build on Node 22.x and 24.x

---

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in, see below
npm run dev                  # http://localhost:3000
```

For **local development** the front end can talk to any OpenAI-compatible endpoint directly:

```env
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=sk-xxxx
VITE_LLM_MODEL=gpt-4o-mini
```

> ⚠️ `VITE_`-prefixed keys are bundled into the front end — fine locally, **not** for a public deployment. There, use the Worker proxy and set only `VITE_PV_PROXY_ENDPOINT`, keeping the key on the server.

### Usage

1.  **Search settings** — enter target ingredients (comma-separated, e.g. `Aspirin, Ibuprofen`) and a date range.
2.  **Start a task** — PubMed is queried and anything already in the master database is filtered out.
3.  **Pending review** — read the AI summaries and conclusions, then **confirm import** for records with PV value.
4.  **Master database** — search history, export CSV.
5.  **Share the reporting link** — in the Case Intake tab, the phone icon opens the form and the link icon copies the `#/report` URL (a QR code works well for the field team).
6.  **Intake** — cases arrive sorted by time pressure; work each through validity → duplicates → seriousness → coding → follow-up → submission.
7.  **Produce documents** — generate the CIOMS-I draft, review it, submit to the authority, record the receipt number, close the case.

---

## Deployment

### LLM proxy

```bash
cd worker
npx wrangler secret put LLM_API_KEY            # upstream key, server-side only
npx wrangler kv namespace create RATE_LIMIT    # put the returned id into wrangler.toml
npx wrangler deploy                            # LLM_BASE_URL / LLM_MODEL come from wrangler.toml
```

Then point `VITE_PV_PROXY_ENDPOINT` at the deployed Worker and rebuild. The front end now carries **no** LLM key. If the rate-limit KV isn't bound, the Worker skips it and works as normal.

### AE case intake backend

The intake API rides on the **same** Worker behind the **same** Access check, so there is no second login to maintain.

```bash
cd worker
npx wrangler d1 create pv-link-ae                       # put database_id into wrangler.toml
npx wrangler r2 bucket create pv-link-ae-attachments
npx wrangler d1 execute pv-link-ae --remote --file=worker/schema.sql
npx wrangler secret put AE_PV_EMAILS                    # bootstrap PV staff, comma-separated
npx wrangler deploy
```

Then set `VITE_AE_API_ENDPOINT=/api/ae-reports` (already in `.env.production`) and rebuild.

> 📖 Full runbook, role management commands, real-device test procedure and go-live checklist: [`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md) (Traditional Chinese).

---

## Testing

```bash
npm test           # vitest, 148 unit tests
npm run typecheck  # tsc --noEmit
npm run build      # production bundle
```

Every pure function with a regulatory consequence has tests: validity, seriousness, the regulatory clock, duplicate detection, CIOMS/E2B mapping, signal aggregation, `parseJsonLoose`, `reconcile`, MedDRA mapping, and the permission rules. Translation coverage for dynamic i18n keys (`ae.issue.*`, `ae.status.*`) is enforced by tests too.

The Worker cannot import the front end's TypeScript modules, so its seriousness and due-date logic is a deliberate mirror. `tests/worker.ae.test.ts` feeds both implementations the same cases and compares them one by one — a drifted mirror shows up as a wrong statutory deadline, which is hard to reproduce in a test environment and directly affects reporting obligations.

Permission rules are tested with their negatives as well as their happy paths, because each failure corresponds to one rep reading another rep's patient data.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md) | Field derivation from CIOMS/E2B, Taiwan regulatory notes, the seven intake gates, backend architecture, roles, reporter profile |
| [`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md) | Deployment runbook, Access setup, role management, real-device test procedure, go-live checklist |

Both are in Traditional Chinese.

## License

MIT License
