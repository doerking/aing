# Architecture / 架构

> aing is a collection of standalone Node.js scripts (CommonJS `.js`), not a TypeScript project. No build step. But it **does** ship a `package.json` with npm scripts (`src/`, `tools/`, `verify-deploy.js` at root) — the older "no src/ directory, no package.json" note was a stale snapshot of a bare copy.
> 2026-11-06 refresh: rewritten from the actual current tree (`src/` 79 modules) and the local config/schema; every claim below is traceable to a local file. Old claims that no longer hold are corrected, not just appended.

## 1. Directory Layout

All runtime code lives in `src/` (79 CommonJS modules, no build). Root holds the config template, schema, gates, and `tools/` for repo-side utilities.

```
aing/
├── src/                          # 79 CommonJS modules (the real "engine" lives here, not in scripts/)
│   ├── compile.js                # Order Brain: raw/*.md → wiki/entities/*.md
│   ├── import-from-wiki.js       # wiki/ → SQLite (import step)
│   ├── distill.js                # distiller: pending-distillation → active (own D4 atomic lock)
│   ├── auto-link.js              # entity link discovery (link step)
│   ├── sync-links-to-fs.js       # dual-brain sync: DB links → wiki/links/ (link-sync step)
│   ├── index-vectors.js          # semantic 384-dim reindex (vector step)
│   ├── semantic-vector.js        # local 384-dim model loader (optional upgrade piece)
│   ├── vector-search.js          # dual-mode retriever: 384-dim semantic / 64-dim char-ngram hash
│   ├── sprout.js                 # Sprouting: keyword similarity + tag, link suggestions
│   ├── pollinate.js              # Cross-domain pollination (Jaccard + tag overlap)
│   ├── compress.js               # Mustard seed compression (text slicing → mustard-seeds/)
│   ├── recycle-seeds.js          # seed recycle (回炉线, idempotent, no guardian driver)
│   ├── prune.js                  # Pruning (90-day inactive, KESPI floor, broken-link cleanup)
│   ├── kespi-check.js            # KESPI 8-dim first evaluator (flips kespi_status pending→computed)
│   ├── kespi-check-fixed.js      # repaired 8-dim variant (KD/KB direction reversed, KQ link-derived); intentionally kept, not the default
│   ├── kespi-enhance.js          # KESPI enhancement (5-dim metadata)
│   ├── fix-kespi.js / recalc-kespi.js / show-kespi.js  # KESPI repair + read helpers
│   ├── shared-spine.js           # compile validation audit tool (minKespi, audit.jsonl) — spine-check, NOT a metabolism step
│   ├── run-metabolism.js        # orchestrator (shells out to the 11 step scripts)
│   ├── metabolism-lock.js / metabolism-log.js / metabolism-panel.js  # cross-process lock / log / panel
│   ├── scheduler.js             # resident metabolism scheduler (timer + raw/ mtime poll, native)
│   ├── knowledge-store.js       # sql.js in-memory SQLite store (8 tables + indexes)
│   ├── trajectory-store.js      # task_trajectories store (W1: lineage → trajectories)
│   ├── growth-loop.js           # episode/decay (FadeMem-style weights)
│   ├── growth-director.js       # growth decision box (full/scheduled → delegates to run-metabolism)
│   ├── growth-docs.js           # growth-doc bridge (writes raw/growth/ docs)
│   ├── self-growth.js           # self-growth core
│   ├── gap-detector.js          # topology gap scan (panel aggregates it)
│   ├── insight-extractor.js     # insight extraction
│   ├── interchange-router.js    # cross-module routing (approval-aware)
│   ├── feedback-loop.js         # feedback loop
│   ├── error-handler.js         # error code action table
│   ├── sensory-ends.js          # sensory layer (file polling, 5s, NOT fs.watch)
│   ├── neural-guide-chain.js    # guide chain (attention scoring; B1: live DB read via node:sqlite)
│   ├── guide-chain-swarm.js     # 3-agent vote guide chain
│   ├── consciousness-layer.js   # consciousness output layer
│   ├── consciousness-kernel.js  # kernel (state machine, inhibition, dedupe, archiving)
│   ├── consciousness-event.js   # event model
│   ├── consciousness-controller.js  # verification / approval-request / record (lineage)
│   ├── approvals-pending.js     # W2 approval-chain persistence (data/consciousness/approvals-pending.json)
│   ├── config-runtime.js        # single source for consciousness/convergence/guideChain tuning (Discipline 5)
│   ├── config-hotreload.js      # on-demand config hot-reload (in-library, not in default pipeline)
│   ├── bootstrap.js / start-all.js / boot-sequence.js  # boot / host orchestration
│   ├── db-live-reader.js        # node:sqlite live read (≥22.5; degrades on 18/20)
│   ├── db-time.js               # SQLite datetime('now') space-UTC parse helper
│   ├── neural-architecture.js   # consciousness neural 3-layer controller
│   ├── neural.js                # consciousness write-side CLI (status/inhibit/event/assess/deliberate/verify/record/approve/archive)
│   ├── tri-path-orchestrator.js # tri-path with circuit breaker
│   ├── metacognition-layer.js   # metacognition 3-layer (M4: measured self-model, not hard-coded)
│   ├── memo.js                  # operations dashboard (CLI + shared with HTTP briefing; C12/C16 pinned)
│   ├── memo-call.js / memo-trigger.js  # memo quick-call / keyword trigger
│   ├── auto-ingest.js           # MAIN session-ingest entry (WAL, scrub, dedup; 洞②收口 2026-11-06: 客户端自报 tags 不进 frontmatter.tags 列，只落 Agent 提议段文本留痕)
│   ├── ingest-scrub.js          # strip collection trace (detail-only ingest, C10h)
│   ├── batch-ingest.js          # parallel ingest entry (reuses auto-ingest.SessionStore)
│   ├── search-and-ingest.js     # search→ingest bridge (host side)
│   ├── api-server.js            # native http REST surface (NO Express); 身份闸(洞①②收口 2026-11-06): POST/PATCH entity 一律 pending-distillation / confidence 0; PATCH 403 拒抬 active; tags 经 sanitizeTags(≤100字/≤20个)
│   ├── agent-dashboard.js       # host dashboard (native http, separate from api-server)
│   ├── hermes-aing-adapter.js / agnes-aing-adapter.js  # host adapters
│   ├── query.js                 # query CLI (fusion + rerank)
│   ├── ner-extractor.js         # optional external multilingual NER (@xenova bert NER)
│   ├── link-filename.js / setup-db.js / sql-migrate.js  # link naming / db setup / migration
│   ├── seed-demo.js / unseed-demo.js / sync-opt.js      # demo seeding / yard sync
│   ├── init-knowledge-base.js   # init (AING_AUTOCOMMIT opt-in only)
│   ├── trigger-log.js           # p9 mustard trigger JSONL (logs/metabolism-trigger-log.jsonl)
│   └── ... (test/debug)
├── tools/                        # repo-side utilities (self-test, verify-sibling-roots, gate-counts, eval-retrieval, gen-greenlist, calibrate-fusion, negatives/)
├── verify-deploy.js             # acceptance gates C0–C20 (exit 0 = ALL GREEN)
├── growth.config.example.js     # config template (C10d isomorphic mirror of src/growth.config.js)
├── schema.sql                   # canonical SQLite schema (mirror of knowledge-store._initTables)
├── package.json                 # npm scripts + deps (@xenova/transformers, sql.js, js-yaml, sharp)
├── raw/                        # Input: raw Markdown (inbox/ from ingest)
├── wiki/
│   ├── entities/               # Compiled entity files (*.md)
│   ├── links/                  # Link files (*.md)
│   ├── type-index/             # Type index files (*.md)
│   └── index.md                # Main wiki index
├── mustard-seeds/compressed/   # Compressed mustard seed index.json
├── pruned/archive/             # Pruned entity archive
├── models/                     # local semantic model (Xenova/...MiniLM-L12-v2, ~113MB, 384-dim)
├── knowledge.db                # sql.js SQLite database (primary)
├── data/                       # panel.json, consciousness/, metacognition/, component-registry.json, WAL
├── logs/                       # decision-lineage.jsonl, metabolism-trigger-log.jsonl, tri-path/, guide-chain/, sensory/
└── assets/skills/              # bundled skill docs (swarm + operator), not host copies
```

