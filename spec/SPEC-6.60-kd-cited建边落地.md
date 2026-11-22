---
tags: [aing-v2, spec, 工单, 寄生槽, 建边, 回单, engineering:7, capability:6, delivery:7, must-read:6]
description: SPEC-6.60 kd-cited 提案建边落地——6.56 声明「kd 靠 P3 候选边过闸」但实现只记账，kd-cited 单结构上不可能通过 acceptance；补 edges 写回口
date: 2026-11-22
status: 待落地
owner: hana
upstream: [spec/SPEC-6.56-回单落地.md, spec/SPEC-6.19-寄生位注册表与取单口.md, spec/SPEC-6.55-票面收缩.md, src/parasite-slot.js, src/pollinate.js, src/field-promote.js, src/proposal-result.js]
---

# SPEC-6.60 · kd-cited 提案建边落地

> **一句话**：SPEC-6.56 §1.2 写着「kd/kc 的修法要靠场域动作（rebond / reconcile）**或 P3 候选边过闸**」，但实现只落了前半句——`kd-cited` 回单一律 `record-only`。被引用却不催化的实体，回单无论写什么都无法改变 `kd`（`kd = clamp01(出向强边/3)`，靠 links）→ 判据永不可能通过 → TTL 到期 `rejected: proposal-expired` → 下轮重开。本件补上「P3 候选边过闸」这半边。

## 一、口径

### 1.1 新增写回项

`applyProposalResult` 的 `WRITE_BACK` 增一行：

| 单类型 | 允许写回 | 校验 |
|---|---|---|
| `kd-cited` | `links`（候选边）| 见 1.2 |

- `WRITE_BACK['kd-cited'] = ['edges']`；回单形态 `result.edges = [{ target, evidence }]`。
- 其余单类型行为不变（`kq-low` / `kq-low-narrative` 走正文；其余仍 `record-only`）。

### 1.2 回单校验（P3 的 refuse 三件 + 幂等）

| 条件 | 结果 |
|---|---|
| `evidence` 唔系非空数组 | 拒 `no-evidence`（P3 refuse「无证据」）|
| `target` 唔存在 | 拒 `target-not-found` |
| `target === entity_id` | 拒 `self-edge` |
| source 系 `future` 而 target 系 `past` | 拒 `future-to-past`（P3 refuse「future→past 边」）|
| 已有同向或反向边（任一 relation）| 幂等 skip，`reason: 'edge-exists'`，唔建 |
| 证据数 ≥3 | `strength = 6`；否则 `4`（复用 pollinate 口径）|

- **唔接受自报 `relation` 与 `strength`**：relation 一律 `pollinate-candidate`，strength 由证据数定。自报会直接把候选边变强边（strength ≥ 7 且非候选）刷 `kd`，系刷分路径，唔开。
- **confidence 一律 0.5**（pollinate 口径）。

### 1.3 写回与提升

- 写回：`INSERT INTO links (source_id, target_id, relation, confidence, strength, evidence, created_at) VALUES (?, ?, 'pollinate-candidate', 0.5, ?, ?, CURRENT_TIMESTAMP)`；`source_id = 票的 entity_id`（被引用唔催化 → 佢系被引用方，出向边从佢出发）。
- **提升唔喺本件做**：交 `promoteEdges`（SPEC-2.13）过闸。候选边属 `CANDIDATE_RELATIONS`，KESPI 计算时排除 → **建候选边唔抬 `kd`**，唔系刷分。
- 过闸后才计入 `outStrong` → `kd` 真变动 → `verifyTickets` 按 acceptance 判。

### 1.4 铁律

- **绝不碰** `last_access` / `entities.status` / `confidence` / `invalid_at` / `strand`。建边唔算访问事件。
- 过闸阶段仍走 `admit`（膜→粒度→发布门），唔过则票标 `rejected`，边零写入。
- **无物理删**：拒与 skip 都唔删既有边。
- 判据权仍归 `verifyTickets`（P7 唔外派）——本件只落边，唔判接受。

## 二、Acceptance Criteria

- **AC-1**：`WRITE_BACK['kd-cited']` 深等于 `['edges']`（`kq-low` / `kq-low-narrative` 仍系 `['content','tags']`）。
- **AC-2**：`kd-cited` 票交回单 `{ edges: [{ target, evidence: ['e1'] }] }` → 建 1 条 `pollinate-candidate` 边，`confidence = 0.5`、`strength = 4`、`evidence` 为 JSON 数组、`source_id = 票的 entity_id`；`links` 表净增 1。
- **AC-3**：`evidence` 为空数组或唔系数组 → `ok: false`、`reason` 含 `no-evidence`、票标 `rejected`、`links` 零改动。
- **AC-4**：source 实体 `strand = 'future'` 而 target `strand = 'past'` → `reason` 含 `future-to-past`、零建边。
- **AC-5**：已存在同向或反向边 → `reason` 含 `edge-exists`、`links` 数唔变（幂等）。
- **AC-6**：回单留账——`evidence_json.applied` 含 `field: 'links'` 条目（带 `target` 与 `strength`）；票状态仍系 `proposed`。
- **AC-7**：写回前后 `last_access` / `status` / `confidence` / `invalid_at` / `strand` 五列逐列一致。
- **AC-8**：回单自报 `relation` 与 `strength`（如 `relation: 'derives'`、`strength: 9`）被忽略——落库仍系 `pollinate-candidate` 与按证据数定的 strength（唔开刷分路径）。
- **AC-9**：`kq-low` 路径唔受影响——正文写回照旧生效（回归）。
- **AC-10**：`target` 唔存在 → `ok: false`、`reason: 'target-not-found'`、零建边。

## 三、边界与唔做的事

- **唔改 `kd` 评分口径**（`src/kespi.js`）——评分公式、候选边排除集一律唔动。
- **唔在 apply 内提升边**——提升系 `promoteEdges` 的职权。
- **`kd-low`（action `rebond`）唔走本件**——佢系场域动作，唔系提案单，`applyProposalResult` 照旧拒 `not-proposable`。
- **kc 唔接**——`kc-low` 走 `reconcile`（场域动作），唔系 `slot` 提案，唔涉本件。
