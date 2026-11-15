---
tags: [aing-v2, spec, 进化团, 四时点, 六维, 维护接线, M2, spec:9, evolution:9]
description: M2.15 六维×四时点维护接线 spec——T0 出本轮 plan、T1 出可复现拦截清单、T2 每轮留六维快照（I9）、T3 gene 衰减归档可回滚；六维各至少一条可测断言
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.8 §四/§五/§七, SPEC-2.10, SPEC-2.12, SPEC-2.13, SPEC-2.14, SPEC-0.1 修订 H]
---

# SPEC-2.15 · 六维 × 四时点维护接线

> 进化团有五个人，但「全程维护」不是五个人各自散步：四个时点各有人负责，六个维度各有读数。
> 本件把时点接成一轮里的固定节拍，把六维接成每轮必落的一张快照——T2 没快照，本轮不算完成（I9）。

---

## 一、目标

一轮代谢内跑齐 T0→T1→T2，跨轮跑 T3；每轮留六维快照；T3 的 gene 衰减与归档可回滚。

## 二、行为（spec 即契约）

### 2.1 T0 轮前定焦（`pilot`）
- 读上轮 `meko_cycles` + 守恒闸 → 出本轮 plan
- `focus ∈ {supply, digest, restore, maintain}`：
  - 无上轮 / `idle` → `supply`
  - `growth-only` → `digest`
  - `prune-only` → `restore`
  - 其余 → `maintain`
- plan 只入运行时，唔写业务表

### 2.2 T1 轮内复核（`tri-cross` + `omni-gate`）
- 面：本轮新增的 `field_actions`
- 判定：
  - `rebond / unwind / reconcile` → 放行（维护动作，前像可撤）
  - `demote / promote / promote-edge` → 要求 `before_json.evidence` 非空且独立类 ≥2；否则 **hold**
- 输出 `{allow: [...], hold: [{id, action, reason}]}`
- **可复现**：同一批动作跑两次，名单逐项相同（按 id 排序）

### 2.3 T2 轮尾度量（`gene-keeper` + I9）
- 每轮 `runCycle` 后必须有一行 `meko_cycles`（含 `growth/pruned/conservation_ratio`）
- 同轮落一张六维快照：
  | 维 | 读数 |
  |---|---|
  | D1 结构 | 断链数（crosscheck gap）|
  | D2 强度 | 本轮跨带动作数（demote/promote）|
  | D3 度量 | KESPI 均值 + 守恒比 + 是否在带 |
  | D4 时序 | 连续 idle 轮数 |
  | D5 成员 | 活跃 gene 数 / 归档数 |
  | D6 用户 | 待呈提案数（只出数，唔动用户面）|
- 快照存运行时并返回；`meko_cycles` 缺行 → 本轮 `complete=false`

### 2.4 T3 跨周期演化（`gene-keeper` + `poll`）
- 每 N 轮（默认 4）跑一次：
  - `score *= decay`（默认 0.9）
  - `score < archiveBelow`（默认 0.2）→ `status='archived'`、`archived_at=now`
  - 写 `lineage`（前像 JSON：score/status/archived_at）
- `rollbackGene(id)`：按 lineage 复原 score/status/archived_at，并清 lineage；可重跑

### 2.5 铁律
- 六维快照唔写 `entities/links`；T3 只写 `genes`
- 唔碰 `last_access`；无物理 DELETE

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | T0 出 plan | `t0Plan()` 返回 `focus ∈ 四值` + `budget`；无历史时 `supply` |
| AC-2 | T1 清单可复现 | 同批动作连跑两次 → allow/hold 逐项相同；无证据 promote 进 hold |
| AC-3 | T2 每轮快照（I9）| `run({rounds:2})` → 2 张快照、2 行 `meko_cycles` 且 ratio 非空 |
| AC-4 | T3 可回滚 | gene 衰减后归档；`rollbackGene` 复原 score/status/archived_at |
| AC-5 | 六维各一条断言 | 快照含 D1–D6 六个数值键，各有可测定义 |

## 四、Non-Goals

- 不做闸东真接与自治审批边界（2.16）
- 不做子agent 生命周期（2.17）
- 不做外派蜂群（2.18）
- 不写用户面（memo 归 3.11）

## 五、契约

- `class EvolutionRuntime { constructor({store, orchestrator}) }`
- `t0Plan() -> {focus, budget, reason}`
- `t1Review({sinceCycle}) -> {allow, hold}`
- `t2Snapshot(cycleId?) -> {cycleId, D1..D6, complete}`
- `t3Evolve({decay, archiveBelow}) -> {decayed, archived}`
- `run({rounds=2, t3Every=4}) -> {plans, reviews, snapshots, evolution}`
- `rollbackGene(id) -> {restored}`

## 六、依赖

- 上游：SPEC-0.8、SPEC-2.10（守恒）、SPEC-2.14（成员）、SPEC-0.1 修订 H（genes）
- 消费者：2.16 闸东、3.11 memo 提案