## 2. Storage Layer

Dual storage:

| Layer | Mechanism | Used By |
|---|---|---|
| **fs-based** | Markdown files in `wiki/entities/`, `wiki/links/`, `mustard-seeds/`, `pruned/`, `raw/` | compile, sprout, pollinate, compress, prune, shared-spine, index-vectors, metacognition, neural-guide-chain, sensory-ends |
| **sql.js** | In-memory SQLite via `require('sql.js')`, persisted to `knowledge.db` | knowledge-store.js, self-growth.js, kespi-check.js, kespi-enhance.js, vector-search.js, trajectory-store.js, growth-loop.js |
| **node:sqlite** | `require('node:sqlite')` (Node ≥22.5) live read, degrades on 18/20 | db-live-reader.js (guide-chain B1 live read) |

> **No better-sqlite3.** `sql-migrate.js` is a standalone migration utility (schema_migrations).
> **No chokidar, no Express** (HTTP is native `require('http')` in api-server.js / agent-dashboard.js). **No sqlite-vec, no fts5.**

**Canonical tables** (`knowledge-store._initTables()` + `schema.sql`): `entities`, `links`, `type_index`, `entity_metadata`, `entity_embeddings`, `error_log`, `kespi_history`, `metabolism_log`. Extended elsewhere: `task_trajectories` (trajectory-store), `system_log` (setup-db), `schema_migrations` (sql-migrate). `entities` migrates add-on columns idempotently: `distill_meta`, `consistency`.

