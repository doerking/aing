---
tags: [aing-v2, spec, 消费侧, 轨迹, 成长闭环, M6, spec:9, trajectory:9]
description: M6.4 spec——补成长消费侧：任务轨迹表 task_trajectories，会话实体与代谢轮各落一条；幂等、只追加、不碰实体列；代谢链增 trajectory 步
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-3.13, SPEC-6.1, 旧院 trajectory-store.js, docs/Engineering/CONSUMER-AUDIT-2026-11-16.md]
---

# SPEC-6.4 · 任务轨迹消费

> 缺口来源：`docs/Engineering/CONSUMER-AUDIT-2026-11-16.md` 缺口 3 的第一件。
> 旧院有 `task_trajectories` 表与四条写入链（episode / rollout / tri-path / metabolism）；
> v2 的成长闭环（SPEC-0.7）说「成长只认会话三源」，但三源入库后**没有轨迹落表**，出口是断的。
> 本任务先补最小闭环：**会话 → 轨迹**、**代谢轮 → 轨迹**；episode/rollout 留给后续。

---

## 一、目标

1. 建 `task_trajectories` 表（沿用旧院列口径），随库自动建表。
2. 每一条有效 `Conversation` 实体落一条 `session` 轨迹（兼容 6.1 六段与 3.13 三源两种 content 形状）。
3. 每一轮编排落一条 `metabolism` 轨迹（成功/失败、失败步骤、耗时、轮次）。
4. 幂等、只追加、可查询、可统计。

## 二、行为（spec 即契约）

### 2.1 表

`task_trajectories`（`knowledge-store` DDL 增建，`IF NOT EXISTS`）：

| 列 | 类型 | 含义 |
|---|---|---|
| `id` | TEXT PK | `traj-<convId>` 或 `traj-cycle-<cycleId>` |
| `task_type` | TEXT | `session` / `metabolism` / … |
| `route` | TEXT | JSON 数组（话题 / 步骤） |
| `tools` | TEXT | JSON 数组（工具名，去重保序） |
| `step_sequence` | TEXT | JSON 数组（段序 / 步骤序） |
| `success` | INTEGER | 0/1 |
| `retries` | INTEGER | 默认 0 |
| `duration_ms` | INTEGER | 默认 0 |
| `score_soft` | REAL | 默认 0 |
| `score_hard` | INTEGER | 默认 0 |
| `evidence` | TEXT | JSON 对象 |
| `source` | TEXT | 来源标识 |
| `created_at` | DATETIME | 写入时间 |

索引：`task_type` / `success` / `source` 各一（`IF NOT EXISTS`）。

### 2.2 会话轨迹

- 取 `type='Conversation'`、`status='active'`、`invalid_at IS NULL` 的实体。
- content JSON 两种形状都支持：
  - **六段（6.1）**：`{format, topic, at, trigger, markdown, turns, stats, calibrations}`
  - **三源（3.13）**：`{topic, at, reply, searchShown, rationale, outcome}`
- 派生字段：
  - `task_type='session'`
  - `route=[topic 或 name]`
  - `tools`：六段取 `turns[].tools[].name` 去重保序；三源取空数组
  - `step_sequence`：六段按出现序压入 `场景/思维/手段/编排/产出`；三源为 `['回复','搜索展示','事由分析']` 中非空者
  - `success`：六段 = 任一 turn 有非空 `output`；三源 = `reply` 非空
  - `evidence={convId, format, trigger|outcome, toolCalls, turnCount, bodyChars, calibrations}`
  - `source`：`session-narrative` / `session-three-source`
- id = `traj-<convId>`（确定性）。

### 2.3 代谢轮轨迹

- 编排器每轮结束调用 `logCycle(store, {cycleId, ok, rounds, results, failedStep, elapsedMs})`。
- `task_type='metabolism'`；`route`/`step_sequence` = 已跑步骤 id（去重保序）；`success=ok?1:0`；
  `duration_ms=elapsedMs`；`evidence={cycleId, rounds, failedStep, resultCount}`；`source='meko-orchestrator'`。
- id = `traj-cycle-<cycleId>`；已存在则跳过（幂等）。
- 写失败不阻断编排（best-effort）。

### 2.4 同步与查询

- `syncSessions(store, opts)`：扫描所有有效 Conversation，逐条落轨迹；已有同 id → `skipped`。
- `listTrajectories(store, {taskType, limit})`：按 `created_at DESC, rowid DESC` 返回。
- `stats(store)`：按 `task_type` 计数 + `success` 汇总。

### 2.5 链上接线

- `metabolism.REGISTRY` 增 `trajectory`：strand `cross`、band `background`、reads `entities`、writes `task_trajectories`、入口 `syncSessions`。
- `DEFAULT_STEPS` 置于 `distill-points` 之后。

### 2.6 铁律

- 不碰 `last_access` / `tolaria_strength` / `invalid_at`；不改实体正文。
- 轨迹只追加，无 `DELETE FROM`；同 id 跳过，不覆盖历史。
- 组件唔直连 knowledge-store（store 注入，arch-lint C5 守）。

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 表形状 | `task_trajectories` 12 列齐 + 3 个索引 |
| AC-2 | 六段会话轨迹 | turns 的两类工具、段序、success、evidence 正确 |
| AC-3 | 三源会话轨迹 | 3.13 形状落行，source 标识正确 |
| AC-4 | 幂等 + 退役跳过 | 二次 sync `logged=0`；退役 Conversation 不落 |
| AC-5 | 代谢轮轨迹 | 成功轮 success=1；失败轮 success=0 且 evidence 带 failedStep |
| AC-6 | 查询与统计 | `listTrajectories` 类型过滤生效；`stats` 计数正确 |
| AC-7 | 链上可见 + 铁律 | `DEFAULT_STEPS` 含 `trajectory`；`last_access` 不变；无 `DELETE FROM`；无直连 store |

## 四、Non-Goals

- 不迁 episode / rollout / tri-path 三条写入链（属缺口 3 后续与缺口 4）。
- 不做轨迹分析/归因（insight-extractor 属 6.5）。
- 不改会话入库与实体形状。
- 不做轨迹上限裁剪（先只追加，后续按 6.5 再定）。

## 五、契约

- `logTrajectory(store, input) -> {id, logged|skipped}`
- `buildSessionTrajectory(entity) -> trajectory input | null`
- `syncSessions(store, opts) -> {scanned, logged, skipped, noBody}`
- `logCycle(store, info) -> {id, logged|skipped}`
- `listTrajectories(store, opts)` / `stats(store)`

## 六、依赖

- 上游：SPEC-3.13（三源）、SPEC-6.1（六段）、SPEC-0.1（表结构）
- 下游：SPEC-6.5（反馈/缺口/元认知）、growth 闭环（SPEC-0.7）
- 旧院证据：`aing/src/trajectory-store.js`（表结构 + log 形状）

## 七、与旧院的差异

| 项 | 旧院 | v2 本件 | 理由 |
|---|---|---|---|
| 写入链 | episode / rollout / tri-path / metabolism 四条 | 先接 session + metabolism 两条 | 最小闭环；另两条随 6.5 / 缺口 4 |
| 代谢轨迹粒度 | lineage 每步一条 | 每轮一条 | v2 有 `meko_cycles` 轮账，步骤明细在 results 里 |
| 幂等 | 随机 id + INSERT OR REPLACE | 确定性 id + 存在即跳过 | 历史不可被覆盖 |
