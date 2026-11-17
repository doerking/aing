---
tags: [aing-v2, spec, 代谢, 记账, KESPI, M1, spec:8, metabolism:9, ledger:9]
description: M1.16 轮账与逐条存活 spec——每轮给在场实体留快照、新边打 cycle_id、账本按轮次有界；为催化率/续航/时序相干三个新 KESPI 维供数据，本件不改公式与检索
date: 2026-11-17
status: 实装
owner: hana
upstream: [SPEC-1.12, SPEC-1.14, SPEC-6.7]
---

# SPEC-1.16 · 轮账与逐条存活（代谢记账层）

> 状态：实装（2026-11-17）
> 上游：SPEC-1.12（KESPI 八维）、SPEC-1.14（编排螺旋）、SPEC-6.7（访问事件）
> 下游：KESPI 五维修订（待定）、检索精排（已按 SPEC-6.3 修订 D 撤出）

## 一、目标

给「代谢」记一本可复算的账：

1. 每一轮代谢结束时，给**每个在场实体**留一行快照（在场、近 7 天是否被访问、有效邻居数、正文长度、分道）。
2. 每一轮**新产生的边**打上 `cycle_id`，知道它是哪一轮催出来的。
3. 账本有界（默认保留最近 30 轮，实测约 2.1MB），不会撑破手机端 10MB 库上限。

这三样是「催化率」「续航」「时序相干」三个新 KESPI 维的前置数据；本件只记账，不改任何 KESPI 公式与检索行为。

## 二、行为（spec 即契约）

### 2.1 表与列

- 新表 `entity_rounds(entity_id TEXT, cycle_id TEXT, alive INTEGER, accessed INTEGER, degree INTEGER, content_len INTEGER, strand TEXT, recorded_at DATETIME, PRIMARY KEY(entity_id, cycle_id))`，附索引 `entity_rounds(cycle_id)`。
- `links` 增列 `cycle_id TEXT`（老库迁移时补列，历史行留空 = 记账前）。
- 两处迁移都幂等：连跑不炸、老库补列不丢数据。

### 2.2 `recordRound(store, cycleId, opts)`

- 只在 `cycleId` 非空时动作（无轮次不记账）。
- **实体快照**：对 `invalid_at IS NULL` 的每个实体写一行，`alive=1`：
  - `accessed = 1` 当且仅当 `last_access` 或最近一条 `access_hits.hit_at` 距今 ≤ 7 天（与 KA「热」阈值同口径）；否则 0。
  - `degree` = 有效边（`links.invalid_at IS NULL`）双向计数，与 KESPI KD 同口径。
  - `content_len` = `content` 原始长度。
  - 同 `(entity_id, cycle_id)` 重复调用不增行（INSERT OR IGNORE，可重跑）。
- **边归属**：`cycle_id IS NULL` 且 `created_at >= 上一轮 executed_at` 的边，写成本轮 `cycle_id`。上一轮取 `meko_cycles` 中 `id != 本轮` 的最近一条 `executed_at`；没有上一轮则不动（历史边保持记账前状态）。
- **上限**：按轮次保留最近 `opts.keepRounds`（缺省 30）轮，更老的整轮删除；删除只删账本行，不碰实体与边。
- 全程只写 `entity_rounds` / `links.cycle_id`；不反写实体、不碰 `last_access`、无物理删实体。

### 2.3 接线

`MekoOrchestrator._writeCycle` 在写入 `meko_cycles` 后调用 `recordRound(store, id)`；记账失败不阻断本轮（best-effort，与既有接线一致）。

## 三、Acceptance Criteria

- AC-1 建表与列：新库 init 后 `entity_rounds` 列齐全、`links` 有 `cycle_id`；老库（无该列）迁移后补列且旧数据不动。
- AC-2 快照与幂等：N 个在场实体 → 本轮 N 行；`alive=1`、`degree`/`content_len` 与库内事实一致；同 `cycleId` 重跑行数不变。
- AC-3 访问标记：近 7 天有 `last_access` 或 `access_hits` 的实体 `accessed=1`，其余 0。
- AC-4 边归属：上一轮之后创建的未归属边归本轮；更早的边保持空；已归属边不被改写。
- AC-5 上限：`keepRounds=3` 时跑 4 轮，账本只剩最近 3 轮的行。
- AC-6 编排接线：`runCycle` 跑一轮后，`meko_cycles` 有行且 `entity_rounds` 有对应 `cycle_id` 的实体行；记账不让本轮失败。

## 四、Non-Goals

- 不改 KESPI 八维公式（五维修订另起一件）。
- 不删/不压缩实体；不做逐条历史回放。
- 不在检索路径读账本（检索仍纯读、与账本无关）。
- 不动真实 `data/knowledge.db` 的接线验证（先在本机副本与隔离库验证，真库迁移另行批准）。

## 五、契约

- 模块：`src/round-ledger.js`，导出 `{ recordRound, ROUND_KEEP }`。
- 注入：`recordRound(store, cycleId, opts)`，store 需有 `_getDb()`（SPEC-1.15 契约）。
- 迁移：`knowledge-store.init` 中新增 DDL 与列迁移。

## 六、依赖

- `meko_cycles`（轮次时间锚）、`access_hits`（SPEC-6.7）、`links`（边层）。

## 七、风险与边界

- 轮次不规律：边归属用「上一轮 executed_at」时间切分，同一秒内产生的边可能被算入下一轮——可接受的近似。
- 账本体积（真库副本实测 2026-11-17）：320 实体、每轮 320 行、单轮约 69KB；30 轮 ≈ 2.1MB，60 轮 ≈ 4.2MB。真库现 4.9MB、手机端上限 10MB，故缺省取 30 轮；实体翻倍或改每日多轮时须改增量存储（只记变化行）。
- 记账只回答「在场/被访问/连接数」，不回答「答得好不好」；不得拿它当答案质量分。
