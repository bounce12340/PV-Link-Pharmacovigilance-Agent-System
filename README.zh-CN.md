[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

---

# PV-Link：药品安全监测代理系统

![React](https://img.shields.io/badge/React-19-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg) ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg) ![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20D1%20%7C%20R2-orange.svg) ![OpenAI-compatible](https://img.shields.io/badge/AI-OpenAI--compatible-green.svg) ![Tests](https://img.shields.io/badge/tests-148-brightgreen.svg)

**PV-Link** 覆盖药商 ICSR 收案的两半：**文献监测**（已发表文献怎么说你的产品）与**自发性报告**（你的业务从临床端听到什么）。两条管道汇入同一个个案库、同一套稽核轨迹、同一个信号聚合视图。

---

## 系统全貌

```
 ┌─ 文献管道 ────────────────────┐   ┌─ 自发性报告管道 ─────────────────┐
 │  PubMed E-utilities           │   │  业务手机报告   #/report          │
 │       ↓                       │   │       ↓（离线队列）               │
 │  AI 评分与摘要                │   │  POST /api/ae-reports            │
 │       ↓                       │   │       ↓                          │
 │  结构化数据提取               │   │  药安收案处理台（七道关卡）       │
 └───────────┬───────────────────┘   └───────────┬──────────────────────┘
             └──────────────┬────────────────────┘
                            ↓
          正式库 · 稽核轨迹 · 成分 × MedDRA PT 信号聚合
                            ↓
            CIOMS-I 草稿 · E2B(R3) 映射 · CSV 导出
```

全部跑在同一个域名（`pvlink.uic-ai.com`）、同一套 Cloudflare Access 验证之下：一个纯静态的 React 前端，加上一个同时承载 LLM proxy 与收案 API 的 Worker。

---

## 文献监测

*   🔍 **确定性检索** —— 直接对接 **NCBI PubMed E-utilities** 官方 API，结果精确且可重现。支持多成分同时检索（`Fenofibrate, Aspirin`）、自定义日期区间，以及可设上限的分页抓取。
*   🤖 **AI 评分与摘要** —— 相关性评分（0–100）、摘要白话化，以及独立抽出的**关键结论**。以并行批次执行，顶部有实时进度条。
*   📊 **结构化提取** —— 成分、不良事件原文、MedDRA 候选词、严重性、因果关系。
*   🧬 **MedDRA 对照层** —— 内置常见 PV 事件的 **PT → SOC 种子词典**，离线验证 AI 猜测的 PT 并补上系统器官分类。⚠️ 完整 MedDRA 词典需授权，请自行扩充种子或接入有授权的来源。
*   💾 **正式库管理** —— 多字段模糊搜索、日期筛选、CSV 导出、IndexedDB 持久化（首次加载自动从 localStorage 迁移）。

## 不良反应个案报告

报告管道有两个界面，各自对应一种使用者。

### 📱 业务报告端（移动优先，`#/report`）

*   字段对应 **CIOMS Form I** 全部 26 个编号字段（字段号直接标在旁边），另加本地实务需要的**批号、有效期与注册证号**。
*   拆成六步骤而非一页四十个输入框；16px 输入框（避免 iOS 自动放大）、≥44px 触控目标、chip 选择器取代原生下拉菜单。
*   **草稿自动保存**（600ms debounce）、**离线队列**恢复连接自动补送、**设备端照片压缩**（长边 1600px）。
*   验证分成错误与警告：只有四要素这类硬缺口会挡住提交，其余转为待补清单——**一份不完整的报告，胜过一份从未提交的报告**。
*   **报告者资料只填一次**。首次登录填姓名、工号、电话、公司（CIOMS 26／24a），之后每份报告自动带入，第一屏从六个输入框收成一张摘要卡。
*   **我的报告记录** —— 只读列表，看得到自己提交过哪些个案、当前状态。

### 🗂️ 药安收案处理台

*   收件箱按**法定时限压力**排序（逾期 → 剩余天数 → 新进），不是先进先出。
*   七道关卡：收案登录 → 效度判定（ICSR 四要素）→ **重复检测** → 严重性判定（人工覆写留痕）→ MedDRA 编码／预期性／因果关系 → 跟踪报告 → 提交与结案。
*   **法定时钟** —— 严重个案自首次获知日起 15 日倒计时；逾期转红，五日内转琥珀。
*   **跟踪报告** —— 一键由原案建立（编号 `PARENT-F1`），Day 0 设为获知新信息当日。带来重要新信息才重启 15 日时钟，否则没有新的快速报告期限，收录于定期安全性报告。跟踪链不纳入重复检测。
*   **境外个案** —— 报告表单收发生国别（CIOMS 1a），后台标记并映射进 CIOMS 与 E2B `E.i.9`。
*   一键生成 **CIOMS-I 文本表格**与 **E2B(R3) 字段映射**；个案列表可导出 CSV；全流程有完整**稽核轨迹**（谁、何时、做了什么）。
*   个案与文献记录一起进入**成分 × MedDRA PT** 信号聚合。

> 📖 字段依据、法规要点与后台作业流程：[`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md)（繁体中文）

---

## 访问控制与角色

登录采用 **Cloudflare Access Email OTP**，以公司邮箱验证——没有密码可泄露、可共用、可要求重置。离职即失效是自动的：邮箱一停用就收不到一次性代码，即使没人记得清理 policy 也进不来。

Access 回答的是「这个人是不是自己人」。至于**他该看到什么**，由 D1 决定：

| 角色 | 能做的事 |
|---|---|
| `rep`（业务） | 提交个案；**只读得到自己提交的** |
| `pv`（药安人员） | 读写全部个案 |

不在 `ae_users` 里的一律是 `rep`。设置漏了的后果因此是「某人看不到全部个案」（他会来反映），而不是「某人看得到全部个案」（没人会来反映）。第一位药安人员用 `wrangler secret put AE_PV_EMAILS` 引导。

> ⚠️ Access policy 必须逐一列举个别 email。设 `Emails ending in @公司域名` 等于**全公司每个人**（含财会、人资、实习生）都能读病人不良反应数据。名单变长请改用 Access Group，而不是退回域名规则。

> ⚠️ 执行点在 Worker，不在界面。hash 路由（`#/report`）无法用 Access 的路径规则分权——`#` 之后的片段不会送到服务器——所以前端的角色判断只是体验。每一条 API 都自己查角色，个案列表的过滤写在 SQL 而非 JS，读不到的个案返回 404 而非 403（403 等于确认那个 id 存在）。

---

## AI 模型

### 当前部署

| | 值 | 设置位置 |
|---|---|---|
| 端点 | `https://ollama.com/v1`（Ollama Cloud） | `worker/wrangler.toml` 的 `LLM_BASE_URL` |
| 模型 | `deepseek-v4-pro` | `worker/wrangler.toml` 的 `LLM_MODEL` |
| JSON 模式 | 关闭——上游对 `response_format` 支持不一，改以 `parseJsonLoose` 解析 | `LLM_JSON_MODE = "0"` |
| Temperature | `0.2` | `services/llmService.ts` |
| API 密钥 | 服务器端 secret，永不进前端 bundle | `wrangler secret put LLM_API_KEY` |

AI 层（`services/llmService.ts`）讲的是标准 **OpenAI Chat Completions**，不依赖任何厂商 SDK，所以换供应商只是改两个环境变量，不动代码：

| 供应商 | Base URL | 模型示例 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `moonshotai/kimi-k2` |
| Ollama（本机） | `http://localhost:11434/v1` | `llama3.1` |

### 模型做什么、不做什么

模型负责**阅读**：相关性评分、摘要白话化、关键结论抽取，以及从自由文本提取不良事件的结构化数据。

**凡是有法规后果的判断，全都是有单元测试的纯函数，完全不经过模型**：

*   严重性判定与 15 日法定时钟
*   ICSR 四要素与其余验证规则
*   重复检测
*   CIOMS-I 与 E2B(R3) 映射
*   角色与权限判断

这个切法是刻意的。换模型、或模型今天状况不好，影响的是摘要质量；**它动不了法定期限、放不过四要素不齐的个案、也不会让某个业务看到另一个业务的病人**。

> ⚠️ 所有 AI 产出都是**供复核的草稿**。CIOMS-I 尤其必须由合格药安人员检查补全后才能提交。

---

## 数据存放位置

| 数据 | 存放 | 说明 |
|---|---|---|
| AE 个案 | **D1**（`ae_cases`） | 个案本体为 JSON payload，另抽出供查询与排序的索引列 |
| 稽核轨迹 | **D1**（`ae_audit`） | 独立数据表，**只增不改由数据库 trigger 强制**，不靠应用层自律 |
| 附件 | **R2** | 一张压缩后的药盒照 0.3–1.5MB，留在 payload 里会让每次列表查询都把它拖出来 |
| 用户与角色 | **D1**（`ae_users`） | email → 角色，以及报告者个人档案 |
| 速率限制 | **KV** | 固定时间窗，每 IP 每分钟 |
| 文献正式库 | **IndexedDB** | 浏览器端；文献管道目前尚无服务器组件 |

> ⚠️ 未设置 `VITE_AE_API_ENDPOINT` 时，报告端与后台共用**同一个浏览器**的 IndexedDB，只适合单机试用。正式上线一定要有后端。

---

## 技术栈

*   **前端** —— React 19、TypeScript 5.8、Vite 6、Tailwind CSS 3.4、Heroicons；hash 路由（纯静态部署，不需服务器 rewrite）
*   **后端** —— Cloudflare Workers（LLM proxy + 收案 API）、D1（SQLite）、R2、KV
*   **身份验证** —— Cloudflare Access（Email OTP），JWT 由 Worker 对 team JWKS 验证
*   **AI** —— 任何 OpenAI 兼容的 Chat Completions API，不绑供应商、不用厂商 SDK
*   **数据源** —— NCBI PubMed E-utilities
*   **测试** —— vitest 3 + jsdom；CI 在 Node 22.x 与 24.x 上跑类型检查、测试与构建

---

## 快速开始

```bash
npm install
cp .env.example .env.local   # 按下方说明填入
npm run dev                  # http://localhost:3000
```

**本机开发**时前端可直连任一 OpenAI 兼容端点：

```env
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_API_KEY=sk-xxxx
VITE_LLM_MODEL=gpt-4o-mini
```

> ⚠️ `VITE_` 开头的变量会被打包进前端——本机自用没问题，**不适合公开部署**。公开部署请改用 Worker proxy，前端只设 `VITE_PV_PROXY_ENDPOINT`，密钥留在服务器端。

### 使用流程

1.  **检索设置** —— 输入目标成分（逗号分隔，例 `Aspirin, Ibuprofen`）与监测日期区间。
2.  **启动任务** —— 系统向 PubMed 发出请求，并自动滤掉正式库已有的文献。
3.  **待复核** —— 阅读 AI 摘要与临床结论，确认有 PV 价值者**导入正式库**。
4.  **正式库** —— 搜索历史记录、导出 CSV 报表。
5.  **分享报告链接** —— 在「个案收案」标签页，手机图标可打开表单，链接图标可复制 `#/report` 网址（做成二维码给业务很好用）。
6.  **收案处理** —— 个案按时限压力排序进来，逐案走过效度 → 重复检测 → 严重性 → 编码 → 跟踪 → 提交。
7.  **产出提交文件** —— 生成 CIOMS-I 草稿，复核后提交监管机构，登录回执号并结案。

---

## 部署

### LLM proxy

```bash
cd worker
npx wrangler secret put LLM_API_KEY            # 上游密钥，只留服务器端
npx wrangler kv namespace create RATE_LIMIT    # 将返回的 id 填入 wrangler.toml
npx wrangler deploy                            # LLM_BASE_URL / LLM_MODEL 于 wrangler.toml 设置
```

接着把 `VITE_PV_PROXY_ENDPOINT` 指向部署后的 Worker 并重新构建。此时前端**不含**任何 LLM 密钥。速率限制的 KV 未绑定时 Worker 会自动跳过、照常运作。

### 不良反应收案后端

收案 API 挂在**同一个** Worker、走**同一套** Access 验证，不必再维护第二套登录。

```bash
cd worker
npx wrangler d1 create pv-link-ae                       # 将 database_id 填入 wrangler.toml
npx wrangler r2 bucket create pv-link-ae-attachments
npx wrangler d1 execute pv-link-ae --remote --file=worker/schema.sql
npx wrangler secret put AE_PV_EMAILS                    # 引导用的药安人员邮箱，逗号分隔
npx wrangler deploy
```

接着设置 `VITE_AE_API_ENDPOINT=/api/ae-reports`（`.env.production` 已内置）并重新构建。

> 📖 完整 runbook、角色管理指令、实机测试流程与上线前检查表：[`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md)（繁体中文）

---

## 测试

```bash
npm test           # vitest，148 个单元测试
npm run typecheck  # tsc --noEmit
npm run build      # 产出正式构建
```

凡是有法规后果的纯函数都有测试：效度、严重性、法定时钟、重复检测、CIOMS／E2B 映射、信号聚合、`parseJsonLoose`、`reconcile`、MedDRA 对照，以及权限规则。动态 i18n 键（`ae.issue.*`、`ae.status.*`）的中英翻译覆盖率也由测试把关。

Worker 无法导入前端的 TypeScript 模块，其严重性与到期日判定是刻意的镜像。`tests/worker.ae.test.ts` 用同一批个案喂给两边逐案比对——镜像一旦漂移，症状就是法定期限算错，很难在测试环境重现，却直接影响报告义务。

权限规则每条都连同反面一起测，因为每一条失败都对应「某个业务读到了别人报告的病人数据」。

---

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md`](docs/superpowers/specs/2026-09-08-ae-case-reporting-design.md) | CIOMS／E2B 字段依据、台湾法规要点、收案七道关卡、后端架构、角色分权、报告者个人档案 |
| [`docs/deployment-ae-backend.md`](docs/deployment-ae-backend.md) | 部署 runbook、Access 设置、角色管理、实机测试流程、上线前检查表 |

两份均为繁体中文。

## 授权条款 (License)

MIT License
