---
tags: [aing-v2, spec, 闸东, 三闸, 审批边界, W2, M2, spec:9, gate:9]
description: M2.16 闸东真接 spec——canary/holdout/acceptance 三闸真接 promote，无闸记录必拒（I8）；醒目阈值改动必入 W2 审批队列；memo 只收提案卡片；入口带上移双重锁
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.8 §五/§六, SPEC-2.13, SPEC-2.14, SPEC-0.1 修订 I]
---

# SPEC-2.16 · 闸东真接 + 自治 / 审批边界

> 旧院 guardrails 写咗但全仓无调用点（核读 §4.3）——规则只在纸上，等于冇。
> 本件把三闸接到 promote 的真路径上：**冇闸记录就唔准升**（I8）；
> 而改可见阈值这类影响主驾与用户面的动作，一律入 W2 队列，唔系成员自己拍。

---

## 一、目标

三闸真接 promote 与提升路径并留痕；无闸记录一律拒；醒目改动入审批队列；memo 只收提案卡片；入口带上移双重锁。

## 二、行为（spec 即契约）

### 2.1 三闸（`runGates`）
| 闸 | 判据 |
|---|---|
| `canary` | 有基线时：候选分 ≥ 基线；无基线：证据非空 |
| `holdout` | 独立证据类 ≥ 2（防过拟合单一信号）|
| `acceptance` | 目标强度 ≤ 6 放行；目标 7+ 需 **doubleLock**（canary 与 holdout 同过）|
- 三闸全过 → `passed=true`；任一不过 → `passed=false` 并给 `failed:[...]`
- 每次判定落一行 `gate_records`（subject/kind/三闸 JSON/证据/基线）

### 2.2 无闸必拒（I8）
- `hasPassingGate(store, subject, kind)`：存在 `passed=1` 的闸记录才为真
- `requireGate(store, subject, kind)`：无则抛 `gate-required`
- promote 主路径：`promoteEntity` 先跑闸、写记录，未过即 `refused.reason='gate-rejected'`，唔改强度

### 2.3 审批边界（W2）
- 以下改动只可入 `approval_queue`（`status='pending'`），冇直接执行入口：
  - 可见阈值（KESPI 红黄阈）
  - 九段段位映射规则
  - T_bound / 轮数 / 预算上限
  - 任何影响主驾行为或用户可见面的改动
- `proposeChange(store, {kind, payload, reason}) -> {queued, id}`
- `decideChange(store, id, {approve})` 只改队列状态，唔代执行——执行由 owner 侧决定后另行发令

### 2.4 memo 提案卡片（I10）
- `proposalCards(store) -> [{title, body, items:[...]}]`：只读拼装待决审批 + 待消化候选 + pilot 定焦
- 唔写用户面、唔直接发消息

### 2.5 双重锁（AC-4）
- 入口带（6→7）上移需：场域证据 ≥2 类 **且** 闸记录 `passed=1` 且 `doubleLock=true`
- 缺一 → 拒

### 2.6 铁律
- 闸与队列只增；唔碰 `last_access`；无物理 DELETE

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 无闸必拒（I8）| 无闸记录时 `hasPassingGate=false`、`requireGate` 抛错；promote 自带闸记录，事后 `hasPassingGate=true` |
| AC-2 | W2 队列 | `proposeChange(kind='threshold')` → 队列 pending 一行；库内阈值未变 |
| AC-3 | memo 卡片 | `proposalCards` 返回含标题/正文/事项的卡片，且不写任何表 |
| AC-4 | 双重锁 | 基线高于候选 → canary 失败 → promote 拒绝、强度不变；基线低于候选 → 通过且记录 `doubleLock=true` |
| AC-5 | 三闸留痕 | 每次判定一行 `gate_records`，三闸结论可读 |
| AC-6 | 铁律 | 队列/闸表只增；`entities/links` 行数不变；源码无 `DELETE FROM` |

## 四、Non-Goals

- 不做自动化调阈（要 owner 拍板，本件只入队）
- 不做 memo 用户面渲染（3.11）
- 不做子agent / 外派（2.17 / 2.18）

## 五、契约

- `runGates(store, {subject, kind, evidence, baseline, targetStrength, cycleId}) -> {passed, failed, gates, recordId}`
- `hasPassingGate(store, subject, kind) -> bool`
- `requireGate(store, subject, kind) -> record | throws`
- `proposeChange(store, {kind, payload, reason}) -> {queued, id}`
- `decideChange(store, id, {approve}) -> {decided}`
- `proposalCards(store) -> cards[]`
- `THRESHOLD_KINDS = ['threshold','band-rule','budget','user-surface']`

## 六、依赖

- 上游：SPEC-0.8 §五/§六、SPEC-2.13（promote 路径）
- 消费者：3.11 memo、2.17/2.18
