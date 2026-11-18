---
tags: [aing-v2, spec, memo, pulse, 维护轮, 自优化, 交付, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.27 pulse 维护轮读数——lastMaintenanceAt 与 maintenanceRoundsSince，让部署方看得出自优化 L3 该不该开
date: 2026-11-19
status: 已落地（test-6.27-pulse-maintenance 6/6）
owner: hana
upstream: [spec/SPEC-6.21-memo节拍强标识.md, spec/SPEC-6.26-维护轮闸.md, spec/SPEC-6.08-自优化闭环.md]
---

# SPEC-6.27 · pulse 维护轮读数

> **一句话**：6.26 证明了自优化只在维护轮跑，但 pulse 看不出维护轮跑没跑过——部署方看到积压，也不知道该不该开一轮。

## 一、新增字段

```js
pulse.lastMaintenanceAt     // 最近一条「维护/自优化」轮的 executed_at；从未跑过为 null
pulse.maintenanceRoundsSince // 那之后又跑了多少轮；从未跑过为 null
```

**为什么不填 0**：`null` 表示「从未有过」，`0` 表示「刚跑完」。两者对使用方的含义完全不同——0 是正常，null 是从来没启用。

## 二、判定来源

- 维护轮 = `meko_cycles.cycle_type` 含「维护」或「自优化」（与 `maintenanceGuard` 的口径一致）。
- `maintenanceRoundsSince` = 该行之后（`rowid >`）的轮次数，用系统自己的节拍算，不用墙钟。

## 三、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 从未跑过维护轮 → 两字段均为 `null` |
| AC-2 | 有维护轮 → 取最新一条时间，`maintenanceRoundsSince === 0` |
| AC-3 | 之后又跑 3 轮 → `maintenanceRoundsSince === 3` |
| AC-4 | 「自优化」类型的轮同样算维护轮 |
| AC-5 | 不影响三态判定（state 仍按积压与停滞算） |
| AC-6 | 纯读（轮次表不变） |

## 四、边界

- 不进 `systemLine`（80 字上限，且这是诊断信息不是用户面读数）。
- 不触发任何动作：只是显示「上次什么时候、之后几轮」。

## 五、仍开着的

1. 部署方看到 `maintenanceRoundsSince` 偏大时，目前要自己跑 `cli orchestrate --self-optimize`；没有「提示该跑」的阈值（可考虑 > 10 轮时进 pulse.reason）。
2. 维护轮本身没有定时触发——交付场景不假设调度器，这是有意的。
