---
tags: [aing-v2, spec, 寄生位, P3, 建边, 自优化闭环, 承接, spec:9, engineering:8]
description: SPEC-6.61 P3 位寄生承接——外部件镜像入向强边产回单，runP3Once 编排闭环，kd-cited 提案单唔再只系候选
date: 2026-11-22
status: 待落地
owner: hana
upstream: [spec/SPEC-6.18-寄生位注册与取单口.md, spec/SPEC-6.45-P1自动领单循环.md, spec/SPEC-6.60-kd-cited建边落地.md, src/parasite-slot.js, src/parasite-runner.js, src/proposal-result.js]
---

# SPEC-6.61 · P3 位寄生承接（关联建边）

## 一、缘起

`SPEC-6.18` 声明咗七点位，`claimable` 取单口亦已可取走 P3 单；`SPEC-6.60` 亦已令 `kd-cited` 回单真能建边（修订 B 后真库 8 张模拟全通，见 `docs/Engineering/KD-CITED-REACHABILITY-2026-11-22.md`）。

但 `src/parasite-runner.js` 只有 `runP1Once`——**P3 位冇承接者**。即：`kd-cited` 单落库后停在 `proposed`，只等 TTL 到期 `proposal-expired`，8/8 的可达性**系手工模拟出来的，唔系系统自己跑出来的**。

## 二、目标

**唔另起平行机制**——只做三件：

1. **外部件**（`tools/parasite-round.js`，只读单与库、唔写库）：P3 位产回单——镜像实体嘅**入向强边来源**，交 ≥2 类独立证据。
2. **写回**：复用 `src/proposal-result.js` 嘅 `applyProposalResult`（`kd-cited → edges` 已有），唔另起写库路径。
3. **编排**（`src/parasite-runner.js`）：`runP3Once(store, opts)`，与 `runP1Once` 同形——领单 → 外部件回单 → 系统写回 → `promoteEdges` → 重算 → `verifyTickets`。

## 三、行为

### 3.1 外部件（P3 全寄生）

`EDGES_REG = { slot: 'P3', mode: 'full', evidence: ['facts', 'pointers', 'sourceGrade', 'selfAssessment'] }`

`externalPartEdges(db, claim, { round }) → { result } | null`

- 读实体 + 佢嘅入向强边（`strength ≥ 7`、`relation` 唔属 `CANDIDATE_RELATIONS`、`invalid_at IS NULL`），按 `strength DESC` 取。
- 无入向强边 → 返 `null`（拒：`no-evidence`，与 P3 refuse「无证据」同口径）。
- 证据系**真值**：`被 <来源> 强引用`、`与来源同标签共现`（≥2 类，与 `promoteEdges` 提升闸「distinct ≥ 2」同口径，否则建边永远提唔升——修订 A 已修）。
- 回单四件证据齐全（`facts` / `pointers` / `sourceGrade: 'high'` / `selfAssessment`），通过 `ticket-gate.admit` 内容闸。
- **唔写库**——只返回单（铁律：外部件不写库）。

### 3.2 编排

`runP3Once(store, { round, max, score, verify })`：

- `P.claimable(store, EDGES_REG, { limit: max })` 取 P3 单（只认 `status='proposed'` 且需求齐全）。
- 逐单：外部件回单 → `applyProposalResult(store, t.id, { result })` → 写回走 `kd-cited: ['edges']`。
- 全部写回后：`promoteEdges` → `kespiStep` → `verifyTickets`。
- 返回 `{ round, claimed, returned, promoted, verify }`。
- 唔接 P7（回单校验系主权动作，`modes: []`，唔得外包）。
- 唔碰 `last_access` / `status` / `confidence` / `invalid_at` / `strand`。

### 3.3 边界

- 唔改 `kespi.js` 评分口径、唔改开票条件、唔推翻 D18。
- 提升唔喺本件做：候选边提升交 `promoteEdges`（`CANDIDATE_RELATIONS` 排除，建候选边唔抬 kd，过闸后才计 `outStrong`）。
- `gateVerdict === 'growth-only'` 时提升闸全拒系既有口径，本件唔改（记喺 `KD-CITED-REACHABILITY` §四）。

## 四、Acceptance Criteria

- **AC-1**：`EDGES_REG` 声明 P3/full，`claimable` 能取走 `kd-cited` 提案单。
- **AC-2**：`runP3Once` 一轮后，该实体建咗候选边、`kd > 0`、票 `verified`。
- **AC-3**：幂等——第二轮 `claimable` 唔再返该单（已 `verified`），`claimed` 空、唔再建边。
- **AC-4**：铁律——`last_access` / `status` / `confidence` / `invalid_at` / `strand` 前后唔变。
- **AC-5**：外部件唔写库——`externalPartEdges` 返回单后，库内 `links` 数与写回前一致。
- **AC-6**：实体无入向强边时外部件返 `null`（拒 `no-evidence`），runner 记 `no-return` 而唔抛错。

## 五、登记

- `test/baseline.json` 增档；`STATUS.md` 增 6.61 行 + 真值；`AGENT.md` 计数；`HANDOFF-2026-11-22.md` 补段。
- 门禁须 `ALL GREEN`；计数改动点三处（`test/baseline.json` / `STATUS.md` / `AGENT.md`）。
