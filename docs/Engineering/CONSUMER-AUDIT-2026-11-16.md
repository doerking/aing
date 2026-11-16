---
tags: [aing-v2, engineering, 消费侧, 核对, 缺口, 审计, audit:9, must-read:8]
description: 旧院后半区消费侧逐件核对——40 项消费契约对表，分类为已承接/有意不迁/真缺口/口径走样；四个真缺口带证据与影响，供排期拍板
date: 2026-11-16
status: draft（待 owner 拍板排期）
owner: hana
upstream: [ARCHITECTURE.md（旧院）, INTERFACES.md（旧院）, METABOLISM-PIPELINE.md（旧院）, STATUS.md, docs/HANDOFF-2026-11-16.md]
---

# 后半区消费侧核对 · 2026-11-16

> 触发：旧院（`aing`）代谢执行面出过问题，但**后半区各消费组件的契约与记录都在**（架构文档 + 源码头注 + 门禁断言）。
> aing-v2 按双链 DNA 重写后，下游消费侧必须逐件对表，区分「已承接 / 有意不迁 / 真缺口 / 口径走样」。
> 本档只做核对与证据，不改代码、不定排期。

---

## 〇、结论

| 类别 | 件数 | 说明 |
|---|---|---|
| 已承接 | 14 | 有 v2 对应件且行为对得上 |
| 部分承接 / 形态变更 | 7 | 有件但口径或形状变了，需登记 |
| 有意不迁（有记录） | 4 | 旧记录或 v2 spec 写明取舍 |
| **真缺口** | **4 组** | 旧记录有消费契约，v2 无件、无消费者、未登记（**缺口 1–4 已全部结案：1/2/3 已补齐，4 裁定不迁**）|
| 口径走样（有 spec，需拍板） | 3 | 参数或判据变了，spec 写了但与旧值不同 |
| 未登记缺口（小件） | 6 | host 面、可选件、触发面 |

最要紧的一句：**6.1 现在只有生产件、没有消费件**——六段叙事落库后，蒸馏端不认识它。旧院这个消费者是写死并带门禁的（C10g + greenlist），不是可选项。

---

## 一、核对口径

- 「消费侧」= 读 raw/wiki/实体表/事件表，产出下游可再用物（镜像、边、向量、分数、卡片、报告、准入决定）的组件。
- 证据优先序：v2 源码 + spec > v2 STATUS/HANDOFF > 旧院架构文档 > 旧院源码头注。
- 旧院文档有自相矛盾处（如 METABOLISM-PIPELINE.md 仍写 7 步，ARCHITECTURE.md 已更正为 11 步），以 ARCHITECTURE.md 为准。

---

## 二、已承接（对表通过）

| # | 旧院消费件 | v2 对应件 | 证据 |
|---|---|---|---|
| 1 | compile（raw→实体） | compile | SPEC-1.1 / test-1.1-compile |
| 2 | import-from-wiki（镜像+边） | import | SPEC-1.4 / test-1.4-import |
| 3 | auto-link（连边） | tri-axis-link + tri-axis-gate | SPEC-1.2 / SPEC-0.4 / test-1.6 |
| 4 | sync-links-to-fs | link-sync | SPEC-1.7 / test-1.7 |
| 5 | index-vectors | vector（后端可插拔） | SPEC-1.8 / 5.1 / test-1.8、test-5.1 |
| 6 | sprout | sprout | SPEC-1.9 / test-1.9 |
| 7 | pollinate | pollinate | SPEC-1.10 / test-1.10 |
| 8 | compress | compress | SPEC-1.11 / test-1.11 |
| 9 | recycle-seeds | recycle | SPEC-2.9 / test-2.9 |
| 10 | discard：prune 90 天门槛 | prune（90 天） | SPEC-1.13 / test-1.13 |
| 11 | neural-guide-chain 五因子注意力 | consciousness-kernel | SPEC-3.1 / test-3.1 |
| 12 | approvals-pending（W2 链） | omni-gate approval_queue | SPEC-2.16 / test-2.16 |
| 13 | auto-ingest（剥除/身份闸） | auto-ingest + scrub + api-gate | SPEC-3.5 / 3.6 / test-3.5、3.6 |
| 14 | memo 读数面 | memo（用户面重构） | SPEC-3.11 / test-3.11 |

