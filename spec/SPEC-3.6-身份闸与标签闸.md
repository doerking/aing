---
tags: [aing-v2, spec, 身份闸, 标签闸, 写面, C10i, M3, spec:9, gate:9]
description: M3.6 身份闸与标签闸 spec——写面只认 hana 身份；客户端自报的 status/confidence/tags 一律忽略；自报标签只作「Agent 提议（未核验）」入正文，唔入 tags 列
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.7 G2, 核读 §3.3, C10i]
---

# SPEC-3.6 · 身份闸 + 标签闸（写面）

> 原院 C10i 是一条真实存在的闸：客户端写请求带咩身份、自报咩状态，服务端都唔照收。
> v2 保留这条闸——**身份只认 `hana`；客户端自报的 status/confidence/tags 一律唔入列**，
> 自报标签只作「Agent 提议（未核验）」附在正文，等蒸馏步去核。

---

## 一、目标

写面身份可拒；自报状态与置信被忽略；自报标签唔入 `tags` 列而只留提议段；闸自身可测。

## 二、行为（spec 即契约）

### 2.1 身份闸
- `actor` 必须 === `'hana'`；否则抛 `identity-rejected`
- 拒后唔写任何行

### 2.2 状态/置信闸
- 客户端 `status` 一律忽略 → 落 `pending-distillation`
- 客户端 `confidence` 一律忽略 → 落 `null`（由蒸馏/场域定）

### 2.3 标签闸
- 客户端 `tags` **唔入** `tags` 列
- 原样写入正文末段：`\n\n## Agent 提议（未核验）\n<tags 逐行>`
- `tags` 列只放服务端派生标签（无则 NULL）

### 2.4 落点
- 实体 id 按传入 `id`（需 `raw-` 前缀或合法 id）；已存在 → `exists`，不覆盖

### 2.5 铁律
- 唔碰 `last_access`；无物理 DELETE

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 身份闸 | actor≠hana → 抛 `identity-rejected`，实体数不变 |
| AC-2 | 自报状态忽略 | payload.status=active → 落库仍 pending-distillation |
| AC-3 | 自报置信忽略 | payload.confidence=0.99 → 落库为 null |
| AC-4 | 标签闸 | tags 列不含自报标签；正文含「Agent 提议（未核验）」段与标签原文 |
| AC-5 | 铁律 | 无物理删；`last_access` 不变；重复写同 id → exists 不覆盖 |

## 四、Non-Goals

- 不做 HTTP 服务本身（3.2 控制面）
- 不做标签核验策略（蒸馏/场域负责）
- 不做审批（W2 归 2.16）

## 五、契约

- `ALLOWED_ACTORS = ['hana']`
- `PROPOSAL_SEGMENT = 'Agent 提议（未核验）'`
- `gateWrite(store, {actor, payload}) -> {accepted, id} | throws`

## 六、依赖

- 上游：SPEC-0.7 G2、C10i
- 消费者：3.5 入库主线
