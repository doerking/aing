---
tags: [aing-v2, spec, 工单, 回单, 寄生槽, 写回, engineering:7, capability:6, delivery:7, must-read:6]
description: SPEC-6.56 回单落地——外部件交回单后只落了 evidence_json.result，实体一字未动；补写回口，按需求白名单写内容并留账
date: 2026-11-20
status: 已落地（test-6.56-proposal-result 7/7）
owner: hana
upstream: [spec/SPEC-6.18-提案单需求定义与寄生位.md, spec/SPEC-6.20-需求穿透-回单按需求判.md, spec/SPEC-6.55-票面收缩.md, spec/SPEC-6.14-回单内容闸.md, src/parasite-slot.js, src/ticket-gate.js]
---

# SPEC-6.56 · 回单落地

> **一句话**：P6 位点的声明写着 `writeBack: entities(按需求改动) + opt_tickets.evidence_json.result`，实现只有后半截。外部件交了回单，正文补在纸上，实体一字未动——判据自然永不通过，单照旧 TTL 作废。

## 一、口径

### 1.1 新增写回口

`applyProposalResult(store, ticketId, { result, membrane }) → { ok, applied, reason }`

- **只接提案单**：`action ∈ {'slot','memo-card'}` 且 `status ∈ {'proposed','dispatched'}`。其余一律拒：`ticket-not-found` / `not-proposable` / `terminal-state`。
- **先过闸**：`admit(result, {membrane})` 不过 → 不落地，票标 `rejected`（原因 `gate:<stage>:<reasons>`），实体零改动。
- **按需求白名单写回**（只改列出的字段，其余一律不碰）：

| 单类型 | 允许写回 | 校验 |
|---|---|---|
| `kq-low` / `kq-low-narrative` | `entities.content`、`entities.tags` | 正文去空白后 ≥ 400 字、且与现文不同；标签若给，须是 ≥3 个非空字符串（存 JSON）|
| `kd-cited`（被引用唔催化）| `links`（候选边）| **SPEC-6.60 接管**——本件唔落边；回单无 `edges` 时拒 `no-edges`，实体正文零变化 |
| 其余（kc 等）| 无 | 只记账，`applied: []`、`reason: 'record-only'` |

- **绝不碰**：`last_access` / `status` / `confidence` / `invalid_at` / `strand`。写回不是访问事件，不能靠它抬 ka。
- **记账**：`evidence_json` 增 `result`（原回单）与 `applied`（每项 `{field, beforeLen, afterLen, digest}`）。票状态保持 `proposed`，交给 `verifyTickets` 按 demand.acceptance 判。
- **幂等/防空转**：新正文与现文逐字相同 → 拒 `no-change`，票不动（留给下一次真改动）。
- **纯读面**：仅校验失败时零写入；成功时只写 entity 白名单字段 + 该票 evidence。

### 1.2 为什么不越界做事

- **kd-cited 的修法是建出向边**（系 `slot` 提案、`action = slot`），走 P3 候选边过闸（**SPEC-6.60**）；kc 的修法系 `reconcile` 场域动作。两者都唔系「写一段正文」，故本件唔写正文。
- 不在这里跑 KESPI、不在这里判接受——判定权在 `verifyTickets`（主权动作，P7 不外派）。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | kq 合格回单 → 实体正文/标签写回，`applied` 记账，`last_access` 不变 |
| AC-2 | 正文 < 400 字 → 拒 `content-too-short`，实体不变，票标 `rejected` |
| AC-3 | 缺自评/事实 → 过不了发布门，不落地，实体不变，票标 `rejected` |
| AC-4 | 正文与现文逐字相同 → 拒 `no-change`，实体不变，票仍在 `proposed` |
| AC-5 | 落地后跑 kespi + verifyTickets → 票 `verified` |
| AC-6 | kd-cited 单 → 只记账不写实体（`record-only`），实体零变化 |
| AC-7 | 不存在 / 不是提案单 / 已终态 → 拒且零写入 |

## 三、边界

- 不改 `verifyTickets`、不改 `ticket-gate`、不改 demand 定义。
- 历史单不受影响（只作用于被显式交付回单的那一张）。
- CLI `tools/apply-result.js`：需 `--db <副本>`，真库路径拒跑（exit 3），默认干跑，`--apply` 才写。
