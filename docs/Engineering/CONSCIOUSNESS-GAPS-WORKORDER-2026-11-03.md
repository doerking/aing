---
tags: [engineering-docs:8]
---

# 意识神经模块·缺口工单清单（2026-11-03）

> 用途：给实施 agent 的发单底稿。每单自包含（实施者无需本会话上下文）。
> 配套文档：CONSCIOUSNESS-SOLUTIONS-2026-11-03.md（每单的解法与外部依据）、COMPONENT-RESEARCH-2026-11-03.md（组件全景）。
> 总纪律见 §五 红线——每单开工前必读。

## 缺口总表（意识神经模块 10 单 + 管线 2 单）

| # | 单 | 层 | 工作量 | 优先 |
|---|---|---|---|---|
| W1 | 轨迹自动供数 | M4 进化环 | 极小 | P0 |
| W2 | 审批链接线（九死导出复活） | controller | 小 | P0 |
| W3 | 感知自动化接线 + 递归扫描 | sensory-ends / neural-architecture | 小 | P1 |
| W4 | insight 统计抽取器 | 新件 | 中 | P1 |
| W5 | channelWeights 影子调制 | kernel / metacognition | 中 | P2 |
| W6 | 代谢日志 before/after 信号修复 | metabolism-log | 小 | P1 |
| W7 | 导链蜂群三小修（observe 永假 / CLI 假信号 / 兴趣因子常数化） | guide-chain-swarm | 小 | P2 |
| W8 | consciousness-event "null" 污染 | consciousness-event | 极小 | P2 |
| W9 | 两处死码处置（boot-sequence / interchange-router） | 孤岛件 | 小 | P2 |
| W10 | 面板假仪表两处（subchain_debts / top_guide_chains） | metabolism-panel | 小 | P2 |
| W11 | search-and-ingest --web 伪造结果入库（管线 P0） | search-and-ingest | 小 | P0 |
| W12 | distill/prune 未接 metabolismBusy（管线 P0） | distill / prune | 小 | P0 |

---

## W1 轨迹自动供数（P0，极小）

- **现状**：trajectory-store.js 头注声称 4 条自动写入链（growth-loop/SkillOpt/tri-path/run-metabolism → logEpisode/logRollout/logTriPath），对应方法不存在，全仓 0 外部写者——task_trajectories 表只能手工 CLI 导入。selfImprovement 六属性的轨迹前提实际无供数。
- **缺**：run-metabolism 链尾（写完 metabolism-decision-lineage.jsonl 之后，:576-582 附近）调 trajectory-store 导入。trajectory-store 已有 `--import-metabolism` CLI 路径（:236-255，真源=metabolism-decision-lineage.jsonl）。
- **补法**：链尾 require trajectory-store（或 spawnSync 其 CLI）执行 lineage 导入；失败不阻断主链（同 trigger-log 的静默降级风格，trigger-log.js:39-57 是样板）。
- **验收**：跑一次全量代谢后 `node src/trajectory-store.js --count` > 0，且 trajectory 行数与 lineage 新增行数对得上；verify C0-C20 全绿。
- **红线**：不改 lineage 格式；失败不得抛出断链。

## W2 审批链接线（P0，小）

- **现状**：consciousness-controller.js 九个审批方法（createEpisode/proposeActionHypothesis/recordFeedbackPayload/checkFeedbackReadiness/classifyDecisionBoundary/simulateFeedbackProviderSubmission/recordFeedbackApprovalDecision/prepareFeedbackApprovalRequest/decision）全仓 0 调用；controller 10 态中 executing/recovering/stagnant 三态无赋值点，waiting-approval 仅死导出可达。
- **缺**：deliberate 产出的审批请求的「持久化 → 人见 → 人批 → 恢复执行」四步。
- **补法**（LangGraph interrupt 模式的 aing 版，解法依据见 CONSCIOUSNESS-SOLUTIONS §缺口3）：
  1. `prepareFeedbackApprovalRequest` 的产出落 `data/consciousness/approvals-pending.json`（原子写，tmp+rename，学 knowledge-store._save :203-217）
  2. memo 读端注入 pending 审批（memo.js buildMemo 加一块，人批入口现成）
  3. `neural.js record` 接为 resume 入口：校验 approval id 存在且未消费 → 记录裁决 → verify→record 收尾 → 从 pending 移除
  4. **闸在代码不在提示**：api-server deliberate 路由已返回 requiresApproval:true（hermes-aing-adapter.js:263）——执行侧必须代码校验 approval 存在且未消费，不靠提示词
- **验收**：deliberate → pending 文件出现 → memo 可见 → `neural.js record <id> approve` → pending 消失 + lineage 落记录；重复 record 同 id 被拒；verify 全绿。
- **红线**：不改变 providerWriteAllowed=false 的既有安全边界；state.json 的写面仍只有 kernel。

## W3 感知自动化接线 + 递归扫描（P1，小）

