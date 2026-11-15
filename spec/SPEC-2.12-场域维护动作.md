---
tags: [aing-v2, spec, 场域维护, 场域带, rebond, unwind, reconcile, demote, M2, spec:9, field:9]
description: M2.12 场域维护动作 spec——rebond 补键 / unwind 断噪 / reconcile 双链对返 / demote 降级，只在 6/5/4 段作业（跨界须显式跨步），每动作留前像后像且全可逆
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.6 §场域动作 I1/I3, SPEC-0.2, SPEC-1.4, SPEC-0.1 修订 G, SPEC-2.11]
---

# SPEC-2.12 · 场域维护动作（rebond / unwind / reconcile / demote）

> 中间 6/5/4 段是场域的作业面：弱键要补、噪键要断、双链缺口要返、证据不足要降。
> 四类动作全部**只在 6/5/4 段**动手（I1）；每一下都留前像后像，任何一下都能原样撤回（I3）。
> 动作账 `field_actions` 只增不删——这是 T1 复核与「全可逆」的凭据。

---

## 一、目标

在 6/5/4 段内完成补键、断噪、对返、降级四类维护；每动作记账、可撤回；强段（7/8/9）非显式跨步唔碰。

## 二、行为（spec 即契约）

### 2.0 带界（I1）
- 场域作业面 = `tolaria_strength ∈ {4,5,6}`
- 非带内实体：rebond/unwind/reconcile **一律跳过**并计数（`skippedOutOfBand`）
- `demote` 是显式跨步：只接 `7→6`、`6→4` 两种跨法；其余强度（8/9/1/2/3）拒绝（返回理由，不改库）

### 2.1 rebond（补键）
- 面：raw 链、强度 ∈ 带、有 wiki 镜像、且两链之间无有效氢键
- 动：插 `hydrogen-bond` 边（`strength` 按 SPEC-1.4 映射、`confidence` 照抄源实体）
- 账：`action='rebond'`，`target='<raw>-><wiki>'`

### 2.2 unwind（断噪）
- 面：有效氢键，且两端内容**不一致**（互校矛盾=噪声）
- 动：`invalid_at=now`、`invalid_reason='unwind'`；不物理删
- 账：`action='unwind'`

### 2.3 reconcile（双链对返）
- 面：带内实体在另一链缺同位（raw 无 `wiki-<base>`，或 wiki 无 `raw-<base>`）
- 动：按对端内容建缺失位（字段逐列复制，`status` 照对端），tags 保留原样
- 账：`action='reconcile'`，`target='<新 id>'`
- 唔补链：对返只补「有没有」，分歧本身留给互校报告

### 2.4 demote（降级）
- 面：强度 7 或 6、且**无任何有效边**（证据不足）
- 动：7→6、6→4；其余强度拒绝
- 账：`action='demote'`，`before_json` 记原强度

### 2.5 可逆（I3）
- `revertFieldAction(store, id)`：
  - `rebond` → 该边 `invalid_at=now, invalid_reason='revert'`
  - `unwind` → 该边 `invalid_at=NULL, invalid_reason=NULL`
  - `reconcile` → 补出的实体 `invalid_at=now, invalid_reason='revert'`
  - `demote` → 实体强度恢复 `before_json.strength`
- 撤销后 `reversed_at=now`；已撤销的动作再撤 → 返回 `alreadyReversed`，不重复动

### 2.6 铁律
- 不碰任何 `last_access`；无物理 DELETE；账本只增

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 带界（I1）| 强度 8 的 raw 缺镜像/缺键 → 三类动作均不动它；demote(8) 被拒且强度不变 |
| AC-2 | rebond 补键 | 带内 raw 有镜像无键 → 键在（hydrogen-bond、strength 按映射）|
| AC-3 | unwind 断噪 | 双链内容不一致的氢键 → `invalid_at` 非空、`invalid_reason='unwind'`；同内容的键不动 |
| AC-4 | reconcile 对返 | 带内 raw 缺镜像 → 镜像出现且内容逐字等于源；非带内不补 |
| AC-5 | demote 降级 | 强度 7 无边 → 6；强度 6 无边 → 4；强度 6 有边 → 不动 |
| AC-6 | 全可逆（I3）| 四个动作各撤一次 → 键复原/镜像退役/强度复原；`reversed_at` 非空；再撤返回已撤销 |
| AC-7 | 记账 | 每动作一行 `field_actions`（action/target/before/after/cycle_id 齐）|
| AC-8 | 铁律 | `entities/links` 无物理删；全部实体 `last_access` 不变；源码无 `DELETE FROM` |

## 四、Non-Goals

- 不做提升（promote/sprout/pollinate 归 2.13）
- 不做强度升降的判断策略（何时升何时降由进化团给建议，本件只执行可证的具体动作）
- 不做互校报告本身（1.14 crosscheck 出 gap；本件只对返）
- 不做 hub 裁剪（2.11）

## 五、契约

- 组件 id `field-maintain`，strand `cross`，band `field`，reads `['entities','links']`，writes `['entities','links','field_actions']`，budgetTick 1，reversible true
- 入口：
  - `rebond(store, { cycleId }) -> { scanned, bonded, skippedOutOfBand }`
  - `unwind(store, { cycleId }) -> { scanned, unwound }`
  - `reconcile(store, { cycleId }) -> { gaps, reconciled, skippedOutOfBand }`
  - `demote(store, { cycleId, entityId? }) -> { demoted: [{id, from, to}], refused: [{id, reason}] }`
  - `revertFieldAction(store, id) -> { reverted?, alreadyReversed? }`
  - `IN_FIELD_BAND = [4,5,6]`

## 六、依赖

- 上游：SPEC-0.6（场域动作表）、SPEC-1.4（映射与镜像前缀）、SPEC-0.1 修订 G（动作账）
- 消费者：2.13 提升、SPEC-0.8 T1 复核、T2 度量
