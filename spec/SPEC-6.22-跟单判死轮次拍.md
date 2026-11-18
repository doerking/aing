---
tags: [aing-v2, spec, 跟单, 判死, 轮次拍, 心跳, 交付, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.22 跟单判死改用系统轮次拍——轮次优先、墙钟只作无轮次时的回退并标明 clock；区分 no-beat（进程没了）与 no-progress（在跑不推进）
date: 2026-11-19
status: 已落地（test-6.22-stale-rounds 9/9）
owner: hana
upstream: [spec/SPEC-6.15-跟单三律.md, spec/SPEC-6.18-提案单需求定义与寄生位.md, spec/SPEC-6.21-memo节拍强标识.md]
---

# SPEC-6.22 · 跟单判死：轮次拍 + 两种失效

> **一句话**：48 小时墙钟在部署环境里不成立——库空闲就等于误判。判死改用系统自己的轮次，并区分「进程没了」与「在跑不推进」，因为两者处理方式完全不同。

## 一、两套钟的冲突（6.15 遗留）

- 6.15 的 `isStale` 用墙钟：`beatAt` 距现在超 48 小时即判死。
- 6.18 的 TTL 用轮次拍：`beats > ttlRounds`。
- 同一份心跳，两套口径。空闲库上墙钟会误判；而轮次拍在没有轮次的环境里无从计算。

## 二、改动（`src/ticket-followup.js`）

### 2.1 心跳多记两样

```js
heartbeatOf(ev, { at, round, stage })
// followup: { beatAt, beats, beatRound, stageSig, sameStage }
```

- `beatRound`：这一拍发生在第几轮（系统轮次，不是墙钟）。
- `stageSig`：阶段签名；`sameStage` 连续相同签名次数，换签名归零。

### 2.2 判死顺序

1. 没有 `beatAt` → `no-beat` / `clock: 'none'`。
2. **有轮次**（`round` 与 `beatRound` 都可算）→ `since = round - beatRound`；`since > maxRounds`（默认 2）判死，`clock: 'round'`。
3. **无轮次**才回退墙钟 48 小时，`clock: 'wall'`——旧口径保留，但必须标明口径，不让两种钟混在一句话里。

### 2.3 两种失效

| kind | 含义 | 处理 |
|---|---|---|
| `no-beat` | 若干轮没有心跳 | 进程/会话没了 → 重派 |
| `no-progress` | 拍在走，`sameStage ≥ 3` | 在跑不推进 → 换件或升级 |

`staleTickets(store, {round})` 两种一起返回，各自带 `kind`；只扫 `dispatched`（提案单继续归 6.18 的 TTL 管，不重复处理）。

### 2.4 接线

`verifyTickets` 的心跳带上 `round`（缺省取 `meko_cycles` 行数）与阶段签名 `v<读数>:<有无回单>`。读数取两位小数——太细会让「几乎没动」被当成推进，太粗会把真推进并掉。

## 三、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 心跳写入 `beatRound` / `stageSig` / `beats` |
| AC-2 | 同阶段累计 `sameStage`，换阶段归零 |
| AC-3 | 轮次拍：`since > maxRounds` 判死，返回 `clock: 'round'` 与 `roundsSince` |
| AC-4 | 无轮次时回退墙钟，并标 `clock: 'wall'` |
| AC-5 | `staleTickets` 分开报 `no-beat` 与 `no-progress` |
| AC-6 | 正常推进件与 `proposed` 单不列入 |
| AC-7 | 无 `followup` 记录按 `no-beat` |
| AC-8 | 判死纯读（不写表） |
| AC-9 | 接线：`verifyTickets` 心跳真的带 `beatRound` 与阶段签名 |

## 四、Non-Goals

- 不改 6.15 三律的判定与升级逻辑（律一/律二不动）。
- 不改 6.18 的 TTL。
- 不做重派/换件的执行器（本轮只出信号，动作仍由调用方按 `kind` 决定）。

## 五、仍开着的

1. 6.16 回单屏还没展示 `kind`——`no-beat` 与 `no-progress` 在屏上目前看不出来，下一轮补一列。
2. `sameStage` 依赖阶段签名质量；读数为两位小数是折中，长期要看是否漏掉小幅真实推进。
3. 轮次由 `meko_cycles` 行数推得；若部署方从不跑代谢，轮次恒为 0，此时自动走墙钟回退（口径已标明）。
