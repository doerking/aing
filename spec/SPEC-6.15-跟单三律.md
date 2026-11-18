---
tags: [aing-v2, spec, 跟单, l3, 三层流层, engineering:8, must-read:7]
description: SPEC-6.15 跟单三律——追单不补位（追单不计失败）、失败≥2 改派、心跳保活（可扫 stale）；修掉「回单慢就判死」的假跟单
date: 2026-11-18
status: 定稿
owner: hana
upstream: [docs/M6-SWARM33-三层流层归位-2026-11-18.md §四 第2步, STATUS.md §七 D17]
---

# SPEC-6.15 · 跟单三律（L3）

> **来处**：swarm33 归位表 org §4「伤亡续编」三条（留档 5 条）——回单未落盘先追单不补位、同单失败≥2 改派、无预备则上报。
> **要修的实病**：现在 `verifyTickets` 每一轮都对 dispatched 单调 `_mark`，而 `_mark` 每次都 `attempts + 1`。于是一个**回单只是慢**的工单，两轮就被判 `no-improvement` 拒掉——这就是「假跟单」：把「还没回来」当成「回不来」。

## 一、三律

### 律一 · 追单不补位

`status = 'dispatched'` 且本轮**无回单**（`evidence_json.result` 不存在）且读数未改善：

- 状态留在 `dispatched`，原因 `awaiting-return`；
- **`attempts` 不加**（追单不是失败，不推进失败计数）；
- 不重派动作、不补位（不新增 `field_actions`）。

### 律二 · 失败≥2 改派

`attempts ≥ VERIFY_ATTEMPTS(2)` 且读数仍不改善 → 转为 `rejected`，原因 `escalate-deep-work`（附原读数），并在 `out.escalated[]` 里单列，供外接屏显示「交深工」。

### 律三 · 心跳保活

律一、律二两条路径都要写心跳：`evidence_json.followup = { beatAt, beats }`，`beats` 逐轮递增。
`staleTickets(store, {maxHours})` 扫出 `dispatched` 但心跳超过 `maxHours` 的工单（默认 48 小时）——这是「跟单断了」的唯一可信信号。

## 二、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 追单不计失败 | 连续两轮无回单 → 状态仍 `dispatched`、`attempts` 不变、原因 `awaiting-return` |
| AC-2 | 追单不补位 | 上述两轮中不产生任何 `field_actions` |
| AC-3 | 心跳递增 | 每轮 `followup.beats` +1、`beatAt` 存在 |
| AC-4 | 失败≥2 改派 | 回单不达标且 `attempts≥2` → `rejected`、原因 `escalate-deep-work`、`out.escalated` 有该项 |
| AC-5 | 改善仍通过 | 读数上升 → `verified`（回归不变） |
| AC-6 | stale 可扫 | 心跳超过 `maxHours` 的 dispatched 单被 `staleTickets` 扫出 |
| AC-7 | 纯函数可复算 | `heartbeatOf` / `isStale` 无 I/O、同输入同输出 |

## 三、Non-Goals

- 不新增工单状态值（沿用 open/dispatched/proposed/verified/rejected/graduated）。
- 不做深工执行本身（改派只是标记与暴露）。
- 不改 `scanTickets` / `dispatchTickets`。

## 四、契约

```js
const { heartbeatOf, isStale, staleTickets, CHASE_REASON, ESCALATE_REASON } = require('./ticket-followup.js');
heartbeatOf(evidenceJson, { at })            // -> { ...ev, followup: { beatAt, beats } }
isStale(evidenceJson, { now, maxHours })     // -> boolean
staleTickets(store, { maxHours })            // -> [{ id, entity_id, beatAt }]
```
