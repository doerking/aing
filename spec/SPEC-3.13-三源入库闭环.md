---
tags: [aing-v2, spec, 会话入库, 三源, 回喂, G1, G5, M3, spec:9, ingest:9]
description: M3.13 三源入库闭环 spec——回复/搜索展示/事由分析三源齐入 Conversation 实体，缺回复拒入（G1）；预案命中/落空经 feedback 实体与证据边回喂场域（G5）；幂等、无物理删
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.7 §2/G1/G5, SPEC-1.1, SPEC-1.2]
---

# SPEC-3.13 · 三源入库闭环 + 回喂门禁

> 成长只认会话三源（SPEC-0.7）：只入最终回复 = 只存结论唔存推理。
> 本件把三源齐入做成一次写入，再把预案的命中/落空接成 feedback 回喂——
> 预判与维护共用一套证据，唔另立账。

---

## 一、目标

一次会话写入 Conversation 实体并带齐三源；缺回复拒入（G1）；预案命中/落空写成反馈实体 + 证据边（G5）。

## 二、行为（spec 即契约）

### 2.1 三源入库（G1）
- 输入：`{sessionId, at, topic, reply, searchShown, rationale}`
- 实体 id `conv-<sessionId>`，type `Conversation`
- content = JSON：`{ topic, at, reply, searchShown: [...], rationale }`
- tags 必含 `conv:9` 与三源标记 `src:reply` / `src:search` / `src:rationale`
- **回复为空** → 抛 `reply-required`，唔写任何行
- 搜索展示与事由分析允许为空数组/空串，但**标签照留**（三源结构在，值可为空）

### 2.2 幂等
- 同 `sessionId` 再入 → `skipped`，实体数不变、内容不变

### 2.3 回喂（G5）
- `recordPlanFeedback(store, {planId, hit, basisIds})`：
  - 实体 `fb-<planId>`，type `Feedback`，tags 含 `plan-hit` 或 `plan-miss`
  - 对每个 `basisIds` 建边 `conv-<id>` → `fb-<planId>`（relation `feedback-evidence`），缺实体则跳过并计数
  - 同 plan 重复回喂 → 幂等（不重复插边）
- 命中/落空各回喂一次 → 证据边数随之变化（AC-4）

### 2.4 铁律
- 不碰 `last_access`；无物理 DELETE

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 三源齐入 | `conv-s1` 存在，content JSON 三源字段齐，tags 含三源标记 |
| AC-2 | 缺回复拒入（G1）| reply 空 → 抛 `reply-required`，实体数不变 |
| AC-3 | 幂等 | 同 sessionId 再入 → skipped，内容与行数不变 |
| AC-4 | 回喂（G5）| hit → `fb-*` 带 `plan-hit`、证据边 +1；miss → `plan-miss`；重复回喂不重复插边 |
| AC-5 | 铁律 | 无物理删；原有实体 `last_access` 不变 |

## 四、Non-Goals

- 不做自动打分/摘要改写（三源原文入）
- 不做搜索源内容抓取（由调用方给）
- 不做 memo 渲染（3.11）、不做预案生成（3.12）

## 五、契约

- `ingestSession(store, payload) -> {ingested, id} | {skipped}`
- `recordPlanFeedback(store, {planId, hit, basisIds}) -> {recorded, id, edges}`
- `SOURCES = ['reply','search','rationale']`

## 六、依赖

- 上游：SPEC-0.7（三源语义）、SPEC-1.1（实体形状）
- 消费者：3.11 memo、3.12 predict
