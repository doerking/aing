---
tags: [aing-v2, overview, quickstart, architecture:9, knowledge-metabolism, dna-double-helix, meko-orchestrator, tri-axis, timebound, consciousness, local-first, nodejs, repo-root-docs:8]
description: aing-v2 知识代谢引擎门面：封闭场域 + DNA 双铰链 + meko 中间质编排 + 三轴加载判定 + 时界确定性调度，含快速开始、CLI/API 一览、脚本表、数据库、文档地图
date: 2026-11-25
status: stable
---

# aing-v2 · 知识代谢引擎（DNA 双铰链版） / Knowledge Metabolism Engine (DNA Double-Helix)

> **封闭场域内的知识代谢引擎**：DNA 双铰链靠 **meko 中间质**螺旋推进，**三轴**夹出加载判定，**时界**确定性调度。
>
> *A knowledge-metabolism engine inside one closed field: a DNA double-helix advanced by the meko interstitial orchestrator, a tri-axis load gate, and deterministic timebound scheduling.*
>
> 让知识库自己活着——超越 RAG，超越 LLM Wiki，进入主动代谢时代。
>
> *Let your knowledge base grow itself — beyond RAG, beyond LLM Wiki, into active metabolism.*

[![Version](https://img.shields.io/badge/version-0.9.9-blue.svg)](https://github.com/doerking/aing)
[![Tests](https://img.shields.io/badge/tests-ALL%20GREEN-brightgreen.svg)](#-验证证据--verification-evidence)

---

## 🗣️ 两句话说清 / Two Sentences

**给普通用户 / For you:**

> 你只管写和说——链接它来连、分数它来打、过期它来剪。笔记会烂尾，aing 不会，因为它自己养自己。
>
> *You just write and talk. aing links, scores, prunes and feeds what you saved — notes rot; aing raises itself.*

**给 Agent / For your agent:**

> 出场先读备忘录（`aing memo`），动手前取技能，关键节点喂回意识事件。库是活的仪表台，不是死文档。
>
> *Read the memo first (`aing memo`), pull skills by tag before acting, and feed consciousness events back at key moments. The library is a live dashboard, not a dead document.*

---

## 一句话 / One Line

**封闭场域内，DNA 双铰链靠 meko 中间质螺旋推进，三轴夹出加载判定，时界确定性调度。**

*Inside one closed field, a DNA double-helix is advanced by the meko interstitial orchestrator, a tri-axis gate decides load, and timebound scheduling keeps every round bounded.*

---

## 🧬 架构 / Architecture

aing-v2 把会话/文档摄入 → 编译成结构化知识（双铰链）→ 蒸馏 → 关联 → 检索 → 自检 → 剪枝，全程由 **meko 中间质编排**，像 DNA 双螺旋一样两条互补链交替推进。

*aing-v2 ingests sessions/docs → compiles them into structured knowledge (double helix) → distills → links → retrieves → self-checks → prunes, all orchestrated by the meko interstitial — two complementary strands advancing like a DNA double helix.*

**核心机制四件套 / Four core mechanisms:**

| 机制 / Mechanism | 说明 / What it does |
|---|---|
| **DNA 双铰链拓扑 / Double-helix topology** | `raw 文档 ⇄ 弱键 ⇄ 结构化实体`，解旋→复制→再螺旋，互补链互校 / `raw docs ⇄ weak bonds ⇄ structured entities`, unzip → replicate → re-helix, strands cross-check |
| **meko 中间质四顶职责 / meko's four duties** | ①氢键结合（弱键可逆）②组蛋白分层（9 段）③时界编排（确定性调度）④双链互校 / ①hydrogen bonding (reversible weak bonds) ②histone layering (9 bands) ③timebound orchestration ④cross-strand verification |
| **三轴夹出加载判定 / Tri-axis load gate** | 边进检索入口 = `(强度≥7) AND (类型配对合法) AND (未失效)` / an edge enters retrieval iff `(strength≥7) AND (type pairing legal) AND (not invalidated)` |
| **时界确定性调度 / Timebound scheduling** | SLB/SLE 双模分流 + G 节点中心 + 每轮时延有界 / SLB/SLE dual-mode routing + G-node centric + bounded per-round latency |

### 代谢管线 / Metabolism Pipeline

meko 编排的螺旋推进（非直线硬串）。一轮代谢 = 解旋 → 复制 → 再螺旋 → 互校，组件按需介入：

*meko-orchestrated helical advance (not a linear hard-wired chain). One round = unzip → replicate → re-helix → cross-check, with components joining as needed:*

```
compile → import → distill → link → link-sync → vector
   → sprout → pollinate → compress → kespi → prune
```

> **关键步熔断 / Critical-step breaker**：compile/import/vector/kespi 失败即置退出码 1 熔断，`--force` 仅续跑非关键步骤。
> *compile/import/vector/keski failures trip a breaker with exit code 1; `--force` continues non-critical steps only.*

---

## 二、哲学：封闭场域增强 / Philosophy: Closed-Field Amplification

**正因封闭，场域先增加得起来。** 开放系统能量向外耗散，场域建立不起来；封闭系统边界兜住，场域累积、稳定、增强。aing-v2 不追求开放兼容，而靠封闭场域内做到极致确定。

*Closedness is what lets the field amplify. Open systems dissipate energy outward and never build a field; a closed boundary holds it, letting it accumulate, stabilize, and strengthen. aing-v2 opts out of open compatibility to be maximally deterministic inside one closed field.*

- **库封闭 / Closed store**：不开放外部直改（门禁守）/ no external direct writes (gate-enforced)
- **双链封闭 / Closed strands**：raw⇄wiki 互为模板，不外泄 / raw⇄wiki are each other's template, nothing leaks
- **guard 封闭 / Closed guard**：默认断，噪声进不来 / open by default is OFF, noise stays out

---

## 三、目录结构（语义占位）/ Layout (semantic placeholders)

```
aing-v2/
├── spec/            架构规格（source of truth）/ architecture specs (source of truth)
├── src/             引擎代码（代谢/意识层/入库/检索/API/meko/适配/辅助）/ engine code
├── tools/           工具面（验收门禁/检索KPI/探针）/ tooling (gates / retrieval KPI / probes)
├── docs/            工程文档 / engineering docs
├── test/            测试面（run-all + count-guard）/ test suite
├── verify-deploy.js 33 项部署门禁 / 33-item deploy gate
└── AGENT.md         agent 出场接线 / agent onboarding
```

> 语义占位，不泄露真实部署路径；技能资产随包自洽部署。
> *Semantic placeholders only; real deploy paths are not disclosed. Skill assets ship self-contained.*

---

## 四、数据模型 / Data Model

三张表（建表即含三轴列，不走加列历史包袱）/ Three tables (tri-axis columns built in from day one, no ALTER-history baggage):

| 表 / Table | 内容 / Contents |
|---|---|
| **entities** | 实体（含强度 `tolaria_strength` / 时效 `last_access` · `invalid_at`）/ entities with strength + validity |
| **links** | 边（含强度 `strength` / 时效 `invalid_at`）/ edges with strength + validity |
| **meko_cycles** | 编排日志（解旋/复制/再螺旋/互校 + 时界调度 + 通感快照）/ orchestration log |

---

## 五、双层蜂群（自维护 + 对外派工，不桥接）/ Two-Layer Swarm (self-maintain + outward dispatch, unbridged)

- **内蜂群 / Inner swarm**（守内面 / inward face）：只管 aing-v2 自维护，5 固定角色，**随包自洽部署**（不依赖任何外部运行时），触发源 = 新架构读数面（KESPI/verify/meko_cycles）。详见 [SPEC-0.5](./spec/SPEC-0.5-内外蜂群接线与部署重设.md)。/ Self-maintenance only, 5 fixed roles, ships self-contained (no external runtime), triggered by the new architecture's read surfaces.
- **外蜂群 / Outer swarm**（对外面 / outward face）：对外派工，载体在宿主运行时面。aing-v2 只做链路保障（轨迹留痕/心跳/归因考核），不做编组指挥。/ Outward dispatch, hosted in the runtime; aing-v2 only guarantees the link (trajectory / heartbeat / attribution), not command.
- **铁律 / Iron rule**：两套不桥接，互不知晓对方存在。/ The two layers are never bridged; neither knows the other exists.

---

## 🚀 快速开始 / Quick Start

> **前置 / Prerequisites**：Node.js ≥ 18（库活读走内建 `node:sqlite`，需 ≥ 22.5；老版 Node 自动降级为静态默认值）。核心依赖只有 `sql.js`；语义检索另需 `@xenova/transformers`（devDependency，缺失自动回退 64 维哈希）。
> *Node ≥ 18 (live reads use built-in `node:sqlite`, needs ≥ 22.5, older Node silently falls back to static defaults). Core dep is `sql.js`; semantic retrieval adds `@xenova/transformers` (falls back to 64-dim hash if absent).*

> **升级须知 / Upgrade note（v0.10.0 破坏性变更）**：写面改为默认拒所有 actor（deny-by-default）。从 v0.9.x 升级后，若未设 `AING_ALLOWED_ACTORS`，`ingest` / `POST /entities` 会返回 `identity-rejected`。设一次即可：`AING_ALLOWED_ACTORS=<你的身份>`。
> *Breaking change in v0.10.0: the write surface denies every actor by default. After upgrading from v0.9.x, set `AING_ALLOWED_ACTORS` or writes return `identity-rejected`.*

```bash
# 1. 克隆仓库 / Clone
git clone https://github.com/doerking/aing.git
cd aing

# 2. 安装依赖 / Install (core: sql.js; semantic: @xenova/transformers)
npm install

# 3. 冷启动建库（按 SPEC-0.1 三表 schema）/ Cold-start the DB (SPEC-0.1 three-table schema)
node src/cli.js compile --dir <你的知识目录>     # batch-ingest：markdown 知识档 → 实体（幂等）

# 4. 一轮代谢（meko 编排双铰链螺旋推进）/ One metabolism round (meko-orchestrated helix)
node src/cli.js orchestrate --rounds 1

# 5. 检索（三轴判定入口 + 命中写回 last_access）/ Retrieve (tri-axis gate + last_access write-back)
node src/cli.js query "<问题>"                   # 或经 aing query（见 CLI 一览）

# 6. 意识层仪表台（读端纯读，不扰表）/ Consciousness dashboard (read-only, never disturbs tables)
node src/cli.js memo                             # 加 --json 出机器可读

# 7. 验收门禁（无 ALL GREEN 不宣布完成）/ Deploy gate (no ALL GREEN, not done)
node verify-deploy.js                            # 33 项
npm test                                         # 181 档全量测试
```

> **写面身份闸 / Write identity gate**：写入口（`ingest` / `POST /entities` / 控制面写端）默认**拒所有 actor**（deny-by-default）。
> 要写入先配 `AING_ALLOWED_ACTORS`（逗号分隔），例：`AING_ALLOWED_ACTORS=hana,hakimi`。不配则拒写；不烧死任何个人代号。
> *The write surface (ingest / POST / control-plane writes) denies every actor by default. Set `AING_ALLOWED_ACTORS` (comma-separated) to allow specific actors; nothing is hardcoded.*

> **全局 CLI / Global CLI**：`npm install -g .` 后可用 `aing <cmd>`（`bin` 已登记 `aing → src/cli.js`）。
> *After `npm install -g .` the `aing <cmd>` binary is available (`bin` maps `aing → src/cli.js`).*

### 检索口径（换后端前必读）/ Retrieval Caliber (read before switching backends)

- **缺省已是语义级 / Semantic by default**（SPEC-5.9）：缺省后端 `onnx-e5-small`（384 维本地 ONNX，E5 前缀口径，模型约 118MB，首载约 1.5s）。真库副本 24 条真问题（含粤语口语）由 owner 逐条判，24/24 判语义好。模型未注册时不静默：回退 `hash-64w2` 并带 `fallback` 标记与告警。/ Default backend is local 384-dim ONNX E5; falls back to `hash-64w2` with a `fallback` marker + warning if the model isn't registered.
- **字面后端保留为对照与回退 / Literal backend kept as control & fallback**：`hash-64w2`（64 维确定性哈希，零模型依赖；t2s 简繁归一）与旧口径 `hash-64` 仍可切（`AING_VECTOR_BACKEND=hash-64w2` 或 `opts.backend`），换后跑 `node src/cli.js reindex` 全量重建。/ `hash-64w2` (64-dim deterministic hash, zero model deps) and legacy `hash-64` remain switchable; run `reindex` after switching.
- **实测差距（冻结集 v2 80 题）/ Measured gap (frozen set, 80 queries)**：R@10 字面 86.9% vs 语义 99.0%，nDCG@10 74.1% vs 90.4%，正负名次差 86.3% vs 97.5%；代价是模型体积与原生依赖。/ Literal vs semantic: R@10 86.9% vs 99.0%, nDCG@10 74.1% vs 90.4%.
- **不同后端的向量永不互比 / Vectors never cross-compare**：建向量记 `model` + `dim`，检索只比对同 `model` 同 `dim` 的行。/ Each vector stores `model`+`dim`; retrieval only compares same-model same-dim rows.
- **仪表台可见 / Visible on the dashboard**：`memo` 系统一行显示「向量 `<后端>` `<覆盖率>`%」，并在未覆盖/旧后端残留/开关泄漏/后端名打错时给固定 code 告警。/ `memo` shows the active backend + coverage, with fixed-code warnings for low coverage / stale rows / env override / backend fallback.
- **测完必须自己复核 / Verify on your own corpus**：评测集只证明「在评测集上谁强」。换之前拿自己 20–50 条真实实体名与真会问的查询手判一轮，决定权在你的语料，不在测试集排名。见 [EMBEDDING-BENCH](./docs/Engineering/EMBEDDING-BENCH-2026-11-16.md)。/ Benchmarks only rank the benchmark; hand-check 20–50 of your own real entities before switching.

---

## 🖥️ CLI 一览 / CLI Reference

统一入口 `node src/cli.js <cmd>`（或全局 `aing <cmd>`）。/ Single entry `node src/cli.js <cmd>` (or global `aing <cmd>`).

| 命令 / Command | 用途 / Purpose |
|---|---|
| `memo [--json] [--limit N]` | 备忘录仪表台：用户待办 / 健康判定 / 派单建议 / 出场三块一次看全 / memo dashboard |
| `predict --message "..."` | 预案器：给一条消息预测该走哪条处置路径 / predictor |
| `dispatch-card --file <ticket.json>` | 外派派单卡落地 / land an outward dispatch card |
| `ingest --payload <json>` | 单条入库（role 归一 + 安全闸）/ single ingest |
| `compile --dir <path>` | batch-ingest：markdown 知识档 → 实体（幂等，SPEC-3.14A）/ batch compile (idempotent) |
| `ingest-search --query "..." --source <dir>` | search-and-ingest（SPEC-3.14B）/ search-and-ingest |
| `api --port 3000 [--host 127.0.0.1]` | HTTP entity REST 服务（SPEC-3.14C）/ HTTP entity REST server |
| `orchestrate [--rounds N] [--self-optimize]` | meko 编排一轮/多轮代谢 / run one or more meko rounds |
| `access --ids a,b [--source cli]` | 访问事件写回（喂 last_access）/ access-event write-back |
| `self-optimize [--cycle <id>] [--no-rescore]` | 自优化闭环（误差工单 → 场域动作）/ self-optimize loop |
| `board [--limit N] [--json]` | 回单外接屏（只读，SPEC-6.16）/ ticket board (read-only) |
| `reindex [--db <path>]` | 换后端后全量重建向量 / full vector rebuild after backend switch |

---

## 🌐 HTTP API（可选）/ HTTP API (optional)

零依赖 HTTP 服务，`node src/cli.js api --port 3000` 启动。/ Zero-dep HTTP server, start with `node src/cli.js api --port 3000`.

| 方法 / Method | 端点 / Endpoint | 用途 / Purpose |
|---|---|---|
| `GET` | `/health` | 健康检查（公开）/ health check (public) |
| `GET` | `/entities` | 实体列表 / entity list |
| `GET` | `/entities/:id` | 实体详情 + 最新 KESPI / entity detail + latest KESPI |
| `POST` | `/entities` | 创建实体 → 一律 `pending-distillation` / confidence 0（身份闸兜底；`active` 只由 `distill.js` 兑付）/ create entity (always pending; only distill promotes to active) |

> **身份闸 / Identity gate**：客户端自报 `status`/`confidence` 一律忽略——`active` 是蒸馏的特权，不是写入的默认。
> `POST`（及一切写面）默认拒所有 actor；先设 `AING_ALLOWED_ACTORS`（逗号分隔）才放行指定身份。
> *Client-supplied `status`/`confidence` are ignored — `active` is distill's privilege, never a write default. `POST` (and every write path) denies all actors by default; set `AING_ALLOWED_ACTORS` to allow specific ones.*

---

## 📜 脚本一览 / Scripts

### 核心流水线 / Core Pipeline

| 脚本 | 用途 |
|---|---|
| `init-kb.js` / `src/bootstrap.js` | 知识库初始化（首装一步）/ one-step init |
| `src/meko-orchestrator.js` | **meko 编排全流程**（双铰链螺旋推进，关键步熔断）/ meko-orchestrated full pipeline |
| `src/compile.js` | 编译：raw → 实体（`kespi_status: pending` 待首评翻转）/ compile raw → entities |
| `src/import.js` | 双链写入 / double-strand write |
| `src/distill.js` | 蒸馏兑付（`active` 的唯一写位）/ distill (sole writer of `active`) |
| `src/link-sync.js` · `tri-axis-link.js` | 双链边一致 + 三轴建边 / strand edge consistency + tri-axis linking |
| `src/vector.js` | 向量索引（默认 384 维语义，缺失自动回退 64 维哈希）/ vector index |
| `src/sprout.js` | 发芽引擎 / sprout engine |
| `src/pollinate.js` | 授粉（跨域融合）/ pollination |
| `src/compress.js` | 换锚压缩 / re-anchor compression |
| `src/kespi.js` | KESPI 八维评估 / 8-dim KESPI scoring |
| `src/prune.js` | 剪枝（三条件 AND 有界淘汰线 + `invalid_at` 逻辑退役）/ prune |

### 决策与意识层 / Decision & Consciousness

| 脚本 | 用途 |
|---|---|
| `src/consciousness-kernel.js` | 意识核（coordination-only 硬约束）/ consciousness kernel |
| `src/neural.js` | 意识层**写端** CLI（喂事件 / 抑制 / 评估 / 归档）/ consciousness write-side CLI |
| `src/memo.js` | 备忘录仪表台（读端纯读）/ memo dashboard (read-only) |
| `src/predict.js` | 预案器 / predictor |
| `src/self-optimize.js` | 自优化闭环 / self-optimize loop |
| `src/field-promote.js` · `field-engine.js` | 场域提升 / field promotion |
| `src/conservation.js` · `hub-trim.js` | 守恒闸 + 存量 hub 裁剪 / conservation gate + hub trim |

### 检索与入库 / Retrieval & Ingest

| 脚本 | 用途 |
|---|---|
| `src/retrieval.js` · `semantic-rank.js` | 三轴判定入口 + 语义排序 / tri-axis entry + semantic ranking |
| `src/entity-api.js` | HTTP entity REST（见 API 表）/ HTTP entity REST |
| `src/session-ingest.js` · `auto-ingest.js` | 会话入库（链路起点，听指纹去重）/ session ingest |
| `src/search-ingest.js` | search-and-ingest / 检索即入库 |

### 工具面 / Tooling

| 脚本 | 用途 |
|---|---|
| `verify-deploy.js` | **33 项部署门禁**（无 ALL GREEN 不宣布完成）/ 33-item deploy gate |
| `test/run-all.js` | 全量测试（179 档）/ full test suite |
| `test/count-guard.js` | test count guard（只加不减）/ test count guard |
| `tools/arch-lint.js` | 架构门禁（组件不越层、不加 CLI main）/ architecture lint |
| `tools/bench-retrieval.js` · `semantic-bench.js` | 检索质量 KPI（只读，独立于门禁）/ retrieval KPI (read-only) |
| `tools/db-integrity.js` | 库完整性核验 / DB integrity check |
| `tools/greenzone-probe.js` · `kd-cited-reachability-probe.js` | 场域/建边可达性探针（隔离 yard，不扰真库）/ field & edge-reachability probes |

---

## 🗄️ 数据库 / Database

- **引擎 / Engine**：`sql.js`（SQLite 编译到 WASM，零原生编译）；库活读走内建 `node:sqlite`（需 Node ≥ 22.5，老版自动降级静态默认值）。/ `sql.js` (SQLite→WASM, zero native build); live reads use built-in `node:sqlite`.
- **建表 / Schema**：三表 DDL 见 [SPEC-0.1](./spec/SPEC-0.1-数据模型.md)，三轴列内建。/ Three-table DDL with tri-axis columns built in.
- **WAL**：写放大与并发读经过实测（无丢行、busy_timeout 必修、写者饿死已治）。/ WAL concurrency实测-verified (no lost rows, busy_timeout required, writer starvation addressed).
- **备份 / Backup**：库文件在 `.gitignore` 排除区（`*.db`/`data/*`），克隆后自建；`tools/db-integrity.js` 核完整性。/ DB files are gitignored — build your own after clone; check integrity with `tools/db-integrity.js`.
- **开库不写盘 / Open-without-persist**：探针/只读路径一律 `openReadOnly` 或隔离 yard，绝不污染真库。/ Read-only paths open without persist or in an isolated yard — never pollute the real DB.
- **旧库迁移 / Legacy migration**：`node tools/migrate-run.js`，默认源 = 本仓上一级嘅 `aing/knowledge.db`（可用 `--source` 改）。开库容量闸默认 **10 MB**，真旧库常超；一次性受控迁移加 `--allow-cap` 放行（或 env `AING_DB_CAP_ALLOW=1` 作后门），报告 JSON 会写 `capRelaxed: true` 并在输出打「本次放行了容量闸」。**用完即撤，唔该长开**。/ Legacy migration via `tools/migrate-run.js` (default source: sibling `aing/knowledge.db`, override with `--source`). Open-cap gate defaults to **10 MB**; pass `--allow-cap` for one-off migrations of larger legacy DBs (report records `capRelaxed: true`). Disable after use.

---

## 🗺️ 文档地图 / Docs Map

> 想了解什么就直接翻对应那一篇；机制口径以 `spec/` 为 source of truth。
> *Read what you need; mechanism ground truth lives in `spec/`.*

| 想了解 / To learn | 该读 / Read |
|---|---|
| 数据模型与库表字段 | [SPEC-0.1 数据模型](./spec/SPEC-0.1-数据模型.md) |
| meko 四顶接口 | [SPEC-0.2](./spec/SPEC-0.2-meko四顶接口.md) |
| 时界调度协议 | [SPEC-0.3 时界调度协议](./spec/SPEC-0.3-时界调度协议.md) |
| 三轴判定 | [SPEC-0.4 三轴判定](./spec/SPEC-0.4-三轴判定.md) |
| 内外蜂群接线与部署 | [SPEC-0.5](./spec/SPEC-0.5-内外蜂群接线与部署重设.md) |
| 入库主线 / CLI / API 接线 | [SPEC-3.14 CLI 入口接线](./spec/SPEC-3.14-CLI入口接线.md) · [SPEC-3.5 入库主线](./spec/SPEC-3.5-入库主线.md) |
| 意识层闭环 / 备忘录 | [SPEC-3.1](./spec/SPEC-3.1-意识层闭环.md) · [SPEC-3.11 memo 用户面](./spec/SPEC-3.11-memo用户面.md) |
| 向量后端可插拔与评测口径 | [SPEC-5.1](./spec/SPEC-5.1-向量后端可插拔与测试口径.md) · [SPEC-5.9 默认语义](./spec/SPEC-5.9-默认后端切换为语义.md) |
| 部署接线（从开箱到 ALL GREEN）| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) |
| agent 出场纪律 | [AGENT.md](./AGENT.md) |
| 规格 index | [spec/README.md](./spec/README.md) |

### 🔧 工程文档 / Engineering
- [EMBEDDING-BENCH 向量后端评测](./docs/Engineering/EMBEDDING-BENCH-2026-11-16.md)
- [KESPI-CALIBRATE 阈值标定](./docs/Engineering/KESPI-CALIBRATE-2026-11-21.md)
- [ENGINE-LOAD 引擎负载实测](./docs/Engineering/ENGINE-LOAD-2026-11-21.md)
- [TECHFLOW 技术流](./docs/Engineering/TECHFLOW-2026-11-21.md)

---

## 🗺️ 路线图 / Roadmap

- [x] **三表 schema + 三轴内建** — entities / links / meko_cycles，建表即含强度与时效列 / three tables, tri-axis columns built in
- [x] **DNA 双铰链 + meko 中间质四顶** — 氢键/组蛋白/时界/互校 / double-helix + meko's four duties
- [x] **三轴加载判定** — 强度 ≥ 7 × 类型配对 × 时效双轨 / tri-axis load gate
- [x] **时界确定性调度** — SLB/SLE 双模 + G 节点 + 时延上界 / timebound scheduling
- [x] **意识层闭环 + 备忘录仪表台** — 一读一取，九通道事件 / consciousness loop + memo
- [x] **语义检索缺省 + 可插拔后端** — onnx-e5-small 缺省，hash 回退 / semantic default + pluggable backends
- [x] **入库三入口 + HTTP entity REST** — compile / search-and-ingest / api（SPEC-3.14）/ three ingest entries + REST
- [x] **双层蜂群 + 内蜂群自洽部署** — 不桥接铁律 / two-layer swarm, unbridged
- [ ] **查重复用另立 spec** — fingerprint 归并已落地单点，复用面待独立规格 / dedup-reuse spec (fingerprint merge landed, reuse face pending)

---

## 🔬 验证证据 / Verification Evidence

> 每个可验证声称都附带可复现的验收脚本。/ Every testable claim carries a reproducible check.

| 面 / Surface | 命令 / Command | 现状 / Status |
|---|---|---|
| 部署门禁 / Deploy gate | `node verify-deploy.js` | ✅ **33 项 ALL GREEN** |
| 全量测试 / Full tests | `npm test`（`test/run-all.js`）| ✅ **179 档 / 1194 断言 ALL GREEN** |
| test count guard | `npm run test:guard` | ✅ 只加不减 / add-only |
| 架构门禁 / Arch lint | `node tools/arch-lint.js` | ✅ 组件不越层 / no layer violations |
| 文档 9 段 / Doc tags | `node tools/doc-tags-lint.js --dir .` | ✅ 156 档全绿 |
| 检索 KPI / Retrieval KPI | `node tools/bench-retrieval.js` | 只读，独立于门禁 / read-only, gate-independent |

> **冻结集实测（80 题）/ Frozen-set measured (80 queries)**：语义 R@10 99.0% / nDCG@10 90.4%；字面 R@10 86.9% / nDCG@10 74.1%。数字属该冻结集口径，非无条件事实。
> *Semantic R@10 99.0% / nDCG@10 90.4% vs literal 86.9% / 74.1% on the frozen set — caliber-dependent, not unconditional facts.*

---

## 🙏 致谢 / Acknowledgments

> 下面**逐块标明账目性质**：真实依赖 ／ 理念同构——不混记，也不构成背书。
> *Each block states what kind of credit it is: actually-used dependency / isomorphic citation.*

### 真实使用的底座依赖 / Foundational Dependencies Actually Used

- **`sql.js`**（SQLite 编译到 WebAssembly，MIT）— 交叉时态数据层实际跑的引擎，换来零原生编译。/ SQLite→WASM, the engine actually running the bi-temporal data layer.
- **`@xenova/transformers`**（Apache 2.0）— 语义检索的上层壳；其下的 ONNX Runtime 是真正的推理执行者。/ Semantic-retrieval shell; ONNX Runtime beneath it does the actual inference.
- **模型 / Model** — `Xenova/paraphrase-multilingual-MiniLM-L12-v2`（384 维多语含中文，约 118MB；许可证以上游仓库为准）。/ 384-dim multilingual model (license per upstream repo).
- **Node.js ≥ 18 + Git** — 除一条 `npm install` 之外的全部运行时要求。/ All the runtime you need beyond one `npm install`.

### 工程实践 · 理念同构 / Engineering Practice (isomorphic, not a code dependency)

- **Harness Engineering** — 「讲不清 harness，模型就成了你的架构」：本包「门禁即架构」的立场与此相合。/ "If you can't articulate the harness, the model becomes your architecture" — aligns with this package's gates-as-architecture stance.
- 以上为**理念同构**，本包不含其任何代码。/ Isomorphic in spirit only; no code from these sources is included.

> 灵感属于所有人，实现属于此刻。
> *If I have seen further, it is by standing on the shoulders of giants.*

---

## 许可 / License

本项目当前以 **UNLICENSED**（私有，保留所有权利）发布；`package.json` 的 `license` 字段为准。第三方组件及其许可证：`sql.js`（MIT）、`@xenova/transformers`（Apache 2.0）。

*This project is currently released as UNLICENSED (private, all rights reserved) — see the `license` field in `package.json`. Third-party components: `sql.js` (MIT), `@xenova/transformers` (Apache 2.0).*
