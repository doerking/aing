---
tags: [aing-v2, spec, 回单, 外接屏, l4, engineering:8, must-read:6, capability, quality, delivery, operations]
description: SPEC-6.16 回单外接屏——只读汇整已验证/闸拒/改派/待回单四类工单，只显事实与指针，分阶段显示拒因，纯读不写表
date: 2026-11-18
status: 定稿
owner: hana
upstream: [STATUS.md §七 D17, spec/SPEC-6.14-回单内容闸.md, spec/SPEC-6.15-跟单三律.md, docs/M6-SWARM33-三层流层归位-2026-11-18.md 一·L4]
---

# SPEC-6.16 · 回单外接屏（L4）

> **来处**：D17 口径最后一段——「得回单后上外接屏显示，处理单次」。前两件已落：内容闸（6.14）管**能不能过**，跟单三律（6.15）管**过得去还是断了**；本件补齐**看得见**：把 `opt_tickets` 的落定状态汇成一张只读屏。
> **要修的实病**：现在回单结果只躺在 `evidence_json` 里，人要看只能翻库；闸拒原因带了 `stage` 与 `reasons` 却没有任何出口显示。等于闸门能拦，人却看不见拦了什么。

## 一、定位

**只读展示件**：读 `opt_tickets` 与 `entities`，产出一份可直接印的结构化屏面（`sections` ＋ `lines`）。

- 不写任何表、不写 `last_access`、不投事件、不起进程、不发网络。
- 不做判定：过没过闸由 6.14 决定，断没断由 6.15 决定，本件只**呈现已有结论**。
- 不做渲染细节：输出是数据与文本行，具体画法交给调用方。

## 二、屏面口径

### 2.1 三节

| 节 | 取什么 | 说明 |
|---|---|---|
| **待回单** | `status='dispatched'` | 带心跳（`beatAt` / `beats`）；无心跳标「无心跳」 |
| **闸拒/改派** | `status='rejected'` | 按原因分两类：`gate:<stage>` 走内容闸；`escalate-deep-work` 单列「交深工」 |
| **已收单** | `status='verified'` | 带读数前后（`before → after`） |

排序：待回单 → 闸拒/改派 → 已收单（有问题的一眼看见）。

### 2.2 只显事实与指针

回单节只允许出现 `result.facts` 与 `result.pointers`。`conclusion`、`fulltext` 一律不入屏——这是膜透性口径在展示面的延续：屏上能看见的是**可核对的**，不是**下过的判断**。

### 2.3 拒因分阶段显示

闸拒行必须带 `stage`（`membrane` / `landing` / `publish`）与 `reasons[]`，让人一眼分清是「内容隔离」「粒度太薄」还是「发布门不过」。

### 2.4 诚实面

- 无数据：`total=0`，屏面只出一行「暂无回单」，不摆占位假数据。
- 实体已退场或缺失：显示回落到 `entity_id`，不显示空。
- 读数缺失：显示 `—`，不猜。

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 纯读 | 调用前后各表行数与 `last_access` 快照一致 |
| AC-2 | 三节齐 | 有三类工单时 `sections` 含 `pending` / `blocked` / `verified` 三节 |
| AC-3 | 只显事实与指针 | 回单里 `conclusion` / `fulltext` 的正文不出现在任何行与 `lines` |
| AC-4 | 拒因分阶段 | 闸拒行带 `stage` 与 `reasons[]` |
| AC-5 | 改派单列 | `escalate-deep-work` 落 `kind='escalate'`，不混进闸拒 |
| AC-6 | 心跳可见 | 待回单行带 `beatAt` / `beats`；缺心跳显示「无心跳」 |
| AC-7 | 空库诚实 | 空库返回 `total=0` 且屏面明说暂无回单 |
| AC-8 | 无 I/O | 源码不含 `fs` / `child_process` / `http(s)` / `fetch(` |

## 四、契约

```js
const { boardOf, SECTIONS } = require('./ticket-board.js');
boardOf(store, { limit }) // -> {
//   summary: { total, pending, blocked, escalated, verified },
//   sections: [{ key, label, rows: [...] }],
//   lines: ['【回单屏】…', ...]
// }
```

行形状（按节不同）：

```js
// pending
{ id, entity, dim, beatAt, beats, note }
// blocked
{ id, entity, dim, kind: 'gate' | 'escalate' | 'failed', stage, reasons, reason }
// verified
{ id, entity, dim, before, after, facts, pointers }
```

## 五、Non-Goals

- 不做终端 UI、不做网页、不做颜色与排版。
- 不改工单状态、不做重试、不做改派执行。
- 不读库外任何东西（会话原文、日志文件一律不碰）。

## 六、铁律

- store 由调用方注入（`arch-lint` 守）：本件不 `require('./knowledge-store.js')`。
- 只 `SELECT`：出现 `INSERT` / `UPDATE` / `DELETE` 即违例。
