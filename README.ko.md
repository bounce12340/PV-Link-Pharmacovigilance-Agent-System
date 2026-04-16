[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: 약물감시 에이전트 시스템 (Pharmacovigilance Agent System)

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![Gemini AI](https://img.shields.io/badge/AI-Google_Gemini-orange.svg)

**PV-Link**는 약물감시(Pharmacovigilance, PV)를 위해 특별히 구축된 전문 자동화 에이전트 시스템입니다. 이 시스템은 기존의 수동 문헌 검토가 시간이 많이 걸리고 누락되기 쉬운 문제를 해결하는 것을 목표로 합니다. 공식 문헌 데이터베이스와 대형 언어 모델(LLM)을 통합하여 검색, 스코어링, 요약부터 구조화된 데이터 추출까지 올인원 솔루션을 제공합니다.

## ✨ 주요 기능 (Core Features)

*   🔍 **정밀한 문헌 검색 (Deterministic Search)**
    *   **NCBI PubMed E-utilities 공식 API**와 직접 연동하여 검색 결과의 절대적인 정확성과 재현성을 보장합니다.
    *   **복수 대상 성분** 동시 검색 지원(예: `Fenofibrate, Aspirin`), 정확한 PubMed 쿼리 구문으로 자동 변환됩니다.
    *   사용자 지정 모니터링 날짜 범위 설정을 지원합니다.
*   🤖 **AI 스코어링 및 요약 (AI Scoring & Summarization)**
    *   **Google Gemini 3 Flash** 모델을 통합하여 신규 문헌의 PV 관련성 점수(0~100점)를 초고속으로 평가합니다.
    *   어려운 영문 의학 요약을 읽기 쉬운 언어로 자동 번역합니다.
    *   약물 안전성 모니터링에 가장 중요한 **"임상적 결론 (Key Conclusion)"**을 독립적으로 추출하며, 원클릭 복사를 지원합니다.
*   📊 **구조화된 데이터 추출 (Structured Data Extraction)**
    *   대상 성분, 이상사례 원문(AE Verbatim), MedDRA 후보 용어, 중대성(Seriousness), 인과관계(Causality) 등 문헌에서 핵심 PV 데이터를 자동으로 추출합니다.
*   💾 **데이터베이스 관리 및 내보내기 (Database & Export)**
    *   확인된 문헌을 가져와 저장할 수 있는 "마스터 데이터베이스" 관리 인터페이스가 내장되어 있습니다.
    *   강력한 **다중 필드 퍼지 검색** 및 날짜 범위 필터링 기능을 제공합니다.
    *   필터링된 문헌 데이터의 **CSV 보고서 내보내기**를 원클릭으로 지원하여 향후 감사 및 보관을 용이하게 합니다.

## 🛠️ 기술 스택 (Tech Stack)

*   **프론트엔드 프레임워크**: React 19, TypeScript, Vite
*   **UI 스타일링**: Tailwind CSS, Heroicons
*   **AI 엔진**: Google Gen AI SDK (`@google/genai`)
*   **데이터 소스**: NCBI PubMed E-utilities API

## 🚀 시작하기 (Getting Started)

### 1. 종속성 설치
환경에 Node.js가 설치되어 있는지 확인한 후, 다음 명령을 실행하여 필요한 패키지를 설치합니다.
```bash
npm install
```

### 2. 환경 변수 설정
프로젝트 루트 디렉토리에 `.env.local` 파일을 만들고 Google Gemini API 키를 입력합니다.
```env
GEMINI_API_KEY=your_api_key_here
```

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

## 🔌 다중 LLM 통합 가이드 (Multi-LLM Integration Guide)

이 시스템은 현재 기본적으로 Google Gemini API를 사용합니다. 다른 AI 소스(OpenAI, Claude, xAI, Ollama, OpenRouter 등)로 확장하거나 교체하려면 다음 두 가지 아키텍처 전략을 사용하는 것이 좋습니다.

### 전략 1: 통합 API 게이트웨이 사용 (가장 빠름, 권장)
다양한 모델을 빠르게 지원하려면 **OpenRouter** 또는 로컬 **Ollama** / **LiteLLM**과 같이 "OpenAI 호환 API" 형식을 지원하는 프록시 서비스를 사용하는 것이 가장 간단한 방법입니다.
1. OpenAI 공식 SDK 설치: `npm install openai`
2. `services/` 아래에 새 Service를 만들고 Base URL을 대상 서비스로 지정합니다.
   ```typescript
   import OpenAI from 'openai';
   
   const openai = new OpenAI({
     baseURL: "https://openrouter.ai/api/v1", // 또는 http://localhost:11434/v1 (Ollama)
     apiKey: process.env.OPENROUTER_API_KEY,
   });
   
   // 호출 시 모델 이름만 바꾸면 됩니다.
   // model: "anthropic/claude-3-opus" 또는 "xai/grok-1" 또는 "llama3"
   ```

### 전략 2: Adapter 패턴 구현 (심층 사용자 정의용)
다른 모델에 대한 심층적인 사용자 정의가 필요한 경우(예: 특정 모델의 Function Calling 또는 JSON Schema 형식이 다른 경우) `services/` 디렉토리 아래에 추상화 계층을 구현합니다.
1. **인터페이스 정의 (Interface)**: `scoreRelevance`, `generateSummaries`, `extractPVData` 등 핵심 메서드를 정의하는 `IAIService` 인터페이스를 만듭니다.
2. **서비스 구현 (Implementations)**: 
   - 기존 `PVGeminiService.ts` 유지
   - `OpenAIService.ts` 추가 (`openai` 패키지 사용)
   - `ClaudeService.ts` 추가 (`@anthropic-ai/sdk` 사용)
3. **의존성 주입 (DI) / Factory 패턴**: `App.tsx`에서 사용자 설정(환경 변수 또는 UI 드롭다운)에 따라 해당 Service를 동적으로 인스턴스화합니다. 예: `const aiService = AIFactory.create(process.env.AI_PROVIDER);`

## 📄 라이선스 (License)
MIT License
