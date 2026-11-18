---
tags: [aing-v2, 状态, 进度, single-source-of-truth:9, must-read:9]
description: aing-v2 重写进度唯一真源——78 任务状态/spec/test/证据三指针，其余文档只引用不复述
date: 2026-11-16
status: active
---

# aing-v2 重写 · 进度真源（STATUS）

> **本表是唯一进度真源。** 其它文档（MASTER / 任务级规划 / 交接）只引用本表，唔复述状态。
> 更新规则：每任务收口三件套 = spec 一节 + test 一档 + 本表一行 + git 一笔。
> 状态口径：`✅ 完成`（spec+test+证据齐）/ `🟡 部分`（有实现无完整验收）/ `⬜ 未做`。

## 〇、基线

| 项 | 值 |
|---|---|
| 代码库 | `G:\DPD\aing-v2`（git 已初始化，基线 commit `361ee98`）|
| 旧库 | `G:\DPD\aing` 冻结只读，**唔碰** |
| 门禁 | `node verify-deploy.js` → C0–C5 ALL GREEN（2026-11-16）|
| 测试 | `npm test` → 143 档 / 931 条断言全绿 |
| test 计数守 | `npm run test:guard`（基线 `test/baseline.json`，只加唔减）|
| 任务总数口径 | **78 任务**（M0=5(+3 附) / M1=15 / M2=18 / M3=15 / M4=6 / M5=3 / M6=15 / M7=1）|

> **2026-11-16 owner 取态（SPEC-0.6）**：aing 全组件转 DNA 范式；meko 中间质贯彻全架构（编排唯一入口 + 组件契约）；9 段分三带，**中间 6/5/4 段跑时界场域**负责双铰链维护与提升；全仓 md 走 Tolaria 9 段格式（门禁 C4）。本取态取代「meko 旁挂四件类」薄版。
> **2026-11-16 摆位裁定（SPEC-0.8）**：进化团旧院一直旁挂无定位，今次**入驻 meko 中间质**——五成员（gene-keeper / omni-gate / pilot / tri-cross / poll）按组件契约注册，蜂巢形态共享同一中间质，T0 定焦 / T1 复核 / T2 度量 / T3 演化 四时点 × 六维（结构/强度/度量/时序/成员/用户）全程维护；判定与执行分离，写入仍由场域件 2.12/2.13 做。
> **2026-11-16 修订 A（SPEC-0.8 §九–§十）**：五角色身份与职责**不动**，三分编组下沉到子层——每位自带 ≤2 子agent（狼位），5 单元 × 3 员 = 15 席，观察层由狼位补。外派蜂群照旧院条令：常驻 3 员单位、**派出前底版范式（语言+行为+工作流）先于任务链**、单间不互斥滚动派发、收口后交接自然消逝（只回残渣）。守内/对外仍互不派单不桥接，两边只共同接住 meko 的派出口与残渣吸入口。**旧五角色（neural-evolution-swarm）归 memo 做外场维护**（无 meko 写权、无场域带权限）；内场加狼位（2.17），外场**唔加常设子agent**（重活交外派）。维护纪律直接对齐**双相循环**（一轮点样转）与**决策闸**（一个动作点样拍板）；发布包内唔用内部术语。
> **2026-11-16 缘起口径（SPEC-0.7）**：本能=场域自动；意识=决策与预判；**成长只认会话三源**（回复/搜索展示/事由分析）；**预判=发芽代谢出有据预案**；memo 把主驾注意力转向用户；内成员与主驾隔着 memo。
> **2026-11-16 修订 B（SPEC-0.8 §十二）**：11-10 物业设定只复制骨架、改名、语义重填，skills 未导入；v2 五成员又按代码组件映射，`skill-trainer` 无继任。今次按「域边界照旧、技能内容搬入」处理——五成员增 `skills` 列，训练师并入 `gene-keeper`，KESPI 误差闭环由 SPEC-6.8 承接，不接外部 SkillOpt/LobeHub。

## 一、M0 全架构 spec（5/5）

| # | 任务 | 状态 | spec | 证据 |
|---|---|---|---|---|
| 0.1 | 数据模型 | ✅ | `spec/SPEC-0.1-数据模型.md` | test-1.1-dataschema 6/6 |
| 0.2 | meko 四顶接口 | ✅ | `spec/SPEC-0.2-meko四顶接口.md` | test-2.8-meko-four 5/5 |
| 0.3 | 时界调度协议 | ✅ | `spec/SPEC-0.3-时界调度协议.md` | test-2.4-timebound 5/5 |
| 0.4 | 三轴判定 | ✅ | `spec/SPEC-0.4-三轴判定.md` | test-1.6-triaxis-gate 8/8 |
| 附 | 内外蜂群接线 | ✅ | `spec/SPEC-0.5-内外蜂群接线与部署重设.md` | 文档面 |
| **0.6** | **meko 贯彻全架构 × 中间三段时界场域** | ✅ | `spec/SPEC-0.6-meko贯彻全架构-中间三段时界场域.md` | doc-tags-lint 6/6 + C4 |
| **0.7** | **双系统运行协议（本能×意识×预判/成长闭环/预案）** | ✅ | `spec/SPEC-0.7-双系统运行协议-成长闭环与预案.md` | 规格拍板（实现挂 M3）|
| **0.9** | **md9 两面（文档面入口标签 / 实体面段位）** | ✅ | `spec/SPEC-0.9-md9两面-文档面与实体面.md` | test-0.9-md-profile 5/5 + `--profile entity` |

**M0 拍板**：2026-11-16 owner 授权 Hana 揸 fit 布置，M0 各份 spec 视为拍板通过，开 M1。

## 二、M1 核心代谢双铰链化（15/15 ✅ M1 完成）

| # | 任务 | 状态 | spec | test |
|---|---|---|---|---|
| 1.1 | 骨架 + knowledge-store（全列 schema）| ✅ | 0.1 | test-1.1-dataschema 6/6 |
| 1.2 | failing test：双铰链拓扑锁行为 | ✅ | 1.14 | test-1.14 AC-2/AC-3（螺旋 + 状态穿透）|
| 1.3 | compile 双铰链化 | ✅ | 1.1 | test-1.1-compile 6/6 |
| 1.4 | import 入库（双链写入）| ✅ | 1.4 | test-1.4-import 7/7 |
| 1.5 | distill 蒸馏（复制链）| ✅ | 1.5 | test-1.5-distill 7/7 |
| 1.6 | link 三轴化 + 三轴 gate | ✅ | 1.2 | test-1.6-link 5/5 + test-1.6-triaxis-gate 8/8 |
| 1.7 | link-sync 同步 | ✅ | 1.7 | test-1.7-link-sync 6/6 |
| 1.8 | vector 向量（strength 加权）| ✅ | 1.8 | test-1.8-vector 7/7 |
| 1.9 | sprout 发芽（含 P3 sproutFloor）| ✅ | 1.9 | test-1.9-sprout 6/6 |
| 1.10 | pollinate 授粉 | ✅ | 1.10 | test-1.10-pollinate 6/6 |
| 1.10 修订 A | 退役边仍占位（pollinate 重跑幂等） | ✅ | `spec/SPEC-1.10-pollinate授粉.md` §七 | test-1.10-pollinate 8/8（AC-7 退役边重跑不抛 UNIQUE、不增行；AC-8 future 产物不参与授粉）；起因 2026-11-18 真库连跑第二轮撞 `UNIQUE constraint failed: links.source_id, links.target_id`——去重集合只装有效边，退役边仍占 PK |
| 1.11 | compress 换锚 | ✅ | 1.11 | test-1.11-compress 7/7 |
| 1.12 | kespi 五维（2026-11-18 修订 A） | ✅ | `spec/SPEC-1.12-kespi八维.md` §七 | test-1.12-kespi 8/8：五维（KQ/KA/KD 催化率/KC 时序相干/KR 续航）落表、KG/KM/KB 写 NULL、overall=五维均值、KQ 去卡片壳、KD 只认出向强边、KC 按派生件同轮在世占比（窗口只取有账的 executed 轮）、KR 在场占比、幂等与铁律；真库实跑 322 条：均值 0.5502（min 0.287 / max 0.87）、≥0.55 共 114 条；消费方同步重定：field-promote 0.55（成真闸，前 36%）、evolution-team 0.45、self-optimize ZONES 0.45/0.60、维规则 kq/ka/kr + kd（仅入向强边≥2 开 rebond 单） |
| 1.13 | prune 逻辑退役 | ✅ | 1.13 | test-1.13-prune 7/7（判据已切 SPEC-6.11 四件） |
| 1.14 | **meko-orchestrator 编排（关键路径尾）** | ✅ | 1.14 | test-1.14-orchestrator 6/6 |
| 1.16 | 轮账与逐条存活（代谢记账层） | ✅ | `spec/SPEC-1.16-轮账与逐条存活.md` | test-1.16-round-ledger 6/6：建表与 links.cycle_id 迁移、每轮 320 类实体快照（alive/accessed/degree/content_len/strand）且同轮幂等、访问锚取 last_access 与 access_hits 更近者（≤7 天）、上一轮后新边归本轮（历史边留空）、账本按轮次有界（keepRounds）、编排 _writeCycle 接线且失败不阻断；真库副本实测：320 行/轮、单轮约 69KB，缺省保留 30 轮≈2.1MB（60 轮≈4.2MB 会顶手机端 10MB 上限，故定为 30）；边归属 0 条（真库 2292 条历史边均早于上一轮，保持记账前，符合预期）；真库实跑（2026-11-18，冷备 knowledge-20261118-011305-preledger.db）：首轮 320 行/8 条归属边，暴露并修复 pollinate 撞退役边 UNIQUE（修订 A）与 import/pollinate 撞 future→past 两个幂等 bug；修复后一轮 21 步全绿，账本 322 行、8 条新边归属，future 产物已正常打标；库体积 4.80→5.29MB（5 轮账≈0.35MB）|
| **1.15** | **场域骨架 + 组件契约门禁（arch-lint C5）** | ✅ | 1.15 | test-1.15-field 8/8 + C5 |

## 三、M2 meko 四顶职责 + 进化团入驻（19/19 已落地）

