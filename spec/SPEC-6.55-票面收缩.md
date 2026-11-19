---
tags: [aing-v2, spec, 工单, 票面, 读数, 自优化, engineering:7, capability:6, delivery:7, must-read:6]
description: SPEC-6.55 票面收缩——只有「有人能动手」的维才开工单；ka/kr/overall 降为读数，kq/kd 走寄生槽，止住每维护轮 20 张恒流产
date: 2026-11-19
status: 已落地（test-6.55-ticket-face 7/7）
owner: hana
upstream: [STATUS.md §七 D18, spec/SPEC-6.18-提案单需求定义与寄生位.md, spec/SPEC-6.53-提案单进memo视野.md, src/self-optimize.js]
---

# SPEC-6.55 · 票面收缩

> **一句话**：每维护轮开满 20 张票（kq5 / ka5 / kd8 / overall2），全部 go `proposed`、TTL 3 轮后作废、下轮重开——转一圈落地 0 张。病因不是「没动作」，是把**读数**当成了**任务**。

## 一、口径

### 1.1 什么才开工单

只有「有人能动手」的维才开：

| 维 | 依据 | 动作 |
|---|---|---|
| `kq` | 正文只能外部写；P2 槽半寄生（semi，want=补正文到 400 字以上 + ≥3 标签）| `slot`（可被 P2 领走）|
| `kd` | raw 缺镜像键可自愈（`rebond`）；被引用不催化走 P3 生成派生 | `rebond` / `slot` |
| `kc` | 派生件同世占比可经 `reconcile` 补双链 | `reconcile` |

### 1.2 什么不开工单

- `ka`（活跃）：`last_access` 只能由**真实访问**抬，引擎造访问＝作弊。它属于「该不该退场」的判据（retention/prune），不是工单。
- `kr`（续航）：在场与否由代谢轮自己决定，外部无从接手。
- `overall`（复合）：红档等于「说不清哪维坏」，只进 memo 读数。
- 三者仍在 `kespi_scores` 与 `memo.user.proposals`（6.53 现算）里可见，**只是不占票**。

### 1.3 slot 动作

`dispatchTickets` 对 `action='slot'` 的处理与 `memo-card` 相同：标 `proposed`，单上已带五段 demand（含 slot/mode/evidence/ttl），外部件经 `claimable(store, reg)` 领走。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | `ka` 低于门槛 → 不开单 |
| AC-2 | `kr` 低于门槛 → 不开单 |
| AC-3 | 各维过线但 `overall` 红 → 不开单 |
| AC-4 | `kq` 低 → 开单，`action='slot'`，`evidence_json.demand.slot='P2'`，mode `semi` |
| AC-5 | `kd` 可自愈（raw 缺镜像键）→ `action='rebond'`；被引用不催化 → `action='slot'`（demand slot `P3`）|
| AC-6 | `dispatchTickets` 对 slot 单标 `proposed`（不判 unknown-action）|
| AC-7 | 票面数只由 kq/kc/kd 配额决定（不再有 ka/kr/overall 票）|

## 三、边界

- 不删 `opt_tickets` 里历史 ka/kr/overall 行（TTL 自然收尾）。
- 不改六维公式与门槛。
- 不放宽 `verifyTickets`（TTL、回单判定照旧）。
