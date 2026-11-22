---
tags: [aing-v2, opt-tickets, TTL, 寄生位, P2, 去重, 量档, spec:9, handoff:9]
description: 工单承接与 TTL 量真值（2026-11-22）——TTL 已实现；真库 opt_tickets 空系设计（默认唔自动下药）；候选 13 张中 kd-cited 8 已有 P3 承接者，kq-low 5 系同一内容三抄、真库无 raw 原料，P2 冇米
date: 2026-11-22
status: 已量完（真库只读副本）
owner: hana
upstream: [STATUS.md §七 D18, docs/Engineering/KD-REALRUN-2026-11-22.md, spec/SPEC-6.61-P3位寄生承接.md, src/self-optimize.js, src/metabolism.js]
---

# 工单承接与 TTL · 量真值（TICKET-SLOT-OWNERSHIP）

## 〇、结论先行

1. **TTL 机制已实现**（`src/self-optimize.js` `verifyTickets` 的 `ttlRounds` → `proposal-expired`）。STATUS D18 行「未修：① proposal 单的消费方与 TTL」**系过时描述**，需更正。
2. **真库 `opt_tickets` 空（0 单）系设计结果，唔系堆积**：`self-optimize` 步骤带 `maintenanceGuard`（`src/metabolism.js`），**默认唔自动下药**，只喺维护轮／`opts.selfOptimize` 开。真库 `meko_cycles = 14` 轮，全唔系维护轮 → 从未 persist 过单。「两轮即堆积 32 单」系 2026-11-18 诊断时副本实测，**唔系真库常态**。
3. **真库候选 13 张**：`kd-cited` 8 张（P3，**今日已落 `runP3Once` 承接者**）＋ `kq-low` 5 张（P2，**无承接者**）。
4. **P2（`kq-low`）唔该做承接者——真库冇米**：`strand=raw` **0 条**、`future` 仅 1 条且已代谢。
5. **`kq-low` 5 张真问题系重复实体三抄**（`wiki-` / `raw-` / 无前缀同一内容各 101–105 字），唔系「正文太少要蒸馏」。这系**回溯去重**问题，属另一条线（且触及 `invalid_at` 铁律），唔夹落 D18。

## 一、TTL 已落（源码指认）

`src/self-optimize.js`：

- `L308`：`const ttl = Number(dm.ttlRounds) || DEFAULT_TTL`
- `L343`：`_mark(db, t.id, 'rejected', { ..., reason: 'proposal-expired' }, cycleId, { bump: false })`
- `L344`：`out.rejected.push({ ..., reason: 'proposal-expired' })`

各 kind 嘅 `ttlRounds` 统一 **3 轮**（`src/ticket-demand.js`）。`kc-low` 与 `memo-card` **冇 `demandFor` 定义**（返 `null`）——唔开单。

## 二、真库常态：从未 persist 过单

| 读数 | 值 |
|---|---|
| `opt_tickets` | **0** |
| `meko_cycles` | 14 |
| `opt_actions` 表 | 唔存在（记账系 `field_actions`）|
| `kespi_scores` / `entities` | 322 / 322 |

`src/metabolism.js` `maintenanceGuard`：

```js
function maintenanceGuard(ctx = {}) {
  return ctx.selfOptimize === true ||
    (ctx.opts && ctx.opts.selfOptimize === true) ||
    /维护|自优化/.test(String(ctx.cycleType || ''));
}
```

`self-optimize` 与 `capability-dispatch`、`lineage-reflect` 步骤皆挂呢个 guard——**默认关**（SPEC-6.8 §三）。即真库普通轮唔开单，`opt_tickets` 空系设计，唔系缺陷。

## 三、候选单分布（`scanTickets({persist:false})`）

| kind | action | slot | 张数 | 承接者 |
|---|---|---|---|---|
| `kd-cited` | slot | **P3** | 8 | **`runP3Once`（今日落，SPEC-6.61）**|
| `kq-low` | slot | **P2** | 5 | **无** |

`scanTickets` 返回 `{ created, skipped, tickets }`——**唔系** `candidates`。本次探针初版读 `scan.candidates` 得 0，系读错字段（唔系库无候选）。

## 四、`kq-low` 5 张实况（系重复实体，唔系缺正文）

| 实体 | 正文 | 标签 | type | status | strand |
|---|---|---|---|---|---|
| `wiki-insight-1383c174` | 101 字 | 1 | MetaKnowledge | pending-distillation | past |
| `raw-insight-1383c174` | 101 字 | 2 | MetaKnowledge | pending-distillation | future |
| `raw-todo-20261106T18570-…` | 105 字 | 1 | Todo | done | past |
| `todo-20261106T18570-…` | 105 字 | 1 | Todo | done | past |
| `wiki-todo-20261106T18570-…` | 105 字 | 1 | Todo | done | past |

两组系**同一内容三抄**（insight 1 组、todo 1 组）。`kq` 低唔系因为正文太少要蒸馏，系因为**重复记账**。

真库 P2 位「米」存量：

| 项 | 值 |
|---|---|
| `entities` `strand=raw` | **0** |
| `entities` `strand=future` | 1（已代谢：`metabolized_at IS NULL` = 0）|
| `distill_points` | 133 |

**结论：P2 承接者唔该做**——冇原料可蒸。

## 五、真正嘅缺口（另一条线）

`src/identity.js` 只喺**入库时**做归一（`deduped: true`），**唔回溯**已入库的三抄。即历史遗留副本会永远喺库、永远各背一份 `kq-low`。

处置需设计，唔该夹落 D18：

- 去重要**退役旧副本** → 写 `invalid_at`，与「铁律唔碰 `invalid_at`」冲突，需明确豁免口径
- 或改为**标记 `dedup-of` 关系边**（唔退役），但 `kd`/`kq` 口径仍各计一次

## 六、STATUS D18 行需更正

原：「**未修（另立线）**：① proposal 单的消费方与 TTL（现两轮即堆积 32 单）」

应：TTL 已落（`verifyTickets` 的 `proposal-expired`）；真库常态未开单系设计（`maintenanceGuard`）；剩「无承接者」系 P2 位，而真库 P2 冇米——真问题是重复实体三抄（回溯去重），另立线。

## 七、关键引用

- 探针（真库只读副本）：`G:\DPD\.mimosa\probe-ttl.js`、`probe-ttl2.js`、`probe-slot.js`、`probe-p2.js`
- 承接现状：`src/parasite-runner.js`（`runP1Once` / `runP3Once`）；`tools/parasite-round.js`（`NARRATIVE_REG` / `EDGES_REG`）
- 上游：`docs/Engineering/KD-REALRUN-2026-11-22.md`、`spec/SPEC-6.61-P3位寄生承接.md`
- 真值：177 档 / 1181 条断言全绿；33 项门禁 ALL GREEN