| # | 任务 | 状态 | spec | test |
|---|---|---|---|---|
| 2.1 | ① HydrogenBond 弱键可逆 | ✅ | 0.2 | test-2.8-meko-four AC-2 |
| 2.2 | ② HistoneLayer 分层 | ✅ | 0.2 | test-2.8-meko-four AC-3 |
| 2.3 | failing test：时界时延上界 | ✅ | 0.3 | test-2.4-timebound AC-2 |
| 2.4 | ③ TimeboundOrchestrator | ✅ | 0.3 | test-2.4-timebound 5/5 |
| 2.5 | ③ SLB/SLE 双模分流 | ✅ | 0.3 | test-2.4 AC-3 |
| 2.6 | ③ Polar 抗干扰 | ✅ | 0.3 | test-2.4 AC-4 |
| 2.7 | ③ 通感一体（KESPI 内嵌）| ✅ | 0.3 | test-2.4-timebound AC-5（每轮写非空 `kespi_snapshot`）；6.9b 起改读 `kespi_scores.overall` 活跃实体均值、仅零读数才落占位并标 `placeholder`，`kespi_source` 入 `meko_cycles`；八维明细未单独消费（探健康只需标量，非缺口）|
| 2.8 | ④ HelixCrosscheck | ✅ | 0.2 | test-2.8b-helix-reconcile 6/6：gap 只数活跃、配对视同场域口径（无前缀归 raw 链）、`reconciled` 取账本真值（目标实体真被补出）、可按 cycle 圈定、只读；同时修掉旧实现「同 id 跨链比对」的恒 gap 缺陷；真库副本读数：320 实体 → wiki 孤儿镜像 31（raw 侧已不在）、wikiGaps 0、账本对返 86 |
| **2.9** | **回炉接线 P6（recycle-seeds 入 STEPS + 门禁断言）** | ✅ | `spec/SPEC-2.9-回炉接线.md` | test-2.9-recycle 6/6；`metabolism.DEFAULT_STEPS` 含 recycle + 编排器真收契约 |
| **2.10** | **守恒闸 P2/P3（sproutFloorPerCycle 2–4，守恒比 ∈[0.8,1.5]）** | ✅ | `spec/SPEC-2.10-守恒闸.md` | test-2.10-conservation 6/6；36 轮每轮产出 2–4、累计比 1.0；每轮落 meko_cycles 三列；修订 A：Infinity 保留为合法读数（不改哨兵），差分侧非有限不出数、标 `ratioState`；修订 B：主读数统一到边层（候选边/退边同量纲），实体层单列 `pruned + backlog`（backlog 取 retention 候选数），报警面 `gate.alerts`，旧混口径保留一版不进报警；test-2.10b 6/6 + test-2.10c 6/6；修订 C：消费者显示口径同源（memo 系统行印边层 `growth:pruned` + 待退 backlog，混口径比值不再上屏），test-3.11c 5/5；修订 D：轮账三列（growth/pruned/ratio）改取边层，实体退场不冒充 pruned，零退边落合法 Infinity，test-2.10d 5/5 |
| **2.11** | **存量 hub 裁剪（非改准入；带误删=0 负向证）** | ✅ | `spec/SPEC-2.11-存量hub裁剪.md` | test-2.11-hub-trim 7/7；只剪弱边(<5)、强边零退、原因码可逆；修订 A：双超 cap 单向让位（超额大者先裁、等额按 id）、先双超对边后叶子边、多轮至稳——副本退边 82→1090、skippedNeeded 2290→96，test-2.11b 6/6 |
| **2.12** | **场域维护动作（rebond/unwind/reconcile/demote，全可逆）** | ✅ | `spec/SPEC-2.12-场域维护动作.md` | test-2.12-field-maintain 8/8；带界 I1 + 全可逆 I3 + 动作账 |
| **2.13** | **场域提升动作（promote/sprout/pollinate，≥2 证据）** | ✅ | `spec/SPEC-2.13-场域提升动作.md` | test-2.13-field-promote 8/8；I2 证据门槛 + I5 守恒闸 + 边提升可逆 |
| **2.14** | **进化团入驻：五成员契约注册 + 蜂巢成员池** | ✅ | `spec/SPEC-2.14-进化团入驻.md` | test-2.14-evolution-team 6/6；五员契约齐、零写权、无独立入口、成员池 15 席 |
| **2.15** | **六维 × 四时点维护接线（T0–T3）** | ✅ | `spec/SPEC-2.15-六维四时点维护接线.md` | test-2.15-evolution-cycle 5/5；T0–T3 齐、六维各一断言、gene 可回滚 |
| **2.16** | **闸东真接 + 自治/审批边界（OmniGate 强制引用）** | ✅ | `spec/SPEC-2.16-闸东真接与审批边界.md` | test-2.16-omni-gate 8/8；I8 无闸必拒、W2 队列、memo 卡片、双重锁 |
| **2.17** | **子agent 单元：每位角色自带 ≤2 狼位（修订 A）** | ✅ | `spec/SPEC-2.17-子agent狼位.md` | test-2.17-wolf-units 4/4；身份快照不变、零写权、完即弃、D1–D5 采样 |
| **2.18** | **外派采集面：粒子×框架 / 七步派单 / 轨迹口径 / 来源分级 / 攻果门 / 基线门 / 两权分离 / 禁虚报** | ✅ | `spec/SPEC-2.18-外派蜂群三分编组.md` | test-2.18-dispatch-swarm 22/22 覆盖 AC-1~20；D11 裁定 A：包内只出派单底版与攻果门校验纯函数（不 spawn / 不发网络 / 不碰存储，arch-lint 守）；厚度三态、批间用户闸、无熔断、轨迹 ≤12、来源分级与交叉、四件门、基线门、三布尔禁虚报、两权清单、三类粒子、掩护位铁律、回报验收、降级不跳门、波次成本 |
| **2.19** | **链接质量人工判定取样（假边率 / 二跳污染率，工具先行）** | ✅ | `spec/SPEC-2.19-链接质量人工判定取样.md` | test-2.19-link-sample 6/6：取样确定性（sha1 序）、全程只读、表头可填且标题走 conv-text、两跳只出缺边三元组、未判 ? 拒收（退出 3）、格式错拒收（退出 4）、比率只认人手填值；真库副本 2284 条活跃边可出单 |

> 2.9–2.11 由神经进化团队首战共识（Gate4b INTERVENE + Gate5 R1 critical）强制纳入，唔做则 M2 门唔过。

## 四、M3 意识层 + 入库 + 门禁（15/15 已落地）

| # | 任务 | 状态 |
|---|---|---|
| 3.1 | 意识层闭环 W3 | ✅ | `spec/SPEC-3.1-意识层闭环.md` | test-3.1-consciousness-kernel 6/6；五因子注意力 + stagnation≥3 断流 |
| 3.2 | 控制面 W2（CLI+HTTP）| ✅ | `spec/SPEC-3.2-意识层控制面.md` | test-3.2-control-plane 8/8；四路由 CLI/HTTP 同源、inhibit 到期自解、status/verify 纯读 |
| 3.3 | 读端纯读（C16）| ✅ | `spec/SPEC-3.11-memo用户面.md` | test-3.11-memo AC-6/AC-6c：纯读前后库指纹一致、源码无写语句 |
| 3.4 | 离散旋钮单源（C17）| ✅ | `spec/SPEC-3.4-离散旋钮单源.md` | test-3.4-config-runtime 5/5；四组件共用 DEFAULTS |
| 3.5 | 入库主线（C10g/h）| ✅ | `spec/SPEC-3.5-入库主线.md` | test-3.5-auto-ingest 6/6；三源剥净 + 双向钉 + 身份闸串联 |
| 3.6 | 身份闸 + 标签闸（C10i）| ✅ | `spec/SPEC-3.6-身份闸与标签闸.md` | test-3.6-api-gate 5/5；自报 status/conf/tags 全忽略 |
| 3.7 | 门禁 C0–C9 适配 | ✅ | `spec/SPEC-3.7-门禁C0-C9适配.md` | test-3.7-gates-c0-c9 3/3；C6/C7a/C7b/C8/C9a–c 真跑 |
| 3.8 | 门禁 C10a–C10i 适配 | ✅ | `spec/SPEC-3.8-门禁C10适配.md` | test-3.8-gates-c10 3/3；入库剥除/身份闸/读数一致 |
| 3.9 | 门禁 C11–C19 适配 | ✅ | `spec/SPEC-3.9-门禁C11-C19适配.md` | test-3.9-gates-c11-c19 3/3；零提交写端 + 纯读 |
| 3.10 | 门禁 C20–C21 适配 | ✅ | `spec/SPEC-3.10-门禁C20-C21适配.md` | test-3.10-gates-c20-c21 3/3；命令真跑 + 文档基线账 |
| **3.11** | **memo 用户面重构（recent/openLoops/patterns/plans）** | ✅ | `spec/SPEC-3.11-memo用户面.md` | test-3.11-memo 8/8；冷启动诚实、systemLine≤80；修订 A：用户面话题可读（markdown 会话取摘要段，与 predict 同源 conv-text.js），test-3.11b 6/6 |
| **3.12** | **预案器 predict.js（发芽 + 上下文 → ≤3 预案卡）** | ✅ | `spec/SPEC-3.12-预案器predict.md` | test-3.12-predict 7/7；冷启动单卡「无以往依据」；修订 A：接 CLI（`predict --message`，人读/ JSON 双输出，缺参退 2），test-3.12b 6/6；修订 B：真库 markdown 正文可读化（摘要段取话题/引文、跳结构行与 id 行、双链去重、词边界截断），test-3.12c 6/6 |
| **3.13** | **会话三源入库闭环（reply/search/rationale）** | ✅ | `spec/SPEC-3.13-三源入库闭环.md` | test-3.13-session-ingest 5/5；plan-hit/miss 反馈边 |
| **3.14** | **CLI 入口接线（memo/predict/ingest/orchestrate）** | ✅ | `spec/SPEC-3.14-CLI入口接线.md` | test-3.14-cli 6/6；arch-lint 白名单增 cli.js；predict 命令见 SPEC-3.12 修订 A |
| **3.15** | **memo 外派派单卡（挂载 + 随载设定）** | ✅ | `spec/SPEC-3.15-外派派单卡.md` | test-3.15-dispatch-card 8/8；卡七段/缺项标「不得派出」/三布尔如实/批间闸/只读快照三态/判据同源；memo 纯读、卡不代派；arch-lint 执行位守增 dispatch-card.js |

## 五、M4 数据迁移 + 总验收（6/6 已落地）

| # | 任务 | 状态 |
|---|---|---|
| 4.1 | 迁移前冷备份 | ✅ | `spec/SPEC-4.0-数据迁移与总验收.md` | test-4.1 AC-1：备份 SHA-256 == 源 |
| 4.2 | failing test：迁移无损 | ✅ | `spec/SPEC-4.0-数据迁移与总验收.md` | test-4.1 先红（模块缺失）后 6/6 绿 |
| 4.3 | 实体迁移（117 实体零丢失）| ✅ | `spec/SPEC-4.0-数据迁移与总验收.md` | test-4.1 AC-2：排序 (id,content) 全等 |
| 4.4 | 边迁移（1009 边零丢失，强度/失效期原样）| ✅ | `spec/SPEC-4.0-数据迁移与总验收.md` | test-4.1 AC-3：排序四元组全等 |
| 4.5 | 全量代谢新架构首跑 | ✅ | `spec/SPEC-4.0-数据迁移与总验收.md` | test-4.1 AC-5 + `node tools/migrate-run.js`：14 步首跑绿 |
| 4.6 | 旧库归档 + 总验收 | ✅ | `spec/SPEC-4.0-数据迁移与总验收.md` | test-4.1 AC-6：旧库 SHA/mtime 不变、报告 archived=true；C0–C21 全绿 |

## 五·补 总验收（2026-11-16 夜）

