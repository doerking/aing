---
tags: [aing-v2, spec, 候选边, 清账, 场域, 运维, engineering:6, capability:5, delivery:7, operations]
description: SPEC-6.52 旧候选边清账——证据为空的候选边永不达提升门槛，按退役处理（invalid_at + 原因），可干跑、幂等、只认空证据
date: 2026-11-19
status: 已落地（test-6.52-candidate-scrub 6/6）
owner: hana
upstream: [STATUS.md §七 D18, spec/SPEC-2.13-场域提升动作.md, src/field-promote.js]
---

# SPEC-6.52 · 旧候选边清账

> **一句话**：`promoteEdges` 要求「≥2 类独立证据」，真库 15 条候选边 `evidence` 全是 NULL（加证据列之前的旧行）——永远达不到门槛、永远不被退役，卡在发芽面上占位。新候选边（sprout/pollinate 现写证据）实测可正常毕业 8/8，所以问题只在旧账。

## 一、口径

### 1.1 判据

- 范围：`links` 中 `relation IN ('sprout-candidate','pollinate-candidate')`、`invalid_at IS NULL`、**`evidence` 为 NULL 或解析后为空数组**。
- 动作：写 `invalid_at = CURRENT_TIMESTAMP`、`invalid_reason = 'legacy-no-evidence'`——**退役、非物理删**（行仍在，可追溯）。
- 有证据（哪怕只有 1 类）的候选边**不动**：那归 `promoteEdges` 判（不足 2 类会记 `insufficient-evidence`，留着等下轮补证）。

### 1.2 铁律

- 默认干跑：只报 `{wouldRetire, ids}`，不写库。
- `apply` 幂等：二跑 `wouldRetire = 0`。
- 不碰实体、不碰非候选关系、不改证据。
- CLI 必须 `--db`，真库路径拒跑（exit 3）——与 tag-scrub / parasite-loop 同口径。

### 1.3 接口

```
scrubCandidates(store, {apply=false}) → { scanned, wouldRetire, retired:[{source_id,target_id,relation,strength}] }
```

### 1.4 CLI

`node tools/candidate-scrub.js --db <副本> [--apply] [--json]`

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 干跑：报出空证据候选，库内 `invalid_at` 仍为空 |
| AC-2 | `apply`：全部退役、`invalid_reason='legacy-no-evidence'`、行未删 |
| AC-3 | 幂等：二跑 `wouldRetire=0` |
| AC-4 | 有证据的候选边（1 类 / 2 类）不动 |
| AC-5 | 非候选关系（related / hydrogen-bond）不动 |
| AC-6 | CLI：`--db` 副本干跑 exit 0 且 JSON 可解析；真库路径 exit 3 |

## 三、边界

- 不回填证据（证据是当时场域的观测，事后补等于编造）。
- 不自动跑 `apply`：清账是运维动作，看得出后果才落手。
