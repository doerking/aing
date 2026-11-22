---
tags: [aing-v2, spec, cli, 入口, 开库, M3, spec:9, cli:9]
description: M3.14 CLI 入口接线 spec——新增统一开库入口 src/cli.js（与 neural.js 同角色入 arch-lint 白名单），提供 memo / ingest / orchestrate 三子命令；库路径取 AING_DB 或缺省 data/knowledge.db；store 注入下游，组件零直连
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-3.11, SPEC-3.5, SPEC-1.14, SPEC-1.15 §四]
---

# SPEC-3.14 · CLI 入口接线（memo / ingest / orchestrate）

> 现状：memo.js / auto-ingest.js / meko-orchestrator.js 皆系依赖注入组件，命令行入口未接；
> 出场接线（读 memo / 会话入库 / 一轮代谢）缺统一开库层。
> 本 spec 新增 `src/cli.js` 作为 CLI 开库入口（与 `neural.js` 同角色，入 arch-lint C5 白名单），
> 开库后注入调用现有组件；唔改组件本体、唔破坏 C5（组件仍唔直连 store）。

---

## 一、目标

提供 `node src/cli.js <memo|ingest|orchestrate>`：开库（`AING_DB` 或缺省 `data/knowledge.db`）→ 注入 store → 调用 `buildMemo` / `autoIngest` / `MekoOrchestrator`。

## 二、行为（spec 即契约）

### 2.1 子命令
- `memo [--json] [--limit N]`：调 `buildMemo(store, {limit})`；默认人读摘要，`--json` 输出全量
- `ingest --payload <json>`：调 `autoIngest(store, payload)`；`payload.actor` 必须 `hana`
- `orchestrate [--rounds N] [--json]`：`buildDefaultSteps()` 注册进 `MekoOrchestrator` 后 `runCycle`

### 2.2 开库路径优先级
`--db` 参数 > `AING_DB` 环境变量 > 缺省 `<repo-root>/data/knowledge.db`

### 2.3 导出（供测试注入，唔靠 spawn）
`openStore / cmdMemo / cmdIngest / cmdOrchestrate / humanMemo / usage / main`

### 2.4 铁律
- 组件本体唔改：memo / auto-ingest / meko-orchestrator 保持纯库，store 由 cli 注入（C5 守）
- 库路径全用 `__dirname` 相对或入参，唔硬编码盘符（C8 守）
- 唔用 child_process / git 写端（C13 守）

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | memo 冷启动诚实 | 空库 `cmdMemo` → `coldStart=true`、`recent=[]` |
| AC-2 | ingest 真写 + memo 读到 | `cmdIngest(hana)` 后 `cmdMemo` recent 含该会话 |
| AC-3 | ingest 只认 hana | `actor=user` → `identity-rejected` |
| AC-4 | orchestrate 真跑 | 注入最小步 → `ok`、`rounds`、meko_cycles 落 |
| AC-5 | CLI 真跑 | spawn `cli.js memo --json` → exit0、JSON 含会话 |
| AC-6 | C5 白名单 + 本仓绿 | `node tools/arch-lint.js` exit0 |

## 四、Non-Goals

- 不做 query 检索面（`query.js` 另立 spec）
- 不改组件本体
- 不做 HTTP 面

## 五、契约

- `openStore(dbPath?) -> store`（`init` 后返回单例）
- `cmdMemo(dbPath?, opts?) -> memo`
- `cmdIngest(dbPath?, payload) -> receipt`
- `cmdOrchestrate(dbPath?, {rounds, steps, cycleType, budgetMs}) -> runResult`

## 六、依赖

- 上游：SPEC-3.11（memo）、SPEC-3.5（ingest）、SPEC-1.14（orchestrator）、SPEC-1.15 §四（arch-lint C5）
- 影响面：`tools/arch-lint.js` WHITELIST 增 `cli.js`；`AGENT.md` 命令表增 cli 子命令

---

## 修订 A · batch-ingest（2026-11-21）