- **77/77 任务落地**（M0 5 / M1 15 / M2 18 / M3 15 / M4 6 / M5 3 / M6 15；M2 2.7/2.8 占位另计）
- **143 档 / 931 条断言全绿**；`node verify-deploy.js` → **C0–C21 共 33 项 ALL GREEN**
- **真库**：`data/knowledge.db`（117 实体 / 1009 边，迁移双指纹复核一致）
- **旧库**：只读未动，SHA-256 与 mtime 前后一致；报告 `data/migration-report.json`
- 交接与取舍：`docs/HANDOFF-2026-11-16.md`

## 五·补二 M5 检索后端与测试口径（3/3 已落地）

| # | 任务 | 状态 | spec | 证据 |
|---|---|---|---|---|
| 5.1 | 向量后端可插拔 + 只供测试的开关 + 混用防护 | ✅ | `spec/SPEC-5.1-向量后端可插拔与测试口径.md` | test-5.1-vector-backend 9/9：默认快照逐位不变、8 维探针后端可用、环境变量开关、未知名回退 `fallback:true`、非法后端拒收、换后端全量 rebuilt、混库各自只出自己的行 |
| 5.2 | memo 向量库状态反馈（诊断 + 系统一行 + 四类告警） | ✅ | `spec/SPEC-5.2-memo向量状态反馈.md` | test-5.2-memo-vector-status 8/8：字段齐全、默认态健康、未覆盖/旧后端残留/测试开关/未知名回退各出固定 code 告警、系统一行含后端与覆盖率且 ≤80、纯读、五字段不变 |
| 5.3 | 检索排序修正（简繁归一 + 双字权重 + 双链去重） | ✅ | `spec/SPEC-5.3-检索排序修正.md` | test-5.3-retrieval-rank 9/9：默认升 hash-64w2、旧口径逐位不变、簡查询命繁正文、双字证据排散字前、raw/wiki 只出一条且优先 raw、k 按去重后计、强度加权不变、内置不可覆盖 |
| 5.4 | 语义后端旁路评测（本地 ONNX，只量不接） | ✅ | `spec/SPEC-5.4-语义后端旁路评测.md` | test-5.4-semantic-bench 6/6：零向量余弦安全、同分按 id 升序、前缀各加一次、指标与 bench-retrieval 同源、复跑逐字一致、空集与 k 缺省安全；`tools/semantic-bench.js` 冻结集实测 e5-small（384/量化）顶1 83.8% vs 字面 58.8%、paraphrase 顶1 74.5% vs 38.3%；只改评测面，`src/vector.js` 同步契约与发布默认未动 |

| 5.5 | 语义后端接入（可选开关 + 回退） | ✅ | `spec/SPEC-5.5-语义后端接入.md` | test-5.5-onnx-wiring 7/7：同步路径逐位不变、异步向量校验、题侧 embedQuery 分流、换后端全量重建、模块不可用回退 hash-64w2、默认值不动、`cli reindex` 按请求后端重建；开关 `AING_VECTOR_BACKEND=onnx-e5-small`，切后 `node src/cli.js reindex` 重建（副本实测 320 条全建、memo 覆盖率 100%）|

| 5.6 | 后端对照自测（真库语料，人手判定） | ✅ | `spec/SPEC-5.6-后端对照自测.md` | test-5.6-backend-ab 7/7：表结构三列、两列不串源、复跑一致、空集安全、judge-score 认 ab 单（语义胜率）、未判拒收；`tools/backend-ab.js --db <副本>` 两阶段重建出并排单，真库直跑被拒；AC-7 锁死分子口径（语义胜率取「语义好」，非对称样本 2:1 验算 66.7%——旧 AC-5 用 1:1 样本，正反都是 50%，掩了分子分母颠倒的 bug）。**实跑结果（2026-11-17，真库副本 320 实体 / 24 题）**：owner 判定 24 条全为「语义好」，语义胜率 **100%（24/24）**；是否切默认后端仍由 owner 定（SPEC-5.6 §六）|
| 5.7 | 检索结果按内容去重 | ✅ | `spec/SPEC-5.7-检索结果按内容去重.md` | test-5.7-dedupe-content 6/6：同文只出一条、k 去重后计、同名异文保留、双链口径不破、只读、空内容安全；起因是真库 320 实体只有 117 种内容，前 3 张卡被同文副本占满 |- **默认口径**：5.1 时默认仍是 `hash-64`；5.3 起默认升为 `hash-64w2`（简繁归一 + 双字权重），旧 `hash-64` 保留可切且与 SPEC-1.8 逐位一致（特征化快照锁）。

| 5.8 | 强度加权收窄（0.9–1.0） | ✅ | `spec/SPEC-5.8-强度加权收窄.md` | 修订 SPEC-5.3 AC-7：强 9 段仍排 3 段前，但系数比落在 1.0–1.12；起因是真库上「存量安全债」余弦 0.910 全库第 1 被强度 9 挤到第 32，24/24 题去掉强度后前 3 全变；收窄后该查询回到第 1；冻结集强度恒 5，指标逐位不变（8.5/77.5/26.3）|- **测试开关**：`opts.backend` / `AING_VECTOR_BACKEND` 只供评测；发布包不设，默认值不按评测排名改。
| 5.9 | 默认后端切换为语义（onnx-e5-small） | ✅ | `spec/SPEC-5.9-默认后端切换为语义.md` | test-5.9-default-backend 7/7：未注册不静默（requested=onnx、回退字面、fallback 标记）、注册后缺省即语义、环境变量与显式参数仍优先、memo 缺省报 onnx 且旧 model 行计 stale、隔离库缺省建行全为 onnx/384；依据 SPEC-5.6 对照单 24/24 语义好（owner 拍板）；真库切换已完成：冷备 `data/backup/knowledge-20261117-224324-predflip.db`（sha256 e286e6ca…），reindex 扫 320 重建 320/跳过 0，实体指纹 fc3f195a、边指纹 bd22ad79 与切前逐位一致，向量 320 行全部 onnx-e5-small/384；冻结集 v2 语义基线（新默认）：R@10 99.0%、nDCG@10 90.4%、正负名次差 97.5%（字面历史对照 86.9% / 74.1% / 86.3%）；粤语 96.7% / 83.5% / 92.0%、改述 98.2% / 85.2% / 95.7% |
- **口径落文档**：README「六·补 检索口径」+ `docs/Engineering/EMBEDDING-BENCH-2026-11-16.md`（评测集冻结规则、四项指标、粤语单列、测完由使用者自己语料复核）。
- **memo 可见**：`buildMemo` 多返 `diagnostics.vector`（后端 / dim / model / source / active / indexed / stale / missing / percent / alerts），系统一行形如「健康 ok / 向量 hash-64w2 100% / 蒸馏债 0 …」；`env-override` / `backend-fallback` / `stale-rows` / `low-coverage` 四类固定 code 告警，异常不静默。
- **文档投喂试用**（2026-11-16）：18 份真实工作区文档（README/AGENTS/SPEC/模板/规范）隔离库跑通 compile→import→vector，memo 覆盖 100%；实测暴露排序问题，直接催生 5.3。记录见 `docs/Engineering/EMBEDDING-BENCH-2026-11-16.md` §八。
- **评测集已冻结 v1**（2026-11-17）：`data/eval/embedding-pairs.jsonl` 65 题（zh 33 / yue 20 / en 12）、`corpus.jsonl` 60 实体、`FROZEN.json` 记 sha1（`d79f91d2ccdf`）；守门 `test-5.3b-eval-set.js` 6/6，改一条即红。**v2 已扩**：80 题（zh 40 / yue 25 / en 15，`eec651fc2515`），含 15 题多正例/噪声题，v1 结论作废。**执行器已落**：`tools/bench-retrieval.js`（P@10 / R@10 / 负例命中率，zh/yue/en 分层单列；隔离库、真库零扰动；test-5.3c 6/6）。v2 结果：hash-64 R@10 81.9% / 负例 37.5%，hash-64w2 77.5% / 26.2%，yue R@10 78.0% / 74.0%。**词面 IDF 通道已接**（SPEC-6.3 修订 A；test-5.3d 6/6；v1 指标逐位未变——该集命中是二值的，增益留待 v2 多正例题）。**compile 侧 type 推断已接**（SPEC-1.1 修订 A；test-1.1b 7/7：显式优先、路径推断会话/待办/论文/元知识/洞察、未知不猜、推断不出不清空）。真库副本 dry-run：旧院 raw 85 档，显式 75 / 可推断 0 / 未知 10，仅 1 档会被纠正、无批量降级。**真库暂不跑**（owner 取态：以后跑几次再定，不合再调）。**未做（下一步）**：假边率与二跳污染率（需链接构建器）、评测集 v3（补噪声对）。

## 五·补三 M6 能力叙事入库与消费（41/41 已落地）

