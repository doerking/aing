---
tags: [aing-v2, spec, 入库主线, 采集痕迹剥除, C10g, C10h, auto-ingest, M3, spec:9, ingest:9]
description: M3.5 入库主线 spec——auto-ingest 把三源先过指纹剥除再入库；产生段与蒸馏毛段双向钉（produced ⊆ raw）；剥除计数非零可证；唔另抄正则
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-3.13, SPEC-3.6, 核读 §2/§3, C10g/C10h]
---

# SPEC-3.5 · 入库主线（采集痕迹剥除）

> 原院 C10h 的教训：采集痕迹（引用编号、检索标记、来源行）如果原样入库，
> 之后蒸馏与检索都会被这些噪声带偏。v2 把剥除做成入库主线的**必经一步**，
> 并用「产生段 ⊆ 蒸馏毛段」的双向钉，保证两处唔会各写各的。

---

## 一、目标

三源先剥采集痕迹再入库；剥除次数可证（>0）；产生段与毛段契约双向一致。

## 二、行为（spec 即契约）

### 2.1 剥除（`scrubCollectionTrace`）
剥除以下痕迹，返回 `{ text, scrubbed }`：
- 行首引用：`引用:1` / `引用：1`
- 行首来源：`来源:` / `Source:` / `URL: http…`
- 内联引用标记：`[cite: …]` / `[citation: …]`
- 检索标记：`【检索】` / `【搜索】`

`scrubbed` = 剥除处数（去空白后仍计数），供 C10h 断言用。

### 2.2 主线（`autoIngest`）
1. 身份闸（3.6）：actor 必须 `hana`
2. 三源逐项剥除：`reply` / `searchShown[]` / `rationale`
3. 交 `ingestSession` 落库（G1 缺回复拒入）
4. 返回 `{ ingested, id, scrubTrace }`

### 2.3 双向钉（C10g）
- `PRODUCED_SECTIONS = ['用户提问','Agent 回复','Agent 分析','收集资料']`
- `RAW_SECTIONS` 至少含上述四段（⊇）
- 违反 → 抛 `section-contract-violation`

### 2.4 铁律
- 唔碰 `last_access`；无物理 DELETE

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 痕迹真剥 | 回复含引用/来源/cite → 落库正文唔含，`scrubTrace ≥ 3` |
| AC-2 | 三源都剥 | searchShown 与 rationale 的痕迹同样剥净 |
| AC-3 | 双向钉 | `PRODUCED_SECTIONS ⊆ RAW_SECTIONS` 且四段齐；不一致即抛 |
| AC-4 | 身份闸串联 | actor≠hana → 拒，实体数不变 |
| AC-5 | 缺回复拒入 | reply 剥后为空 → `reply-required` |
| AC-6 | 铁律 | 无物理删；原有实体 `last_access` 不变 |

## 四、Non-Goals

- 不做 HTTP/CLI 控制面（3.2）
- 不做内容摘要改写
- 不做蒸馏（1.5）

## 五、契约

- `scrubCollectionTrace(text) -> {text, scrubbed}`
- `autoIngest(store, {actor, sessionId, at, topic, reply, searchShown, rationale, outcome}) -> {ingested, id, scrubTrace}`
- `PRODUCED_SECTIONS`、`RAW_SECTIONS`、`assertSectionContract()`

## 六、依赖

- 上游：SPEC-3.13（三源）、SPEC-3.6（写面闸）
- 消费者：3.7–3.10 门禁
