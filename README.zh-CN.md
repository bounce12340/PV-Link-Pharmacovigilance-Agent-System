[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link: 药品安全监测代理系统 (Pharmacovigilance Agent System)

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![OpenAI-compatible](https://img.shields.io/badge/AI-OpenAI--compatible-green.svg)

**PV-Link** 是一个专为药品安全监视 (Pharmacovigilance, PV) 打造的专业自动化代理系统。本系统旨在解决传统人工文献审查耗时且容易遗漏的问题，透过串接官方文献数据库与大型语言模型 (LLM)，提供从检索、评分、摘要到结构化数据抽取的一站式解决方案。

## ✨ 核心功能 (Core Features)

*   🔍 **精准文献检索 (Deterministic Search)**
    *   直接串接 **NCBI PubMed E-utilities 官方 API**，确保检索结果的绝对精确性与可重现性。
    *   支持**复数目标成分**同时检索（例如：`Fenofibrate, Aspirin`），自动转换为精确的 PubMed 查询语法。
    *   支持自定义监测日期区间。
*   🤖 **AI 智能评分与摘要 (AI Scoring & Summarization)**
    *   可串接任何 **OpenAI 兼容的 Chat Completions 端点**（OpenAI、Azure OpenAI、Ollama、OpenRouter、Kimi…），对新进文献进行 PV 关联性评分 (0-100分)。
    *   自动将生硬的英文医学摘要，转化为易读的**中文摘要**。
    *   独立提炼出对药安监测最重要的**“临床结论 (Key Conclusion)”**，并支持一键复制。
*   📊 **结构化数据抽取 (Structured Data Extraction)**
    *   自动从文献中提取关键 PV 数据，包含：目标成分、不良反应描述 (AE Verbatim)、MedDRA 候选词、严重程度 (Seriousness)、因果关系 (Causality) 等。
*   💾 **文献库管理与导出 (Database & Export)**
    *   内置“正式文献库”管理界面，支持将确认无误的文献导入保存。
    *   提供强大的**多字段模糊搜索**与日期区间过滤功能。
    *   支持一键将筛选后的文献数据**导出为 CSV 报表**，方便后续稽核与归档。

## 🆕 高级功能 (v4)

*   📄 **CIOMS-I / E2B(R3) 草稿生成**
    *   在文献详情页一键由结构化数据生成 **CIOMS-I 个案安全报告草稿**，含 E2B(R3) 关键数据元素对照（如 `E.i.2.1b MedDRA PT`、`G.k.2.2 Active substance`）。
    *   纯离线映射、可复制或下载为 `.txt`。⚠️ 产出为草稿，需药安人员审阅补全后方可提交。
*   📈 **安全信号聚合 (Signal Aggregation)**
    *   新增“信号聚合”标签页，将正式库依 **成分 × MedDRA PT** 分组计数，标示严重个案与潜在信号（计数 ≥ 3 或含严重个案）。
*   🧬 **MedDRA 对照层**
    *   内置常见 PV 事件的 **PT → SOC 种子词典**，离线校验 AI 猜测的 PT 并补上系统器官分类。⚠️ 完整 MedDRA 为授权词典，需自行扩充或接授权来源。
*   ⚡ **批量并行 + 进度显示**
    *   AI 评分/摘要改为**并行分批**（大幅缩短一轮时间），并在顶部显示实时进度条。
    *   正式库支持**批量结构化抽取**未抽取文献，供信号聚合使用。
*   💽 **IndexedDB 持久化**
    *   正式库与“待核阅清单”改存 **IndexedDB**（容量远大于 localStorage），刷新不丢失；首次加载自动从旧 localStorage 迁移。
*   🔎 **PubMed 分页**：检索可设定“最多取回笔数”（分页上限，默认 100），efetch 自动分批抓取。
*   🛡️ **后端速率限制**：Worker proxy 内置 KV 固定窗速率限制（每 IP 每分钟上限），保护密钥额度。

## 🆕 不良反应个案通报 (v5)

自发性通报渠道，补上文献监测之外的另一半个案来源。分为两个界面：

*   📱 **业务通报端（移动优先，`#/report`）**
    *   字段对齐 **CIOMS Form I** 全部 26 项（标注官方字段编号），并补充本地实务所需的**批号、有效期、许可证字号**。
    *   分 6 步填写；输入框 16px（防 iOS 自动缩放）、触控目标 ≥44px、单选多选一律使用大色块 chip。
    *   **草稿自动保存**、**离线队列**（发送失败自动补送）、**照片端内压缩**（长边 1600px）。
    *   校验分 error / warning：仅四要素等硬性缺失会阻挡提交，其余列入补件清单——**宁可收到不完整的个案，也不要让业务放弃通报**。
*   🗂️ **药安收案后台（「通报收案」标签页）**
    *   收件箱按**法定时限压力**排序（逾期 → 剩余天数 → 新进）。
    *   七道处理关卡：收案登记 → 有效性判定（ICSR 四要素）→ **重复个案检测** → 严重性判定（可人工覆写并留痕）→ MedDRA 编码／预期性／因果关系 → 补件跟踪 → 送件与结案。
    *   **法定时钟**：严重个案自「首次获知日」起 15 日倒计时。
    *   一键生成 **CIOMS-I 文本表单**与 **E2B(R3) 字段对照**；个案清单可导出 CSV。
    *   **随访报告**：可由原案一键建立（编号 `原案-F1`），Day 0 设为**获知新信息之日**；带来重要新信息者 15 日时钟重新起算，否则不重启。随访链自动排除于重复个案检测之外。
    *   **境外个案**：通报端可选反应发生国别（CIOMS 1a），后台标记境外个案。
    *   全流程记录**稽核轨迹**，并自动并入「成分 × MedDRA PT」**信号聚合**。

> 📖 完整设计说明见 [`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md)（繁体中文）。
> ⚠️ 未设置 `VITE_AE_API_ENDPOINT` 时，通报端与后台共用**同一个浏览器**的 IndexedDB（仅适合单机试用）。

## 🧪 测试 (Testing)

核心纯函数（`parseJsonLoose`、`reconcile`、MedDRA 对照、CIOMS 映射、信号聚合）皆有单元测试。
Worker 无法导入前端的 TypeScript 模块，其严重性与到期日判定是刻意的镜像——`tests/worker.ae.test.ts` 用同一批个案喂给两边逐案比对，因为镜像一旦漂移，症状就是法定期限算错：
```bash
npm test        # vitest 执行单元测试
npm run typecheck  # tsc --noEmit 类型检查
```

## 🛠️ 技术栈 (Tech Stack)

*   **前端框架**: React 19, TypeScript, Vite
*   **UI 样式**: Tailwind CSS, Heroicons
*   **AI 引擎**: 任何 OpenAI 兼容的 Chat Completions API（provider 无关，不绑定任何厂商 SDK）
*   **数据来源**: NCBI PubMed E-utilities API

## 🚀 快速开始 (Getting Started)

### 1. 安装依赖
请确保您的环境已安装 Node.js，然后执行以下指令安装所需套件：
```bash
npm install
```

### 2. 环境变量设定
将 `.env.example` 复制为 `.env.local`。**本机开发**时可让前端直接指向任一 OpenAI 兼容端点：
```env
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=sk-xxxx
VITE_LLM_MODEL=gpt-4o-mini
```
> ⚠️ `VITE_` 开头的变量会被打包进前端 bundle——本机自用没问题，但**不适合公开部署**。要公开/多人使用，请改用后端 proxy（见下方「部署」），前端只设 `VITE_PV_PROXY_ENDPOINT`，密钥留在服务器端。

### 3. 启动开发服务器
```bash
npm run dev
```
启动后，请在浏览器打开 `http://localhost:3000` 即可开始使用。

## 📖 使用指南 (Usage Guide)

1.  **检索设定**: 进入“检索设定”标签页，输入您要监测的目标成分（多个成分请用逗号分隔，如 `Aspirin, Ibuprofen`），并设定监测的日期区间。
2.  **启动任务**: 点击右上角的“启动新监测任务”。系统会自动向 PubMed 发出请求，并过滤掉已经存在于正式库中的文献。
3.  **待核阅**: 任务完成后，系统会自动切换至“待核阅”标签页。您可以在此查看 AI 生成的中文摘要与临床结论。
4.  **确认导入**: 确认文献内容具备 PV 价值后，点击“确认导入正式库”。
5.  **正式库管理**: 在“正式库”标签页中，您可以搜索历史纪录，并点击右上角的“导出 CSV 报表”来下载数据。

## 🔌 LLM 供应商（OpenAI 兼容）

AI 层（`services/llmService.ts`）是 provider 无关的：它走标准 **OpenAI Chat Completions** 格式，因此 OpenAI、Azure OpenAI、Ollama、OpenRouter、Kimi、LiteLLM 或任何兼容网关都能接——只改环境变量，不用动代码。

要换供应商，把 `VITE_LLM_BASE_URL` / `VITE_LLM_MODEL`（本机）或 Worker 的 `LLM_BASE_URL` / `LLM_MODEL`（proxy）指向你的服务即可。示例：

| 供应商 | Base URL | 示例模型 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `moonshotai/kimi-k2` |
| Ollama（本地） | `http://localhost:11434/v1` | `llama3.1` |

## 🚀 部署（公开 / 多人使用）

为避免把任何 API 密钥送进浏览器，请部署 `worker/` 内的薄 proxy（Cloudflare Worker）——密钥留在服务器端，由它把 prompt 转发给你选用的 OpenAI 兼容端点。

```bash
cd worker
npx wrangler secret put LLM_API_KEY   # 将上游密钥存成 secret
npx wrangler kv namespace create RATE_LIMIT   # 创建速率限制 KV，将返回的 id 填入 wrangler.toml
npx wrangler deploy                    # LLM_BASE_URL / LLM_MODEL 于 wrangler.toml 设定
```
接着在前端把 `VITE_PV_PROXY_ENDPOINT` 设为部署后的 Worker URL 并重新 build。此时前端**不含**任何 LLM 密钥。速率限制的 KV 未绑定时 Worker 会自动跳过、照常运作。


### 不良反应收案后端（Worker + D1 + R2）

AE 收案 API 挂在**同一个** Worker、走**同一套** Cloudflare Access 验证，不必再维护第二套登录。

```bash
cd worker
npx wrangler d1 create pv-link-ae                 # 将返回的 database_id 填入 wrangler.toml
npx wrangler r2 bucket create pv-link-ae-attachments
npx wrangler d1 execute pv-link-ae --remote --file=worker/schema.sql
npx wrangler deploy
```
接着设置 `VITE_AE_API_ENDPOINT=/api/ae-reports`（`.env.production` 已内置）并重新 build。个案存于 D1、附件存于 R2；稽核轨迹为独立数据表，**只增不改由数据库 trigger 强制**，不依赖应用层自律。

业务端以**公司邮箱**通过 **Cloudflare Access Email OTP** 登录——没有密码可泄露、可共用、可要求重置；且离职即失效是自动的：邮箱一停用就收不到一次性代码，即使没人记得清理 policy 也进不来。

> ⚠️ 必须逐一列举个别 email。设 `Emails ending in @公司域名` 等于**全公司每个人**（含财会、人资、实习生）都能读病人不良反应个案。名单变长请改用 Access Group，而不是退回域名规则。
**角色**记在 D1，因为 Access 只回答「这个人是不是自己人」，不回答「这个人该看到什么」：

| 角色 | 能做的事 |
|---|---|
| `rep`（业务） | 送出个案；**只读得到自己送的** |
| `pv`（药安人员） | 读写全部个案 |

不在 `ae_users` 里的一律是 `rep`——设定漏了的后果是「某人看不到全部个案」（他会来反映），而不是「某人看得到全部个案」（没人会来反映）。第一位药安人员用 `wrangler secret put AE_PV_EMAILS` 开机。

> ⚠️ 执行点在 Worker，不在界面。hash 路由（`#/report`）无法用 Access 的路径规则分权——`#` 之后的片段不会送到服务器——所以前端的角色判断只是体验；每一条 API 都自己查角色，且列表过滤写在 SQL 而非 JS。

> 📖 完整 runbook、实机测试步骤与上线前检查表：[`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md)（繁体中文）

## 📄 授权条款 (License)
MIT License
