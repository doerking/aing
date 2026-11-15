---
tags: [aing-v2, spec, 守恒闸, conservation, 场域带, M2, spec:9, conservation:9]
description: M2.10 守恒闸 spec——每轮以「发芽产出 / 退场数量」计守恒比，落 meko_cycles 度量列并判定是否在 [0.8,1.5] 带内；失衡只报警不擅改，长跑 36 轮每轮有产出
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.6 I5, SPEC-0.8 D3/T2, SPEC-1.9, SPEC-1.11, SPEC-1.13, SPEC-2.9]
---

# SPEC-2.10 · 守恒闸（conservation gate）

> 旧院最隐的健康指标：守恒比归零（只剪不长或只长不剪），而无人计量（核读 §2.4/§2.5）。
> v2 把守恒做成每轮必算、必落盘的读数：**量出来，判出来，但不擅自动手**——
> 处置权归进化团 T2 与场域件，闸只出评分与告警（I10）。

---

## 一、目标

每轮代谢后量出「发芽产出 / 退场数量」，写入 `meko_cycles` 度量列；比出 [0.8, 1.5] 带内与否；
带外只报警，不剪不发。

## 二、行为（spec 即契约）

### 2.1 计量口径（窗口默认 30 天，`since` 可覆盖）
- **growth**：`links` 中 `relation IN ('sprout-candidate','pollinate-candidate')` 且 `created_at >= since` 的行数
- **pruned**：`entities` 中 `invalid_at >= since` 的行数
- **ratio**：
  - `pruned > 0` → `growth / pruned`
  - `pruned = 0 且 growth > 0` → `Infinity`（只长不剪）
  - 两者皆 0 → `1`（无动作，视为持平）

### 2.2 判定
- `inBand = ratio >= 0.8 && ratio <= 1.5`
- `verdict`：
  - `balanced`（带内）
  - `growth-only`（ratio > 1.5，含 Infinity）→ 告警：候选囤积，需退场/提升消化
  - `prune-only`（ratio < 0.8，含 0）→ 告警：只剪不长，需供料或发芽恢复
  - `idle`（两者皆 0）→ 记 `balanced`，另置 `idle=true`

### 2.3 落盘（I9 纪律）
- 每轮 `runCycle` 写的 `meko_cycles` 行必须带 `growth` / `pruned` / `conservation_ratio` 三列
- 闸自身**不写** `entities` / `links`；**不碰** `last_access`；无物理删

### 2.4 发芽下限承接
- 守恒闸成立的前提是 sprout 每轮有产出（SPEC-1.9 sproutFloor 2–4）
- 长期运行中每轮 `seeded > 0`；某轮 `seeded = 0` → `idle` 计入，连续 3 轮 `idle` 由进化团 D4 报警

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 带内判 balanced | 造 growth=4 / pruned=4 → ratio=1，inBand=true，verdict=balanced |
| AC-2 | 只长不剪告警 | pruned=0、growth=3 → verdict=growth-only，inBand=false |
| AC-3 | 只剪不长告警 | growth=0、pruned=5 → ratio=0，verdict=prune-only |
| AC-4 | 长跑每轮有产出 | 36 轮（每轮新料 + 发芽）→ 每轮 `seeded ∈ [2,4]`，累计 ratio ∈ 带内 |
| AC-5 | 每轮落盘 | `runCycle` 每行 `meko_cycles` 的三列非空，且 `conservation_ratio` 与计量一致 |
| AC-6 | 闸不擅改 + 铁律 | 跑闸前后 `entities`/`links` 行数不变；`last_access` 不变；源码无 `DELETE FROM`/`INSERT INTO`/`UPDATE` |

## 四、Non-Goals

- 不做剪枝/退场动作（归 1.13 prune、2.12 场域维护）
- 不做提升（2.13）
- 不自动调参（带外只告警，处置权归进化团）
- 不做活性-连接相关（P8 待复核，M2 后段另立）

## 五、契约

- 组件 id `conservation`，strand `cross`，band `background`，reads `['links','entities']`，writes `['meko_cycles']`，budgetTick 1，reversible true
- 入口：
  - `measureConservation(store, { sinceDays = 30 }) -> { growth, pruned, ratio, inBand, verdict, idle }`
  - `conservationStep(store, opts)` → 注册步（返回计量结果，不写业务表）

## 六、依赖

- 上游：SPEC-1.9（产出）、SPEC-1.13（退场）、SPEC-1.10（跨域产出）
- 消费者：SPEC-0.8 T2 度量、pilot D3/D4