| # | 任务 | 状态 | spec | 证据 |
|---|---|---|---|---|
| 6.1 | 能力显现入库（六段叙事 + 校准合并） | ✅ | `spec/SPEC-6.1-能力显现入库.md` | test-6.1-narrative-ingest 7/7：六段齐、手段/编排归位、截断与思维开关、approval 按 callId 挂工具、feedback/goal 落会话级、落库 content 带 format/turns/stats、幂等、缺料拒入、铁律 |
| 6.2 | 能力叙事消费与蒸馏点 | ✅ | `spec/SPEC-6.2-能力叙事消费与蒸馏点.md` | test-6.2-distill-points 7/7：区间捕获不截断、h1–h6 双语起锚、止端中文、不过捕、蒸馏点确定性、落 distill_points、幂等+退役跳过、链上可见+铁律 |
| 6.3 | 检索融合消费（三路 + 慢回忆 + 伪精排） | ✅ | `spec/SPEC-6.3-检索融合消费.md` | test-6.3-retrieval-fusion 7/7：三路融合形状、名称路、词面路、慢回忆走三轴有效边、KESPI 伪精排、双链去重+k+退役、predict 接线+不写 last_access；同隔离库 8 查询 top-1 3/8→5/8、MRR 0.542→0.729（未调参）；修订 B（2026-11-17）：缺省融合权重随语义后端重调为 0.8/0.05/0.15（SPEC-6.3 §十），test-6.3b-fusion-weights 3/3（缺省向量≥0.75 且和为 1、语义命中排词面命中前、显式覆盖仍生效）；冻结集 v2：nDCG@10 90.4→91.7%、正负名次差 97.5→98.75%、粤语 nDCG 83.5→87.3%，R@10 99.0% 不变；修订 C（2026-11-17）：会话原文在向量通道也乘 SOURCE_PRIOR=0.75（回忆意图不折），test-6.3c-conversation-prior 4/4；真库 24 问 top10 槽位：技能注册 115→46、正文实体 69→103、todo- 8→50、dispatch- 19→11；冻结集指标不变（语料全 Concept）；修订 D（2026-11-17）：精排撤出 KESPI，缺省 rerank={kespi:0,recency:0.05}（旧口径显式传参可恢复），test-6.3d-no-kespi-rerank 5/5；依据：真库 320 条 KESPI 八维中 KG/KM/KC 恒 1、KR≈0.99、KQ 85% 卡顶，KESPI 只反映代谢活跃度；冻结集对本项无分辨力（评测库无 kespi_scores 行且 updated_at 全同，两项恒零权重，改前改后 99.0%/91.7% 逐位相同）；真库 24 问 top10 槽位 A→D：技能注册 46→46、正文实体 133→129、todo 50→51、dispatch 11→14，top1 变 3/24（「意识神经缺口工单」「存量安全债」两题真答案卡顶上，另一题为两张 skill-registry 对调）；bench-retrieval 增 `--kespi/--recency` 消融开关；修订 E 调查（2026-11-18，不改缺省）：注册表/技能卡占位根因查明——真库 24 题 top1 里注册表卡 10/24、top3 49/72；类型先验（metaPrior 0.9→0.5）只改写 2–7 题且多为「一张通用卡换另一张」，实验口已撤；融合权重 0.8/0.05/0.15→0.5/0.2/0.3 使答案卡 top1 9→14、注册表卡 10→8，但属自定类目判读、无人工标签，不改缺省；冻结集对本项无分辨力（每题仅 1 正例、正例名次不动，K=3 亦零差异；极端权重能改写候选序 14/20 题但都在正例之后）；hubness 假设否（余弦均值 p10 0.888 / p50 0.900 / p90 0.913 压成窄带）——根因在嵌入模型；bench-retrieval 增 `--vector/--lexical/--name` 消融开关；改缺省的前置门槛是 24 题人工判读对照单（SPEC-5.6）；修订 E（2026-11-18）：24 题真库判读单已出（agent 判读，待 owner 复核，存 data/eval/real-labeled-2026-11-18.json），据此把缺省融合权重 0.8/0.05/0.15 → 0.5/0.2/0.3；实测 K=8/10/30 三口径一致：top1 9→12、top3 15→16~17、MRR .512→.614~.626；test-6.3e-default-weights 5/5（新缺省、显式档位不动、recall 随缺省、名称通道可压纯语义、旧口径可显式恢复），test-6.3b AC-1 随之改口径；explain 档单独下调更差故不动；遗留（未修）检索结果依赖请求 K：24 题里 23 题在 limit 6 / 20 下 top6 顺序不同（慢回忆 avgSim 在变大小的池上算），已入 SPEC-6.3 §十五|修订 F（2026-11-18）：候选池与请求 K 脱钩——根因是 k=limit*3 的池里只从词面进来的候选 sim=0（缺考记 0 分），同卡在 K=6/K=12 下融合分 0.148 vs 0.554；改法=向量路取全库 + 慢回忆置信只看最像 10 条；test-6.3f-k-independent 5/5（同 id 分数与 K 无关 / K=6 对 20 前缀一致 / 3·5·8·10 对 20 前缀一致 / 确定性 / 强制慢回忆前缀一致）；实测 K 依赖题数 23/24→0/24、avgSim 不再随 K 漂移、耗时 208.5→215.4 ms/题（+3%）；修池后 judge-real K=10 复核：新 0.5/0.2/0.3 仍 top1 12/top3 15/MRR .579，旧 0.8/0.05/0.15 为 9/14/.515，修订 E 不回退；调参标尺 tools/judge-real.js 落地（真库副本、用完即删）|修订 C 条件化尝试已试已否（2026-11-18）：「有加工件才打折」实测 top1 12→10、MRR .579→.494，已还原；原因是 139 个会话里 108 个有出边，去打折等于整体抬高会话卡；目标题 `zpd-aing-deploy` 不打折也只到第 20 名（第 1 是另一份部署记录）。连带修正判读集第 12 题为两卡皆可（标注过窄非检索缺陷），修订后基线 top1 13/24、top3 16/24、MRR .621|6 道未进候选已解剖（2026-11-18，只诊断）：卡都在（向量全序 #2/#13/#23/#33/#10/#61，共 118 条），真因是词面通道噪声型——中文不分词、整句当一个词、二字滑窗使无关长档普遍拿 0.54~0.55 而真答案 0~0.29，0.09 的分差相当于 0.18 的向量差；反证：去掉词面只剩 top1 3/24，通道必要、计分有错；拟修 df 加权已试已否（2026-11-18）：真库实测噪声二字 df 其实很低（意识 7.5%、神经 6.5%、结果 9.3%），噪声来自长句十余个二字窗撞上三四个稀有二字，df 截断几乎不触发；冻结集逐位不变、判读集 13/16/.610→13/16/.614（Q11 掉一位），已还原（补丁留档 .temp/g-lexical-df.patch）；真瓶颈在名称路——nameScore 只认「整句 query 出现在 id 里」，自然语言问句几乎永真不中，0.3 名称权重在 24 题上全空转，而 6 道未进候选的答案卡关键词都在 id 里；修订 H：名称路补部分命中档（id 二字覆盖比 × namePartial，上限压在整句包含 0.8 之下，opts.namePartial=0 可关），系数扫描 0/0.5/0.7/0.85/1.0 → top1 13/15/16/17/17，采纳 0.85：判读集 top1 17/24、top3 19/24、MRR .778、未进候选 1（仅剩英文题 Q23 跨语言）；冻结集逐位不变；test-6.3i-name-partial 6/6（整句档仍最高、无关查询 0、派生标题不入键、可关闭、端到端翻转、关闭后回落）|
| 6.13 | 意图路由（规则分类 + 权重分流） | ✅ | `spec/SPEC-6.13-意图路由.md` | test-6.13-intent-routing 6/6：分类表 8 句（查物/回忆/解释/一般各 ≥2，命中词可解释）、lookup>recall 优先级、lookup 抬名称通道（id 命中排前）、recall 抬新鲜度（recency 0.25、新条排前）、显式权重压过路由且可整件关闭、一般查询逐项等于修订 B 缺省；规则在 `src/intent.js`（无模型），检索 meta 返回 `intent{intent,hits}`；实测：冻结集 80 题 76 general + 4 explain，指标逐位不变（R@10 99.0% / nDCG 91.7% / 名次差 98.8%）；真库 24 条真问题路由分布 general 12 / explain 6 / lookup 4 / recall 2，开/关 top3 有 4 条变化，其中「三三制攻防学说草案落在哪个文件」把真档 todo-…v0落档 从第 2 提到第 1 |
| **6.14** | **回单内容闸（L4 基础件）** | ✅ | `spec/SPEC-6.14-回单内容闸.md` | test-6.14-ticket-gate 10/10（膜 open 只给落点 / semi 只过事实+指针 / closed 零交换 / 未知档位抛错 / 发布门五条硬拦 / 原因码收全 / 四项齐才发 / 粒度缺指针即 thin-payload / 组合闸分阶段 / 纯函数可复算）；`src/ticket-gate.js` 为纯函数（`membrane`/`publishGate`/`landingGate`/`admit`），不碰 store、不做 I/O；取材 swarm33 归位表「留」档三条（膜透性三档、发布门、落盘粒度），术语按红线已换词。**已接 `self-optimize.verifyTickets`（修订 A）**：工单 `evidence_json.result` 存在时先过闸，不过即 `rejected`（原因码 `gate:<stage>:<codes>`），读数上升也不放过；不带 result 的工单行为不变；护栏 test-6.14b 6/6 |
| **6.15** | **跟单三律（L3）** | ✅ | `spec/SPEC-6.15-跟单三律.md` | test-6.15-ticket-followup 10/10；修掉「假跟单」——原先每轮 `_mark` 都 `attempts+1`，回单只是慢的工单两轮就被判死，现改为：① 追单不补位（无回单 → `awaiting-return`、`attempts` 不动、不新增 field_actions）② 失败≥2 改派（回单合格但读数不改善且 `attempts≥2` → `rejected` + `escalate-deep-work`，`out.escalated[]` 外露）③ 心跳保活（每轮写 `followup.{beatAt,beats}`，`staleTickets({maxHours})` 扫跟单已断的 dispatched 单）；`src/ticket-followup.js` 纯函数 + store 扫描 |
| **6.16** | **回单外接屏（L4）** | ✅ | `spec/SPEC-6.16-回单外接屏.md` | test-6.16-ticket-board 10/10；`src/ticket-board.js` 只读汇整 `opt_tickets` → 三节（待回单／闸拒改派／已收单）+ 文本屏 `lines`；只显事实与指针（结论/全文不入屏，膜透性口径的展示面延续）、闸拒带 `stage`+`reasons`、改派单列 `kind='escalate'`、待回单带心跳（缺则明说「无心跳」）、空库诚实、屏外状态（proposed 等）点名不静默吞；纯读（前后快照一致、不碰 `last_access`、源码无写语句/无 I/O）；CLI 面 `node src/cli.js board [--limit N] [--json]` 真跑绿 |
| **6.17** | **kd 催化率与派单匹配（闭环可转）** | ✅ | `spec/SPEC-6.17-kd催化率与派单匹配.md` | test-6.17-kd-alignment 10/10；修四处断裂——① rebond 镜像键封底 strength 7（真库 126 条氢键里 118 条原是 strength=1，补键永不被催化率看见）② kd 门槛 0.40 → 0.30（kd 离散为 0/1/3/2/3/1，0.40 把 1/3 判死）③ kd 单分两路：raw 缺键 → `rebond`、被引用不催化 → `memo-card`/`kd-cited`，越界 rebond 当场 `out-of-scope`④ rebond 不再谎报：未来档 `skippedFuture`、已有 effective 边 `skippedExisting`、非主键冲突的错一律抛出 （原状：3 次记账 0 条边）。真库副本两轮：不再产生注定落空的 kd 单，改为 8 张提案；87 个 raw 已全部有键，故真库上 kd 无事可做（正确）。 |
| **6.18** | **提案单需求定义与 TTL（+ 寄生位点位表）** | ✅ | `spec/SPEC-6.18-提案单需求定义与寄生位.md` | test-6.18-proposal-demand 8/8；提案单不再只有「哪一维低了」——每张 `memo-card` 单带五段需求 `demand{want/acceptance/evidence/mode/slot/ttlRounds}`（`src/ticket-demand.js` 单源，纯函数校验）：want 要具体、acceptance 可测（dim∈五维/overall，op∈gte/gt/improved）、evidence 与发布门同源、mode 分 semi/full、slot 指向寄生位；TTL 到期（`beats > ttlRounds`，默认 3 轮）→ `rejected: proposal-expired` 并释放 `(entity,dim)` 名额，心跳复用 6.15 律三，`dispatched` 单不受影响。同文附 **寄生位点位表 P1–P7**（入口成形/蒸馏/关联建边/蒸馏点/洞察提取/提案承接/回单校验），每点定半寄生与寄生两形态、写回点与拒绝条件；P7 校验层明确不可外包。**模拟已跑**：`tools/sim-derive.js`（拒在真库跑）——工作区成文 10,510 字入库副本，distill 产 1 件 future 产物 + 1 条 `derived@7`，kd 0→0.3333；提案单落单即带五段 demand。 |
| **6.19** | **寄生位注册表与取单口（P1–P7 声明面）** | ✅ | `spec/SPEC-6.19-寄生位注册表与取单口.md` | test-6.19-parasite-slot 8/8；`src/parasite-slot.js` 只做声明与取单，纯函数无 I/O（取单口只读库）：`SLOTS` 落 P1–P7 七点位（位置/输入/输出/写回点/两形态/拒绝条件），`validateSlot` 拦未知点位与非法形态，`claim(slot,reg,demand)` 按序判不可外包（P7）→ slot 不匹配 → 形态过窄（semi 接不了 full）→ 证据缺件，`claimable(store,reg)` 只列能被这份注册接走的 `proposed` 单。外部件仍不写库——交回单，系统按写回点落库。 |
| **6.20** | **需求穿透最后一跳（回单按 demand.acceptance 判）** | ✅ | `spec/SPEC-6.20-需求穿透-回单按需求判.md` | test-6.20-demand-acceptance 8/8；**审计先行**：`tools/audit-demand.js` 逐跳验需求是否被读到，初跑 H4/H5 两处断——回单到了 `verifyTickets` 的 `proposed` 分支只打心跳，`demand.acceptance` 在 `src/` 里 0 处被读。修：`ticket-demand.checkAcceptance(demand, readings, {before})`（gte/gt/improved，improved 无快照不假通过）；`proposed` 有回单时先过内容闸（6.14）再按需求判——达标 `verified`、不达标 `rejected: acceptance-failed`（不退成 `gate:`）；扫单时落 `readings` 五维快照，`improved` 判据才有 before。TTL 与心跳不动。审计现全程通。 |
| **6.21** | **memo 节拍强标识（pulse：PROGRESSING/IDLE/STUCK）** | ✅ | `spec/SPEC-6.21-memo节拍强标识.md` | test-6.21-memo-pulse 9/9；交付后看不到部署方调度器，心跳从「要求对方打的拍」改为「从底账读出的差」：memo 每次被读就用 `meko_cycles` + `kernel_state.stagnation_count` + 积压（pending-distillation + 未闭环工单）现算三态。`pulse.code` 是强标识且恒等于 `state`（机器只认这一个），`marker` ▶/⏸/⚠；非 PROGRESSING 时系统行行首加 `marker code /`，正常时不占字数。冷启动与无积压一律 IDLE，**有活不干才报 STUCK**。零新表、纯读。 |
| **6.22** | **跟单判死改用轮次拍，区分 no-beat / no-progress** | ✅ | `spec/SPEC-6.22-跟单判死轮次拍.md` | test-6.22-stale-rounds 9/9；48 小时墙钟在部署环境不成立（空闲库即误判），改判死顺序：有轮次用轮次拍（`since = round - beatRound > 2`），无轮次才回退墙钟并标 `clock: wall`——两套钟不再混口径。心跳多记 `beatRound` / `stageSig` / `sameStage`；`staleTickets` 分报 **no-beat**（进程没了→重派）与 **no-progress**（拍在走、同签名≥3→换件），只扫 `dispatched`，提案单仍归 6.18 TTL。`verifyTickets` 心跳带轮次与阶段签名（读数两位小数 + 有无回单）。 |
| **6.23** | **回单屏分两种失效（no-beat / no-progress）** | ✅ | `spec/SPEC-6.23-回单屏分两种失效.md` | test-6.23-board-stale-kinds 8/8；待回单行加 `kind`（ok / no-beat / no-progress），复用 `ticket-followup.isStale` 与 `SAME_STAGE_LIMIT` 单源；屏上 `⚠ 无心跳（N 轮未拍）` / `⏳ 无进展（同阶段 N 拍）` 可分辨；`summary.noBeat` / `summary.noProgress` 为强标识，下游只读数字即可分重派与换件。`boardOf(store,{round})` 可指定轮次，缺省取 `meko_cycles` 行数；仍是纯读。 |
| **6.24** | **P2 半寄生端到端（取单→回单→写回→判→上屏）** | ✅ | `spec/SPEC-6.24-P2半寄生端到端.md` | test-6.24-parasite-e2e 6/6；工具 `tools/parasite-round.js`（拒在真库跑）。锁的是**边界**：外部件只 SELECT 产回单（前后两张表快照必须一致），写入只走系统 `applyReturn` 按 P2 写回点执行；回单缺自评在 `gate:publish` 先拒，轮不到判据兜底。真库副本实跑：kq 0.2393→0.85，`verified/accepted`，屏上已收单 1 条。**发现**：`MAX_TICKETS=20` 全局上限会被 kd(0)/ka(0.2) 占满，kq 单进不来——按维配额列入下一步。 |
| **6.25** | **扫单按维配额（kq 不再饿死）** | ✅ | `spec/SPEC-6.25-扫单按维配额.md` | test-6.25-scan-quota 6/6；`DIM_QUOTA={kq5,ka5,kr5,kc5,kd8,overall3}`，逐条按维计数取位，总上限仍是硬顶，`opts.quota` 可覆盖。真库副本对照：kq 单 **0→5**、ka 12→5、kd 8、overall 0→3；配额后 P2 半寄生仍跑通（kq 0.2393→0.85 verified）。**背景**：kd/ka 分数天然偏低，全局抢 20 位时 kq 永远排不上——这是「自优化覆盖不到质量维」的真因。 |
| **6.26** | **维护轮闸（L3 只在维护轮执行）** | ✅ | `spec/SPEC-6.26-维护轮闸.md` | test-6.26-maintenance-guard 6/6；把 `maintenanceGuard` 在链上的真实行为钉住——真库副本实测：`代谢` 轮 `skipped:true` 且 0 单，`维护` 轮 `scanned 20 / proposed 20`，`代谢 + selfOptimize:true` 亦执行；跳过不算失败（轮 ok）。链序 `kespi → self-optimize` 由测试锁死，防止重排链导致排单用旧读数。**这解释了真库 14 轮 0 工单**：不是没信号，是从来没跑过维护轮。 |
| **6.27** | **pulse 报上次维护轮（lastMaintenanceAt）** | ✅ | `spec/SPEC-6.27-pulse维护轮读数.md` | test-6.27-pulse-maintenance 6/6；`pulse` 增 `lastMaintenanceAt` 与 `maintenanceRoundsSince`——取 `meko_cycles` 里最近一条「维护/自优化」轮，并数其后又跑了多少轮；从未跑过时为 `null`（不伪造 0）。三态判定不受影响，仍是纯读。这也让部署方看得出「自优化 L3 该开了」——6.26 已证明普通轮里它不跑。 |
| **6.28** | **P1 入口成形位接六段叙事** | ✅ | `spec/SPEC-6.28-P1入口成形六段叙事.md` | test-6.28-p1-narrative 7/7；`auto-ingest → ingestNarrative` 增 `narrative` 入参：**semi** 外部只给标题/标签（六段仍系统拼），**full** 外部交完整六段（系统只 `validateNarrative` 校验 + 原样渲染，不重写）。缺段/空段/非法 mode 整件退回不落库；外部件介入时 content 记 `narrative{mode,slot:P1,provided}`，与系统自拼可区分。外部件仍不写库。**这是「六段叙事提质量」的入口**——此前 P1 只在注册表里躺着。 |
| **6.29** | **kq 读叙事正文（不读 JSON 外壳）** | ✅ | `spec/SPEC-6.29-kq读叙事正文.md` | test-6.29-narrative-kq 5/5；`narrativeBody` 先取 narrative JSON 的 `markdown` 再交 `cleanBody` 量长度——修前薄叙事（正文 4 字、turns 8000 字）拿 **0.675**，修后 0.078，与同长度纯文本一致。坏 JSON/缺 markdown 退回原串不抛；`cleanBody` 签名不变，三源实体读数零影响。**背景**：真库 139 条会话全是三源格式，六段叙事至今 0 条——修的是「第一条叙事进来不出错」。 |
| **6.30** | **六段覆盖率进 kq（缺段掉分）** | ✅ | `spec/SPEC-6.30-六段覆盖率进kq.md` | test-6.30-narrative-coverage 6/6；`narrativeCoverage` 数六个固定小节标题命中 / 6，`narrativeFactor = 0.6 + 0.4×coverage` 作乘子接进 kq——六段齐不打折（0.675），三段 0.540，零段 0.405。非叙事 `factor` 恒 1，三源读数逐位不变；原三项权重不动，避免重新分配引发全线漂移。连带把 test-6.29 AC-2 的 fixture 改成六段齐（两段 fixture 会被覆盖率合法扣分，会串味）。 |
| **6.31** | **段有效性阈值（凑数段不算）** | ✅ | `spec/SPEC-6.31-段有效性阈值.md` | test-6.31-section-validity 6/6；`narrativeCoverage` 改为先按标题行切段、段正文去空白 ≥ `MIN_SECTION_CHARS`(20) 才算有效段——六段各写「无」覆盖率从 1.0 掉到 0（kq 落 ×0.6 下限），五段有料+一段「同上」得 5/6。段边界按任意 1~4 级标题截断；非叙事读数不变。堵的是「交差式填报」——标题在、内容空也能拿满分。 |
| **6.32** | **叙事工单口径对齐六段** | ✅ | `spec/SPEC-6.32-叙事工单口径对齐六段.md` | test-6.32-narrative-ticket 7/7；两处病一起修：① 叙事 kq 的长度分只量六段正文（段外几千字填充不再抬分，修前 0.405 能过 0.50 验收，修后 0.05）；② `kq-low` 工单落库前辨实体——叙事实体换 `kq-low-narrative` 需求（slot **P1** / mode **full** / want 明写六段齐全每段 ≥20 字），非叙事仍 P2/semi 不变。六段齐全的叙事不开 kq 单，闭环成立。 |
| **6.33** | **P1 全寄生一轮（领单→六段→写回→验收）** | ✅ | `spec/SPEC-6.33-P1全寄生一轮.md` | test-6.33-p1-round 7/7；工具增 `NARRATIVE_REG` / `externalPartNarrative` / `applyReturnNarrative`——外部件只读单与原料（前后快照逐表一致），系统按 P1 写回点**只换 markdown 与 bodyChars**、`turns` 原样保留、打 `narrative{P1,full,provided}` 标；重算 kq 后按 acceptance 转 verified/accepted。非叙事 content 拒绝改写（坏 JSON / 非六段直接抛）。P2 接单方领不到 P1 单，位不混。 |
| **6.34** | **六段由实体事实抽出（模板滑动）** | ✅ | `spec/SPEC-6.34-六段由实体事实抽出.md` | test-6.34-narrative-sliding 7/7；P1 接单方的六段从恒定文案改为「骨架恒定 + 事实槽滑动」：场景取 turns[0].scene、思维取推理块、手段/编排按工具与子agent 分类列名、产出取文本、校准取条目；**无证据的段只写声明不填充**（短于 20 字不算有效段，覆盖率如实下降）。`facts` 逐条记抽取来源。直接后果：轨迹薄的实体会诚实拿低分、验收可能 rejected——这是对的，不是回归；6.33 的 fixture 因此换成真实会话。 |
| **6.35** | **段有效阈值滑动（20±5）** | ✅ | `spec/SPEC-6.35-段有效阈值滑动.md` | test-6.35-threshold-slide 6/6；阈值不再钉死 20：`sectionThreshold(entityId)` 按实体 id 散列在 **15/25** 间定，同实体跨轮恒定（不掷骰子、可复算），无 id 时退回基准 20。贴线写 20 字的段在一半实体上作废——逼接单方按 25 写。17 字段实测：15 档实体 coverage=1、25 档=0，kq 随档分开。非叙事零影响。 |
| **6.36** | **阈值游标（20 → ±1..±5 → 20，方向交替）** | ✅ | `spec/SPEC-6.36-阈值游标.md` | test-6.36-threshold-cursor 6/6；阈值走游标：每周期首轮 20，随后把幅度 1..5 **各用一次**（shuffle 顺序），回 20；下一周期方向取反。shuffle 种子＝实体 id＋周期号，同实体同轮可复算，审计能重放。轮次取 `meko_cycles` 行数（显式 `opts.round` 优先）。示例：`20,23,25,21,22,24, 20,18,15,19,17,16, 20,…`。6.35 的「15/25 两档」由本条取代，测试同步改为守「恒在 15~25、同轮可复算」。 |
| **6.37** | **阈值符号串 ++-+----+-++** | ✅ | `spec/SPEC-6.37-阈值符号串.md` | test-6.37-sign-chart 6/6；方向不再整周期取反，改用固定符号串 `++-+----+-++`（12 轮一循环，前 6 与后 6 互为反相），幅度仍每周期 1..5 各一次。示例：`20,23,22,25,21,24, 20,18,16,17,19,15, 20,…`。正负混排避免同向长跑把读数一路推高/压低；同 (实体,轮) 仍可复算。6.36 的「整周期取反」由本条细化。 |
| **6.38** | **摘录窗口滑动（起点按游标前后挪）** | ✅ | `spec/SPEC-6.38-摘录窗口滑动.md` | test-6.38-window-slide 6/6；`externalPartNarrative(db, claim, {round})` 的六段摘录不再永远从第 0 字截——起点 = `delta = sectionThreshold(id,{round}) - 20`（0 或 ±1..±5），夹在 `[0, len-width]`；同一篇原文，不同轮摘到不同片段，窗口宽度不变、同轮可复算。工具主流程增 `--slot P1`（领单→回单→写回按 P1 走）。 |
| 6.4 | 任务轨迹消费（会话 + 代谢轮落表） | ✅ | `spec/SPEC-6.4-任务轨迹消费.md` | test-6.4-trajectory 7/7：13 列表+3 索引、六段会话轨迹、三源会话轨迹、幂等+退役跳过、成功/失败轮轨迹、查询统计、链上可见+铁律 |
| 6.4b | markdown 会话轨迹回填 | ✅ | `spec/SPEC-6.4b-markdown会话轨迹回填.md` | test-6.4b-markdown-conv 5/5：markdown 落轨迹（小节段序+证据）、空正文/怪 JSON 不落、幂等、六段/三源不回归、实体与 last_access 零变化；真库副本实测 139 扫 → 139 落 |
| 6.5 | 成长观察四件（缺口/反馈/自我模型/洞察） | ✅ | `spec/SPEC-6.5-成长观察四件.md` | test-6.5-growth-observe 9/9：五维缺口、反馈差分、自我模型、洞察落候选、幂等+不造料、T2 消费、链上可见、铁律 |
| 6.6 | 内外维护接线（memo 外场 × meko 内场） | ✅ | `spec/SPEC-6.6-内外维护接线.md` | test-6.6-maintenance-wiring 8/8：简报形状、targets 优先级、洞察上浮、memo 外场块、memo 纯读、T0 内场、T2 内场、铁律 |
| 6.7 | 访问事件接口（access_hits） | ✅ | `spec/SPEC-6.7-访问事件接口.md` | test-6.7-access-events 8/8：表+索引只追加、记录契约、prune 只救不杀、compress 双锚、晋级证据、KESPI KA、CLI 接线、铁律 |
| 6.8 | 自优化闭环（KESPI 误差 → 工单 → 场域动作 → T2 复核 → gene） | ✅ | `spec/SPEC-6.8-自优化闭环-误差工单到场域动作.md` | test-6.8-self-optimize 8/8：工单表、误差开单幂等、维度路由、场域下药留痕、读数上升复核、过闸毕业 gene、技能导入+训练师只读、铁律 |
| 6.9 | 原版脚手架三件移植（检索 KPI / 谱系反思 / 能力派单） | ✅ | `spec/SPEC-6.9-原版脚手架三件移植-能力入原生表.md` | test-6.9-scaffold-port 8/8：三件导出+链登记、KPI 轨迹幂等、KPI 只读、反思归组/撤回计失败/幂等、反思只写轨迹、cap 开单幂等（已消费不开）、cap 复核不毕业、铁律 |
| 6.9b | 时界真接（真 KESPI + 分步预算） | ✅ | `spec/SPEC-6.9b-时界真接-真KESPI与分步预算.md` | test-6.9b-timebound-wiring 8/8：运算类/未知 base≥120s、budgetTick 求和抬升、软配额 overBudget、真探针均值+来源、写回真值、无读数写占位标记、走势排除占位、幂等补列+铁律 |
| 6.9c | 成长观察读数同源（Delta / 洞察只取真读数） | ✅ | `spec/SPEC-6.9c-成长观察读数同源.md` | test-6.9c-kespi-readers 4/4：Delta 只取真读数、真读数不足报 insufficient、洞察效果不混占位轮、过滤条件+无删+差分只读 |
| **6.10** | **蒸馏点消费（points_json → 预案依据）** | ✅ | `spec/SPEC-6.10-蒸馏点消费.md` | test-6.10-point-basis 5/5；predict basis 增 point 类（关联实体首条点，≤80 字），无点不加、不造依据；conversation+point 即 high；纯读、确定性；检索融合明确不加第四通道 |
| **6.11** | **分层留存与到期归档（原稿/短料/知识/墓碑）** | ✅ | `spec/SPEC-6.11-分层留存与到期归档.md` | test-6.11-retention 8/8；`src/retention.js` 只读分层规划（到窗+无访问+无证据+可还原/可重建）；`tools/archive.js` 月包 ndjson+md+manifest、干跑还原、校验不过不删、墓碑表（SPEC-0.1 修订 K）；实测 20k 短料 15.3MB / KESPI 3.4s / 向量 4.0s；移动端退役模式已落地请求侧：手机默认 7 天热窗、只出 `retire-request.json`、`--apply` 被拒（SPEC-6.11 修订 A，test-6.11b 6/6）；修订 B：候选带可读 `topic`（与 memo/predict 同源），归档 md 与退役请求不再只印时间戳名，判据一行不动（test-6.11c 6/6）；prune 已切新四件判据（test-1.13-prune 7/7） |
| **6.12** | **落盘安全（原子写 + 单写者锁 + 容量上限 + 崩溃自愈）** | ✅ | `spec/SPEC-6.12-落盘安全.md` | 修订 B：init 只在真变化时落盘（纯读开库不动 mtime）+ 开库清死锁；test-6.12-persist-safety 10/10；tmp/rename 原子写（失败原库不变、无残留）、`.lock` 单写者（活锁拒写、死 pid/超时接管）、外部改写检测 `db-stale`、容量上限默认 10MB（env 可调）、init 清死 pid 孤儿 tmp；AC-8~10 真子进程 6 轮随机硬杀：每次重开成功、`integrity_check=ok`、可继续写；**手机真机（proot）实测入册**：库只准私有 f2fs 目录（`/sdcard` fuseblk 三次连写 mtime 全同，`db-stale`/锁时间判定同时失效）、20k 行 export 10.04MB（cap 10MB ≈ 2 万行边界）、10MB 库 → wasm 堆 103MB / RSS 峰 142MB（堆 ≈ 库×10）；soak 复跑产物 `/root/workspace/swarm-test/` |

