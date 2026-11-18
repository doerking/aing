---
tags: [aing-v2, spec, memo, 节拍, 心跳, 三态, 交付, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.21 memo 节拍强标识——交付后看不到部署方调度器，心跳改为从底账读出的差；PROGRESSING/IDLE/STUCK 三态，code 恒等于 state
date: 2026-11-19
status: 已落地（test-6.21-memo-pulse 9/9）
owner: hana
upstream: [spec/SPEC-3.11-memo用户面.md, src/memo.js, src/consciousness-kernel.js, spec/SPEC-6.18-提案单需求定义与寄生位.md, spec/SPEC-6.15-跟单三律.md]
---

# SPEC-6.21 · memo 节拍强标识（pulse）

> **一句话**：发布之后我们看不见部署方的调度器，所以心跳不能是「要求对方打的拍」，只能是「从底账读出来的差」。memo 每次被读，就用已有底账重算一次三态，并给一个机器只认一个的强标识。

## 一、为什么落在 memo

- **零契约**：memo 不发起、只读，不要求部署方配 cron、开端口、做回调。
- **观测时钟由看的人提供**：agent 出场读、人手动跑、使用方自己的 cron 调——谁读就用谁的节拍。
- **素材现成**：`meko_cycles`、`kernel_state`、`entities(pending-distillation)`、`opt_tickets`。
- 旧代码已经在查 `meko_cycles` 最后一条，但查出来没用——这条线本来就该接在这里。

## 二、三态定义（不是「活着吗」，是「该不该叫」）

| state | 条件 | 语义 |
|---|---|---|
| `IDLE` | 无轮次（`cold-start`）或积压为 0（`no-backlog`） | 没活可干，正常 |
| `STUCK` | 有积压 **且** `stallRounds ≥ 3`（`backlog-stalled`） | 有活不干，真故障 |
| `PROGRESSING` | 有积压且未达停滞阈值（`backlog-moving`） | 在动 |

- `backlog` = `pending-distillation` 实体 + 未闭环工单（`open`/`dispatched`/`proposed`）。
- `stallRounds` 直接取 `kernel_state.stagnation_count`（全仓唯一写者，不另算一套）。
- **冷启动绝不报 STUCK**：没数据不等于卡住。

## 三、强标识

```js
pulse = {
  state,        // PROGRESSING | IDLE | STUCK
  code: state,  // 强标识：机器只认 code，且恒等于 state
  marker,       // ▶ | ⏸ | ⚠
  reason,       // cold-start | no-backlog | backlog-stalled | backlog-moving
  lastCycleAt, cyclesTotal, stallRounds, backlog
}
```

**为什么 code 单独一个字段**：下游（部署方的监控、我们的 board、以后的 CLI）只需要 `pulse.code === 'STUCK'` 一句话判断，不必理解 `reason` 的措辞；`state` 将来若要扩展成更细的状态，`code` 保持三个值不变，反而不容易把消费方写崩。

**系统行**：只有非 `PROGRESSING` 时才在行首加 `marker code /`，正常时一个字都不占（80 字上限）。截断仍走原有按段收口，强标识在第一段，不会被削。

## 四、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 导出 `PULSE_STATES`，三值齐 |
| AC-2 | 空库 → `IDLE/cold-start`，不误报 STUCK |
| AC-3 | 有积压 + 停滞达阈值 → `STUCK`，行首 `⚠ STUCK` |
| AC-4 | 有积压不停滞 → `PROGRESSING`，行首不加标识 |
| AC-5 | 积压清空 → `IDLE/no-backlog` |
| AC-6 | `code === state` 且 `state` 必属枚举 |
| AC-7 | `lastCycleAt` 取最后一条轮次，`cyclesTotal` 可读 |
| AC-8 | 纯读：跑前后四张表行数不变 |
| AC-9 | 系统行仍 ≤ 80 |

## 五、边界

- memo 是**观测面，不是报警器**。承诺是「被看的时候看到的是真相」，不是「没人看时会叫人」。要主动提醒，使用方用 cron 调 `memo --summary`。
- 不引入新表、不写任何状态；三态每次现算。
- 不改 `health` 口径——v2 没有独立 health 块，健康仍在系统行第一段（守恒读数）。

## 六、Non-Goals

- 不做租约（外部件 owner 未定，先不做空位钥匙）。
- 不改 `isStale` 的墙钟口径——留待与真外部件接入同轮统一。
- 不做常驻调度或 webhook。

## 七、仍开着的

1. `isStale` 仍是 48 小时墙钟，与轮次拍并存——空闲库会误判，下一轮统一。
2. `stallRounds` 依赖内核被轮次驱动更新；完全没人跑代谢时它停在旧值，此时 `backlog>0` 会显得「一直停滞」。这是真实态（确实没在动），按 STUCK 报是诚实的。