---

## 三、部分承接 / 形态变更（需登记，不算缺口）

| # | 旧件 | v2 现状 | 差异 |
|---|---|---|---|
| 1 | vector-search 双模（384 语义 / 64 哈希） | vector 仅字面级（hash-64w2 默认，可插拔） | 语义模型未装；M5 已登记「由使用者语料复核」，非遗漏 |
| 2 | kespi-check 8 维**加权** + kespi_history 历史 | kespi 8 维**算术均值** + kespi_scores 当前值 | SPEC-1.12 明写不建历史表；权重表未迁 |
| 3 | kespi-enhance 5 维 metadata 第二轴 | 无对应 | **未在 v2 规格登记**，需判去留 |
| 4 | growth-loop（episode/decay 权重） | evolution-cycle T3（gene 衰减/归档） | gene 有，episode 权重无 |
| 5 | consciousness-layer briefing（热点/警报/建议） | memo（recent/openLoops/patterns/plans） | 形状换了，语义近似 |
| 6 | guide-chain-swarm（3 agent 投票） | dispatch-swarm（常驻 3 员） | 编组形似；**投票裁决**无对应 |
| 7 | db-live-reader（node:sqlite 直读） | store 注入直读 | 形态变，行为可接受 |

---

## 四、真缺口（旧记录有消费契约，v2 无件）

### 缺口 1 · 能力叙事消费侧（最高优先）——**2026-11-16 已补**

> **已补**：`spec/SPEC-6.2-能力叙事消费与蒸馏点.md` + `src/distill-points.js` + `test-6.2-distill-points.js`（7 AC 全绿）；默认链在 `distill` 之后新增 `distill-points` 步，蒸馏点落辅助表 `distill_points`。本缺口关闭，余下两组仍开。

- **旧院契约**：`aing/src/distill.js:103` `extractCapabilityRaw`——按「能力单元 / Capability Unit」区间捕获六段原话；起端双语锚（`/i`）、止端只认消费端中文节名（提取实体/标签/蒸馏摘要）；h1–h6 鲁棒；配套 C10g 门禁与 greenlist「capability-narrative-ingest」（green 31 / locked 3）。
- **旧院教训**：截断正则下六段只留 1 行，**94% 内容静默丢失**（`aing/docs/HANDOFF-2026-11-09-capability-narrative.md`）。
- **v2 现状**：`src/distill.js` 为「复制链保真」，只做状态转身 + 逐字复制；SPEC-1.5 §四 Non-Goal 写「内容改写属后续期」，但**没有任何后续任务承接**。6.1 只做了生产件（`capability-narrative.js`），全仓 grep `能力单元|Capability Unit|extractCapabilityRaw` 无消费者。
- **影响**：会话六段落库后被当普通正文复制，蒸馏端不抽原话、不建蒸馏点；6.1 的产出在代谢链里是死料。
- **建议**：新任务 6.2——把区间捕获落成 v2 独立抽取层，遵循交接单三条口径（层级鲁棒 / 起端双语 / 止端中文），带「不许过捕」负向证与门禁断言。

### 缺口 2 · 检索融合消费侧——**2026-11-16 已补**

> **已补**：`spec/SPEC-6.3-检索融合消费.md` + `src/retrieval.js` + `test-6.3-retrieval-fusion.js`（7 AC 全绿）；`predict` 已改接三路融合。唯一硬差异：不写 `last_access`。

- **旧院契约**：`aing/src/query.js` 五件事——三路加权融合（语义 0.6 / 关键词 0.25 / 名称 0.15）、慢回忆二跳扩展、伪精排（KESPI 0.15 + 新鲜度 0.1）、阈值单源 `growth.config.query`、附 KESPI 最新分。
- **v2 现状**：无 `query.js`；只有 `vector.js` 的 `search()`（纯向量 + 强度加权 + 双链去重）。`predict.js` 直接吃向量 top-N，`memo` 也只读库。
- **影响**：预案卡 basis 只有字面向量一条腿；SPEC-5.3 §七自己承认 top-1 仅 3/8。旧院已有的融合/二跳/精排结构没迁，等于把已知有效的补偿件丢了。
- **建议**：新任务 6.3——先迁「三路融合 + 伪精排」确定性部分（不引语义模型），词面 IDF 通道并入同一接口；评测集冻结后再判是否加权。

