# aing 蜂群功能专题研究（2026-11-03）

> 承接 COMPONENT-RESEARCH-2026-11-03.md，应所有者点单「尤其系蜂群功能」下钻。
> 定性先行：aing 有**两套蜂群 + 一套派单机制 + 一套蜂群近亲**，分属运行时决策层与开发时工程层，互不知晓对方存在。

## 〇、设计边界（所有者澄清，2026-11-03）——本研究的定性锚

所有者口述原设计意图（代码推不出，须记牢）：

1. **神经进化团队（neural-evolution-swarm，固定 5 角色）只负责 aing 自维护**——派单触发全是 aing 自身健康读数（selfAssessment/verify 红/gaps/selfImprovement），这是设计而非缺陷。它不该接对外工单。
2. **蜂群是对外派工用，数量不限**——动态创建临时 agent、按任务复杂度定规模、完即销毁。载体在宿主运行时面。
3. 因此「宿主运行时面没装 neural-evolution-swarm」**是对的**——自维护团队住在 aing 的 assets 里随包走，本来就不该装进通用运行时面；memo 的 swarmSearch 去探宿主技能根只是探测逻辑，探不到属正常，不构成缺口。
4. 本文第六节原建议 1「两套蜂群互不接线是最值的一条线」**按此边界修正**：自维护与对外派工分开是设计本意，不作桥接。保留的只有运行时投票补对抗检查一条（那属于导链蜂群自身的质量，与派工边界无关）。

## 一、蜂群全景清单

| 蜂群 | 层 | 角色 | 状态 | 真调用方 |
|---|---|---|---|---|
| guide-chain-swarm（导链蜂群） | 运行时·意识层决策 | 分析型/行动型/策略型 3 agent | **活** | hermes-aing-adapter.deliberateMaintenance、run-metabolism --smart |
| neural-evolution-swarm（神经进化蜂群） | 开发时·工程流水线 | theorist/engineer/trainer/analyst + adversarial-reviewer 5 角色 | **活（降级运行）** | memo --dispatch 健康驱动 + agent 手动 |
| memo --dispatch（派单机制） | 治理面 | 4 角色按异常读数路由 | **活** | memo.js swarmDispatch |
| tri-path-orchestrator（三路突击） | 工具面 | explore/verify/optimize + 队正裁决 | **活（CLI-only）** | npm run tripath |

## 二、guide-chain-swarm：运行时决策蜂群

**本质定性（最重要）**：三个"子Agent"是**规则启发式类，不是 LLM agent**——每个是一套确定性打分函数（guide-chain-swarm.js:44/135/194），"多Agent决策"= 多启发式置信度加权投票。同源同作者写就，**天然群体同向**——它有投票形状，没有对抗结构。

**调度逻辑**（:320-357）：critical=3 agent 全上 → high=分析+行动 → medium=仅行动 → low=仅策略（后台慢思考）。

**在意识链的位置**：`POST /api/consciousness/deliberate` → controller.deliberate → adapter.deliberateMaintenance（hermes-aing-adapter.js:204-265）→ kernel.ingest + guideChain.routeSignals 双路取注意力 → alertSeverity/topAttention 定紧急度 → swarm.deliberate → 共识 **requiresApproval: true**（只出共识要人批，不执行——意识层铁律）。

**已知修复与诚实边界**：
- 决策历史断线已修：旧读 system_log type='decision' 恒空（该表唯一写手写 'feedback'），2026-11-03 改读 metabolism-decision-lineage.jsonl（:253-276）
- 诚实边界登记在案：lineage 里 action 只有 execute/summarize 无 observe →「多次 observe→boost_growth」分支永假（:217，不硬造）
- 单代理投票形状归一修复（2026-09-04 超算部署复盘：透传原始形状导致共识被吞，:364-375）

**两个缺口**：
1. **CLI main 是演示假信号**（:462-475 硬编码 kespiTrend/fileChanges）——直接跑 CLI 出的报告不代表真状态，无「DEMO」标注，属假仪表位风险
2. **决策路径无对抗角色**：patch-12 把 adversarial-reviewer 加进了开发时蜂群的 Gate5，但运行时 deliberation 共识（这套投票）没有 devil 检查——三个同源启发式投出来的共识直接送人批

## 三、neural-evolution-swarm：开发时工程蜂群

**五角色五门禁**（workflow.md）：Leader 设计稿 → Gate2 theorist 六属性评审（✓≥4 且无关键✗）→ Gate3 engineer 回归全过 → Gate4a trainer 候选分>基线 ∥ Gate4b analyst 守恒比 0.8~1.5 → Gate5 adversarial-reviewer 只反驳不修复（无 critical/major 才放行出共识要人批，有则回炉≤1轮）→ Leader 终报（矛盾原样呈现）。

**对抗结构的设计动机**（SKILL.md 头注 + aing-operator/evolution-team.md）：单 agent 既当运动员又当裁判——工程师天然偏"能跑就行"，理论家天然偏"机制不成立"，矛盾必须分角色暴露。**四角色看同一份输入会往同一方向飘，共识质量不能全靠"四个都同意"**——这是 patch-12（2026-11-01，吸收 dsh-orchestrate 的 devil 合同）补第 5 角色的理由。

