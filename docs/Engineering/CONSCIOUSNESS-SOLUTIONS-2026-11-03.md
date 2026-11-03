# 意识神经模块缺口·外部解法研究（2026-11-03）

> 承接 COMPONENT-RESEARCH-2026-11-03.md 的三个真缺口 + selfImprovement 轨迹缺口。解法全部来自外部系统与论文，落地设计对齐 aing 现有纪律（证据优先、影子先行、门禁不跳过）。

## 缺口 1：channelWeights 回路「记账不生效」

**现状**：元认知回写的通道权重无读者参与 kernel 注意力计算（五因子硬编码 consciousness-kernel.js:50-57）——GWT「情境偏置」未闭合。

**外部解法**：
- **双系统元认知控制**（[HAL 双系统框架](https://hal.science/hal-05539022v1/file/TM_2.pdf)）：内环快（环境交互、固定参数），外环慢（元认知、有界调参）——两层**不同时间尺度**，外环不许直接改内环逻辑，只调内环参数
- **元认知反馈环**（[Emergent Mind](https://www.emergentmind.com/topics/metacognitive-feedback-loop)）：monitor→evaluate→adjust 三段式，adjust 的输出必须**回到行为层被消费**才算闭环
- [Metagent-P 的 Metacognitive Reflector](https://aclanthology.org/2025.findings-acl.1169.pdf)：反思器输出**量化**调参，不输出自然语言建议

**落地设计（aing 版双系统）**：
1. kernel.integrate 改读 `state.json.channelWeights`（归一化 + 上下钳位 ±0.05/轮），与固定五因子基线**并行算两份 attention**——基线照旧广播，调制分只记 lineage
2. 影子期纪律：两份分差进 `metabolism-decision-lineage.jsonl` 攒证据，分差对决策无增益（N 轮统计）→ 调制通路判死；有增益 → 翻真（门禁裁决，不是默认开）
3. 这与 aing 现有「影子模式产物只留档不判分」纪律同构，无新原则

## 缺口 2：感知自动化缺位（neural-architecture 孤岛）

**现状**：文件感知→意识的唯一自动通道全仓 0 require；sensory-ends 只扫顶层，raw/inbox/ 进不了快照。

**外部解法**：
- [Mem0 的后台管线](https://iotdigitaltwinplm.com/mem0-vs-letta-vs-zep-agent-memory-frameworks-comparison-2026)：extraction→consolidation→update 全异步后台跑——**摄取与消费解耦，触发器常驻**
- [Letta/MemGPT](https://automem.ai/blog/agent-memory-in-2026-an-honest-comparison-of-mem0-zep-letta-and-the-rest)：内存管理 agentic 化；Zep：时序知识图谱按时间感知摄取
- 检索确认：**file-watching 模式在主流记忆框架里反而是稀缺品**——aing 的 scheduler mtime 快照轮询（scheduler.js:148-160，弃 fs.watch 改轮询是 Windows 正确姿势）恰好是可靠做法，缺的只是接线

**落地设计（最小接线）**：
1. start-all 拉起第三个子进程：neural-architecture（30s tick 已有，:143-161），它已经是完整编排器，只差有人跑它
2. sensory-ends._getFiles 改递归（ consciousness-layer._getAllRawFiles 已修过的同形修复，:288 有现成写法可抄）
3. 信号→kernel.ingest 通道已建好（_handleSignal:85-107），零改动
4. 消抖：沿用 scheduler 的 mtime 快照对比，不引 fs.watch

## 缺口 3：审批链备而未接（controller 九个死导出）

**现状**：payload→readiness→request→approval→simulate 五步全建好，缺宿主串接。

**外部解法**（这题外部最成熟）：
- [LangGraph interrupt() 模式](https://machinelearningmastery.com/building-a-human-in-the-loop-approval-gate-for-autonomous-agents)：**代码级闸门**——暂停于 checkpoint、持久化状态、等人裁决、恢复执行
- [实战者关键教训](https://www.reddit.com/r/LangChain/comments/1ux4rt3/i_built_a_human_approval_gate_for_langchain)：闸必须在代码路径不在提示词——模型能推理绕过"请确认"，绕不过代码条件边
- [StackAI 运行时控制模式](https://www.stackai.com/insights/human-in-the-loop-ai-agents-how-to-design-approval-workflows-for-safe-and-scalable-automation)：HITL 是 runtime 控制面，不是对话礼貌

**落地设计（aing 已有 80%，只差三针线）**：
1. `deliberate → prepareFeedbackApprovalRequest` 结果落 `data/consciousness/approvals-pending.json`（=LangGraph 的 checkpoint 持久化）
2. memo 已有待办/告警面——pending approval 注入 memo（人批入口现成，不用新 UI）
3. `neural.js record` 命令就是 resume 入口：读 pending、接人的裁决、走 verify→record 收尾，审批 id 匹配校验在代码里（防错批/重放）
4. **关键借鉴：闸在代码不在提示**——api-server 的 deliberate 路由已返回 requiresApproval:true，执行侧必须校验 approval 存在且未消费才放行

## 缺口 4（连带）：selfImprovement 轨迹前提

**现状**：trajectory-store 头注声称的 4 条自动写入链不存在，M4 轨迹数据无自动供数。

**外部解法**（这条外部积累最深）：
- [ExpeL](https://arxiv.org/abs/2308.10144)：从轨迹**抽取自然语言 insights**，add/edit/vote 迭代精炼，决策时检索——**无参数更新**的自改进，与 aing 无 LLM 依赖的机械蒸馏气质相容
- [AWM（Agent Workflow Memory）](https://arxiv.org/abs/2409.07429)：从成功轨迹归纳**可复用工作流**入记忆
- [Voyager](https://arxiv.org/abs/2305.16291)：可验证技能库（技能=可执行代码，可组合复用）
- 共同范式：**execute → reflect/extract → store → retrieve → improve**，全部不碰权重

**落地设计（aing 的半成品拼图）**：
1. run-metabolism 链尾已写 metabolism-decision-lineage.jsonl——trajectory-store 的 `--import-metabolism` CLI 已存在，**只差在链尾调一次**（或 cron），轨迹表即刻有真供数
2. ExpeL 式 insight 抽取落 `raw/growth/*.md`——growth-docs 的写入通道与 compile 的消费端**都已建好**（consciousness-kernel 经 growth-docs 写、compile 递归吃 raw/），当前只是没东西可写（raw/growth/ 空）
3. growth-loop.promoteImprovement 的四门（测试/评估/基线 margin 0.02/回滚）与 ExpeL 的 vote 机制同构——Gate 结构现成
4. 真正缺的是 **insight 抽取器**：从 lineage + kespi_history 机械抽「什么动作对应什么分差」，产出候选 insight 交四门——这是唯一需要新写的件（可先做无 LLM 的统计版，与 distill 的机械蒸馏同风格）

## 优先级建议

| 序 | 件 | 工作量 | 收益 |
|---|---|---|---|
| 1 | 轨迹自动供数（链尾 hook） | 极小（一调用） | selfImprovement 有了证据前提，△ 有路可翻 |
| 2 | 审批链三针线 | 小（落盘+memo 注入+record 校验） | 九个死导出复活，意识层闭环最后一米 |
| 3 | 感知接线（start-all + 递归扫描） | 小 | 事件不再只靠代谢尾投递 |
| 4 | insight 统计抽取器 | 中（唯一新件） | 轨迹→知识→代谢的进化环闭合 |
| 5 | channelWeights 影子调制 | 中 | GWT 情境偏置闭合，按影子纪律验证后翻真 |

## 来源

- [GWT×传感运动 in-silico 模型](https://www.researchgate.net/publication/385558257_Consciousness_in_Artificial_Systems_Bridging_Global_Workspace_and_Sensorimotor_Theory_in_In-Silico_Models) · [Anthropic Claude 全局工作空间分析](https://aiweekly.co/alerts/anthropic-identifies-a-global-workspace-inside-claude)
- [Mem0 vs Letta vs Zep 对比](https://iotdigitaltwinplm.com/mem0-vs-letta-vs-zep-agent-memory-frameworks-comparison-2026) · [2026 记忆框架诚实比较](https://automem.ai/blog/agent-memory-in-2026-an-honest-comparison-of-mem0-zep-letta-and-the-rest)
- [HITL 审批闸构建](https://machinelearningmastery.com/building-a-human-in-the-loop-approval-gate-for-autonomous-agents) · [LangGraph](https://www.langchain.com/langgraph) · [实战审批闸](https://www.reddit.com/r/LangChain/comments/1ux4rt3/i_built_a_human_approval_gate_for_langchain) · [StackAI HITL 设计](https://www.stackai.com/insights/human-in-the-loop-ai-agents-how-to-design-approval-workflows-for-safe-and-scalable-automation)
- [ExpeL](https://arxiv.org/abs/2308.10144) · [AWM](https://arxiv.org/abs/2409.07429) · [Voyager](https://arxiv.org/abs/2305.16291)
- [双系统元认知控制](https://hal.science/hal-05539022v1/file/TM_2.pdf) · [元认知反馈环](https://www.emergentmind.com/topics/metacognitive-feedback-loop) · [Metagent-P](https://aclanthology.org/2025.findings-acl.1169.pdf)
