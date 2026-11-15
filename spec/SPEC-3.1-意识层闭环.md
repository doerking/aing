---
tags: [aing-v2, spec, 意识层, 内核状态机, stagnation, 注意力, M3, spec:9, kernel:9]
description: M3.1 意识层闭环 spec——注意力五因子加权、六态状态机、recordCycleResult 为 stagnationCount 唯一写者；连续 3 轮无产出转 stagnant 并落断路器记录；状态可读可复现
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.7, SPEC-2.15, SPEC-0.1 修订 J, 核读 §3.2]
---

# SPEC-3.1 · 意识层闭环（stagnationCount 真写端）

> 原院状态机写咗，但 `stagnationCount` 只有一处写者、调用点单一，且「停滞」只在事后记账。
> v2 把状态机接成闭环：**每轮代谢结果都入 kernel**，连续无产出就转 `stagnant` 并留断路器记录——
> 这是「退化信号 → 自动报警」的唯一真实信号源（SPEC-0.8 D4）。

---

## 一、目标

注意力可算、状态可迁移、停滞可累积；`recordCycleResult` 是 `stagnationCount` 唯一写者；状态可读。

## 二、行为（spec 即契约）

### 2.1 注意力（五因子）
`attention = vitality*0.3 + recency*0.25 + connectionDensity*0.2 + anomaly*0.15 + userInterest*0.1`
- `vitality`：KESPI overall 均值（无则 0.5）
- `recency`：最近会话距今天数 `exp(-days/7)`
- `connectionDensity`：`min(1, 有效边数 / (实体数*5))`
- `anomaly`：`min(1, 告警数 / 5)`（无告警 0）
- `userInterest`：未闭环会话占比

### 2.2 状态机（六态）
- `idle / sensing / integrating / focused / aroused / stagnant`
- 有事件时按 attention：`≥0.8 → aroused`、`≥0.6 → focused`、`≥0.4 → integrating`、否则 `sensing`；无事件 → `idle`
- 停滞态优先：一旦 `stagnationCount ≥ 3` → `stagnant`（直到下次有产出）

### 2.3 停滞计数（唯一写者）
- `recordCycleResult(store, {cycleId, ok, actions})`：
  - `actions` 合计 > 0 → 有产出：`stagnationCount = 0`
  - 否则 `+1`
  - `≥3` 写 `breaker_json = {at, cycleId, cycles}`，状态置 `stagnant`
- 只有本函数写 `stagnation_count`；其它地方一律只读

### 2.4 只读面
- `kernelStatus(store)`：返回状态、attention、停滞数、断路器；**纯读**

### 2.5 铁律
- 唔碰 `last_access`；无物理 DELETE

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 注意力五因子 | 造数据 → attention ∈ [0,1]，五因子各自可复算 |
| AC-2 | 状态迁移 | 高 attention + 事件 → aroused；无事件 → idle |
| AC-3 | 停滞累积 | 连 3 轮无产出 → count=3、state=stagnant、breaker 非空 |
| AC-4 | 有产出清零 | 第 4 轮有产出 → count=0、退出 stagnant |
| AC-5 | 唯一写者 | 源码中 `stagnation_count` 只在 `recordCycleResult` 出现写语句 |
| AC-6 | 只读状态 | `kernelStatus` 跑前后行数不变 |

## 四、Non-Goals

- 不做 30s tick / 事件总线（原院 poll 型；v2 由编排轮驱动）
- 不做简报生成（memo 3.11 负责）
- 不做审批链（W2 归 3.2）

## 五、契约

- `computeAttention(store) -> {attention, factors}`
- `observe(store, {events}) -> {state, attention}`
- `recordCycleResult(store, {cycleId, ok, actions}) -> {stagnationCount, state, breaker}`
- `kernelStatus(store) -> row`
- `STATES = ['idle','sensing','integrating','focused','aroused','stagnant']`

## 六、依赖

- 上游：SPEC-0.7、SPEC-2.15（轮结果）、SPEC-0.1 修订 J
- 消费者：2.15 D4 停滞维、memo 系统行、3.2 控制面
