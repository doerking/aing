---
tags: [aing-v2, spec, 核心代谢, pollinate, 授粉, 跨域, M1, spec:8, pollinate:8]
description: M1.10 pollinate spec——跨类型实体对按「跨域+标签/关键词」证据授粉，场域带 4-6 段，与 sprout 分工明确（同域发芽/跨域授粉）
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-1.9, SPEC-0.1 §2.4, SPEC-0.6]
---

# SPEC-1.10 · pollinate（授粉）

> sprout 管同域（同类型之间发芽），pollinate 管跨域（不同类型之间授粉）。
> 跨域本身算第一类证据；再叠加共享标签或关键词重叠，≥2 类才成粒——防止「万物互联」式滥发。

---

## 一、目标

在**不同类型**的有效实体对之间按跨域证据产候选边，落场域带 4–6 段。

## 二、行为（spec 即契约）

### 2.1 候选面
- 有效实体，上限 200；已有边（任一方向）跳过
- **两端 type 相同 → 跳过**（同域归 sprout）
- type 为空 → 不参与（避免空类型互相授粉）

### 2.2 证据
| 类 | 判据 |
|---|---|
| `cross` | 两端类型不同（基础证据，恒计 1 类）|
| `tag` | 共享标签（去 `:N` 后缀）|
| `kw` | 关键词重叠 ≥2 |

### 2.3 成粒
- ≥2 类 → 成粒；2 类 strength 4，3 类 strength 6
- relation `pollinate-candidate`；`evidence` JSON；每轮上限 4，下限 2（候选够时）

### 2.4 铁律
- 不碰 `last_access`/`invalid_at`；无物理删；幂等

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 同类型不授粉 | 同 type 两实体 → 无 pollinate 边 |
| AC-2 | 跨域+标签 → strength 4 | 不同类型 + 共享标签 |
| AC-3 | 跨域+标签+关键词 → strength 6 | 三类证据 |
| AC-4 | 每轮 2–4 粒 | 候选充足时 seeded ∈ [2,4] |
| AC-5 | 已有边跳过 + 幂等 | 同一对边不重复发种（PK 唯一 + 跑两趟无重复）|
| AC-6 | 铁律 | last_access 不变；源码无 `DELETE FROM` |

## 四、Non-Goals

- 同域发芽（1.9）
- 提升入入口带（2.13）
- 语义模型

## 五、契约

- 组件 id `pollinate`，strand `raw`，band `field`，reads `['entities','links']`，writes `['links']`，budgetTick 1，reversible true
- 入口：`async pollinateStep(store, { floor = 2, cap = 4 }) -> { scanned, pairs, seeded, skipped }`

## 六、依赖

- 上游：SPEC-1.9（证据词表复用）
- 消费者：2.10 守恒闸