- **现状**：neural-architecture.js（文件感知→意识唯一自动通道）全仓 0 require、不在 scheduler/start-all 任何主链；sensory-ends._getFiles 只扫顶层（:143-149），raw/inbox/ 子目录进不了快照（consciousness-layer._getAllRawFiles :288 修过的同形病）。
- **补法**：
  1. start-all.js 增拉第三个子进程 neural-architecture（同 :22-25 的 spawn 风格，纳入 fail-fast 树杀）
  2. sensory-ends._getFiles 改递归（照抄 consciousness-layer.js:288 的递归写法）
  3. 消抖沿用 mtime 快照对比，**不引 fs.watch**（scheduler.js:7 已有 Windows 弃 watch 的前科记录）
- **验收**：start-all 三进程齐；往 raw/inbox/ 落一个测试档 → 30s 内 kernel state.json activeEvents 出现对应事件；撤测试档恢复。
- **红线**：事件只读不写知识库（C16 读端纯读纪律）。

## W4 insight 统计抽取器（P1，中，唯一新件）

- **现状**：raw/growth/ 空——growth-docs 写道与 compile 消费端都建好，无内容可写；轨迹（W1 之后）有供数但无人提炼。
- **补法**（ExpeL 式 extract→store，无 LLM 统计版，与 distill 机械蒸馏同风格）：
  1. 新件 `src/insight-extractor.js`：读 metabolism-decision-lineage.jsonl + kespi_history，按「动作 → 前后 KESPI 分差」聚合统计，产出 top-N 候选 insight（结构化：条件/动作/效果/样本量）
  2. 产档落 `raw/growth/insight-*.md`（frontmatter 带 confidence 0 + pending-distillation，同 auto-ingest 的身份铁律 auto-ingest.js:141-142）
  3. 下轮 compile 自然代谢；growth-loop.promoteImprovement 四门（Gate-3 基线 margin 0.02）做晋级闸
- **验收**：跑抽取器 → raw/growth/ 产档 → 代谢后实体入库可检索；无数据时空跑优雅退出；四门拒绝路径可复现。
- **红线**：**禁报「候选分>基线」**除非四门真过（skill-trainer 同款纪律）；insight 不得自执行任何动作（growth-docs 头注契约 :5-8）。

## W5 channelWeights 影子调制（P2，中）

- **现状**：metacognition 回写的 channelWeights 存进 state.json 但无读者——kernel 五因子硬编码（consciousness-kernel.js:50-57），GWT 情境偏置未闭合。
- **补法**（双系统元认知控制，CONSCIOUSNESS-SOLUTIONS §缺口1）：
  1. kernel.integrate 并行算两份 attention：固定五因子基线（照旧广播）+ state.json.channelWeights 调制分（归一 + 每轮钳位 ±0.05）
  2. 调制分只记 lineage（与基线分差一并记），影子期 N 轮统计分差对决策有无增益
  3. 有增益 → 开关翻真（consciousnessTuning() 加旋钮，C17 单源纪律）；无增益 → 调制通路判死并登记
- **验收**：影子期 lineage 出现双分记录；旋钮关时行为与现状字节级一致；旋钮开时调制分生效且权重钳位可复现。
- **红线**：默认关（影子）；不改变 state.json 写者唯一性。

## W6 代谢日志 before/after 信号修复（P1，小）

- **现状**：metabolism-log.js:51-54 的 kespi_before 按 run_id 查上一条，而 runId 每轮重新生成（run-metabolism.js:518）→ prev 永远查不到 → before 恒等于 after，SkillOpt Gate 的反馈信号恒零差。
- **补法**：prev 查询改跨 run 口径（按 kespi_history 最近一条、或 metabolism_log 表按时间倒序取上一条的 after），二选一以 kespi_history 为准（它才是分数真源）。
- **验收**：连续两轮代谢后 metabolism_log 第二轮的 kespi_before ≠ kespi_after（除非分数真没变）；历史行不被改写。
- **红线**：只改查询口径，不动表结构。

## W7 导链蜂群三小修（P2，小）

- **现状**（guide-chain-swarm.js）：①「多次 observe→boost_growth」分支永假（:217，lineage 无 observe 动作，诚实边界已登记）；② CLI main 硬编码演示信号（:462-475）无 DEMO 标注，假仪表风险；③ userInterests 硬编码示例词（neural-guide-chain.js:39-44，兴趣因子退化常数 0.5）。
- **补法**：① 观察 action 真源判定：lineage 无 observe 属实——从 growth-director 决策记录补 observe 落库，或删该分支并留档（二选一，实施者按现场取证后定，勿硬造数据）；② CLI 输出加「⚠ DEMO 信号，非真状态」横幅；③ userInterests 改读 config（growth.config 加段，config-runtime 单源）。
- **验收**：CLI 有 DEMO 标注；config 改兴趣词 → routeSignals 打分变化可复现。
- **红线**：不硬造 observe 数据。