- **口径来自 AB**：`G:\AB.7z` → `AB/capability-narrative.js` 纯逻辑 1:1 移植（CJS 化），只取 `aing-bridge.js` 的数据契约，不搬 dsh 壳。
- **与三源并存**：3.13（reply/search/rationale）保留；六段是更完整的入库单元（产出=回复、思维≈事由分析、手段≈搜索展示与工具调用）。
- **差异登记**：手段与编排拆成两个 `###` 段（六段要数得出来）；AB 写 `raw/inbox` 中间文件，v2 直接写 Conversation 实体；校准由调用方传数组，不依赖 cordis 事件。
- **已接（2026-11-18）**：六段叙事接到唯一真实入口 `autoIngest`——按载荷形状分流：`payload.messages` 非空走 `capability-narrative.ingestNarrative`，否则走三源（3.13 不动）；CLI `ingest` 经 payload 透传自动继承，无需另加分支（真跑验证：`cli.js ingest --payload {messages…}` → `route=narrative`，库里 `conv-cli1` name=id、title=「命令行六段」）。两径同号 `conv-<sessionId>` 先到先得、后到 skipped（只追加）。顺带纠正六段落库的身份面（此前写 `name=话题`、`title` 空），现按 SPEC-7.1 AC-1 落 `name=id` + `title` 派生。护栏 `test-6.1b-narrative-wiring` 7/7；SPEC-6.1 已补「修订 A · 接线」。
- **swarm33 规则库（AB 六模块 135 断言）**：不按「是否移植」判，按 DNA 范式 0.5 版的三层流层结构重组——见 §七 D17。
- **6.2 消费侧**：旧院 `distill.js:103` 的区间捕获口径已迁入 `src/distill-points.js`；蒸馏点落辅助表 `distill_points`（不改正文、不破逐字保真），默认链 14→15 步（`distill` 之后插 `distill-points`）。缺口来源与其余三组真缺口见 `docs/Engineering/CONSUMER-AUDIT-2026-11-16.md`。
- **6.3 检索侧**：旧院 `query.js` 的三路融合（向量 .6 / 词面 .25 / 名称 .15）、慢回忆、KESPI+新鲜度伪精排已迁入 `src/retrieval.js`；`predict` 改接本模块。唯一硬差异：**不写 `last_access`**（旧院 P0 写回，v2 铁律禁写）。慢回忆只走通过三轴判定的有效边。
- **6.4 轨迹侧**：`task_trajectories` 表（13 列 + 3 索引）已建；会话（六段/三源）与代谢轮各落一条，id 确定性、只追加；编排器每轮 best-effort 记录。默认链 15→16 步（`distill-points` 后插 `trajectory`）。旧院导入链已合并：growth-loop episode、代谢因果链（每步一条）经 `logFromGrowthLoop` / `logFromLineage` 接入（SPEC-6.4 修订 A，test-6.4c 6/6）；rollout 无 v2 消费方暂不移植，tri-path 随缺口 4「三路裁决不迁」裁定不接（缺口 3 轨迹链后续结案）。
- **6.4b markdown 回填**：真库 139 条 Conversation 全是 markdown 正文，原派生只认六段/三源两种 JSON，导致 `syncSessions` 全落 `noBody`、session 轨迹为 0。现在第三种形状：非 JSON 且正文非空 → 按 `##`–`######` 小节落轨迹（`source='session-markdown'`，`route=[name|首标题]`，`success=1`，证据带 `bodyChars/sections`）；能解析成 JSON 的怪对象不按 markdown 处理。真库副本实测 `scanned 139 → logged 139 → noBody 0`。
- **6.5 成长观察**：旧院四件按「观察与执行分离」改姿态——`gap-scan`（五维缺口）、`feedback-delta`（轮间 Delta 与走势）、`self-model`（覆盖率/蒸馏债/成功率）三件只读，零写、不调参，统一由 T2 快照的 `gaps`/`feedback`/`selfModel` 三块消费；`insight-extract` 只写 raw 链候选实体（`pending-distillation`、confidence 0、type `MetaKnowledge`），走同一道蒸馏门。默认链 16→17 步（`trajectory` 后插 `insight-extract`）。自动调参与 `--fix` 自动修复明确不做。
- **6.6 内外维护**：新增只读聚合 `src/maintenance-report.js`（单一出口）——`internal` 给 meko 内场（T0 plan 带 `observation` + 按 empty→orphan→unindexed→stagnant→thin 排序的 `targets`；T2 快照增 `insights`），`external` 给 memo 外场（`user.maintenance` + 系统行「缺口 N 走势」）。memo 仍纯读、不派单；targets 只是清单，真修复仍归 2.12/2.13；洞察仍走蒸馏门。
- **6.11 真库副本端到端**（2026-11-17）：320 实体分层原稿 86 / 短料 174 / 知识 60；默认 30 天窗候选 0（短料更新时间全在 2026-11-02..15）；`--window-days 7` 强跑副本：候选 3 → 归档包（ndjson/md/manifest）→ 干跑还原通过 → 删 3 行 + 墓碑 3 → `integrity_check=ok`。真库未动，归档包留在临时目录。
- **6.7 访问事件**：新增只追加事实表 `access_hits`（entity_id/hit_at/source）+ `src/access.js`；`recordAccess` 由 CLI/宿主在内容被真正消费后调用，检索与 memo 仍纯读。prune（近 90 天 hit 只救不杀）、compress（last_access 与最近 hit 都旧才压）、field-promote（近 30 天 hit 算 access 证据）、KESPI KA（两者取更近）四处消费同一时钟。不改 `last_access`、不物理删。旧院 `query.js` 在读路径写回；本件把同一次写挪到消费方，语义同、边界清。
- **6.8 自优化闭环**：新增 `opt_tickets` 工单表 + `src/self-optimize.js`。KESPI 八维低于阈值即开单（同实体同维幂等），按维路由到 `reconcile`/`rebond`/`demote` 或 `memo-card`；`reconcile` 先于 `rebond`。下药后重算 KESPI，读数上升即 `verified`，连续两次无改善即 `rejected`。已验证工单过 `omni-gate` 三闸后毕业成 `opt:<kind>:<action>` gene（未过则 `quarantined`）。默认链 `kespi` 后插 `self-optimize`（17→18 步），但只在「维护/自优化」轮或显式开关下执行，迁移/全量首跑不改库。`gene-keeper` 继承 `skill-trainer`，只读扫描工单候选（`persist:false`）；五成员增 `skills` 列。详见 `docs/Engineering/MEKO-SKILL-IMPORT-2026-11-16.md`。
- **6.9 脚手架三件移植**：取证结论是原版 14 件只通 1 条活线（`panel ← gap-detector`），return 是 stdout 日志投递、非契约，四个头全绑 v1 数据模型。本件只搬能力不搬壳：`src/retrieval-kpi.js`（自指 Q&A → recall@k/MRR → 一条轨迹）、`src/lineage-reflect.js`（`field_actions` 归组 + 撤回计失败 + KESPI 走势 → 反思轨迹）、`src/capability-dispatch.js`（有原文无蒸馏点 → `dim='cap'` 工单）。三件只写 `task_trajectories` / `opt_tickets`，同 cycle 覆盖不堆行；`verifyTickets` 扩到 `proposed`，cap 工单以 `distill_points` 出现为消费证据，且不毕业成 gene。默认链插入三步（18→21），共用 6.8 的维护开关，迁移/首跑不改库。不搬 `parasite-return` / `meko-switchboard` / `meko-patrol` 存在性核单 / `growth-exploration-graph`。
- **6.9b 时界真接**：`meko_cycles` 增 `kespi_source`（新库建表即带，旧库 `PRAGMA table_info` 后幂等补列）；`probeTopologyHealth` 改取 `kespi_scores.overall` 的活跃实体均值，无读数才写占位并标 `placeholder`。`T_bound` 的 base 改 `max(cycleType base, Σ budgetTick)`，运算类显式 120/300 秒、未知类型不再落 3 秒；每步按 `budgetTick × loadFactor × 1s` 记软配额（`quotaMs/elapsedMs/overBudget` 入结果与轨迹），硬停仍是整轮 deadline。`lineage-reflect` 走势只取 `kespi_source='kespi_scores'`，占位/NULL 行排除。`feedback-delta` / `insight-extract` 的同类读数未在本件改，登记为后续。
- **6.9c 读数同源**：`feedback-delta` 的最近两轮与 `insight-extract` 的轮级序列都加 `kespi_source='kespi_scores'`，占位行不再进入 Delta 与洞察效果；真读数不足两轮则诚实报 `insufficient`，不拿占位凑数。旧库历史占位行保留原样，新读者直接跳过。6.9b 登记的残留至此清完。

