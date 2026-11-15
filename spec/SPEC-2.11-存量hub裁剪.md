---
tags: [aing-v2, spec, hub裁剪, degree-cap, 场域带, M2, spec:9, hub-trim:9]
description: M2.11 存量 hub 裁剪 spec——另立裁剪机制处理已超额存量的高度节点，按强度留 cap 条、其余逻辑退役并写原因码，误删=0 负向证、全可逆、不改准入阈值
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.4, SPEC-1.6, SPEC-0.1 修订 F, SPEC-2.10]
---

# SPEC-2.11 · 存量 hub 裁剪（hub-trim）

> 准入侧的 `applyDegreeCap` 只管「检索时取几条」，管不到**库里早已超额**的高度节点。
> 存量 hub 会把场域的强度分布拖偏：一边几百条边，另一边无人问津。
> 本件另立裁剪机制，**唔改准入阈值**，只把存量的超额部分逻辑退役，且每一步都留原因与退路。

---

## 一、目标

把现存高度节点的有效边按强度留 `degreeCap` 条，其余逻辑退役；误删=0、全可逆、只碰 `invalid_at/invalid_reason`。

## 二、行为（spec 即契约）

### 2.1 度数口径
- 度数 = 该实体**任一方向**的有效边数（`invalid_at IS NULL`）
- 基线 `degreeCap` 默认 8（SPEC-0.4 入口带口径），可经 opts 覆盖

### 2.2 裁剪轮次
- 取所有度数 > cap 的实体，按超额从大到小逐个体处理
- 候选 = 该实体全部有效边，按 `strength DESC, confidence DESC, created_at ASC` 排序
- 保留前 `cap` 条；其余进入裁剪集

### 2.3 只让弱边（误删=0 的负向证）
- 只有 **`strength < weakBelow`（默认 5）** 的边可让位——场域带 4–6 段以下的弱边才剪，
  入口带 7+ 与中段强边一律唔动（「非改准入」的另一半：唔降门槛，也唔砍强关系）
- 落刀前先问对端：若对端**本身也超 cap**，则跳过交由对端自己裁（唔抢别家名额、唔造成双重削减）
- 结果不变量：
  - 任何被退役的边 `strength < weakBelow`
  - 任何被退役的边至少一端裁剪前超 cap
  - 度数 ≤ cap 的节点，其边 0 变化

### 2.4 落刀
- 从最弱起裁（`strength ASC, created_at ASC`），裁到该节点度数 = cap 即停
- `invalid_at = now`；`invalid_reason = 'hub-trim'`
- 只写这两列；`strength / confidence / relation / evidence / created_at` 一律不动
- **无物理 DELETE**

### 2.5 可逆
- `restoreHubTrim(store, opts)`：把 `invalid_reason = 'hub-trim'` 且 `invalid_at` 非空的边恢复为 `invalid_at = NULL, invalid_reason = NULL`
- 恢复只按原因码，不碰其它原因退役的边

### 2.6 幂等
- 第二趟 `trimmed = 0`（已到 cap 或已无可退役候选）

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | hub 裁到 cap | 12 条边的 hub、cap=8 → 有效边 8 条，退役 4 条，留的是最强 8 条 |
| AC-2 | 误删=0 负向证 | 每条退役边 `strength < 5` 且至少一端裁剪前超 cap；无强边被退 |
| AC-3 | 不改准入 + 小节点零动 | `STRENGTH_THRESHOLD` 不变；度数 ≤ cap 的节点有效边 0 变化 |
| AC-4 | 可逆 | `restoreHubTrim` 后 hub 有效边回 12 条，原因码清空 |
| AC-5 | 幂等 | 第二趟 trimmed=0，有效边数不变 |
| AC-6 | 只碰两列 + 无物理删 | strength/confidence/relation 逐列不变（links 无 last_access 列）；实体 last_access 不变；源码无 `DELETE FROM` |

## 四、Non-Goals

- 不改准入阈值 / 不改 `applyDegreeCap`（准入归 SPEC-0.4）
- 不删实体、不做 prune 三条件退役（1.13）
- 不做场域维护动作 rebond/unwind（2.12）
- 不做提升（2.13）

## 五、契约

- 组件 id `hub-trim`，strand `cross`，band `field`，reads `['links']`，writes `['links']`，budgetTick 1，reversible true
- 入口：
  - `trimHubs(store, { degreeCap = 8, weakBelow = 5 }) -> { hubs, trimmed, skippedNeeded }`
  - `restoreHubTrim(store, {}) -> { restored }`

## 六、依赖

- 上游：SPEC-0.4（入口带 cap）、SPEC-1.6（边形状）、SPEC-0.1 修订 F（原因码）
- 消费者：2.12 场域维护、2.13 提升、SPEC-0.8 T2 度量
