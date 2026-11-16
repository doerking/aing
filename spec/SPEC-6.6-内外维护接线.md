---
tags: [aing-v2, spec, 维护, memo, meko, 内场, 外场, M6, spec:9, memo:9, meko:9]
description: M6.6 spec——把 6.5 观察读数接进 memo 外场维护与 meko 内场维护：一份 maintenance-report 单一出口，memo 只呈现、T0/T2 只读取，执行仍归场域件
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.8, SPEC-2.15, SPEC-3.11, SPEC-6.5]
---

# SPEC-6.6 · 内外维护接线（memo 外场 × meko 内场）

> 6.5 四件已产出读数，但只接到 T2 快照。SPEC-0.8 §9.3 把维护分两层：
> **内场**（meko 进化团，维护双链本体）与**外场**（挂 memo，服务主驾，不碰双链）。
> 本任务补的是消费侧：让两层的入口都读得到同一份维护读数，且仍然只读/只提案。

---

## 一、姿态

| 层 | 入口 | 本任务给什么 | 不给什么 |
|---|---|---|---|
| 内场 | meko T0/T2 | T0 plan 带 `observation` + `targets`；T2 快照带 `insights` | 不给 T0 写权；不自动按 targets 修边 |
| 外场 | memo | `user.maintenance` 块 + 系统行「缺口/走势」+ 外派派单卡（外派面挂载于此，随载交付设定） | memo 纯读：不执行派出、不改双链、不写表 |
| 出口 | `maintenance-report.js` | 一份聚合读数，两处消费 | 不各自重算，避免多套读数 |

**执行边界不变**：targets 只是清单，真修复仍归 2.12/2.13；洞察候选仍走蒸馏门。

---

## 二、行为（spec 即契约）

### 2.1 维护简报 `src/maintenance-report.js`（只读）

```js
buildReport(store, opts) -> {
  generatedAt,
  internal: { gaps, selfModel, feedback, targets },
  external: { pendingInsights }
}
```

- `internal.gaps` = `gapScan(store)` 原样（`{counts, ids, total}`）。
- `internal.selfModel` = `measure(store)` 原样（`{measuredAt, metrics}`）。
- `internal.feedback` = `delta(store, opts)` 原样（含 `verdict`）。
- `internal.targets`：按 `empty → orphan → unindexed → stagnant → thin` 优先级，去重取前 `TARGETS_MAX=10` 个 id。
- `external.pendingInsights`：`type='MetaKnowledge' AND status='pending-distillation' AND invalid_at IS NULL`，按 `rowid DESC` 取前 `PENDING_INSIGHT_MAX=3`，返回 `{count, items:[{id,name}]}`。
- **零写**：不修边、不改实体、不碰 `last_access`。

### 2.2 memo 外场维护（`src/memo.js`）

- `user.maintenance` = `{ gaps: {total, counts}, trend, pendingInsights: {count, items} }`，由 `buildReport` 供料；失败置 `null`，不阻断 memo。
- 系统一行在「蒸馏债」后加 `缺口 <total> <走势>`；走势记法：`improving→↑`、`regressing→↓`、`flat→→`、`insufficient→─`。
- 仍守 `SYSTEM_LINE_MAX=80`，向量段位置不变（SPEC-5.2 先保向量）。
- **纯读**：memo 与简报都不写表（C16 继续成立）。

### 2.3 meko 内场维护

- `t0Plan()` 增 `observation`（= `internal`，失败置 `null`）与 `targets`（失败置 `[]`）；`focus` 仍只取 `supply/digest/restore/maintain` 四值，不改既有判定。
- `t2Snapshot()` 的 `gaps`/`feedback`/`selfModel` 改为由同一份 `buildReport` 供料（形状不变），并增 `insights` = `external.pendingInsights`（失败置 `null`）。
- 不新增代谢步骤；不自动按 targets 执行修复。

### 2.4 铁律

- 简报只读：前后库指纹一致。
- memo 仍纯读；不投事件、不执行派出（外派面只留派单卡与读数）。
- 不物理删除；不直连 knowledge-store（store 注入，arch-lint C5 守）。

---

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 简报形状 | `internal` 三块 + `targets` 齐；`external.pendingInsights` 有 count/items |
| AC-2 | targets 优先级 | 造五类缺口，targets 按 empty→orphan→unindexed→stagnant→thin 排序、去重、≤10 |
| AC-3 | 洞察候选上浮 | 插入待蒸馏洞察候选 → `external.pendingInsights` 计数与条目正确，最多 3 条 |
| AC-4 | memo 外场块 | `user.maintenance` 有 gaps/trend/pendingInsights；系统行含「缺口」「走势」且 ≤80，向量段仍在 |
| AC-5 | memo 纯读 | 调 `buildMemo` 前后库指纹一致 |
| AC-6 | T0 内场 | `t0Plan()` 带 `observation` 与 `targets`；`focus` 仍四值之一 |
| AC-7 | T2 内场 | `t2Snapshot()` 的 gaps/feedback/selfModel 形状不变，且带 `insights` |
| AC-8 | 铁律 | 简报与 memo 前后指纹一致；`last_access` 不变；简报无 `DELETE FROM` 与直连 store |

## 四、Non-Goals

- 不自动执行 targets 修复（归 2.12/2.13）。
- 不给 memo 执行派出或写权；不恢复外场五角色为常驻子 agent。
- 不改 `focus` 四值语义，不新增代谢步骤。
- 不做审批流（洞察仍走蒸馏门，非 approval_queue）。

## 五、契约

- `buildReport(store, opts) -> {generatedAt, internal, external}`
- 常量：`TARGETS_MAX=10`、`PENDING_INSIGHT_MAX=3`、`TARGET_ORDER`
- 消费：`memo.buildMemo`、`EvolutionRuntime.t0Plan`、`EvolutionRuntime.t2Snapshot`

## 六、依赖

- 上游：SPEC-6.5（四件读数）、SPEC-0.8（内外场划界）、SPEC-2.15（T0/T2）、SPEC-3.11（memo）
- 下游：2.12/2.13（按 targets 修）、后续 memo 外场五角色（读 maintenance 块）

## 七、与旧院/6.5 的差异

| 项 | 6.5 | 本件 |
|---|---|---|
| 消费点 | 只有 T2 | memo + T0 + T2 三处，共用一份简报 |
| 缺口清单 | 只出数 | 出数 + 排优先级 targets |
| 洞察候选 | 只落库 | 在 memo 外场可见（只呈现，不执行） |
| 写权 | 洞察写候选实体 | 不变；本件新增模块全部只读 |