### 缺口 3 · 成长反馈与轨迹消费侧（一组五件）——**已补齐（6.4 + 6.5）**

> **6.4 已补**：`task_trajectories` 表（13 列 + 3 索引）+ `src/trajectory.js`；会话（六段/三源）与代谢轮各落一条，幂等只追加。
> **6.5 已补**：四件按「观察与执行分离」改姿态——`gap-scan` / `feedback-delta` / `self-model` 三件只读，由 T2 快照消费；`insight-extract` 只写 raw 链候选实体（confidence 0），走蒸馏门。自动调参与 `--fix` 明确不做。
> **6.6 已补**：内外维护接线——`maintenance-report.js` 单一出口，memo 外场见 `user.maintenance`（缺口/走势/待蒸馏洞察），meko 内场 T0 拿 `targets`、T2 拿 `insights`；执行仍归 2.12/2.13。

| 旧件 | 职责 | v2 现状 |
|---|---|---|
| feedback-loop | 执行前后快照 Delta、参数调优、学习记录 | 无件；只有 session-ingest 的 plan-hit/miss 边 |
| insight-extractor | lineage + 轮级 KESPI → insight 档（confidence 0，不自评） | 无件 |
| trajectory-store | `task_trajectories` 表 + 四条写入链（episode/rollout/tri-path/metabolism） | **无表无件**（v2 schema 12 张表无 trajectory） |
| gap-detector | 5 维缺口（孤立/稀薄/停滞/未索引/空内容） | 无件；helix-crosscheck 只做双链 gap，且 `reconciled=0` 占位 |
| metacognition-layer | 三层自我模型（实测 KESPI/覆盖率/错误率/响应时） + 策略调整 | 无件；evolution T2 是六维快照，不是自我模型调参 |

- **影响**：SPEC-0.7 要求「成长只认会话三源」，但三源入库后**没有轨迹落表、没有效果感知、没有缺口扫描**——成长闭环只有入口没有出口。evolution-cycle 的 T2 度量能看，但不能回答「上一轮做了什么、效果如何、下一轮改什么」。
- **建议**：拆成 6.4（轨迹表 + 三源落轨迹）与 6.5（反馈/缺口/元认知并入 evolution T2 与 field-maintain），或明确裁定只留其中一件。

### 缺口 4 · 三路裁决编排 —— **2026-11-17 已裁定：不迁**

- **旧院契约**：`aing/src/tri-path-orchestrator.js`——EXPLORE（向量+多样性）/ VERIFY（双佐证：边置信或 KESPI）/ OPTIMIZE（实体均分），队正裁决 + 熔断（failureThreshold=5 / resetTimeout=60s / halfOpenMax=3），状态落 `data/tri-path-state.json`。
- **v2 现状**：无对应。**注意**：v2 的「三轴判定」（SPEC-0.4）是**准入闸**（强度/配对/时效），不是三路执行裁决；两者名字相近、职能不同，不能互替。
- **裁定（2026-11-17 owner）**：外派蜂群是**采集面**（搜资料 / 看资料 / 按用户要求定厚度），不是裁决面。三路候选、择优裁断、熔断**一律不迁**；复杂判断仍单路直出，接受「一步失败无降级路径」这一代价。
- **落地**：`spec/SPEC-2.18-外派蜂群三分编组.md` 修订 B 已按内部总设定重写为「外派采集面」（七步派单 / 轨迹口径 / 来源分级 / 攻果门 / 基线门 / 两权分离 / 禁虚报），并写入「不做裁决、无熔断、批间用户闸」。
- **残留**：`dispatch-swarm.js` 目前无生产调用方（仅测试 require），接线待 memo 派工口落地时一并做。

---

## 五、未登记缺口（小件，建议一次性拍板）

