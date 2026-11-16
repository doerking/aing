---
tags: [aing-v2, spec, 消费侧, 成长闭环, 反馈, 洞察, 缺口, 元认知, M6, spec:9, growth:9]
description: M6.5 spec——四件成长观察一起落：缺口扫描/反馈差分/自我模型三件只读，洞察抽取只写候选知识（raw 链待蒸馏）；全部由 T2 消费，禁止自调参数
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.7, SPEC-2.15, SPEC-3.4, SPEC-6.4, docs/Engineering/CONSUMER-AUDIT-2026-11-16.md]
---

# SPEC-6.5 · 成长观察四件（反馈 / 洞察 / 缺口 / 元认知）

> 缺口来源：`docs/Engineering/CONSUMER-AUDIT-2026-11-16.md` 缺口 3 的其余四件。
> 旧院四件是各自独立脚本：gap-detector 扫 5 维缺口、feedback-loop 做前后快照并**自动调参**、
> insight-extractor 写 `raw/growth/*.md`、metacognition-layer 自测并**调策略**。
> v2 不是把它们搬过来，而是按新架构改姿态——**观察与执行分离、候选知识与正式知识分离、参数变更归人**。

---

## 一、转换姿态（本任务的核心判断）

| 旧件 | 旧姿态 | v2 姿态 | 理由 |
|---|---|---|---|
| gap-detector | 独立扫描器 + `--fix` 自动修 | **只读镜头**：5 维缺口只出数与 id，不动边、不修实体 | 修复归场域件（2.12 rebond/demote）；观察件无写权 |
| feedback-loop | 前后快照 + **自动调权重/阈值/频率** | **只读差分**：算轮间 Delta 与走势判定，**不调参** | 旋钮单源（SPEC-3.4）与审批边界（2.16）；调参是 owner 动作 |
| insight-extractor | 写 `raw/growth/insight-*.md` 落盘 | **写 raw 链候选实体**：`pending-distillation`、confidence 0、type `MetaKnowledge` | 新架构只有双链；洞察必须走「候选 → 蒸馏 → 正式」同一道门 |
| metacognition-layer | 自测 + 调策略 | **只读自我模型**：测覆盖率/蒸馏债/成功率/均分，**不调策略** | 判定与执行分离；测量值供 T2 与 memo 读 |

三件只读件由 **evolution T2 快照**消费（`gaps` / `feedback` / `selfModel` 三块），不新增代谢步骤；
洞察一件写实体，进默认链（`insight-extract`），下一轮自然被 compile/distill 收走。

---

## 二、行为（spec 即契约）

### 2.1 缺口扫描 `src/gap-scan.js`（只读）

对 `status='active' AND invalid_at IS NULL` 的实体扫 5 维：

| 维 | 判据 |
|---|---|
| `orphan` | 没有任何有效边（双向、`invalid_at IS NULL`） |
| `thin` | `length(content) < 50` |
| `stagnant` | `updated_at` 距今 ≥ 90 天 |
| `unindexed` | 无当前后端（`vector.resolveBackend()` 的 model+dim）的向量行 |
| `empty` | `content` 为 NULL 或去空白后为空 |

- 返回 `{counts:{5 维}, ids:{每维 ≤50}, total}`；同一实体可落多维。
- **零写**：不修边、不改实体、不碰 `last_access`。

### 2.2 反馈差分 `src/feedback-delta.js`（只读）

- 取最近两条 `meko_cycles`（按 `rowid DESC`）与全库计数。
- 输出 `{from, to, delta:{kespi, growth, pruned, ratio}, counts:{entities, edges}, trajectory:{samples, successRate}, verdict}`。
- `delta.*` = 两轮之间的差；`counts.*` = 当前库值（无历史快照可比，故不做差）。
- `verdict`：KESPI 变化 > +0.01 → `improving`；< −0.01 → `regressing`；否则 `flat`；不足两条 → `insufficient`。
- **不调参**：不写 `config`、不改 `DEFAULTS`、不发审批。

### 2.3 自我模型 `src/self-model.js`（只读）

输出 `{measuredAt, metrics}`，metrics 全部从库内事实算：

| 指标 | 定义 |
|---|---|
| `entities` / `active` | 实体总数 / 有效实体数 |
| `edges` | 有效边数 |
| `vectorCoverage` | 有当前后端向量的有效实体 / 有效实体（%） |
| `distillDebt` | `status='pending-distillation'` 且有效的实体数 |
| `kespiAvg` | `kespi_scores.overall` 均值（4 位） |
| `trajectorySuccessRate` | 最近 20 条 `session` 轨迹的成功率 |
| `gaps` | 5 维缺口合计（调用 gap-scan） |

- **只建模，不自调**：不写任何表。

### 2.4 洞察抽取 `src/insight-extract.js`（只写候选实体）

