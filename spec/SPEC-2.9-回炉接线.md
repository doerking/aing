---
tags: [aing-v2, spec, 回炉, recycle, 闭环, M2, spec:9, recycle:9]
description: M2.9 回炉接线 spec——压缩籽回炉成 MetaKnowledge 微粒实体（每粒一次），作为编排步骤注册进代谢链并有门禁断言，堵住旧院回炉单向泄漏
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.1 修订 D, SPEC-1.11, SPEC-1.14, SPEC-0.6]
---

# SPEC-2.9 · 回炉接线（recycle）

> 旧院最伤的缺口：recycle-seeds **不在代谢 STEPS、无守护**，压缩单向泄漏（核读 §2.3）。
> v2 把它做成一等步骤：注册进编排器、每粒回炉一次、有门禁断言证明「链上真有它」。

---

## 一、目标

把已压缩、未回炉的籽回炉成 MetaKnowledge 微粒实体，并让回炉成为代谢链的正式步骤。

## 二、行为（spec 即契约）

### 2.1 回炉
- 取 `compressed_seeds` 中 `active=1 AND recycled=0`
- 生成实体 `mz-<entity_id>`：type `MetaKnowledge`，name `回炉·<原实体名>`，content = 原内容首 200 字 + `\n\n[recycled-from:<entity_id>]`，tags 含 `recycled:5`，status active
- 标记该籽 `recycled=1`（每粒只回炉一次）

### 2.2 链上位置（门禁）
- 回炉组件以契约注册进 `MekoOrchestrator`（band `field`），并出现在默认代谢步骤表中
- **门禁断言**：编排器注册的步骤 id 集合包含 `recycle`；缺即 M2 门不过

### 2.3 铁律
- 不物理删籽行；不碰 `last_access`；幂等（第二趟 recycled=0）

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 籽回炉成微粒 | mz 实体存在，type=MetaKnowledge，content 含 recycled-from 血统 |
| AC-2 | 每粒一次 | 第二趟 recycled=0，mz 实体数不变 |
| AC-3 | 未压缩/已解压籽不回炉 | active=0 的籽不回炉 |
| AC-4 | 链上可见 | 默认代谢步骤含 `recycle`（门禁断言）|
| AC-5 | 铁律 | 无 `DELETE FROM`；last_access 不变 |

## 四、Non-Goals

- 不做残壳归档（旧院阶段 2 的 DB 清理，v2 由 prune/1.13 管）
- 不做回炉质量评分（KESPI 自动覆盖）
- 不写文件

## 五、契约

- 组件 id `recycle`，strand `raw`，band `field`，reads `['compressed_seeds']`，writes `['entities']`，budgetTick 1，reversible true
- 入口：`async recycleStep(store, opts) -> { scanned, recycled, skipped }`

## 六、依赖

- 上游：SPEC-1.11（籽）、SPEC-0.1 修订 D（recycled 列）、SPEC-1.14（编排）
- 消费者：2.10 守恒闸（回炉闭环断言）
