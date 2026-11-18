---
tags: [aing-v2, spec, 回单屏, 跟单, 判死, 失效分类, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.23 回单屏分两种失效——待回单行带 kind（ok/no-beat/no-progress），屏上与汇总分开显示，两种失效不再混成一句「心跳」
date: 2026-11-19
status: 已落地（test-6.23-board-stale-kinds 8/8）
owner: hana
upstream: [spec/SPEC-6.16-回单外接屏.md, spec/SPEC-6.22-跟单判死轮次拍.md, spec/SPEC-6.15-跟单三律.md]
---

# SPEC-6.23 · 回单屏分两种失效

> **一句话**：6.22 把判死拆成 `no-beat`（进程没了）与 `no-progress`（在跑不推进），但回单屏还只说「心跳 xx（N 拍）」——两种失效在屏上分不出来，等于白拆。

## 一、改动（`src/ticket-board.js`）

### 1.1 待回单行加 `kind`

| kind | 判据 | 屏上 |
|---|---|---|
| `ok` | 有心跳，轮次未超，`sameStage < 3` | `心跳 <时刻>（N 拍）` |
| `no-beat` | 无 `beatAt`，或轮次 `since > 2` | `⚠ 无心跳（N 轮未拍）` |
| `no-progress` | 心跳在走，`sameStage ≥ 3` | `⏳ 无进展（同阶段 N 拍）` |

行上同时带 `roundsSince` / `sameStage`，`kind` 复用 `ticket-followup.isStale` 与 `SAME_STAGE_LIMIT` 单源，屏不另算一套。

### 1.2 汇总加两个强标识

```js
summary.noBeat     // 待回单里 no-beat 的条数
summary.noProgress // 待回单里 no-progress 的条数
```

下游只读这两个数字就知道该重派还是该换件，不必解析文字。

### 1.3 轮次

`boardOf(store, {round})`：调用方可指定；缺省取 `meko_cycles` 行数。屏是纯读，不写任何表。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 正常心跳标 `ok` |
| AC-2 | 轮次断 → `no-beat`，带 `roundsSince`，`note` 仍为「无心跳」 |
| AC-3 | 有拍不推进 → `no-progress`，带 `sameStage` |
| AC-4 | 无心跳记录 → `no-beat` |
| AC-5 | `summary.noBeat` / `summary.noProgress` 分开计数 |
| AC-6 | 屏上两种失效可分辨（`⚠ 无心跳` / `⏳ 无进展`） |
| AC-7 | 轮次由调用方指定即按指定算 |
| AC-8 | 纯读（跑前后表不变） |

## 三、Non-Goals

- 不做动作：屏只分类，重派/换件仍由调用方按 `kind` 决定。
- 不改 `blocked` / `verified` 两节。
- 不改 6.16 原有的「事实与指针才入屏」口径。

## 四、仍开着的

1. 屏上有 `kind` 但 CLI 没有按 `kind` 过滤的参数（如 `board --stale`）。
2. 两种失效目前都只提示，没有自动重派入口。
