---
tags: [aing-v2, spec, 蒸馏点, distill_points, 预案, 消费侧, M6, spec:9, distill:8, predict:7]
description: M6.10 蒸馏点消费 spec——把 points_json 从「幂等缓存」变成预案依据：predict 的 basis 增 point 类（取会话关联实体的首条蒸馏点），只读、不新增排序通道、不造空依据；检索融合明确不加第四通道
date: 2026-11-17
status: 定稿
owner: hana
upstream: [SPEC-6.2 蒸馏点, SPEC-3.12 预案器, CONSUMER-AUDIT §四 6.10, D10]
---

# SPEC-6.10 · 蒸馏点消费（points_json → 预案依据）

> 现状：`distill_points.points_json` 有写无读——三个读点只查「有没有这行」（capability-dispatch 查存在、self-optimize 查消费、distill-points 查 digest），内容一次没被用过。
> 本件给它一个真消费者：**predict 的预案依据**。零写、零新表、不新增排序旋钮。

---

## 一、目标

1. 预案卡的 `basis` 增一类 `point`：取该会话**关联实体**的蒸馏点首条，作为「有据」的最短事实。
2. 只读：不写表、不碰 `last_access`、不改 `distill_points`。
3. 不造依据：没有蒸馏点就不加 `point` 条目，不写空 quote、不补占位。
4. **检索融合不加第四通道**——无基线可校，多一通道只是多一个摆设；明确不做。

---

## 二、行为（spec 即契约）

### 2.1 依据来源与顺序

- 每张卡的 `basis` 顺序：① 会话原文（`kind:'conversation'`）→ ② 蒸馏点（`kind:'point'`）→ ③ 候选边连到的会话（`kind:'sprout'`）。
- `point` 取法：查该会话的活跃边（不分方向、`invalid_at IS NULL`），按 `strength DESC, 对端 id ASC` 取前 5 个对端；逐个查 `distill_points.points_json`，取**首个非空点**；命中即止。
- `quote` 截 80 字，与既有 `QUOTE_MAX` 同口径。
- `id` 用蒸馏点所属实体 id（`base_id`），可点回原文。

### 2.2 不造依据

- 无关联实体、无蒸馏点行、`points_json` 解析失败或为空数组 → 不加 `point` 条目；`basis` 结构不出现空值。
- 空库仍走原冷启动卡（SPEC-3.12 AC-3 不变）。

### 2.3 信心带

- 沿用 `_band`：`basis` 出现 ≥2 类 → `high`；同类 ≥2 条 → `mid`；其余 `low`。
- `conversation + point` 两类即 `high`（蒸馏点与原会话是独立来源）。

### 2.4 确定性与纯读

- 同一库、同一消息，两次 `predict` 的 `basis` 序列（kind/id/quote）逐项相同。
- 前后库指纹（entities / links / distill_points / entity_vectors / meko_cycles）一致。

---

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | point 依据出现 | 会话有带蒸馏点的关联实体 → `basis` 含 `kind:'point'`，`quote` = 首条点（≤80） |
| AC-2 | 不造依据 | 无蒸馏点 → 无 `point` 条目；任何 `point` 的 `quote` 非空 |
| AC-3 | 信心带 | `conversation + point` → `high` |
| AC-4 | 纯读 | 五表计数前后一致；源码无写语句 |
| AC-5 | 确定性 | 两次调用 `basis` 序列逐项相同 |

---

## 四、Non-Goals

- 不改 `distill_points` 表结构，不改抽取算法（SPEC-6.2 契约不动）。
- 不把蒸馏点喂进检索融合排序（见目标 4）。
- 不改 memo 预案展示、不改 6.2 的 digest 幂等。

---

## 五、契约

- `predict(store, {message})` 返回的 `plans[].basis[]` 增 `{kind:'point', id:<base_id>, quote:<≤80 字>}`；其余字段不变。
- 关联边取前 5、每卡最多 1 条 `point`。

---

## 六、依赖

- 上游：SPEC-6.2（蒸馏点落表）、SPEC-3.12（预案器）、CONSUMER-AUDIT 缺口 6.10。
- 消费者：memo 预案段、CLI `memo`。