| # | 旧件 | 处置建议 |
|---|---|---|
| 1 | sensory-ends（5s raw/ 轮询） | v2 改按需 CLI；**需在 STATUS 登记「有意不迁」**，否则下轮又会当成漏件 |
| 2 | scheduler（常驻调度） | 同上；v2 靠 orch/CLI + 宿主定时 |
| 3 | batch-ingest（并行入库） | 若宿主批量场景在，迁；否则登记不迁 |
| 4 | search-and-ingest（搜索→入库桥） | 依赖宿主面，建议随接口面一起判 |
| 5 | api-server entity REST | v2 只有 api-gate 纯函数 + control-plane 四路由；**无 entity 写面服务**。宿主接入前必须补或明确不补 |
| 6 | agent-dashboard / memo-call / memo-trigger / 两个 host adapter / ner-extractor | host 面与可选件；建议随发布范围一次性裁定 |

> **2026-11-17 owner 确认**：1/2 登记为有意不迁（v2 走按需 CLI 与宿主定时）；3–6 随宿主接口面与发布范围一次性裁定，不逐件开单。

---

## 六、口径走样（有 spec，但与旧值不同，需 owner 拍板）

| 项 | 旧值 | v2 值 | 依据 | 风险 |
|---|---|---|---|---|
| KESPI overall | 八维加权（0.15/0.12/0.13/0.12/0.13/0.10/0.15/0.10） | 八维算术均值 | SPEC-1.12 §二 | **已裁（2026-11-17）：维持均值**——维度语义已换，恢复权重只给旧数字假的可比性 |
| prune 判据 | ≥90 天未动 **且** KESPI < 0.5 | ≥90 天未动 **且** 强度 ≤3（背景带） | SPEC-1.13 | 去掉质量下限，低质高强实体不会被退；需确认是否刻意 |

> **6.7 补记**：prune 的「90 天未动」原先只读 `last_access`，而 v2 无人写它；已补 `access_hits` 访问事件接口（只追加，检索/memo 仍纯读），prune/compress/field-promote/KESPI 四处共用同一时钟。质量下限仍不进 prune——质量走降级证据链。
| memo 健康口径 | 三块：用户待办 / 健康判定 / 派单建议 | 同三块 + 向量诊断行（5.2） | SPEC-3.11 / 5.2 | 已扩展，非走样；登记备查 |

---

## 七、建议排期（按影响）

| 序 | 任务 | 理由 |
|---|---|---|
| 1 | 6.2 能力叙事消费 | 让 6.1 从「死料」变成闭环；旧院有现成口径与教训，风险最低 |
| 2 | 6.3 检索融合 | predict/memo 质量直接受制；SPEC-5.3 已承认单通道不可信 |
| 3 | 6.4 轨迹表 + 三源落轨迹 | 成长闭环的出口；不建则 SPEC-0.7 只有入口 |
| 4 | 6.5 反馈/缺口/元认知 | ✅ 已落地（四件：三只读 + 一候选写入） |
| 5 | 三路裁决去留 + 小件登记 | 一次拍板，防下轮再核 |

---

## 八、证据索引

- 旧院架构：`G:\DPD\aing\docs\Engineering\ARCHITECTURE.md`（79 模块清单、11 步链、双模检索）
- 旧院接口：`G:\DPD\aing\docs\Engineering\INTERFACES.md`（模块导出面）
- 旧院流水线：`G:\DPD\aing\docs\Engineering\METABOLISM-PIPELINE.md`（注意：7 步为旧版，以 ARCHITECTURE 11 步为准）
- 能力叙事交接：`G:\DPD\aing\docs\HANDOFF-2026-11-09-capability-narrative.md`
- 旧院消费件源码：`aing/src/query.js`、`distill.js:103`、`trajectory-store.js`、`insight-extractor.js`、`gap-detector.js`、`metacognition-layer.js`、`feedback-loop.js`、`tri-path-orchestrator.js`
- v2 现况：`STATUS.md`、`docs/HANDOFF-2026-11-16.md`、`src/knowledge-store.js`（12 张表清单）
- 同类核对记录（上一轮）：`docs/Engineering/EMBEDDING-BENCH-2026-11-16.md`

> **2026-11-17 补记**：`distill_points.points_json` 有写无读（原「内容层无消费者」），已由 6.10 补上消费者——predict 的 basis 增 `point` 类（关联实体首条蒸馏点），只读、不造依据；检索融合明确不加第四通道。
