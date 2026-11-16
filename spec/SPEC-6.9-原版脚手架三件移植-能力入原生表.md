---
tags: [aing-v2, spec, 移植, 寄生, 脚手架, 检索KPI, 决策谱系, 能力派单, M6, spec:8, meko:7]
description: M6.9 原版脚手架三件移植 spec——检索 KPI、决策谱系反思、能力叙事派单，全部改用 v2 原生表（task_trajectories / opt_tickets），不搬 return 文件投递与状态板
date: 2026-11-16
status: 拍板（取证后按实况裁定）
owner: hana
upstream: [SPEC-6.2, SPEC-6.4, SPEC-6.5, SPEC-6.8, SPEC-1.14, SPEC-2.15]
---

# SPEC-6.9 · 原版脚手架三件移植（能力入 v2 原生表）

> **取证结论**：原版 14 件寄生脚手架里，真正通电的只有 1 条（代谢链尾 `metabolism-panel → gap-detector`）；5 份 return 只有 1 份被消费，且 `parasite-return` 投的是 stdout 日志片段，不是契约；四个头的读端全绑 v1 数据模型（`KnowledgeStore` / `entity_metadata` / `entity_embeddings` / `kespi_history.overall_score`），v2 一个都没有。
> 本件只搬**能力**，不搬壳：三件改成 v2 原生读端，结果落 `task_trajectories` / `opt_tickets`，验收看行数变化，不看文件是否存在。

---

## 一、目标

1. **检索 KPI**：只用现成检索面跑自指 Q&A，算 recall@k / MRR，落一条 `task_trajectories`；不改实体、不改向量、不碰 `last_access`。
2. **决策谱系反思**：把 `field_actions` 的「做了 / 被撤回」与 `meko_cycles` 的 KESPI 走势归组成反思轨迹，落 `task_trajectories`；不写 growth-loop 文件。
3. **能力叙事派单**：能力叙事有原文但没进 `distill_points` 的实体，直接开 `opt_tickets`（`dim='cap'`）；消费后由 6.8 的复核口验证。
4. 三件进默认代谢链，但只在「维护 / 自优化」轮或显式开关下执行；迁移 / 全量首跑不改库。
5. 明确不搬：`parasite-return` 文件投递、`meko-switchboard` 状态板、`meko-patrol` 存在性核单、`meso-closure` 的不完整 `guardNoLeak`、`growth-exploration-graph`（无消费者）。

---

## 二、行为（spec 即契约）

### 2.1 检索 KPI（`src/retrieval-kpi.js` · `runKpi`）

- 取样：`entities` 中 `status='active' AND invalid_at IS NULL` 且有 `name` 的实体，按 `id` 升序；同 base 去重，优先 `raw-`。默认 `sample=20`。
- 自指 Q&A：query = `entity.name`，期望命中 = 同 base 的实体。
- 调 `retrieval.search(store, name, {k})`（默认 `k=5`）。
- 指标：`recall@k = 命中数 / 样本数`；`MRR = Σ(1/rank) / 样本数`。
- 落一条 `task_trajectories`：
  - `id = traj-rkpi-<cycleId | YYYYMMDD>`（同 cycle 重跑覆盖，不增行）
  - `task_type='retrieval-kpi'`、`source='retrieval-kpi'`
  - `success = recall >= baseline`（默认 `0.5`）
  - `score_soft=recall`、`score_hard=success`
  - `evidence={k, sample, hits, recall, mrr, baseline, backend:{model,dim}}`
- 只写 `task_trajectories`；不写 `entities` / `links` / `entity_vectors` / `access_hits`。

### 2.2 决策谱系反思（`src/lineage-reflect.js` · `reflect`）

- 归组：`field_actions` 按 `action` 统计 `n`、`stood`（`reversed_at IS NULL`）、`reversed`。
- 走势：`meko_cycles` 最近 5 个非空 `kespi_snapshot`，`trend = 末值 − 首值`。
- 每个 `n >= minSamples`（默认 1）的动作落一条：
  - `id = traj-reflect-<action>-<cycleId | latest>`
  - `task_type='reflect'`、`route=[action]`、`source='lineage-reflect'`
  - `success = stood / n >= minRate`（默认 `0.8`）
  - `score_soft=stood/n`
  - `evidence={action, n, stood, reversed, rate, kespiTrend, samples}`
- 只写 `task_trajectories`；不撤回动作、不改 `field_actions`。

### 2.3 能力叙事派单（`src/capability-dispatch.js` · `dispatchCapabilities`）