## 五·补四 M7 身份与派生面（1/1 已落地）

> **2026-11-17 owner 定调**：知识进 aing 后表头只是序列号，aing 不处理它；内容才是要加工的对象；新内容另有序列号。关联由内容产生——**关键词能把库中多少派生词关联得越多，就是知识链**。另两条硬要求：粤语本身可以拆（词素级）；繁体是粤语最常用形、也是海外圈主用形，生成器必须同产繁体。

| # | 任务 | 状态 | spec | 证据 |
|---|---|---|---|---|
| 7.1 | 序列号身份 × 派生词发芽面 | ✅ 收口（2026-11-18） | `spec/SPEC-7.1-序列号身份与派生词发芽面.md` | test-7.1-identity-derive 12/12（繁简双形/查询归一/粤语拆解/strand+metabolized_at/future→past 拒边/一次加标签/单圈 21 步）+ test-7.1b-assemble 7/7（四件齐、源头只取 past 带原始时间、链按 links.created_at 升序、纯读）+ test-7.1c-index-face 7/7（表头不入键/正文入键/繁简互打/粤普互打/序列号路只认 id/弱 related 不进慢回忆）+ test-7.1d-identity 5/5（序列号 e-YYYYMMDD-NNNN + 号段账本不回收/标题派生/指纹去重/同号拒写）+ test-7.1e-yue 11/11（九条真实粤语问句可转普通话、非粤语不乱猜）+ test-7.1f-sprout-degree 5/5（sprout 只数强候选边/variants/死胡同分布/提升后仍进发芽面/对象形证据）+ test-7.1g-expansion 3/3（扩展 ≤3、权重递减、原词优先）+ test-7.1h-rounds 8/8（单轮全绿/上轮产物过一轮即标记/新产物落 future/已标记产物不再进蒸馏/两轮产物数不增/重跑标记不变/稳态轮实体零增长/边按配额有界增长）+ test-7.1i-distill-stock 4/4（旧行不动/产物落 future/past→future 加工边/重跑不重写产物）+ test-8.1-adapter 4/4（只有插排碰 sql.js/接口独立读写/未接引擎显式报错/换引擎不改上层）+ test-8.2-hard-gates 7/7（入库保原始时间/迁移拒无时间行并复核/库层触发器拒 future→past 的 INSERT 与 UPDATE/past→future 放行）+ test-7.1j-migration-idempotent 3/3（schema 迁移两趟快照一致/别名映射不变/旧库第二趟拒且目标不动，护栏）+ test-7.1k-synonym-expansion 5/5（同义词可查/别名上限≤4/无关词不乱扩/写盘→落盘端到端/找东西→检索）+ test-7.1l-field-weight 4/4（正文命中权重高于标签命中/标签仍可召回不归零/正文命中排前/TAG_WEIGHT<1 可解释）+ test-7.1m-dedupe-twins 3/3（同基名镜像只占一个名次/让出槽位给不同内容/被折叠 id 记 mergedIds）；`src/{derive,assemble,identity,retrieval,sprout-report}.js`、`data/lexicon/{zh-variant,yue-morph}.json`；修 field-promote 三处（闸读边层口径 / 证据对象形 / 提升落 hydrogen-bond@7）并接进 field-maintain；实测：冻结评测集 R@10 77.5%→85.6%（paraphrase 63.8→74.5%、粤语 74.0→86.0%）；真库副本跑一轮后关键词死胡同 92/92→30/92、中位 0→2、p90 0→8；AC-17 已收口（orchestrator 每轮开局收产物清单、本轮全绿即 markMetabolized；insight-extract 落 future；distill 只处理 past 源、产物落 future；reconcile 不为 future 建镜像）；AC-19 已落地（distill 旧行只翻状态、镜像落 future、建 past→future derived 边、产物行只读）；插排 AC-8.1 已收口（src/db-adapter.js 唯一碰 sql.js，arch-lint C6 守）；AC-18 落成库层触发器（INSERT/UPDATE 都拦 future→past）；AC-20 落地（insertEntity 保留原始时间；迁移拒收无时间行并逐行复核）；AC-8 迁移幂等已锁；同义/别名扩展层落地（data/lexicon/zh-synonym.json，查询侧、仍受 ≤3 扩展上限）：冻结集 R@10 85.6→86.9%、nDCG@10 73.5→74.1%、正负名次差 85.0→86.3%、粤语 86.0→90.0%、改述 75.5→77.7%（负例命中率 32.5→33.8% 是 top10 变宽，名次差同涨 1.3 说明排序变好）；评测指标加 nDCG@10 + 正负名次差。字段权重落地（正文命中满分、仅标签命中 ×TAG_WEIGHT=0.6，排序永远正文在前）：冻结集不动（评测标签只有 eval，无泛标签可压），真库副本上只靠标签抢位的条目 top10 59/240→55/240；镜像孪生按 id 基名折叠（raw-x / x / wiki-x 只留名次最高一份，mergedIds 可解释；不按正文指纹折，避免吞掉独立条目）：真库副本 top10 标签抢位 59→55（22.9%），冻结集 R@10 86.9% 不变。AC-1/2 主体补落地（2026-11-18）：title 独立成列（正文派生、永不入键；老库回填 name→title）、name 降为序列号副本、reviseEntity 修订走新序列号 + 旧档 invalid_at/invalid_reason 指新号（同内容不新开号）、会话卡 title 取话题/正文首句不裸露 sessionId 与时间戳；显示层 memo/predict/retention/trajectory/recycle/maintenance-report 一律 title 优先、回落 name；test-7.1n-identity-title 6/6；判读集与冻结集不变（词面面不含 name/title）。AC-7 补落地（2026-11-18）：发芽度报告工具 tools/sprout-report.js（默认真库副本、--keywords/--json/--top，纯读源库不动）+ hub 警戒线（单关键词 sprout ≥ max(5, 实体数×20%) 只报不扩）+ 实体级 hub（被 ≥3 个关键词触达的实体单列）；真库读数：93 词 / 死胡同 68 / 中位 0 / p90 2 / 最大 4（发芽面近乎为空，强候选边太少），无词级 hub，实体级 hub 直指 skill-registry 卡（被 9 个词触达）；test-7.1o-sprout-hub 8/8。AC-12 收口（2026-11-18）：扩展改为整句共用名额池（≤3 条，按词轮转分配：单词吃到 3、三词各 1），且只有短/模糊查询才触发（CJK ≤8 字且词数 ≤3）；繁简/粤普归一不算扩展、不占名额；组内去重、原词恒首位、权重递减不变；test-7.1p-expansion-cap 5/5；判读集 17/19/.778 与冻结集 P@10 11.6%/R@10 98.5% 逐位不变。 AC-9/13 补护栏（2026-11-18）：data/lexicon/README.md 逐个登记三份词典的用途/出处/许可（含引入外部词典的规矩与候选来源许可），test-7.1q-lexicon-provenance 5/5（每份 _meta 齐 / README 列名 / 抽词器确定性 / 生成器与发芽链无网络·子进程·GPU 调用 / 词典只从仓内读）。SPEC-7.1 全部 AC 收口。**M7 收口复核（2026-11-18，hana）**：AC-1~AC-17 逐条对到绿断言（7.1/7.1b~7.1r、8.1、8.2 共 19 档），三条裁定见 §七 D16——① 存量旧档不重写 name（只追加），题头一律落 title；② 余下四条旧导入路径（compile/api-gate/capability-narrative/recycle）仍写 name=题头，登记偏离、不属本轮（distill/meko-field/import 三处产物 title 已补，见 §七 D16）；③ §七.1 的 alias 列不实施，旧 id 原地充当序列号（等价形态）。本轮补的真缺口：`migrateFrom` 之前只搬 name 不搬 title，旧库迁入后 title 全空——已修（旧 title 优先、缺了回落旧 name），护栏 test-7.1r-identity-closeout 5/5。 |