> 缘起：D14「batch-ingest / search-and-ingest / api-server entity REST / host 杂件」六个未登记小件中，
> batch-ingest 系最高价值。**发现：`src/compile.js` 嘅 `compile()` 本身就系 batch-ingest**——walk 目录
> → frontmatter 解析 → 实体 upsert → `compile_audit` 留痕，幂等（按 id 去重、rowEquals 判 skipped）。
> 按「唔另起平行机制」纪律，**batch-ingest = 暴露 `cli.js compile` 命令**（复用 compile，唔新造）。

### 修订 A 行为

- `node src/cli.js compile --dir <path> [--quality] [--json]`：读 `<path>` 下全部 `.md` 知识档
  （Tolaria frontmatter：tags/type/name/description/status），逐档转实体，幂等，逐档回执。
- 复用 `compile(rawDir, store, {quality})`——唔改 compile 本体，只喺 cli.js 加 `cmdCompile` 接线。
- 满足 D14「batch-ingest」项；`.json` 档、search-and-ingest、api entity REST 另立（见 修订 B 待议）。
- 幂等：同 id 重跑 → `skipped`（rowEquals）；内容变 → `updated`；唔重插、唔造 duplicate。

### 修订 A 契约

- `cmdCompile(dbPath?, {dir, quality}) -> {scanned, created, updated, skipped, rejected, tagsDropped, auditId}`
- 文件读取只喺 cli 层（SPEC-3.15）；compile 本体保持纯库。

---

## 修订 B · search-and-ingest（2026-11-21）

> 缘起：D14 第 2 项。语义：query 拆词（len>=2）评分源档（name+type+tags+content 命中占比），
> 选 top-N ≥ threshold，经 `compile(source, store, {files})` 入库——**复用 compile 管线**
> （gate/upsert/compile_audit/幂等），唔另起平行入库机制。

### 修订 B 行为

- `node src/cli.js ingest-search --query "..." --source <dir> [--top N] [--threshold x] [--json]`
- 评分：`score = 命中词数 / 总词数`（全小写；可检索文本 = name + type + tags + content）。
- 选档：`score >= threshold`（默认 0.5）→ 按 score 降序（同分按档名）→ top-N（默认 5）。
- 入库：`compile(source, store, {files: 选中档绝对路径})`——幂等、逐档 gate、audit 留痕。
- 返回：`{query, terms, threshold, top, scanned, scored, matched, ingested, updated, skipped, rejected, selected[], compile}`。

### 修订 B 契约

- `cmdSearchIngest(dbPath?, {query, source, top, threshold}) -> 上述回执`
- **compile 扩展**：`opts.files`（绝对路径数组）提供时只处理呢啲档（filter .md + 存在）；
  **空数组 = 处理零档**（`Array.isArray` 判，唔用 `.length`——否则空数组误判为「无选项」而 walk 全目录）；
  未提供时 `walkMarkdown` 照旧。`walkMarkdown` 由 compile.js 导出（复用）。

---

## 修订 C · api entity REST（2026-11-22）

> 缘起：D14 六个未登记小件嘅第 3 项（`api-server entity REST`）。前两项目（batch-ingest、search-and-ingest）
> 已收口，呢系 D14 唯一剩余活跃项。写面**复用 `src/api-gate.js` 嘅 `gateWrite`**（身份闸 + 标签闸，SPEC-3.6），
> 唔另起平行写面——与修订 A/B「暴露既有能力」同一纪律。HTTP 面用 `node:http`，零外部依赖。
> 本修订推翻 §四 Non-Goals「唔做 HTTP 面」——该项当时系因入库 CLI 未定；入库 CLI 已落，HTTP 面单独立项。

### 修订 C 行为

- `node src/cli.js api --port 3000 [--host 127.0.0.1] [--db <path>]`：起 HTTP 服务，绑定 store。
- 路由四条：
  - `GET /health` → `200 {ok:true, entities, backend}`（存活 + 实体计数 + 向量后端名）
  - `GET /entities` → `200 {total, limit, offset, entities[]}`；查询串 `q`（name 模糊）、`limit`（缺省 50，上限 200）、`offset`（缺省 0）；列表**唔返 content**（列表面唔送正文）
  - `GET /entities/:id` → `200 {found:true, entity}`（含 content）；未命中 `404 {found:false, id}`
  - `POST /entities` → 读 JSON body → `gateWrite`：接受 `201`；已存在 `409`；身份唔认 `403`；缺 id `400`；坏 JSON `400`；body 超 1 MiB `413`