## W8 consciousness-event "null" 污染（P2，极小）

- **现状**：consciousness-event.js:33-34 `text(input.center, null)` 把 null 归一成字符串 "null"，state.json 的 centers/candidateIds 全是 "null" 垃圾值。
- **补法**：null 输入归一为 null/undefined（不进字符串），state.json 清一次存量污染。
- **验收**：新事件无 "null" 字符串；存量 state.json 清理后 kernel 功能回归正常（memo/api 读数不变）。

## W9 两处死码处置（P2，小）

- **boot-sequence.js**：0 require + 三处 `modules.X.default` 断流（真跑知识/生长/元认知三块必落 risks）。处置二选一：修 `.default` 并接线（它收集的「第一印象」与 memo 有互补面），或登记收敛进 memo 并归档——按 P1-1 先例写处置记录，勿悬置。
- **interchange-router.js**：0 调用 + 策略档 config/interchange-routing.json 不存在（构造即抛）。处置二选一：补策略档最小版并接一个消费方（查询侧安全路由是现成能力），或归档。**归档 ≠ 删**（aing 有「死孪生登记」先例，学 db-time 的处置风格）。
- **验收**：处置记录落 docs/Engineering/（修了→接线证据；归档→登记行）。

## W10 面板假仪表两处（P2，小）

- **现状**：metabolism-panel.js ① health.subchain_debts 硬编码 0（:131 附近）；② chains.top_guide_chains 恒 []（:153）。
- **补法**：① subchain_debts 接真源（auto-ingest pendingSessions / 待办账）；② top_guide_chains 读 guide-chain routes jsonl 最近记录，或删字段并登记（假字段比缺字段更毒——KESPI 断线审计的核心教训）。
- **验收**：panel.json 两字段要么真数据要么不存在；verify C9c 面板 schema 门同步改（schema 变了别忘钉）。

---

## 管线 P0 两单（非意识层，实施 agent 可顺带）

## W11 search-and-ingest --web 伪造结果入库（P0，小）

- **现状**：`--web` 调 `node src/query.js --mode web`（search-and-ingest.js:55），query.js 无此模式 → 恒落 fallbackSearch 伪造模拟结果（:73-96）→ 伪 URL 入 raw/ 污染代谢链。
- **补法**：禁用伪造——fallback 只打印模拟说明不入库（或 --web 面直接报「未接真搜索源」退出非零）；--page 面真活保留。
- **验收**：`--web` 不再产入库档；负向验证（伪 URL 不出现在 raw/ 与 DB）。

## W12 distill/prune 接 metabolismBusy（P0，小）

- **现状**：distill.js 与 prune.js 是仅有的两个未接 metabolism-lock 的 DB 写端（grep 实证无 require）——代谢持库期手动跑会整库快照互吞（last-writer-wins）。
- **补法**：入口加 metabolism-lock 拒写检查（exit 3 + refuseLine 统一文案，样板 auto-link.js:51-54）；链内子进程凭 AING_METABOLISM_CHILD 豁免（metabolism-lock.js:26 现成机制，STEPS 调用不受影响）。
- **验收**：模拟持锁（手造 data/metabolism.lock 带活 pid）→ 手动跑 distill/prune 被拒 exit 3；全量代谢 11 步照常全绿。

---

## §五 红线（每单开工前必读）

1. **commit 会被 Mimosa git-gate 拦**（77H/24M 存量告警全是已归因误报，闸不认归因账）——改动完成后**留在工作树**，勿自行拨 MIMOSA_GIT_GATE_MODE/MIMOSA_NO_GIT_GATE 开关（所有者保留拍板权），勿改 .mimosa/ 下任何状态。
2. **全量回归**：每单完成后跑 `node verify-deploy.js`，必须 ALL GREEN（C0-C20 32 项）；门禁计数（C19 钉的四处手抄数字）不许因加新件而漂——新件不注册新 C 门，验收走各单自带验收行。
3. **最小可验证改动**：不顺手重构、不升级依赖、不修单外的东西（安全债归因账 docs/Engineering/SECURITY-DEBT-TRIAGE-2026-11-03.md 里判「可保留」的告警勿动）。
4. **禁触面**：src/memo.js 的 agentSurface 节与 KESPI-DISCONNECT 2 文档是所有者未收口改动（W2 的 memo 注入除外——加块不碰 agentSurface 节）；.mimosa/、training/runs/、raw/、wiki/、knowledge.db 不入 git。
5. **诚实纪律**：修不了/测不了明说（影子模式产物只留档不判分；禁报「候选分>基线」）；证据一律 file:line；矛盾原样呈现不静默调解。
6. **派单方式**：本机运行时无 subagent 装载面时，读 aing `assets/skills/neural-evolution-swarm/roles/*.md` 抽「Inline Persona for Teammate」段执行（senior-engineer 为主，改完交 adversarial-reviewer 挑刺一轮）；团队只管自维护，对外工单不走这套（所有者设计边界）。
