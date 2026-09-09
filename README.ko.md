[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: 약물감시 에이전트 시스템 (Pharmacovigilance Agent System)

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![OpenAI-compatible](https://img.shields.io/badge/AI-OpenAI--compatible-green.svg)

**PV-Link**는 약물감시(Pharmacovigilance, PV)를 위해 특별히 구축된 전문 자동화 에이전트 시스템입니다. 이 시스템은 기존의 수동 문헌 검토가 시간이 많이 걸리고 누락되기 쉬운 문제를 해결하는 것을 목표로 합니다. 공식 문헌 데이터베이스와 대형 언어 모델(LLM)을 통합하여 검색, 스코어링, 요약부터 구조화된 데이터 추출까지 올인원 솔루션을 제공합니다.

## ✨ 주요 기능 (Core Features)

*   🔍 **정밀한 문헌 검색 (Deterministic Search)**
    *   **NCBI PubMed E-utilities 공식 API**와 직접 연동하여 검색 결과의 절대적인 정확성과 재현성을 보장합니다.
    *   **복수 대상 성분** 동시 검색 지원(예: `Fenofibrate, Aspirin`), 정확한 PubMed 쿼리 구문으로 자동 변환됩니다.
    *   사용자 지정 모니터링 날짜 범위 설정을 지원합니다.
*   🤖 **AI 스코어링 및 요약 (AI Scoring & Summarization)**
    *   임의의 **OpenAI 호환 Chat Completions 엔드포인트**(OpenAI, Azure OpenAI, Ollama, OpenRouter, Kimi 등)와 연동하여 신규 문헌의 PV 관련성 점수(0~100점)를 평가합니다.
    *   어려운 영문 의학 요약을 읽기 쉬운 언어로 자동 번역합니다.
    *   약물 안전성 모니터링에 가장 중요한 **"임상적 결론 (Key Conclusion)"**을 독립적으로 추출하며, 원클릭 복사를 지원합니다.
*   📊 **구조화된 데이터 추출 (Structured Data Extraction)**
    *   대상 성분, 이상사례 원문(AE Verbatim), MedDRA 후보 용어, 중대성(Seriousness), 인과관계(Causality) 등 문헌에서 핵심 PV 데이터를 자동으로 추출합니다.
*   💾 **데이터베이스 관리 및 내보내기 (Database & Export)**
    *   확인된 문헌을 가져와 저장할 수 있는 "마스터 데이터베이스" 관리 인터페이스가 내장되어 있습니다.
    *   강력한 **다중 필드 퍼지 검색** 및 날짜 범위 필터링 기능을 제공합니다.
    *   필터링된 문헌 데이터의 **CSV 보고서 내보내기**를 원클릭으로 지원하여 향후 감사 및 보관을 용이하게 합니다.

## 🆕 고급 기능 (v4)

*   📄 **CIOMS-I / E2B(R3) 초안 생성**
    *   문헌 상세 페이지에서 구조화된 데이터로부터 원클릭으로 **CIOMS-I 개별 증례 안전성 보고서 초안**을 생성하며, E2B(R3) 핵심 데이터 요소 매핑을 포함합니다(예: `E.i.2.1b MedDRA PT`, `G.k.2.2 Active substance`).
    *   순수 오프라인 매핑이며 복사하거나 `.txt`로 다운로드할 수 있습니다. ⚠️ 결과물은 초안이며, 제출 전 약물감시 담당자의 검토와 보완이 필요합니다.
*   📈 **안전성 신호 집계 (Signal Aggregation)**
    *   "신호 집계" 탭이 추가되어 마스터 데이터베이스를 **성분 × MedDRA PT** 기준으로 그룹화하여 집계하고, 중대한 사례 및 잠재적 신호(건수 ≥ 3 또는 중대한 사례 포함)를 표시합니다.
*   🧬 **MedDRA 매핑 레이어**
    *   일반적인 PV 이벤트에 대한 **PT → SOC 시드 사전**을 내장하여 AI가 추정한 PT를 오프라인으로 검증하고 기관계 대분류(System Organ Class)를 보완합니다. ⚠️ 전체 MedDRA는 라이선스 사전이므로 직접 확장하거나 라이선스가 있는 소스에 연결해야 합니다.
*   ⚡ **배치 병렬 처리 + 진행률 표시**
    *   AI 스코어링/요약이 **병렬 배치 처리** 방식으로 변경되어(한 라운드 소요 시간을 크게 단축) 상단에 실시간 진행률 표시줄이 나타납니다.
    *   마스터 데이터베이스는 추출되지 않은 문헌에 대한 **배치 구조화 추출**을 지원하며, 신호 집계에 사용됩니다.
*   💽 **IndexedDB 영구 저장**
    *   마스터 데이터베이스와 "검토 대기 목록"의 저장소가 **IndexedDB**(localStorage보다 훨씬 큰 용량)로 변경되어 새로고침해도 데이터가 유실되지 않습니다. 처음 로드 시 기존 localStorage에서 자동으로 마이그레이션됩니다.
*   🔎 **PubMed 페이지네이션**: 검색 시 "최대 조회 건수"(페이지네이션 상한, 기본값 100)를 설정할 수 있으며, efetch가 자동으로 배치 단위로 가져옵니다.
*   🛡️ **백엔드 속도 제한**: Worker 프록시에 KV 고정 윈도우 방식의 속도 제한(IP당, 분당 상한)이 내장되어 API 키 할당량을 보호합니다.

## 🆕 이상반응 개별사례 보고 (v5)

문헌 모니터링이 닿지 못하는 자발보고(spontaneous reporting) 경로를 추가했습니다. 화면은 두 개입니다:

*   📱 **영업 담당자 보고 화면 (모바일 우선, `#/report`)**
    *   **CIOMS Form I** 26개 항목 전체에 대응(공식 항목 번호 병기)하며, 실무상 필요한 **로트번호·유효기간·허가번호**를 추가로 수집합니다.
    *   6단계 위저드 방식. 입력창 16px(iOS 자동 확대 방지), 터치 영역 44px 이상, 선택 항목은 네이티브 드롭다운 대신 칩 형태.
    *   **임시저장 자동화**, **오프라인 대기열**(전송 실패 시 자동 재전송), **기기 내 사진 압축**(긴 변 1600px).
    *   검증은 error / warning으로 분리. 4대 요건 등 필수 누락만 제출을 막고 나머지는 추가정보 목록으로——**불완전한 사례가 보고되지 않은 사례보다 낫습니다**.
*   🗂️ **약물감시 접수 콘솔 ("통보 접수" 탭)**
    *   수신함은 **법정 기한 압박도** 순(기한 초과 → 남은 일수 → 최신)으로 정렬됩니다.
    *   7단계 처리 관문: 접수 등록 → 유효성 판정(ICSR 4대 요건) → **중복 사례 탐지** → 중대성 판정(감사기록이 남는 수동 재정의 가능) → MedDRA 코딩／예측성／인과관계 → 추가정보 추적 → 제출 및 종결.
    *   **법정 타이머**: 중대 사례는 최초 인지일로부터 15일 카운트다운.
    *   **CIOMS-I 텍스트 서식**과 **E2B(R3) 항목 대조표**를 원클릭 생성. 사례 목록은 CSV로 내보낼 수 있습니다.
    *   **추적 보고**: 원 사례에서 한 번의 클릭으로 생성할 수 있으며(번호는 `원번호-F1`), Day 0은 **새 정보를 입수한 날짜**로 설정됩니다. 중요한 새 정보가 있으면 15일 타이머가 재시작되고, 없으면 재시작하지 않고 정기보고서에 수록됩니다. 추적 체인은 중복 사례 탐지에서 제외됩니다.
    *   **해외 사례**: 보고 화면에서 발생 국가(CIOMS 1a)를 선택할 수 있으며, 콘솔에서 해외 사례로 표시됩니다.
    *   전 과정에 **감사 추적**을 기록하며, 기존 "성분 × MedDRA PT" **시그널 집계**에도 자동 반영됩니다.

> 📖 설계 상세: [`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md) (번체 중국어).
> ⚠️ `VITE_AE_API_ENDPOINT`를 설정하지 않으면 보고 화면과 콘솔이 **같은 브라우저**의 IndexedDB를 공유합니다(단일 기기 시험용).

## 🧪 테스트 (Testing)

핵심 순수 함수(`parseJsonLoose`, `reconcile`, MedDRA 매핑, CIOMS 매핑, 신호 집계)에는 모두 단위 테스트가 있습니다.
Worker는 프런트엔드의 TypeScript 모듈을 가져올 수 없어 중대성·기한 판정이 의도적인 미러 구현입니다. 미러가 어긋나면 법정 기한 오류로 나타나므로, `tests/worker.ae.test.ts`는 동일한 증례 집합을 양쪽에 넣어 건별로 대조합니다:
```bash
npm test        # vitest로 단위 테스트 실행
npm run typecheck  # tsc --noEmit로 타입 체크
```

## 🛠️ 기술 스택 (Tech Stack)

*   **프론트엔드 프레임워크**: React 19, TypeScript, Vite
*   **UI 스타일링**: Tailwind CSS, Heroicons
*   **AI 엔진**: 임의의 OpenAI 호환 Chat Completions API(provider 독립적, 특정 벤더 SDK에 종속되지 않음)
*   **데이터 소스**: NCBI PubMed E-utilities API

## 🚀 시작하기 (Getting Started)

### 1. 종속성 설치
환경에 Node.js가 설치되어 있는지 확인한 후, 다음 명령을 실행하여 필요한 패키지를 설치합니다.
```bash
npm install
```

### 2. 환경 변수 설정
`.env.example`을 `.env.local`로 복사합니다. **로컬 개발**에서는 프런트엔드를 임의의 OpenAI 호환 엔드포인트에 직접 연결할 수 있습니다.
```env
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=sk-xxxx
VITE_LLM_MODEL=gpt-4o-mini
```
> ⚠️ `VITE_`로 시작하는 변수는 프런트엔드 번들에 포함됩니다——로컬 사용에는 문제없지만 **공개 배포에는 적합하지 않습니다**. 공개/다중 사용자 배포 시에는 백엔드 프록시를 사용하고(아래 "배포" 참고), 프런트엔드에는 `VITE_PV_PROXY_ENDPOINT`만 설정하여 키를 서버 측에 보관하세요.

### 3. 개발 서버 시작
```bash
npm run dev
```
시작 후 브라우저에서 `http://localhost:3000`을 열어 사용을 시작합니다.

## 📖 사용 가이드 (Usage Guide)

1.  **검색 설정**: "검색 설정" 탭으로 이동하여 모니터링할 대상 성분을 입력하고(여러 성분은 쉼표로 구분, 예: `Aspirin, Ibuprofen`) 모니터링 날짜 범위를 설정합니다.
2.  **작업 시작**: 오른쪽 상단의 "새 모니터링 작업 시작"을 클릭합니다. 시스템은 자동으로 PubMed에 요청을 보내고 마스터 데이터베이스에 이미 존재하는 문헌을 필터링합니다.
3.  **검토 대기 중**: 작업이 완료되면 시스템이 자동으로 "검토 대기 중" 탭으로 전환됩니다. 여기에서 AI가 생성한 요약과 임상적 결론을 확인할 수 있습니다.
4.  **가져오기 확인**: 문헌 내용에 PV 가치가 있는지 확인한 후 "마스터 데이터베이스로 가져오기 확인"을 클릭합니다.
5.  **마스터 데이터베이스 관리**: "마스터 데이터베이스" 탭에서 기록을 검색하고 오른쪽 상단의 "CSV 보고서 내보내기"를 클릭하여 데이터를 다운로드할 수 있습니다.

## 🔌 LLM 공급자 (OpenAI 호환)

AI 레이어(`services/llmService.ts`)는 provider에 독립적입니다. 표준 **OpenAI Chat Completions** 형식을 사용하므로 OpenAI, Azure OpenAI, Ollama, OpenRouter, Kimi, LiteLLM 또는 호환되는 모든 게이트웨이에서 작동합니다——환경 변수만 변경하면 되고 코드 변경은 필요 없습니다.

공급자를 전환하려면 `VITE_LLM_BASE_URL` / `VITE_LLM_MODEL`(로컬) 또는 Worker의 `LLM_BASE_URL` / `LLM_MODEL`(프록시)을 원하는 서비스로 지정하세요. 예시:

| 공급자 | Base URL | 예시 모델 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `moonshotai/kimi-k2` |
| Ollama(로컬) | `http://localhost:11434/v1` | `llama3.1` |

## 🚀 배포 (공개 / 다중 사용자)

브라우저로 API 키가 전달되지 않도록, `worker/`에 있는 얇은 프록시(Cloudflare Worker)를 배포하세요——키는 서버 측에 보관되며 선택한 OpenAI 호환 엔드포인트로 프롬프트를 전달합니다.

```bash
cd worker
npx wrangler secret put LLM_API_KEY   # 업스트림 키를 secret으로 저장
npx wrangler kv namespace create RATE_LIMIT   # 속도 제한용 KV 생성, 반환된 id를 wrangler.toml에 입력
npx wrangler deploy                    # LLM_BASE_URL / LLM_MODEL은 wrangler.toml에서 설정
```
그런 다음 프런트엔드의 `VITE_PV_PROXY_ENDPOINT`를 배포된 Worker URL로 설정하고 다시 빌드합니다. 이제 프런트엔드에는 LLM 키가 **전혀** 포함되지 않습니다. 속도 제한용 KV가 바인딩되지 않은 경우 Worker는 자동으로 건너뛰고 정상적으로 동작합니다.


### 이상반응 백엔드 (Worker + D1 + R2)

AE 접수 API는 **동일한** Worker에서 동작하며 **동일한** Cloudflare Access 인증을 거칩니다. 두 번째 로그인 체계를 따로 유지할 필요가 없습니다.

```bash
cd worker
npx wrangler d1 create pv-link-ae                 # 반환된 database_id를 wrangler.toml에 입력
npx wrangler r2 bucket create pv-link-ae-attachments
npx wrangler d1 execute pv-link-ae --remote --file=worker/schema.sql
npx wrangler deploy
```
그런 다음 `VITE_AE_API_ENDPOINT=/api/ae-reports`(`.env.production`에 이미 포함)를 설정하고 다시 빌드합니다. 증례는 D1에, 첨부파일은 R2에 저장됩니다. 감사 추적은 별도 테이블이며 **추가만 가능**하다는 제약을 데이터베이스 트리거가 강제합니다——애플리케이션의 자율 규제에 의존하지 않습니다.

영업 담당자는 **Cloudflare Access Email OTP**로 로그인합니다——유출되거나 공유되거나 재설정이 필요한 비밀번호가 없습니다.

> ⚠️ Access 정책에는 개별 주소를 하나씩 나열하세요. `@gmail.com` **도메인** 규칙은 Gmail 계정을 가진 모든 사람에게 문을 열어 줍니다.
> ⚠️ 개인 Gmail 주소는 퇴사해도 만료되지 않습니다. "Access 정책에서 주소 제거"를 퇴사 체크리스트에 반드시 포함하세요.

> 📖 전체 실행 매뉴얼, 실기기 테스트 절차, 배포 전 체크리스트: [`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md) (번체 중국어)

## 📄 라이선스 (License)
MIT License
