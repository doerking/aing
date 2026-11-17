---
tags: [aing-v2, spec, 核心代谢, sprout, 发芽, 候选边, M1, spec:8, sprout:8]
description: M1.9 sprout spec——从共享标签/关键词重叠/共同邻居三类证据中发现候选边，≥2 独立证据才成种，落场域带 4-6 段，每轮产出 2-4 粒（sproutFloor）
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.1, SPEC-0.4, SPEC-0.6, SPEC-1.8]
---

# SPEC-1.9 · sprout（发芽）

> 旧院 sprout 在链上只产报告、不建链（核读 §2.4），且中文分词失效 → 36 轮零产出。
> 本步直接产**候选边**（场域带 4–6 段），每粒必带证据列表，并设每轮最低产出（sproutFloor 2）——
> 这是守恒闸（2.10）成立的前提。

---

## 一、目标

在无既存边的有效实体对之间，按三类证据发种；候选边落 4–6 段，每轮 2–4 粒。

## 二、行为（spec 即契约）

### 2.1 候选面
- 有效实体（`invalid_at IS NULL`），上限 200 个（按 `updated_at` 倒序取，防全量 O(n²)）
- 已有边的实体对（任一方向）跳过

### 2.2 三类证据
| 类 | 判据 |
|---|---|
| `tag` | 共享标签（去 `:N` 强度后缀后比对）|
| `kw` | 关键词重叠 ≥2（CJK 双字 + 拉丁词，停用词不算）|
| `neighbor` | 共同邻居 ≥2（links 有效边）|

### 2.3 成种
- **≥2 条独立证据**才成种（不同类计数，同类多条算一条）
- strength：2 类 → 4；3 类 → 6（落场域带，唔入检索入口）
- relation `sprout-candidate`；`evidence` 存 JSON 数组；`invalid_at` NULL
- **sproutFloor**：本轮产出下限 2、上限 4（候选够就按证据数排序取前 4，不足 2 有多少出多少）

### 2.4 铁律
- 不碰 `last_access`、`invalid_at`；无物理删；幂等（同一对不重复发种）

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 单类证据不成种 | 只共享 1 个标签 → 无候选边 |
| AC-2 | 两类证据成种 + strength 4 | 共享标签 + 关键词重叠 → 边存在，strength=4，evidence 含 2 类 |
| AC-3 | 三类证据 strength 6 | 再加共同邻居 → strength=6 |
| AC-4 | sproutFloor | 候选充足时本轮产出 ∈ [2,4] |
| AC-5 | 已有边不发种 + 幂等 | 预置边不重复；第二趟 seeded=0 |
| AC-6 | 铁律 | 实体 last_access 不变；源码无 `DELETE FROM` |

## 四、Non-Goals

- 不做提升（≥2 证据入入口带归 2.13）
- 不做跨域配对（1.10 pollinate）
- 不做语义模型
- 不写文件

## 五、契约

- 组件 id `sprout`，strand `raw`，band `field`，reads `['entities','links']`，writes `['links']`，budgetTick 1，reversible true
- 入口：`async sproutStep(store, { floor = 2, cap = 4 }) -> { scanned, pairs, seeded, skipped }`

## 六、依赖

- 上游：SPEC-0.4（三轴）、SPEC-0.1 §2.4（evidence 列）
- 消费者：2.10 守恒闸、2.13 提升

## 七、修订 A（2026-11-18，退役边仍占位）

- 事故：真库轮次在 sprout 撞 `UNIQUE constraint failed: links.source_id, links.target_id`，与 pollinate 同源（SPEC-1.10 §七）。
- 根因：去重集合只装 `invalid_at IS NULL` 的边；边表主键与 `invalid_at` 无关，退役边仍占 PK。
- 契约：去重集合装全部边行（含退役），退役边按「已存在」跳过，不自动复活。
- 测试：test-1.9-sprout AC-7。
