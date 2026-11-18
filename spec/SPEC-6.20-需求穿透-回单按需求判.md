---
tags: [aing-v2, spec, 需求穿透, 回单, 验收判据, 审计, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.20 需求穿透最后一跳——回单要按 demand.acceptance 判，达标 verified、不达标 acceptance-failed；审计工具逐跳验需求是否真被读到
date: 2026-11-18
status: 已落地（test-6.20-demand-acceptance 8/8；audit-demand 全程通）
owner: hana
upstream: [spec/SPEC-6.18-提案单需求定义与寄生位.md, spec/SPEC-6.19-寄生位注册表与取单口.md, spec/SPEC-6.14-回单内容闸.md, spec/SPEC-6.15-跟单三律.md]
---

# SPEC-6.20 · 需求穿透：回单按需求判

> **一句话**：需求写进了单、取单口也认，但回了单系统只打心跳——`demand.acceptance` 谁都没读。本轮把最后一跳接上，并把「有没有断」做成可跑的审计。

## 一、断点证据（审计先行）

`tools/audit-demand.js` 逐跳验需求还在不在，初跑结果：

| 跳 | 判据 | 初跑 |
|---|---|---|
| H1 生成 | 六种单的 demand 五段齐 | ✅ |
| H2 落库 | 扫出的单带 demand | ✅ slot=P2 mode=semi |
| H3 取单 | 取单口能取到 | ✅ |
| H4 判回单（达标） | 回单满足 acceptance → verified | ❌ 停在 `proposed` |
| H5 判回单（不达标） | 回单不满足 → rejected | ❌ 停在 `proposed` |
| H7 到期 | 超 TTL 作废 | ✅ |

静态旁证：`acceptance` 在 `src/` 里只出现在 `ticket-demand.js` 的定义与校验，**没有一处读它做判定**。`verifyTickets` 的 `proposed` 分支当时只有心跳与 TTL。

## 二、判据（`checkAcceptance`）

```js
checkAcceptance(demand, readings, { before })
// → { ok, checked, failures: [{dim, op, value, before, after, reason}] }
```

- `gte` / `gt`：拿当前读数与 `value` 比。
- `improved`：`after > before`；**没有 before 快照就判 `no-before`，不假通过**。
- 无读数 → `no-reading`；无判据 → `no-acceptance`。
- 纯函数，无 I/O，供系统判与外部件自查同一份口径。

### 2.1 before 从哪来

扫单时把五维读数快照写进 `evidence_json.readings`。没有这个快照，`improved` 类判据（如 `overall-red`）永远判不了——这是本轮同时补的计量缺口。

## 三、判定顺序（`verifyTickets` 的 `proposed` 分支）

1. **有回单**（`ev.result` 是对象）：
   1. 先过内容闸（6.14 `admit`，膜 → 粒度 → 发布门）；不过 → `rejected: gate:<stage>:<reasons>`。
   2. 再按 `checkAcceptance` 判：过 → `verified`（带 `before`/`after`/`acceptance`）；不过 → `rejected: acceptance-failed`（带 `failures`）。
   3. 两条都不 bump attempts——回单只判一次，退单即释放名额。
2. **无回单**：心跳 +1；`beats > ttlRounds` → `rejected: proposal-expired`；否则保持 `proposed`。

**为什么退单不退成 gate 类**：内容闸管「够不够格交付」，判据管「交的东西管不管用」。混成一个原因码，后面就没法区分「外部件不会写」和「外部件没解决问题」。

## 四、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | `checkAcceptance` gte 达标判过 |
| AC-2 | gte 不达标判不过，并点名维度 |
| AC-3 | improved 靠 before 快照；无快照返回 `no-before` 不假通过 |
| AC-4 | proposed 单 + 合格回单 + 判据达标 → `verified` |
| AC-5 | 判据不达标 → `rejected: acceptance-failed` |
| AC-6 | 回单不合格先被内容闸拦（`gate:` 优先于判据） |
| AC-7 | 扫单留 `readings` 五维快照 |
| AC-8 | 无回单超 TTL 仍作废（6.18 不被撬翻） |

## 五、审计工具

```bash
node tools/audit-demand.js   # 自带临时库，不碰真库
```

退出码 0 = 全程通；1 = 有断点；2 = 环境错。工具用临时库造回单，**不需要真外部件**就能验整条链——真外部件接进来之前，这就是穿透的证据。

## 六、Non-Goals

- 不实现外部件运行时（谁被调用）。
- 不改 `dispatched` 单的 6.15 三律。
- 不改内容闸门（6.14）。
- 不改 `claimed` 单的归属语义——本轮只判「回单到没到、达没达标」。

## 七、仍开着的

1. `improved` 判据依赖开单时快照；跨多轮的大幅改善可能被中途重开的单切碎。
2. 真外部件还没接——审计证明链通，但「谁来干活」仍是空的。
3. `acceptance` 目前只支持 gte/gt/improved；「缺什么补什么」之外的定性判据暂不支持。