## 六、代谢健康第二口径（工程绿 ≠ 健康绿）

首战体检结论（库龄 11 天口径）：守恒比 0 / 回炉单向泄漏 / 存量 hub 垄断（29 实体超 cap，头部 48 度贡献 65% 边）。

| 目标 | 断言 | 挂钩任务 |
|---|---|---|
| 守恒比 ∈ [0.8, 1.5] | 36 轮 sprout 有产出 | 2.10 |
| 回炉闭环 | recycle-seeds 在 STEPS 且触发过 | 2.9 |
| hub 拆解 | cap 越线节点清零，误删=0 | 2.11 |
| 活性-连接相关 | P8 待复核后定（r=-0.187 疑批量刷活性）| 2.10 |

## 七、未决与偏离登记

| # | 事项 | 处置 |
|---|---|---|
| D1 | meko 四件先于 M1 代谢件落地（顺序倒挂）| 已重标 M2；M1 关键路径仍 1.1→1.6→1.14 |
| D2 | M1 任务数 12/14 两口径 | **统一 14**（1.1–1.14）|
| D3 | 文档待更新：ds superagent 复刻标记、双蜂群口径 | **已补（2026-11-18）**：INVENTORY 增 §K（内外两蜂群 + ds 复刻保真要点）+ MASTER §四 + 任务级 M2/M3 保真注；F 家族 tri-path 标「外蜂群三路突击本体」、H 家族 guide-chain 去掉「蜂群」称谓 |
| D4 | 轴 3 行号 prune.js:190 vs :245 | **已核（2026-11-18，旧院 aing 冻结版）**：190 = 三条件 AND 闸（`if (checks.inactive && checks.lowQuality && checks.lowDegree)`）；245–266 = invalid_at 打戳 + 搬 pruned/，两处行号对得上，无偏移 |
| D5 | AGENT.md 命令超前（memo/neural/query 等未实现）| 已加可用性标注 |
| D6 | T_bound p99 真值未测 | 随 2.4 补离线实测 |
| **D7** | 双链 id 前缀（`raw-`/`wiki-`）只喺实现约定 | 已入 SPEC-0.6 §五，待 0.1 修订落列 |
| **D18** | 自优化闭环在真库从未闭合过（14 轮 / 865 次场域动作 / 20 单 / **0 verified**） | **已诊（2026-11-18，hana；真库副本实测）**：四处断裂同时存在——① **规则**：五维里 kq/ka/kr/overall 全走 `memo-card`，只出提案不碰场域（真库 ka<0.3 有 205 个实体，只开出 12 单，`MAX_TICKETS=20` 额满）；② **状态机**：`proposed` 无消费方、不回 `open`，却又被 `_openKeys` 算作在途 → 出应单＝永久占坑；③ **作用域**：kd 开单要求「入向强边≥2」，命中的全是 `wiki-/dispatch-/skill-registry-` 实体，而 `rebond` 硬过滤 `raw-*` → `scanned=0` 必然（8 单全 `no-effect`）；④ **计量**：真库 126 条有效氢键中 118 条 `strength=1`，而 kd 只数 `strength≥7` 出向边；kd 又是离散步长（0/1/3/2/3/1），门槛 0.40 把单条边（0.333）判死 —— 动作造的东西、指标测的东西、单子派的对象三者不相交。**另查**：`kc` 全库恒 0.5（322/322，无派生件），`kc<0.40` 永不触发 → reconcile 这条真动作一次都开不出单；真库 0 条 `derived` 边，286 条 `strength≥7` 的 `related` 边全是旧库迁移遗产，v2 无任何步骤产出它们。**已修（SPEC-6.17）**：③④ 两条 + `rebond` 假成功（库层 future→past 闸被 catch 吞成「复键」，3 次记账 0 条边）。**未修（另立线）**：① proposal 单的消费方与 TTL（现两轮即堆积 32 单）；② 催化率长期口径——v2 不产强 `related` 边，kd 现在只能靠镜像键与派生边有分；③ 闭环缺「真能造结构边」的动作，派生链（distill 仅 2 条原料待产）尚未铺开。 |
| **D17** | swarm33 规则库（AB 六模块 135 断言）的定位与接线口径 | **owner 口径（2026-11-18）**：不是「要不要移植」的问题，是它本来就属 **DNA 范式 0.5 版**——**三层流层结构**：`aing →（信号）→ memo（单向）→ meko`，meko **直接派单至 skill 或寄生**，meko 跟单，得回单后上 **meko 外接屏**显示，**处理单次**。meko 与 aing 平行，不经 memo 之外的旁路。**待对账**：D12（2026-11-17）写的是「meko 不派粒、不接外派工单、外派面在 memo 挂载」——本口径下 meko 要派单，两者需分域：推定读法是「外派**采集**面仍在 memo、meko 不接外派单；meko 所派是本域**内场**单（skill / 寄生）」，此读法待 owner 一句确认。**六件源码本身不接进新构造**（它们是对旧包的分析产物）；**取的是口径不是代码**——135 断言按三层流层逐条归位（信号层 / memo 阀门 / meko 派单跟单 / 回单与外接屏 / 单次处理），归位结果为「留、改、弃」三档——**已归位（2026-11-18）**：134 条 = 留 58 / 改 57 / 弃 19，逐段表见 `docs/M6-SWARM33-三层流层归位-2026-11-18.md`；最值钱三条为膜透性三档、发布门、追单不补位。**六段叙事与此不冲突**：六段是给新版定的入库单元，要接到 CLI / auto-ingest（见 §五·补三 6.1 待接条）|
| **D16** | SPEC-7.1 §七 迁移口径与实现三处偏离（别名列 / 存量 name / 旧导入路径）| **已裁（2026-11-18，M7 收口复核）**：① §七.1「新增 alias 列 + 重排序列号」不实施——旧 id 原地充当序列号，等价形态，避免动 links 端点与推翻 AC-2 只追加；② 存量旧档不重写 name，题头一律落 title（旧 name 原值保留）；③ **title 面已补**：distill / meko-field（镜像）/ import（骨架）三条产物路径改为带 title（源有题头就继承、缺了回落 name），真库副本「迁移 + 首跑 21 步」后 320 实体空 title 由 203→**0**；仍属已知偏离的是 compile / api-gate / capability-narrative / recycle 四条旧导入路径（不在代谢链上跑）仍写 name=题头、title 空——展示回落 name、不入键、不影响检索；改造要推翻 1.1/1.4/1.5/2.9b/6.11b 既有断言，须独立 spec 轮次 |
| **D15** | 「无物理删」铁律与 2 万/月短料 + 手机端容量冲突 | **已裁（2026-11-17，owner 批准）**：改为「带归档的两段式删除」——退役打戳 → 归档校验（条数/SHA）→ 物理清热库 → 墓碑永久；原稿层永不删。落 SPEC-6.11；代码已补（retention/archive/tombstone/prune 切换） |
| **D14** | KESPI 总公式口径（旧八维加权 vs v2 算术均值）与六个未登记小件 | **已裁（2026-11-17）**：KESPI 维持算术均值（维度语义已换，权重只给旧数字假可比）；sensory-ends / scheduler 登记「有意不迁」，batch-ingest / search-and-ingest / api-server entity REST / host 杂件随宿主接口面与发布范围一次性裁定 |
| **D13** | 旧版 aing 的 md9 欠账（88 篇机械回填 + references/demo/tools 9 篇 + 13 篇无 frontmatter 定值） | **已裁（2026-11-17）**：旧版冻结、一律不改；v2 实际启用时以 v2 为准（owner：旧版果边可以跳过） |
| **D9** | 原院 guardrails 无调用点、四件 meko-* 无调用方 | 已裁定唔迁：guardrails 化为 `omni-gate` 强制闸（2.16）；meko-* 四件弃 |
| **D10** | **守内面两套口径并存**：内部总设定 = neural-evolution-swarm 旧五角色；v2 = gene-keeper/omni-gate/pilot/tri-cross/poll 五组件 + 狼位 | **已裁（2026-11-17，owner 授权代裁）**：守内面 = v2 五组件 + 2.17 狼位；旧五角色不迁入守内面。理由：旧角色依赖宿主 spawn 子代理，包内不装执行器，搬入即空壳；2.14/2.17/6.6 已落地全绿，换口径零收益；对抗职能由 omni-gate 三闸 + tri-cross 双链互校 + poll 加权意见承担，掩护位粒子属外派面不混入 |
| **D11** | 包内 `src/dispatch-swarm.js` 与「对外采集与包无代码接线」边界冲突 | **已裁 A（2026-11-17）**：留包内，只作「派单底版校验 + 攻果门校验」纯函数与记账；不 spawn、不发网络、不碰存储（`tools/arch-lint.js` 执行位守）；AC-6~20 全落测。剩项：包内无生产调用方，接线归宿主运行时的外派入口 |
| **D12** | memo 与 meko 两端口径并存（§11.2 `memo --dispatch` vs 6.6「memo 不派单」） | **已裁（2026-11-17）**：**外派面在 memo 挂载**，随载交付相关设定；memo 只出读数与派单卡（纯读、不执行），meko 只出编排与场域读数、只管双铰链体（不派粒、不接外派工单）；两端口径同源、字段同名、均不声称「已派」。落于 SPEC-2.18 §〇 / SPEC-0.8 十 / SPEC-6.6 |
| ~~D8~~ | ~~8 个模块直连 store~~ | **已清**：compile/tri-axis-gate 改注入；arch-lint C5 守（2026-11-16）|
