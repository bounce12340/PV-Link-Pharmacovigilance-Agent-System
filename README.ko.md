[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: 약물감시 에이전트 시스템

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20D1%20%7C%20R2-orange.svg) ![OpenAI-compatible](https://img.shields.io/badge/AI-OpenAI--compatible-green.svg) ![Tests](https://img.shields.io/badge/tests-148-brightgreen.svg)

**PV-Link**는 품목허가권자의 ICSR 접수 양쪽을 모두 다룹니다. **문헌 모니터링**(발표된 문헌이 자사 제품에 대해 말하는 것)과 **자발보고**(영업 담당자가 임상 현장에서 듣는 것)입니다. 두 경로는 하나의 증례 데이터베이스, 하나의 감사 추적, 하나의 신호 집계 화면으로 모입니다.

---

## 시스템 한눈에 보기

```
 ┌─ 문헌 경로 ───────────────────┐   ┌─ 자발보고 경로 ──────────────────┐
 │  PubMed E-utilities           │   │  영업 담당자 휴대폰  #/report     │
 │       ↓                       │   │       ↓(오프라인 큐)             │
 │  AI 점수 산정 및 요약         │   │  POST /api/ae-reports            │
 │       ↓                       │   │       ↓                          │
 │  구조화 데이터 추출           │   │  PV 접수 콘솔(7개 관문)          │
 └───────────┬───────────────────┘   └───────────┬──────────────────────┘
             └──────────────┬────────────────────┘
                            ↓
       마스터 DB · 감사 추적 · 성분 × MedDRA PT 신호 집계
                            ↓
        CIOMS-I 초안 · E2B(R3) 매핑 · CSV 내보내기
```

모든 것이 하나의 오리진(`pvlink.uic-ai.com`)에서 하나의 Cloudflare Access 인증 뒤에 동작합니다. 정적 React 프런트엔드와, LLM 프록시와 증례 접수 API를 함께 담당하는 단일 Worker로 구성됩니다.

---

## 문헌 모니터링

*   🔍 **결정론적 검색** —— **NCBI PubMed E-utilities** 공식 API를 직접 사용하므로 결과가 정확하고 재현 가능합니다. 다중 성분 동시 검색(`Fenofibrate, Aspirin`), 사용자 지정 기간, 상한 설정이 가능한 페이지네이션을 지원합니다.
*   🤖 **AI 점수 산정 및 요약** —— 관련성 점수(0–100), 초록의 평이한 요약, 그리고 별도로 추출되는 **핵심 결론**. 병렬 배치로 실행되며 상단에 실시간 진행률이 표시됩니다.
*   📊 **구조화 추출** —— 성분, 이상사례 원문 표현, MedDRA 후보어, 중대성, 인과관계.
*   🧬 **MedDRA 매핑 계층** —— 일반적인 PV 사례에 대한 **PT → SOC 시드 사전**을 내장하여, AI가 추정한 PT를 오프라인으로 검증하고 기관계 대분류를 채웁니다. ⚠️ 전체 MedDRA 사전은 라이선스가 필요합니다. 시드를 직접 확장하거나 라이선스가 있는 소스를 연결하세요.
*   💾 **마스터 데이터베이스** —— 다중 필드 부분 검색, 날짜 필터, CSV 내보내기, IndexedDB 영속화(최초 로드 시 localStorage에서 자동 이전).

## 이상반응 증례 보고

보고 경로에는 대상별로 두 개의 화면이 있습니다.

### 📱 영업 담당자 보고 화면(모바일 우선, `#/report`)

*   **CIOMS Form I**의 26개 항목 전체에 대응(항목 번호를 함께 표시)하며, 현지 실무에서 요구되는 **로트번호, 유효기한, 품목허가번호**를 추가로 수집합니다.
*   입력란 40개가 나열된 한 페이지 대신 6단계 마법사 방식. 16px 입력란(iOS 자동 확대 방지), 44px 이상 터치 영역, 네이티브 드롭다운 대신 칩 형태 선택기를 사용합니다.
*   **임시저장 자동화**(600ms 디바운스), 재연결 시 자동 재전송하는 **오프라인 큐**, **기기 내 사진 압축**(긴 변 1600px).
*   검증은 오류와 경고로 나뉩니다. 4대 요건 같은 결정적 결손만 제출을 막고, 나머지는 후속 확인 목록이 됩니다 —— **불완전한 보고가 아예 보고되지 않는 것보다 낫기** 때문입니다.
*   **보고자 정보는 한 번만 입력**합니다. 첫 로그인 시 이름·사번·전화번호·회사명(CIOMS 26／24a)을 입력하면 이후 모든 보고에 자동 입력되어, 폼의 첫 화면이 입력란 6개에서 요약 카드로 바뀝니다.
*   **내 보고 이력** —— 본인이 제출한 증례와 현재 상태를 확인하는 읽기 전용 목록.

### 🗂️ PV 접수 콘솔

*   받은 편지함은 **법정 기한 압박** 순(기한 초과 → 남은 일수 → 최신)으로 정렬됩니다. 선입선출이 아닙니다.
*   7개 관문: 접수 등록 → 유효성 판정(ICSR 4대 요건) → **중복 탐지** → 중대성 판정(수동 재정의는 감사 추적에 기록) → MedDRA 코딩／예측성／인과관계 → 후속 보고 → 제출 및 종결.
*   **법정 타이머** —— 중대 증례는 최초 인지일로부터 15일 카운트다운. 기한 초과 시 빨강, 5일 이내 시 주황으로 표시됩니다.
*   **후속 보고** —— 원 증례에서 한 번의 클릭으로 생성(번호는 `PARENT-F1`)되며, Day 0는 새 정보를 입수한 날로 설정됩니다. 중요한 새 정보가 있을 때만 15일 타이머가 재시작되고, 그렇지 않으면 신규 신속보고 기한이 발생하지 않고 정기보고에 수록됩니다. 후속 보고 연쇄는 중복 탐지 대상에서 제외됩니다.
*   **해외 증례** —— 폼에서 발생 국가(CIOMS 1a)를 수집하고, 콘솔에서 표시하여 CIOMS와 E2B `E.i.9`에 매핑합니다.
*   클릭 한 번으로 **CIOMS-I 텍스트 서식**과 **E2B(R3) 항목 매핑** 생성. 증례 목록은 CSV로 내보낼 수 있으며, 전 과정에 완전한 **감사 추적**(누가·언제·무엇을)이 남습니다.
*   증례는 문헌 레코드와 함께 **성분 × MedDRA PT** 신호 집계에 포함됩니다.

> 📖 항목 근거, 규제 관련 주석, 백오피스 업무 흐름: [`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md) (번체 중국어)

---

## 접근 제어와 역할

로그인은 회사 메일 주소를 사용하는 **Cloudflare Access Email OTP**입니다 —— 유출되거나 공유되거나 재설정이 필요한 비밀번호가 없습니다. 퇴사 시 차단도 자동입니다. 메일함이 비활성화되면 일회용 코드를 받을 수 없으므로, 정책을 정리하는 것을 아무도 기억하지 못해도 접근이 끊깁니다.

Access가 답하는 것은 "이 사람이 내부인인가"입니다. **무엇을 봐도 되는가**는 D1에서 결정됩니다.

| 역할 | 가능한 작업 |
|---|---|
| `rep`(영업 담당자) | 증례 제출, **자신이 제출한 증례만** 조회 |
| `pv`(PV 담당자) | 모든 증례 읽기·쓰기 |

`ae_users`에 없는 주소는 `rep`로 취급합니다. 설정 누락의 결과가 "모든 증례를 못 본다"(본인이 알려 옴)이지 "모든 증례를 볼 수 있다"(아무도 알리지 않음)가 되지 않도록 하기 위함입니다. 첫 PV 담당자는 `wrangler secret put AE_PV_EMAILS`로 등록합니다.

> ⚠️ Access 정책에는 개별 주소를 하나씩 나열하세요. `Emails ending in @회사도메인` 규칙은 재무·인사·인턴을 포함한 **전 직원**이 환자 이상반응 데이터를 읽을 수 있다는 뜻입니다. 목록이 길어지면 도메인 규칙으로 되돌아가지 말고 Access Group을 사용하세요.

> ⚠️ 시행 지점은 화면이 아니라 Worker입니다. 해시 라우트(`#/report`)는 Access의 경로 규칙으로 분리할 수 없으며 —— `#` 이후는 서버로 전송되지 않습니다 —— 프런트엔드의 역할 판정은 표시용일 뿐입니다. 각 API가 스스로 역할을 확인하고, 증례 목록 필터링은 JS가 아닌 SQL에서 수행하며, 볼 수 없는 증례에는 403이 아니라 404를 반환합니다(403은 그 id의 존재를 확인해 주는 셈이기 때문입니다).

---

## AI 모델

### 현재 배포 구성

| | 값 | 설정 위치 |
|---|---|---|
| 엔드포인트 | `https://ollama.com/v1`(Ollama Cloud) | `worker/wrangler.toml`의 `LLM_BASE_URL` |
| 모델 | `deepseek-v4-pro` | `worker/wrangler.toml`의 `LLM_MODEL` |
| JSON 모드 | 비활성 —— 상위 서비스의 `response_format` 지원이 일정하지 않아 `parseJsonLoose`로 파싱 | `LLM_JSON_MODE = "0"` |
| Temperature | `0.2` | `services/llmService.ts` |
| API 키 | 서버 측 secret, 번들에 절대 포함되지 않음 | `wrangler secret put LLM_API_KEY` |

AI 계층(`services/llmService.ts`)은 표준 **OpenAI Chat Completions**만 사용하며 벤더 SDK에 의존하지 않습니다. 따라서 공급자 변경은 환경 변수 두 개를 바꾸는 일이며 코드 수정이 필요 없습니다.

| 공급자 | Base URL | 모델 예시 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `moonshotai/kimi-k2` |
| Ollama(로컬) | `http://localhost:11434/v1` | `llama3.1` |

### 모델이 하는 일과 하지 않는 일

모델이 담당하는 것은 **읽기**입니다. 관련성 점수 산정, 초록 요약, 핵심 결론 추출, 자유 기술로부터의 이상사례 데이터 구조화 추출.

**규제상 결과를 수반하는 판단은 모두 단위 테스트를 갖춘 순수 함수이며, 모델을 전혀 거치지 않습니다**:

*   중대성 판정과 15일 법정 타이머
*   ICSR 4대 요건 및 그 밖의 검증 규칙
*   중복 탐지
*   CIOMS-I 및 E2B(R3) 매핑
*   역할 및 권한 판정

이 구분은 의도적입니다. 모델을 교체하거나 모델의 상태가 좋지 않아도 달라지는 것은 요약 품질뿐입니다. **법정 기한을 바꾸거나, 4대 요건을 충족하지 못한 증례를 통과시키거나, 어떤 영업 담당자에게 다른 담당자의 환자를 보여줄 수는 없습니다.**

> ⚠️ 모든 AI 출력은 **검토용 초안**입니다. 특히 CIOMS-I는 제출 전에 자격을 갖춘 PV 담당자의 확인과 보완이 반드시 필요합니다.

---

## 데이터 저장 위치

| 데이터 | 저장소 | 비고 |
|---|---|---|
| AE 증례 | **D1**(`ae_cases`) | 증례 본문은 JSON 페이로드, 조회·정렬용 인덱스 컬럼을 별도로 추출 |
| 감사 추적 | **D1**(`ae_audit`) | 별도 테이블. **추가만 가능하다는 제약을 데이터베이스 트리거가 강제**하며, 애플리케이션의 자율 규제에 의존하지 않습니다 |
| 첨부파일 | **R2** | 압축된 약상자 사진은 0.3–1.5MB. 페이로드에 두면 목록 조회 때마다 함께 끌려옵니다 |
| 사용자와 역할 | **D1**(`ae_users`) | 이메일 → 역할, 그리고 보고자 프로필 |
| 속도 제한 | **KV** | 고정 윈도, IP별·분당 |
| 문헌 마스터 DB | **IndexedDB** | 브라우저 측. 문헌 경로에는 아직 서버 구성 요소가 없습니다 |

> ⚠️ `VITE_AE_API_ENDPOINT`를 설정하지 않으면 보고 화면과 콘솔이 **같은 브라우저**의 IndexedDB를 공유합니다. 단일 기기 시험용이며, 실제 운영에는 백엔드가 필요합니다.

---

## 기술 스택

*   **프런트엔드** —— React 19, TypeScript 5.8, Vite 6, Tailwind CSS 3.4, Heroicons. 해시 라우팅(정적 호스팅, 서버 rewrite 불필요)
*   **백엔드** —— Cloudflare Workers(LLM 프록시 + 증례 접수 API), D1(SQLite), R2, KV
*   **인증** —— Cloudflare Access(Email OTP). JWT는 Worker가 팀 JWKS에 대해 검증
*   **AI** —— OpenAI 호환 Chat Completions API라면 무엇이든. 벤더 비종속, SDK 미사용
*   **데이터 소스** —— NCBI PubMed E-utilities
*   **테스트** —— vitest 3 + jsdom. CI는 Node 22.x와 24.x에서 타입 검사·테스트·빌드를 실행

---

## 시작하기

```bash
npm install
cp .env.example .env.local   # 아래 설명을 참고해 입력
npm run dev                  # http://localhost:3000
```

**로컬 개발** 시에는 프런트엔드에서 OpenAI 호환 엔드포인트에 직접 연결할 수 있습니다.

```env
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=sk-xxxx
VITE_LLM_MODEL=gpt-4o-mini
```

> ⚠️ `VITE_`로 시작하는 변수는 프런트엔드 번들에 포함됩니다 —— 로컬 사용에는 문제없지만 **공개 배포에는 적합하지 않습니다**. 공개 배포 시에는 Worker 프록시를 사용하고, 프런트엔드에는 `VITE_PV_PROXY_ENDPOINT`만 설정하여 키를 서버 측에 보관하세요.

### 사용 흐름

1.  **검색 설정** —— 대상 성분(쉼표로 구분, 예: `Aspirin, Ibuprofen`)과 모니터링 기간을 입력합니다.
2.  **작업 시작** —— PubMed에 질의하고, 마스터 DB에 이미 있는 문헌은 자동으로 제외합니다.
3.  **검토 대기** —— AI 요약과 임상적 결론을 읽고, PV 가치가 있는 것을 **마스터 DB로 가져옵니다**.
4.  **마스터 DB** —— 이력을 검색하고 CSV 보고서를 내보냅니다.
5.  **보고 링크 공유** —— "증례 접수" 탭에서 휴대폰 아이콘으로 폼을 열고, 링크 아이콘으로 `#/report` URL을 복사합니다(영업팀에는 QR 코드가 효과적입니다).
6.  **접수 처리** —— 증례는 기한 압박 순으로 도착합니다. 유효성 → 중복 탐지 → 중대성 → 코딩 → 후속 → 제출 순으로 처리합니다.
7.  **제출 문서 작성** —— CIOMS-I 초안을 생성하고 검토 후 당국에 제출한 뒤, 접수번호를 기록하고 증례를 종결합니다.

---

## 배포

### LLM 프록시

```bash
cd worker
npx wrangler secret put LLM_API_KEY            # 업스트림 키, 서버 측에만 보관
npx wrangler kv namespace create RATE_LIMIT    # 반환된 id를 wrangler.toml에 입력
npx wrangler deploy                            # LLM_BASE_URL / LLM_MODEL은 wrangler.toml에서
```

이어서 `VITE_PV_PROXY_ENDPOINT`를 배포된 Worker로 지정하고 다시 빌드합니다. 이제 프런트엔드에는 LLM 키가 **전혀** 포함되지 않습니다. 속도 제한용 KV가 바인딩되지 않은 경우 Worker는 자동으로 건너뛰고 정상 동작합니다.

### 이상반응 접수 백엔드

접수 API는 **동일한** Worker에서 **동일한** Access 인증 뒤에 동작하므로, 두 번째 로그인 체계를 유지할 필요가 없습니다.

```bash
cd worker
npx wrangler d1 create pv-link-ae                       # database_id를 wrangler.toml에 입력
npx wrangler r2 bucket create pv-link-ae-attachments
npx wrangler d1 execute pv-link-ae --remote --file=worker/schema.sql
npx wrangler secret put AE_PV_EMAILS                    # 초기 PV 담당자, 쉼표로 구분
npx wrangler deploy
```

이어서 `VITE_AE_API_ENDPOINT=/api/ae-reports`(`.env.production`에 이미 포함)를 설정하고 다시 빌드합니다.

> 📖 전체 실행 매뉴얼, 역할 관리 명령, 실기기 테스트 절차, 배포 전 체크리스트: [`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md) (번체 중국어)

---

## 테스트

```bash
npm test           # vitest, 단위 테스트 148건
npm run typecheck  # tsc --noEmit
npm run build      # 프로덕션 빌드
```

규제상 결과를 수반하는 순수 함수에는 모두 테스트가 있습니다. 유효성, 중대성, 법정 타이머, 중복 탐지, CIOMS／E2B 매핑, 신호 집계, `parseJsonLoose`, `reconcile`, MedDRA 매핑, 그리고 권한 규칙입니다. 동적 i18n 키(`ae.issue.*`, `ae.status.*`)의 번역 커버리지도 테스트로 보장합니다.

Worker는 프런트엔드의 TypeScript 모듈을 가져올 수 없어 중대성·기한 판정이 의도적인 미러 구현입니다. `tests/worker.ae.test.ts`는 동일한 증례 집합을 양쪽에 넣어 건별로 대조합니다 —— 미러가 어긋나면 법정 기한 오류로 나타나는데, 테스트 환경에서 재현하기 어려운 반면 보고 의무에 직결되기 때문입니다.

권한 규칙은 정상 경로뿐 아니라 부정 사례도 함께 테스트합니다. 각 실패가 "어떤 영업 담당자가 다른 담당자의 환자 데이터를 읽었다"는 사건에 대응하기 때문입니다.

---

## 문서

| 문서 | 내용 |
|---|---|
| [`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md) | CIOMS／E2B 기반 항목 근거, 대만 규제 주석, 접수 7개 관문, 백엔드 구성, 역할 분리, 보고자 프로필 |
| [`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md) | 배포 매뉴얼, Access 설정, 역할 관리, 실기기 테스트 절차, 배포 전 체크리스트 |

둘 다 번체 중국어입니다.

## 라이선스 (License)

MIT License
