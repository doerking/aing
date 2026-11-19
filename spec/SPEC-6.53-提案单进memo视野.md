---
tags: [aing-v2, spec, memo, 提案单, 视野, 只读, engineering:6, capability:5, delivery:7, must-read:6]
description: SPEC-6.53 提案单进 memo 视野——memo 简报列出待接提案（dim/target/want），原来只报一个数字，没人知道提的是什么
date: 2026-11-19
status: 已落地（test-6.53-memo-proposals 6/6）
owner: hana
upstream: [STATUS.md §七 D18, spec/SPEC-6.18-提案单需求定义与寄生位.md, spec/SPEC-3.11-memo.md]
---

# SPEC-6.53 · 提案单进 memo 视野

> **一句话**：`memo` 只把在途工单数成 `backlog` 一个数字；20 张提案单究竟指向谁、要什么，主驾看不到——「只出提案」实际是「出了也看不见」。本件把待接提案列进简报，**纯读、不派单、不改状态**。

## 一、口径

### 1.1 列什么

`opt_tickets` 中 `status='proposed'` 的行，按 `score` 升序（最差读数先看）取前 N（默认 5，`opts.proposalsLimit` 可调）：

```
{ id, dim, target, want, score, createdAt }
```

- `want` 取 `evidence_json.demand.want`；缺 demand / 坏 JSON → `want: null`（不编造）。
- `target` 可附 `title`（实体题头），取不到就 null。

### 1.2 铁律

- **纯读**：不写库、不改 `opt_tickets.status`、不动 mtime。
- 只出 `proposed`：`open` 尚未路由、`dispatched/verified/rejected` 已闭环，都不列。
- 空就是 `[]`：不摆「暂无提案」占位条目。
- 不派单、不发信号——派单是宿主/meko 的事（D12/D17）。

### 1.3 接口

`buildMemo(store, opts)` 返回体增 `user.proposals: object[]`。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 3 张 proposed → `proposals` 3 条，字段齐（id/dim/target/want/score）|
| AC-2 | `want` 来自 `demand.want`；无 demand → `null` |
| AC-3 | 只出 proposed：open/dispatched/verified 一律不列 |
| AC-4 | `proposalsLimit` 生效（默认 5）|
| AC-5 | 纯读：库 mtime/size 不变 |
| AC-6 | 无提案 → `[]`（不伪造占位）|

## 三、边界

- 不做提案详情页、不做接受/拒绝动作（那是 memo 交互层）。
- 不改 `backlog` 口径（仍数 open/dispatched/proposed）。
