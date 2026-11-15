---
tags: [aing-v2, spec, 核心代谢, link, 双铰链, M1, spec:9, link:8]
description: M1.2 link 同步步 spec——auto-link 弃自由生长改三轴夹出判定，按类型配对矩阵建边，invalid_at 逻辑退役
date: 2026-11-13
status: draft（待 owner review）
owner: ring
upstream: [ARCHITECTURE-全架构重写图纸-DNA双铰链-从零实现-2026-11-13.md §1.2/§五, SPEC-0.4, SPEC-0.1]
---

# SPEC-1.2 · link 同步步（三轴夹出建边）

> 第 1 期核心代谢循环的 link 步。图纸 §1.2：auto-link 弃「两两自由生长」，改**三轴夹出判定 + 类型专一配对**。
> 本步是 SPEC-0.4 判定（shouldEnterRetrieval / isTypePairingLegal）的直接消费者。M0 未覆盖代谢编排，本 spec 补 link 步语义为 source of truth。

---

## 一、目标

把候选边喂三轴判定，只让**三轴全过**的边入 links 表；prune 语义走 invalid_at 逻辑退役（非物理 DELETE）。

## 二、行为（spec 即契约）

### 2.1 建边
- 候选边 = { source_id, target_id, relation, source_type, target_type, confidence }。
- confidence→strength 段位（SPEC-0.1 §五映射）：0.8+→8 / 0.6-0.79→7 / 0.4-0.59→5 / 0.3-0.39→3。
- **只建 strength≥7 且配对合法的边**（入口级）；<7 但≥3 的边仍可入表但不进检索入口（时效/调度层管）。
- 写 links 表（strength 段位列、invalid_at=NULL）。

### 2.2 退役（可逆）
- 退役边 = 打 invalid_at 戳（非 DELETE）。清戳即复活。

### 2.3 compile 永不碰 last_access
- P0 换锚铁律：本步（及所有代谢步）不写 entities.last_access，只有检索命中写。

## 三、Acceptance Criteria（可客观检验）

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | confidence→strength 映射 | confidence 0.85→8 / 0.7→7 / 0.5→5 / 0.35→3 |
| AC-2 | 三轴夹出建边 | strength≥7 + 配对合法 → 入表；Todo→Concept（配对非法）→ 不入表 |
| AC-3 | 退役可逆 | 退役边打 invalid_at 戳；查有效边（invalid_at IS NULL）不含它；清戳后复现 |
| AC-4 | compile 不碰 last_access | link 步跑后 entities.last_access 不变 |
| AC-5 | 幂等 | 同候选边连跑 2 趟不炸（PK 冲突按 OR IGNORE/已存在跳过） |

## 四、Non-Goals

- 不做检索入口过滤（那是读取层 shouldEnterRetrieval 的职责，SPEC-0.4）。
- 不做向量检索（vector 步另立）。
- 不做意识层调度（时界 G 节点属 0.3/第 3 期）。

## 五、依赖

- 上游：SPEC-0.4（判定）、SPEC-0.1（links 表）
- 实现：M1 任务 1.2（tri-axis-link.js）

---

> 第 1 期按垂直切片推进，每步独立 spec + failing test + ALL GREEN。