- 未知路由 / 方法 → `404 {error:'not-found', route}`。
- 全部响应 `Content-Type: application/json; charset=utf-8`。

### 修订 C 铁律

- **写面单源**：POST 只走 `api-gate.gateWrite`（身份闸、自报 status/confidence/tags 忽略、提案段留痕），唔新增第二条写路径。
- **读面唔碰写端**：list/get/health 全 SELECT；唔更新 `last_access`（无旁路访问面）。
- **组件唔直连 store**：`src/entity-api.js` 唔 `require('./knowledge-store.js')`，store 由调用方注入（C5 守）；SQL 走 `store._getDb()`，与 `api-gate.js` 同模式。
- **唔装守护、唔起后台**：`--port` 缺省 3000；端口被占 → 非零退出（唔换端口、唔 fork，SPEC-6.48 单进程口径）。

### 修订 C 契约

- `createServer({port, host, store}) -> {server, address(), close()}`（`port` 可传 `0` 取随机端口，供测试）
- **修订 D**：`createServer` 返回值增 **`ready`**（`Promise<void>`，`listening` 事件到达即 resolve）。`server.listen` 系异步——同步返回后立刻取 `address()` 会得 `null`，调用方被迫自己挂 `server.once('listening')`。**契约要求：调用方只需 `await svc.ready` 即可安全取端口**，唔该泄漏 Node 事件细节。
  - `ready` 唔该 `setTimeout` 轮询实现（轮询系猜时序，唔系契约）；`error` 事件须使 `ready` reject，唔该永挂。
  - `cli.js api` 命令行亦须 `await ready` 后再打印起服回执（唔该打印 `port: null`）。
- `handleRequest(req, res, store)`：路由解析 + 分发，纯处理唔监听（测试直接喂假 req/res，唔靠 spawn）
- `listEntities(store, {q, limit, offset}) -> {total, limit, offset, entities}`
- `readEntity(store, id) -> {found, entity}`
- `cmdApi(dbPath?, {port, host}) -> {port, host, routes, started}`（cli 接线，起服务并阻塞；`--json` 时打印起服回执后退出）

### 修订 C Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 导出在位 | `cmdApi` / `createServer` / `handleRequest` / `listEntities` / `readEntity` 皆暴露 |
| AC-2 | health 真跑 | 起服务 → `GET /health` 200、`ok=true`、`entities` 为非负整数 |
| AC-3 | 写后读闭环 | `POST /entities`（`actor=ohana`）→ 201；`GET /entities` 含该实体；`GET /entities/:id` 返同一实体 |
| AC-4 | 身份闸生效 | `actor` 唔系 `hana` → 403；回执 `ignored` 含 status/confidence/tags |
| AC-5 | 幂等与未命中 | 同 id 重发 → 409；未命中 id → 404 `found:false` |
| AC-6 | 错误面 | 坏 JSON → 400；未知路由 → 404 |
| AC-7 | CLI 真跑 | spawn `cli.js api --port 0 --json` → exit0、回执含实际端口 |
| AC-8 | **ready 契约（修订 D）** | `createServer` 返回 `ready`；`await ready` 后 `address()` 为非空整数——**调用方唔需自己挂 `server.once('listening')`**；`ready` 唔得用 `setTimeout` 轮询 |
| AC-9 | **ready 真连（修订 D）** | `await svc.ready` 后 `GET /health` 真跑 200；端口被占 / listen 失败时 `ready` 须 reject，唔该永挂 |

### 修订 C Non-Goals

- 唔做鉴权 token / 唔做 CORS / 唔做 TLS——局域网工具面，身份语义仍系 `actor=ohana`（hana）单闸。
- 唔做 `PATCH` / `DELETE`——铁律无物理删除（两段式退役走 SPEC-6.11 独立路径）。
- 唔做分页游标（limit/offset 已够当前规模）；唔做流式响应。