- 候选：`entities` 中 `status='active' AND invalid_at IS NULL`，`distill-points.extractRawMessages(content)` 非空，且 `distill_points` 无对应 `base_id` 行。
- 跳过已有 `dim='cap'` 且状态为 `open / proposed` 的实体（幂等）。
- 每轮最多开 `maxTickets=10`，落 `opt_tickets`：
  - `dim='cap'`、`kind='capability-unconsumed'`、`action='memo-card'`
  - `score=NULL`、`zone='yellow'`、`status='open'`
  - `evidence={source:'capability-narrative', rawLines, sections}`
- 返回 `{scanned, consumed, opened, skipped}`；`consumed` = 已有蒸馏点的叙事数（不重开单）。

### 2.4 复核口扩展（`self-optimize.verifyTickets`）

- 复核范围从 `status='dispatched'` 扩到 `status IN ('dispatched','proposed')`。
- `dim='cap'`：
  - `distill_points` 出现该实体 → `verified`（`delta=1`，证据 `{reason:'consumed'}`）。
  - 仍无且 `attempts >= 2` → `rejected/no-consumption`。
  - 否则 `attempts+1`，保持 `proposed`。
- 非 cap 的 `proposed`（KESPI 提案单）不参与复核，保持原状。
- `graduateToGene` 跳过 `dim='cap'`：提案单不毕业成 gene，只作 memo 待办。

### 2.5 链上位置与开关（`src/metabolism.js`）

- 默认链：`kespi` → `capability-dispatch` → `self-optimize` → `lineage-reflect` → `retrieval-kpi` → `prune`。
- 四步共用同一 guard：`ctx.selfOptimize === true` 或 `ctx.opts.selfOptimize === true` 或 `cycleType` 命中「维护 / 自优化」。
- guard 不满足时返回 `{ok:true, skipped:true}`，不读写任何表。

---

## 三、验收（AC）

| # | 判据 | 证据面 |
|---|---|---|
| AC-1 | 三件模块存在并导出约定函数；`metabolism.DEFAULT_STEPS` 含三步且与 REGISTRY 对齐 | 源码 / `DEFAULT_STEPS` |
| AC-2 | 检索 KPI 落一条轨迹，`recall/mrr/success` 与样本一致；同 cycle 重跑不增行 | `task_trajectories` |
| AC-3 | 检索 KPI 只读：实体、链接、向量、访问表前后完全一致 | 表快照 |
| AC-4 | 谱系反思按动作归组，撤回计入失败；`success/score_soft` 正确；同 cycle 重跑不增行 | `task_trajectories` |
| AC-5 | 谱系反思只写轨迹，`field_actions` / `meko_cycles` 前后一致 | 表快照 |
| AC-6 | 有原文无蒸馏点的实体开 `dim='cap'` 工单；已有蒸馏点的实体不开；重跑幂等 | `opt_tickets` |
| AC-7 | 蒸馏点出现后，cap 工单被复核为 `verified`；cap 工单不毕业成 gene | `opt_tickets` / `genes` |
| AC-8 | 三件源码无 `DELETE FROM`、不直连 `knowledge-store`；跑三件前后双链零变化 | 源码 / 表快照 |

---

## 四、非目标

- 不恢复 `data/meko/returns/*.json` 文件投递通道。
- 不做 `meko-switchboard` 状态板、`meko-patrol` 文件存在性核单。
- 不移植 `growth-exploration-graph`（原版无调用方）。
- 不改 KESPI 八维公式与阈值。
- 不做自动修复：cap 工单只提案，消费仍走蒸馏门。

---

## 五、契约

- 三件均由编排器注入 `store`，不 `require('knowledge-store')`（arch-lint C5）。
- 写表仅限：`task_trajectories`（KPI / 反思）、`opt_tickets`（能力派单）。
- `id` 确定性 + `ON CONFLICT DO UPDATE`，同 cycle 重跑覆盖不堆行。
- 铁律照旧：不碰 `last_access`、无物理删、账本只增。

---

## 六、与 6.8 的关系

6.8 解决「KESPI 读数没人消费」；6.9 把原版脚手架里仍有价值的三件接进同一条维护回合：

- `capability-dispatch` 在 `kespi` 后开能力工单；
- `self-optimize` 同轮把 `open` 推进到 `proposed/dispatched`，并在下一轮复核；
- `lineage-reflect` / `retrieval-kpi` 把「这轮维护有没有用」写成可查的轨迹行。

验收口径随之统一：看 `opt_tickets` / `task_trajectories` 行数与状态变化，不看 return 文件是否落盘。
