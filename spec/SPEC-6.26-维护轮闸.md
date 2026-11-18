---
tags: [aing-v2, spec, 维护轮, 自优化, 代谢链, guard, 交付, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.26 维护轮闸——L3 只在维护/自优化轮于链上执行；普通轮跳过不落单，跳过不算失败，链序 kespi 先于 self-optimize
date: 2026-11-19
status: 已落地（test-6.26-maintenance-guard 6/6）
owner: hana
upstream: [spec/SPEC-6.8-自优化闭环.md, src/metabolism.js, spec/SPEC-6.25-扫单按维配额.md]
---

# SPEC-6.26 · 维护轮闸

> **一句话**：自优化在链上有 guard（默认不下药），但此前没人验过它在链上到底跑不跑。真库 14 轮 0 工单，只能靠猜。本轮把它钉成可重复的判据。

## 一、闸的定义

`maintenanceGuard(ctx)` 为真才执行，三选一：

1. `ctx.selfOptimize === true`（编排器透传的显式开关）
2. `ctx.opts.selfOptimize === true`
3. `ctx.cycleType` 含「维护」或「自优化」

命中执行，否则该步 `actions.skipped = true`，**不算失败**，轮整体仍 `ok`。

## 二、链上实测（真库副本）

| 轮型 | self-optimize 步 | 工单 |
|---|---|---|
| `代谢` | `skipped: true` | 0 |
| `维护` | `scanned 20 / proposed 20` | 20 |
| `代谢` + `selfOptimize: true` | 执行 | >0 |

## 三、链序

`DEFAULT_STEPS` 里 `kespi` 在 `self-optimize` 之前——排单用的是当轮新算的读数，不是上一轮的旧值。测试断言下标顺序，防止有人重排链。

## 四、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 普通轮跳过且不落单 |
| AC-2 | 维护轮真执行并落单 |
| AC-3 | 显式 `selfOptimize:true` 在普通轮也执行 |
| AC-4 | 链上落的单带五段需求（与手动扫描同源） |
| AC-5 | 链序 `kespi` → `self-optimize` |
| AC-6 | 跳过不污染轮结果 |

## 五、边界

- 这是 6.8 §三「默认不下药」的延续，不是缺陷：没人看着时系统不改库。
- 部署方想跑自优化，必须显式开维护轮或带开关——文档要写明，否则使用方会觉得「功能不在」。

## 六、仍开着的

1. 维护轮目前只有 CLI `orchestrate` 入口；没有定时/自动触发（交付场景不假设调度器）。
2. `pulse`（6.21）目前只反映积压与停滞，不反映「上次维护轮是什么时候」——可考虑加一个 `lastMaintenanceAt`。
