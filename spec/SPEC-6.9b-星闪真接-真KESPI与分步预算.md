---
tags: [aing-v2, spec, 星闪, 调度, KESPI, 预算, 通感, M6, spec:8, starlink:8]
description: M6.9b 星闪真接 spec——meko_cycles.kespi_snapshot 改写真 KESPI 均值并标记来源，预算按契约 budgetTick 求和抬升，分步配额入轨迹；反思只吃真读数
date: 2026-11-16
status: 拍板（6.9 收口后按实况补接）
owner: hana
upstream: [SPEC-0.3, SPEC-1.14, SPEC-2.4, SPEC-6.9]
---

# SPEC-6.9b · 星闪真接（真 KESPI + 分步预算）

> **要补的两个坑**：① `meko_cycles.kespi_snapshot` 一直是 `0.5 + min(实体数,50)/100` 的占位值，不是 KESPI；6.9 的谱系反思正拿它当走势。② `runCycle` 默认 `cycleType='代谢'` 不在 `BASE_TICK` 表里，fail-closed 取 3 tick = 3 秒，21 步链路事实上必超；`budgetTick` 只在注册时校验，执行时不消费。
> 本件把「通感」接成真读数，把「预算」接成契约可算的总量 + 分步配额，并把读数来源写进库，读者不能再误吃占位。

---

## 一、目标

1. `meko_cycles.kespi_snapshot` 优先写 `kespi_scores.overall` 的活跃实体均值；无读数时才退回占位，并用 `kespi_source` 标明来源。
2. `kespi_source ∈ {'kespi_scores','placeholder'}`；旧库幂等补列，新库建表即带列。
3. `T_bound` 的 base 取 `max(cycleType base, Σ 步骤 budgetTick)`；运算类 cycleType 有显式 base，未知类型不再落到 3 秒。
4. 每步按 `budgetTick × loadFactor × 1s` 记软配额：结果里带 `quotaMs / elapsedMs / overBudget`，写进本轮轨迹；硬停仍是整轮 `deadline`。
5. `lineage-reflect` 只取 `kespi_source='kespi_scores'` 的快照算走势，不再吃占位行。

---

## 二、行为（spec 即契约）

### 2.1 真 KESPI 探针（`StarlinkOrchestrator.probeTopologyHealth`）

- 读 `kespi_scores` ⋈ `entities`（`invalid_at IS NULL`），取 `AVG(overall)`。
- 有行且为有限数 → `{kespiSnapshot: 四舍五入到 4 位, source: 'kespi_scores', scored: n}`。
- 无行 → `{kespiSnapshot: null, source: 'none', scored: 0}`。
- 纯读，不触发 KESPI 计算。

### 2.2 通感写回（`scheduleCycle` / 编排器 `_writeCycle`）

- 有真读数 → 写真值 + `kespi_source='kespi_scores'`。
- 无真读数 → 写占位值（`0.5 + min(实体数,50)/100`）+ `kespi_source='placeholder'`，保证 `kespi_snapshot` 仍非空（旧 AC-5 不破）。
- `scheduleCycle` 与 `MekoOrchestrator` 同一口径。

### 2.3 预算（`_tBoundMs` / `runCycle`）

```
base_eff   = max(BASE_TICK[cycleType] || DEFAULT_BASE, declaredTicks)
loadFactor = max(1, ceil(pendingEdges / 10))
T_bound    = base_eff × loadFactor × 1s
```

- `declaredTicks = Σ steps[].budgetTick`（契约字段真正参与调度）。
- 运算类 base：`代谢 120 / 维护 120 / 进化团 120 / 迁移首跑 300 / 首跑 300`；DNA 四类保持 `解旋 1 / 复制 2 / 再螺旋 2 / 互校 3`；未知 `DEFAULT_BASE=120`。
- 显式 `opts.budgetMs` 仍优先（迁移/测试用）。

### 2.4 分步软配额

- 每步执行前后记 `elapsedMs`；`quotaMs = budgetTick × loadFactor × 1s`。
- `elapsedMs > quotaMs` → 该步结果带 `overBudget:true`，并写入本轮轨迹 `results`；**不中断**（同步步骤无法抢占，硬停由整轮 deadline 负责）。
- `metabolism.REGISTRY` 每步补 `budgetTick` 实际值（compile 10 / import 15 / vector 30 / kespi 10 …），`buildDefaultSteps` 取登记值，不再一律 1。

### 2.5 反思只吃真读数（`lineage-reflect.kespiTrend`）

- 查询加 `AND kespi_source = 'kespi_scores'`；`NULL` 与 `placeholder` 行不入走势。
- 不足 2 个真读数 → `trend = 0`（不猜）。

---

## 三、验收（AC）

| # | 判据 | 证据面 |
|---|---|---|
| AC-1 | 运算类 base ≥120s、未知类型 ≥120s；DNA 四类原值不变 | `computeDeterministicDeadline` |
| AC-2 | 契约 `budgetTick` 求和抬升 T_bound（base 1s + 5 tick → ≥5s） | `_deadlineMs` / `runCycle` |
| AC-3 | 步骤超软配额 → 结果 `overBudget:true`，本轮仍 `ok` | `runCycle.results` |
| AC-4 | 有 `kespi_scores` → 探针返回真均值与 `source='kespi_scores'` | `probeTopologyHealth` |
| AC-5 | 编排器写回 `meko_cycles` 真值 + 来源标记 | `meko_cycles` |
| AC-6 | 无 KESPI → 写占位且 `kespi_source='placeholder'`，`kespi_snapshot` 非空 | `meko_cycles` |
| AC-7 | 反思走势只取真读数，占位/NULL 行被排除 | `trajectory.evidence.kespiTrend` |
| AC-8 | 旧库幂等补列；无 `DELETE`；跑编排前后双链零变化 | 表结构 / 表快照 |

---

## 四、非目标

- 不改 KESPI 八维公式；探针只取 `overall` 均值。
- 不做步骤级抢占/中断（Node 同步步骤无法安全抢占）；硬停仍为整轮 deadline。
- 不在本件修 `feedback-delta` / `insight-extract` 的同类占位读数问题（登记为后续）。
- 不把 `scheduleCycle` 强接进 `runCycle`；本件只统一两者的读数口径与写入列。

---

## 五、铁律

- 探针纯读，不写 `entities` / `kespi_scores`。
- 列迁移幂等：`PRAGMA table_info` 先查后补，连跑不炸。
- 不碰 `last_access`、无物理删、账本只增。
