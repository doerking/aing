---
tags: [aing-v2, spec, P1, 寄生, 自动领单, 闭环, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.45 P1 自动领单循环——把 6.33 的一轮手驱（领单→六段→写回→验收）抽成可重复调用的 runP1Once，CLI 提供 --once 与定频两种形态，仍只跑副本库
date: 2026-11-19
status: 已落地（test-6.45-p1-runner 7/7）
owner: hana
upstream: [spec/SPEC-6.33-P1全寄生一轮.md, spec/SPEC-6.19-寄生位注册表.md, spec/SPEC-6.8-自优化闭环-误差工单到场域动作.md]
---

# SPEC-6.45 · P1 自动领单循环

> **一句话**：6.33 打通了 P1 一轮，但要靠测试/工具一步步手推。现在抽成一次调用跑完整轮，可 `--once` 也可定频循环——但**不内置守护进程**，部署形态仍由宿主决定。

## 一、口径

### 1.1 一轮做什么

```
runP1Once(store, { round?, max?, score?, verify? }):
  1. 可选：kespiStep 重算（score !== false）
  2. claimable(store, NARRATIVE_REG, {limit: max}) → P1 单（只认 P1/full）
  3. 逐单：externalPartNarrative(db, ticket, {round}) → applyReturnNarrative(store, ticket, ret)
  4. 可选：verifyTickets(store, {round})（verify !== false）
  5. 返回 { round, claimed[], rewritten[], verify:{verified,rejected,stillOpen} }
```

- **一轮一条时间线**：评分 → 领单 → 回单 → 写回 → 验收，不跳步。
- **只认 P1**：runner 用 `NARRATIVE_REG` 取单，其他位点的单原样留给各自承接方。
- **幂等**：验收通过后单转 `verified`，再跑不再领（`claimed=0`）。
- **失败可重试**：验收 rejected 的单回 `proposed`，下一轮可再领；每轮阈值游标按 6.40 推进，重写内容随之不同。

### 1.2 部署边界

- CLI `tools/parasite-loop.js`：**必须 `--db <副本>`**，真库路径拒跑。
- `--once` 跑一轮即退（默认）；`--interval <ms>` 定频循环，只在显式给出时才循环，Ctrl-C 结束。
- **不做系统服务、不写守护脚本**：常驻与否是宿主的决定。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 低分叙事单被领走：`claimed=1`、六段回单写回、验收 `verified` |
| AC-2 | 第二轮 `claimed=0`（verified 单不再领），库不因空转变化 |
| AC-3 | 写回保留 `turns`，不碰派工单以外实体 |
| AC-4 | 非 P1 单不被 runner 领（只认 P1/full） |
| AC-5 | `score:false` / `verify:false` 可单独关，返回里如实反映 |
| AC-6 | 返回形状：round / claimed / rewritten / verify 四块齐 |
| AC-7 | CLI 拒绝真库路径、`--once` 跑完退出 |

## 三、边界

- 不改 `externalPartNarrative` / `applyReturnNarrative` 的契约（6.33/6.34/6.38/6.41 全保留）。
- 不新增表、不加列。
- runner 不替外部承接方做判断：外部件仍是「只读单与原料、交回单」。
- 单轮失败（如外部件抛错）记入 `rewritten[].error`，不中断整轮。

## 四、仍开着的

1. 循环频率无自适应（固定 interval；建议上限由宿主定）。
2. 无并发保护：两个 runner 同时跑同一副本会重复领单（提议单无锁租约，本 spec 不做）。
3. 真库上跑要等「部署形态」定——现在只跑副本。