- 输入：最近 `N`（默认 8）条 `meko_cycles` + 每轮 `field_actions` 的主动作。
- 条件 = 该轮守恒判定（`balanced / growth-only / prune-only / idle`）；动作 = 该轮出现最多的 `field_actions.action`（无则 `none`）。
- 效果 = **下一轮相对本轮的 KESPI 快照均值变化**（轮序对齐，不做跨时钟 join）。
- 按「条件 + 动作」聚合，样本量 = 出现轮数；取 `|效果|` 前 3 组。
- 落实体：`id='raw-insight-<sha1(条件+动作) 前 8>'`，`type='MetaKnowledge'`，`status='pending-distillation'`，`confidence=0`，`tags='["insight"]'`。
- 正文含四行：条件 / 动作 / 效果 / 样本量，并明写「统计相关，不作因果；confidence 0 待蒸馏」。
- 幂等：同 id 已存在 → `skipped`；不足两条周期或没有可算效果 → `insufficient`，**不造洞察**。

### 2.5 接线

- `evolution-cycle.t2Snapshot()` 增三块（best-effort，失败置 `null`，不阻断快照）：`gaps`、`feedback`、`selfModel`。
- `metabolism` 增步骤 `insight-extract`（strand `cross`、band `background`、reads `entities`、writes `entities`），置于 `trajectory` 之后。
- 三件只读件不进代谢链（无写，不做步骤）。

### 2.6 铁律

- 三件只读件：零写（前后库指纹一致）。
- 洞察件：不改已有实体、不碰 `last_access`、无 `DELETE FROM`；新实体 `confidence=0`，不得直接 `active`。
- 全部组件唔直连 knowledge-store（store 注入，arch-lint C5 守）。

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 五维缺口 | 造孤儿/稀薄/停滞/未索引/空内容各一，counts 与 ids 命中，不命中健康实体 |
| AC-2 | 反馈差分 | 两条周期已知增减 → delta 正确；KESPI 上升判 `improving` |
| AC-3 | 自我模型 | 实体/边/覆盖率/蒸馏债/成功率数值正确 |
| AC-4 | 洞察落候选 | 生成 ≤3 条 `raw-insight-*`，`MetaKnowledge` + `pending-distillation` + confidence 0，正文含四要素与「不作因果」 |
| AC-5 | 洞察幂等 + 不造料 | 二次 `skipped`；周期不足 → `insufficient` 且零写入 |
| AC-6 | T2 消费 | `t2Snapshot()` 带 `gaps/feedback/selfModel` 三块 |
| AC-7 | 链上可见 | `DEFAULT_STEPS` 含 `insight-extract` |
| AC-8 | 铁律 | 三只读件前后库指纹一致；`last_access` 不变；无 `DELETE FROM`；无直连 store |

## 四、Non-Goals

- 不做自动调参、不写 `config` 表、不自动审批。
- 不做因果推断（只报轮级统计相关）。
- 不做 `--fix` 自动修复（修复归 2.12/2.13）。
- 不迁 episode / rollout / tri-path 三条轨迹链（缺口 4 再议）。
- 不改 memo 用户面字段（T2 与模块可被读，memo 接线留后续）。

## 五、契约

- `gapScan(store) -> {counts, ids, total}`（另导出 `DIMENSIONS`）
- `delta(store, opts) -> {from, to, delta, trajectory, verdict}`
- `measure(store) -> {measuredAt, metrics}`
- `extractInsights(store, opts) -> {scanned, extracted, skipped, insufficient, ids}`
- 常量：`GAP_MIN_LEN=50`、`STAGNANT_DAYS=90`、`INSIGHT_MAX=3`、`CYCLE_WINDOW=8`

## 六、依赖

- 上游：SPEC-6.4（轨迹）、SPEC-2.15（T2）、SPEC-1.12（KESPI）、SPEC-5.3（向量口径）
- 下游：T2 快照、memo（后续）、场域维护（读缺口清单决定动作）
- 旧院证据：`aing/src/gap-detector.js`、`feedback-loop.js`、`insight-extractor.js`、`metacognition-layer.js`

## 七、与旧院的差异

| 项 | 旧院 | v2 本件 | 理由 |
|---|---|---|---|
| 缺口修复 | `--fix` 自动修 | 只出清单 | 写权归场域件，观察件不越权 |
| 反馈调参 | 自动调权重/阈值 | 只出 Delta 与走势 | 旋钮单源 + 审批边界 |
| 洞察落点 | `raw/growth/*.md` | raw 链候选实体 | 双链单一真源，走蒸馏门 |
| 元认知 | 自测 + 调策略 | 只测量 | 判定与执行分离 |
| 消费方式 | 各自被面板/脚本调用 | 统一由 T2 消费；洞察进链 | 一个出口，避免多套读数 |