**资源约束**（bind.md）：45 分钟墙钟 / 300k token 总预算 / max_parallel=2（仅 trainer∥analyst）/ 角色间证据隔离（trainer 与 analyst 互不看对方产出）。失败降级阶梯完整：单角色缺失→inline persona 补位（终报标注降级损失）；diff>2000 行→降级为 engineer 单角色模式。

**部署面现状（2026-11-03 实证）**：
- 宿主面 `<e-yard>\assets\skills\` ✓（随包携带，bundled）
- 宿主运行时技能根 ✗——实测该目录 ~100 个技能但**无 neural-evolution-swarm** → memo 永远报 inline-degraded
- **memo 不知道的新事实**：宿主运行时 Agent 工具 + inline persona 就是可用的真派单运行时（真并行子代理、真隔离上下文、真 Gate 裁决）

**首战实录（2026-11-03 夜，安全债单）**——这套蜂群的第一次全流程真跑：
- 5 角色全部以独立子代理出场（非 Leader 自填）：engineer 修复 → reviewer 两轮（BLOCK 抓出数字抄错/证据自相矛盾/账本漏 4 处 execSync → 回炉 → PASS，且自更正己方 ×9 误记）→ Leader 集成
- **Gate5 真的拦下过共识**——对抗结构起作用的实证，不是纸面设计
- 成本：主会话外 4 个子代理合计 ~4.6M token，超 bind.md 300k 预算 ~15 倍（该预算是旧宿主运行时时代写的；子代理实测规模需重定标）

## 四、memo --dispatch：健康驱动的派单机制

- 异常读数→角色机器路由（memo.js swarmDispatch）：selfAssessment→theorist、verify 红/组件断链→engineer、selfImprovement △→trainer、gaps/distillDebt/reflowPending/kespi 跌破→analyst；P13 blockedGoals 按 blocked_code 路由
- 每单带 why/gate/how 三件套：交什么证据、过什么 Gate、怎么干；Gate 文案明标「转述 AGENTS 约定，仅供人看，不参与判定」
- **禁假称能派**纪律：inRuntimeSurface=false 时明说「本场我调不动它，按 inline 降级自办」——这是 aing 诚实原则在派单面的落点（C18 门禁钉住）
- adversarial-reviewer 不进 roles[]（按设计：它是门禁角色，非健康驱动入口，出共识要人批前 inline 填）

## 五、tri-path-orchestrator：蜂群近亲

explore（检索多样性）/ verify（链接+KESPI 双佐证）/ optimize（全库 KESPI）三路 + 队正裁决（≥2 路同意）+ 持久化熔断器（data/tri-path-state.json）+ 影子库 TRI_PATH_DB。影子期 improvement 恒 0（诚实纪律）。CLI-only 活码，未进任何自动链。

## 六、结构性发现与建议（按 §〇 设计边界修正后）

1. ~~两套蜂群互不接线~~ → **撤回**：自维护团队与对外派工蜂群分开是所有者设计本意（§〇），不作桥接。memo 若要改，只改文案：明标 neural-evolution-swarm 是「自维护专用团队」，防后人再当缺口提
2. **运行时投票无对抗**：guide-chain-swarm 三 agent 同源同向，建议按 patch-12 先例给它加一个 devil 检查步（规则-based 反例探测：共识动作的反向指标校验，如共识=full_metabolism 时检查 KESPI 是否真降），或明标「同源启发式投票，非独立证据」
3. **memo 的运行时探测面**：只认宿主技能根——按 §〇 边界这不构成缺口（自维护团队本就不装通用面）；真正值得登记的是「本会话运行时是否有子代理能力」（宿主运行时 Agent 工具），有则 inline 升级为真并行派单，memo 文案可加一句「本会话具备真子代理能力时，inline 模式可按角色独立派发」
4. **Gate4a 无法真跑是 trainer 永远的缺口**：需外部 SkillOpt+python；在环境就绪前 trainer 只出就绪度/缺口报告（禁报候选分>基线）——这直接连着 selfImprovement △ 的唯一残账
5. **bind.md 预算重定标**：300k token / 45min 是旧宿主运行时时代约束，新运行时首战实测 ~4.6M；按新运行时实测重写，否则预算永远形同虚设
6. **CLI 演示信号加 DEMO 标注**（guide-chain-swarm.js:462-475），消一个假仪表位

## 七、一句话总判

aing 的蜂群不是装饰：导链蜂群真在意识链里投票（每次 deliberateMaintenance），神经进化蜂群 5 角色刚打完首战且 Gate5 真拦过共识，派单机制带禁虚报纪律。设计边界清晰——**神经进化团队守内（自维护，固定 5 角色严门禁），蜂群对外（派工，数量不限动态组队）**。真正的短板只剩一条：运行时投票无对抗检查。