## 3. KESPI Scoring System

A **dual KESPI system**. All 8 dims follow "higher is better"; `KD`/`KB` were direction-reversed in the v2 fix (old docs still show the pre-fix inverted formulas — corrected here).

### 8-Dimensional (`kespi-check.js`, weights + thresholds from `growth.config.js`)

Reads entities from `knowledge-store.js`, computes 8-dim via `_calcKQ`~`_calcKB()`, appends to `kespi_history.dimension_scores` (JSON), updates `entity_metadata.kespi_score`, flips `kespi_status: pending → computed`.

| Code | Name | Weight | Calculation (current, higher=better) |
|---|---|---|---|
| KQ | Quality | 0.15 | `confidence × 0.6 + consistency × 0.4` (P1 #003 adds the `consistency` column) |
| KG | Growth | 0.12 | stepwise age from `updated_at` (UTC-safe parseDbTime): ≤7d=1.0, ≤30d=0.8, ≤90d=0.6, ≤180d=0.4, else 0.2 |
| KA | Assetization | 0.13 | tags avg value/9×0.3 (9-segment numeric, bare tag=5) + source_file 0.3 + metadata 0.2 + content>50 0.2 |
| KM | Metabolism | 0.12 | stepwise age from `last_checked_at`: ≤24h=1.0, ≤72h=0.8, ≤168h=0.6, ≤336h=0.4, else 0.2 |
| KD | Density | 0.13 | link completeness (FIXED, higher=better): ≥5=1.0, 3–4=0.7, 1–2=0.4, 0/orphan=0.0 |
| KC | Retrieval | 0.10 | embedding presence: present=1.0, absent=0.0 |
| KR | Response | 0.15 | content length stepwise: ≥1000=1.0, ≥500=0.8, ≥200=0.6, ≥50=0.4, else 0.2 |
| KB | Block | 0.10 | pending error count (FIXED, higher=better): 0=1.0, 1=0.7, 2=0.4, ≥3=0.0 |

Thresholds (all in `growth.config.js`, single source): **greenLight=0.80, yellowLight=0.65, redLight=0.50**. Per-dimension yellow/red floors + `action` codes live in `config.kespi.dimensions`.

**Storage**: `kespi_history` table — each check appends a row with `dimension_scores` (JSON). Latest row per entity = current 8-dim scores.

> ⚠️ `compile.js` does **not** fabricate KESPI placeholders — it writes `kespi_status: pending` (comment: "等待 kespi-check.js 首次真实评估") and the real scores come from the kespi step. No `Math.random()` in compile (the old "random placeholder 0.7–1.0" note is obsolete).

### 5-Dimensional metadata (`kespi-enhance.js` + `entity_metadata`)

`originality, relevance, consistency, provability, utility` — a second axis in `entity_metadata` (see `schema.sql` comment "5-dim: originality/relevance/consistency/provability/utility"), distinct from the 8-dim KESPI.

## 4. Consciousness Neural Architecture

Three layers implemented in code, plus a controller/kernel layer and a W2 approval persistence layer:

```
Sensory Endings (sensory-ends.js)
  → raw/ mtime polling (5s, NOT fs.watch; Windows fs.watch is unreliable)
  → independent per-ending signals, sensing only, no decision

Neural Guide Chain (neural-guide-chain.js)
  → attention = vitality×0.3 + recency×0.25 + connectionDensity×0.2 + anomaly×0.15 + userInterest×0.1
  → B1 (2026-11-05): sensory input reads live DB via node:sqlite (db-live-reader); wiki/links/index.md demoted to human projection
  → W7 (2026-11-03): userInterests + userInterestDefault now single-sourced from config.guideChain (no hard-coded words)

Consciousness Layer (consciousness-layer.js)
  → briefing: hotspots, alerts, recommendations
```

Supporting pieces: `consciousness-kernel.js` (state machine idle/integrating/focused/aroused/stagnant, inhibition, dedupe, bounded observed-event archiving — the only writer of `stagnationCount` is `kernel.recordCycleResult()`), `consciousness-event.js`, `consciousness-controller.js` (verify/record/assess/deliberate + approval-request readiness), `approvals-pending.js` (W2, independent-approval chain), and the write-side CLI `neural.js` / read-side `memo.js` (the operations dashboard).

## 5. Metacognition Layer

`metacognition-layer.js` (a class; `require(...).selfCheck()` is NOT the API — call the CLI `node src/metacognition-layer.js self-check`). M4: self-model parameters are **measured from the real DB** (avg KESPI → confidence, active/total entities → coverage, metabolism_log failures → errorRate, last-7d average duration → responseTime), not hard-coded defaults; falls back to defaults only when a table is absent.

## 6. Tri-Path Orchestrator

`tri-path-orchestrator.js` — three paths + circuit breaker. **Not mock** (the old "runPath returns `['候选 A','候选 B','候选 C']`" note is outdated): `runPath()` now runs real reads —
- **EXPLORE** — `vectorSearch.semanticSearch(query,8)`, diversity = type distribution of candidates
- **VERIFY** — dual corroboration: best link confidence ≥ `verifyLink` **or** KESPI score ≥ `kespiPass` (via-link / via-kespi)
- **OPTIMIZE** — real `kespi.calculateEntity` over active entities, mean overall; `improvement: 0` in shadow phase (a real delta needs before/after comparison)

Adjudication (队正裁决) takes each path's own metric (explore=diversity, verify=confidence, optimize=finalScore), independent pass thresholds from `config.triPath`, success when ≥2 paths agree. Circuit breaker (from `config.triPath.circuitBreaker`, single source): **failureThreshold=5, resetTimeout=60000ms, halfOpenMax=3**; state persisted to `data/tri-path-state.json`.

## 7. Metabolism Pipeline

`run-metabolism.js` orchestrates by **shelling out to individual scripts** via `execSync`. Full mode = **11 steps** (the old "shared-spine → compile → sprout → pollinate → compress → kespi → prune" 7-step chain is wrong):

```
compile → import → distill → link → link-sync → vector → sprout → pollinate → compress → kespi → prune
```

- **Critical steps** (failure aborts the chain, exit 1): `compile, import, vector, kespi` (`CRITICAL_STEPS`).
- `shared-spine` is **not** a chain step — it is the separate `spine:check` audit tool.
- `--force` continues past non-critical failures only (does NOT propagate to child steps; `compile --force` and `prune --force` have their own meanings — see AGENTS Pitfall 6).
- Cross-process atomic lock (`metabolism-lock.js`), decision-lineage logging (`logs/metabolism-decision-lineage.jsonl`, ≥12 records), consciousness tail-write via `kernel.recordCycleResult()` (C14), W1 trajectory auto-feed (lineage → `task_trajectories`), and `AING_NO_AUTOCOMMIT` guard (metabolism never commits on the user's behalf, C13).
- **No SQL-based pipeline**; each step is a separate Node.js process.

## 8. Vector Search

`vector-search.js` is **dual-mode**, not hash-only:
- Default **384-dim semantic** via `semantic-vector.js` (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, quantized ~113MB, mean-pooled + L2-normalized, fully local via `setup-vectors.ps1`).
- Falls back to **64-dim char-n-gram hash** when the model is absent; `getStatus()` reports `model: 'char-ngram-hash-64'` in that case.
- No 768-dim all-MiniLM-L6-v2 in this package (that was a mislabel; it is 384-dim MiniLM-L12, multilingual including Chinese).

## 9. Compression

`compress.js` uses **text slicing**, not LLM/semantic compression:
- `generateSummary()` = `content.slice(0, 200).trim()`
- `inactiveDaysThreshold = 30`, `minContentLength = 50`, `maxCompressedSize = 1000`
- Seeds land in `mustard-seeds/compressed/index.json` (merge + dedupe by id); recycle line `recycle-seeds.js` is idempotent (each seed recycled at most once, no guardian driver).

## 10. Pruning

`prune.js`:
- **`inactiveDaysThreshold = 90`** (NOT 7), `minKespiScore = 0.5`, `move_to_archive = true` (archive → `pruned/archive/`).
- Default dry-run preview; `--force` (or `config.prune.autoForce`) actually executes archive deletion.
- Broken-link cleanup extracts linked entity IDs — the regex must match the real ID shape (Chinese IDs included; see AGENTS Pitfall 22 J), and DB references are cleaned to keep C10e zero-dangling.

## 11. Language Support

`sprout.js` and `pollinate.js` keyword filters **keep** CJK: a word passes if `w.length > 2 || /[\u4e00-\u9fff]/.test(w)` and it is not in a small English stop-list (`the, a, an, is, ...`). The 384-dim semantic model is **multilingual (includes Chinese)**, so semantic retrieval is not English-only. The old "No Chinese/Japanese/Korean support" note is obsolete; keyword extraction still leans on an English stop-list but does not drop Chinese.

## 12. What Does NOT Exist

Still absent in the current code (verified against `src/` and `package.json`):
- chokidar / any fs.watch-based watcher
- Express (HTTP is native `require('http')`)
- trace_id system
- multi-model AI routing
- multi-agent data chain
- `IGrowthEngine` interface
- Shared Graph API
- fts5 full-text search
- sqlite-vec extension
- LLM-based compression
- 768-dim vector embeddings
- 7-day pruning threshold
- SQLite `BEFORE` triggers
- these tables: `meta_knowledge_capsule`, `jiezi`, `pollination_log`, `expiry_event`, `kespi_snapshot`

Corrected — the following **do exist** (older "not exist" list items that are now present):
- scheduler/cron → `scheduler.js` (`npm run scheduler`, timer + raw/ poll, no cron lib)
- config hot-reload → `config-hotreload.js` (in-library, on-demand, not in default pipeline)
- trigger log → not a SQLite table, but `trigger-log.js` writes JSONL to `logs/metabolism-trigger-log.jsonl` (p9 mustard triggers)
- `src/` now holds all runtime JS; `package.json` has ~30 npm scripts (`verify`, `scheduler`, `server`, `metabolism`, `memo`, `neural`, `query`, `tripath`, …)

## 13. Security Gates / 安全面（身份铁律 + 标签闸，洞①②收口 2026-11-06）

外来写面（HTTP API + 会话入库）不得把未核验内容直接抬成知识资产身份。本包两道并行闸：

| 洞 | 旧风险（收口前） | 收口后行为（隔离院真跑 8/8 全绿，见 .temp/sec-gates-behavior.js） |
|---|---|---|
| ① 身份闸 | POST /api/entity 默认 status:active + confidence:0.7；PATCH 可翻 active、confidence 任意 — 外来者绕开 distill.js 兑付 | POST 一律落 pending-distillation / confidence:0（客户端自报 status/confidence 忽略）；PATCH status=active → 403，confidence 对外写面关闭；active 唯一写位 = distill.js |
| ② 标签闸 | 客户端自报 distillation.tags 任意字符串直入 frontmatter.tags 列，污染标签检索/建链加权/KA 分 | auto-ingest frontmatter.tags 只收服务端机械抽取的 serverTags；自报 tags 降级为「## Agent 提议（未核验）」段引用行留痕（distill 不算原话）；API entity 写面 tags 经 sanitizeTags（去控制字符 / 每标签≤100字 / 每实体≤20个） |

> 与纪律 4（身份铁律）、纪律 7（标签是加载单位）、门禁 C10g③（自报不抬身份）同源：这三道闸是它们在外来写面上的落地。负向自证走隔离院真跑行为证（SEC-GATES ALL PASS），非静态 grep。
