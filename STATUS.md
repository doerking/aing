---
tags: [aing-v2, 状态, 进度, single-source-of-truth:9, must-read:9]
description: aing-v2 重写进度唯一真源——61 任务状态/spec/test/证据三指针，其余文档只引用不复述
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
| 测试 | `npm test` → 46 档 / 286 条断言全绿 |
| test 计数守 | `npm run test:guard`（基线 `test/baseline.json`，只加唔减）|
| 任务总数口径 | **61 任务**（M0=4(+3 附) / M1=15 / M2=18 / M3=14 / M4=6 / M5=3 / M6=1）|

> **2026-11-16 owner 取态（SPEC-0.6）**：aing 全组件转 DNA 范式；meko 中间质贯彻全架构（编排唯一入口 + 组件契约）；9 段分三带，**中间 6/5/4 段跑时界场域**负责双铰链维护与提升；全仓 md 走 Tolaria 9 段格式（门禁 C4）。本取态取代「meko 旁挂四件类」薄版。
> **2026-11-16 摆位裁定（SPEC-0.8）**：进化团旧院一直旁挂无定位，今次**入驻 meko 中间质**——五成员（gene-keeper / omni-gate / pilot / tri-cross / poll）按组件契约注册，蜂巢形态共享同一中间质，T0 定焦 / T1 复核 / T2 度量 / T3 演化 四时点 × 六维（结构/强度/度量/时序/成员/用户）全程维护；判定与执行分离，写入仍由场域件 2.12/2.13 做。
> **2026-11-16 修订 A（SPEC-0.8 §九–§十）**：五角色身份与职责**不动**，三分编组下沉到子层——每位自带 ≤2 子agent（狼位），5 单元 × 3 员 = 15 席，观察层由狼位补。外派蜂群照旧院条令：常驻 3 员单位、**派出前底版范式（语言+行为+工作流）先于任务链**、单间不互斥滚动派发、收口后交接自然消逝（只回残渣）。守内/对外仍互不派单不桥接，两边只共同接住 meko 的派出口与残渣吸入口。**旧五角色（neural-evolution-swarm）归 memo 做外场维护**（无 meko 写权、无场域带权限）；内场加狼位（2.17），外场**唔加常设子agent**（重活交外派）。维护纪律直接对齐**双相循环**（一轮点样转）与**决策闸**（一个动作点样拍板）；发布包内唔用内部术语。
> **2026-11-16 缘起口径（SPEC-0.7）**：本能=场域自动；意识=决策与预判；**成长只认会话三源**（回复/搜索展示/事由分析）；**预判=发芽代谢出有据预案**；memo 把主驾注意力转向用户；内成员与主驾隔着 memo。

## 一、M0 全架构 spec（4/4）

| # | 任务 | 状态 | spec | 证据 |
|---|---|---|---|---|
| 0.1 | 数据模型 | ✅ | `spec/SPEC-0.1-数据模型.md` | test-1.1-dataschema 6/6 |
| 0.2 | meko 四顶接口 | ✅ | `spec/SPEC-0.2-meko四顶接口.md` | test-2.8-meko-four 5/5 |
| 0.3 | 时界调度协议 | ✅ | `spec/SPEC-0.3-时界调度协议.md` | test-2.4-timebound 5/5 |
| 0.4 | 三轴判定 | ✅ | `spec/SPEC-0.4-三轴判定.md` | test-1.6-triaxis-gate 8/8 |
| 附 | 内外蜂群接线 | ✅ | `spec/SPEC-0.5-内外蜂群接线与部署重设.md` | 文档面 |
| **0.6** | **meko 贯彻全架构 × 中间三段时界场域** | ✅ | `spec/SPEC-0.6-meko贯彻全架构-中间三段时界场域.md` | doc-tags-lint 6/6 + C4 |
| **0.7** | **双系统运行协议（本能×意识×预判/成长闭环/预案）** | ✅ | `spec/SPEC-0.7-双系统运行协议-成长闭环与预案.md` | 规格拍板（实现挂 M3）|

**M0 拍板**：2026-11-16 owner 授权 Hana 揸 fit 布置，四份 spec 视为拍板通过，开 M1。

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
| 1.11 | compress 换锚 | ✅ | 1.11 | test-1.11-compress 7/7 |
| 1.12 | kespi 八维 | ✅ | 1.12 | test-1.12-kespi 7/7 |
| 1.13 | prune 逻辑退役 | ✅ | 1.13 | test-1.13-prune 6/6 |
| 1.14 | **meko-orchestrator 编排（关键路径尾）** | ✅ | 1.14 | test-1.14-orchestrator 6/6 |
| **1.15** | **场域骨架 + 组件契约门禁（arch-lint C5）** | ✅ | 1.15 | test-1.15-field 8/8 + C5 |

## 三、M2 meko 四顶职责 + 进化团入驻（4/8 已落地 + 3 健康修复 + 3 进化团）

| # | 任务 | 状态 | spec | test |
|---|---|---|---|---|
| 2.1 | ① HydrogenBond 弱键可逆 | ✅ | 0.2 | test-2.8-meko-four AC-2 |
| 2.2 | ② HistoneLayer 分层 | ✅ | 0.2 | test-2.8-meko-four AC-3 |
| 2.3 | failing test：时界时延上界 | ✅ | 0.3 | test-2.4-timebound AC-2 |
| 2.4 | ③ TimeboundOrchestrator | ✅ | 0.3 | test-2.4-timebound 5/5 |
| 2.5 | ③ SLB/SLE 双模分流 | ✅ | 0.3 | test-2.4 AC-3 |
| 2.6 | ③ Polar 抗干扰 | ✅ | 0.3 | test-2.4 AC-4 |
| 2.7 | ③ 通感一体（KESPI 内嵌）| 🟡 占位 | 0.3 | 现为均分读数，非真 KESPI |
| 2.8 | ④ HelixCrosscheck | 🟡 接口行为 | 0.2 | reconcile=0 占位，完整互校待补 |
| **2.9** | **回炉接线 P6（recycle-seeds 入 STEPS + 门禁断言）** | ✅ | `spec/SPEC-2.9-回炉接线.md` | test-2.9-recycle 6/6；`metabolism.DEFAULT_STEPS` 含 recycle + 编排器真收契约 |
| **2.10** | **守恒闸 P2/P3（sproutFloorPerCycle 2–4，守恒比 ∈[0.8,1.5]）** | ✅ | `spec/SPEC-2.10-守恒闸.md` | test-2.10-conservation 6/6；36 轮每轮产出 2–4、累计比 1.0；每轮落 meko_cycles 三列 |
| **2.11** | **存量 hub 裁剪（非改准入；带误删=0 负向证）** | ✅ | `spec/SPEC-2.11-存量hub裁剪.md` | test-2.11-hub-trim 7/7；只剪弱边(<5)、强边零退、原因码可逆 |
| **2.12** | **场域维护动作（rebond/unwind/reconcile/demote，全可逆）** | ✅ | `spec/SPEC-2.12-场域维护动作.md` | test-2.12-field-maintain 8/8；带界 I1 + 全可逆 I3 + 动作账 |
| **2.13** | **场域提升动作（promote/sprout/pollinate，≥2 证据）** | ✅ | `spec/SPEC-2.13-场域提升动作.md` | test-2.13-field-promote 8/8；I2 证据门槛 + I5 守恒闸 + 边提升可逆 |
| **2.14** | **进化团入驻：五成员契约注册 + 蜂巢成员池** | ✅ | `spec/SPEC-2.14-进化团入驻.md` | test-2.14-evolution-team 6/6；五员契约齐、零写权、无独立入口、成员池 15 席 |
| **2.15** | **六维 × 四时点维护接线（T0–T3）** | ✅ | `spec/SPEC-2.15-六维四时点维护接线.md` | test-2.15-evolution-cycle 5/5；T0–T3 齐、六维各一断言、gene 可回滚 |
| **2.16** | **闸东真接 + 自治/审批边界（OmniGate 强制引用）** | ✅ | `spec/SPEC-2.16-闸东真接与审批边界.md` | test-2.16-omni-gate 8/8；I8 无闸必拒、W2 队列、memo 卡片、双重锁 |
| **2.17** | **子agent 单元：每位角色自带 ≤2 狼位（修订 A）** | ✅ | `spec/SPEC-2.17-子agent狼位.md` | test-2.17-wolf-units 4/4；身份快照不变、零写权、完即弃、D1–D5 采样 |
| **2.18** | **外派三分编组：常驻 3 员/底版先于任务链/滚动派发/交接消逝** | ✅ | `spec/SPEC-2.18-外派蜂群三分编组.md` | test-2.18-dispatch-swarm 7/7；缺底版拒派、单间并行、收口只回残渣、零写权 |

> 2.9–2.11 由神经进化团队首战共识（Gate4b INTERVENE + Gate5 R1 critical）强制纳入，唔做则 M2 门唔过。

## 四、M3 意识层 + 入库 + 门禁（14/14 已落地）

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
| **3.11** | **memo 用户面重构（recent/openLoops/patterns/plans）** | ✅ | `spec/SPEC-3.11-memo用户面.md` | test-3.11-memo 8/8；冷启动诚实、systemLine≤80 |
| **3.12** | **预案器 predict.js（发芽 + 上下文 → ≤3 预案卡）** | ✅ | `spec/SPEC-3.12-预案器predict.md` | test-3.12-predict 7/7；冷启动单卡「无以往依据」 |
| **3.13** | **会话三源入库闭环（reply/search/rationale）** | ✅ | `spec/SPEC-3.13-三源入库闭环.md` | test-3.13-session-ingest 5/5；plan-hit/miss 反馈边 |
| **3.14** | **CLI 入口接线（memo/ingest/orchestrate）** | ✅ | `spec/SPEC-3.14-CLI入口接线.md` | test-3.14-cli 6/6；arch-lint 白名单增 cli.js |

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

- **61/61 任务落地**（M0 4 / M1 15 / M2 18 / M3 14 / M4 6 / M5 3 / M6 1；M2 2.7/2.8 占位另计）
- **46 档 / 286 条断言全绿**；`node verify-deploy.js` → **C0–C21 共 33 项 ALL GREEN**
- **真库**：`data/knowledge.db`（117 实体 / 1009 边，迁移双指纹复核一致）
- **旧库**：只读未动，SHA-256 与 mtime 前后一致；报告 `data/migration-report.json`
- 交接与取舍：`docs/HANDOFF-2026-11-16.md`

## 五·补二 M5 检索后端与测试口径（3/3 已落地）

| # | 任务 | 状态 | spec | 证据 |
|---|---|---|---|---|
| 5.1 | 向量后端可插拔 + 只供测试的开关 + 混用防护 | ✅ | `spec/SPEC-5.1-向量后端可插拔与测试口径.md` | test-5.1-vector-backend 9/9：默认快照逐位不变、8 维探针后端可用、环境变量开关、未知名回退 `fallback:true`、非法后端拒收、换后端全量 rebuilt、混库各自只出自己的行 |
| 5.2 | memo 向量库状态反馈（诊断 + 系统一行 + 四类告警） | ✅ | `spec/SPEC-5.2-memo向量状态反馈.md` | test-5.2-memo-vector-status 8/8：字段齐全、默认态健康、未覆盖/旧后端残留/测试开关/未知名回退各出固定 code 告警、系统一行含后端与覆盖率且 ≤80、纯读、五字段不变 |
| 5.3 | 检索排序修正（简繁归一 + 双字权重 + 双链去重） | ✅ | `spec/SPEC-5.3-检索排序修正.md` | test-5.3-retrieval-rank 9/9：默认升 hash-64w2、旧口径逐位不变、簡查询命繁正文、双字证据排散字前、raw/wiki 只出一条且优先 raw、k 按去重后计、强度加权不变、内置不可覆盖 |

- **默认口径**：5.1 时默认仍是 `hash-64`；5.3 起默认升为 `hash-64w2`（简繁归一 + 双字权重），旧 `hash-64` 保留可切且与 SPEC-1.8 逐位一致（特征化快照锁）。
- **测试开关**：`opts.backend` / `AING_VECTOR_BACKEND` 只供评测；发布包不设，默认值不按评测排名改。
- **口径落文档**：README「六·补 检索口径」+ `docs/Engineering/EMBEDDING-BENCH-2026-11-16.md`（评测集冻结规则、四项指标、粤语单列、测完由使用者自己语料复核）。
- **memo 可见**：`buildMemo` 多返 `diagnostics.vector`（后端 / dim / model / source / active / indexed / stale / missing / percent / alerts），系统一行形如「健康 ok / 向量 hash-64w2 100% / 蒸馏债 0 …」；`env-override` / `backend-fallback` / `stale-rows` / `low-coverage` 四类固定 code 告警，异常不静默。
- **文档投喂试用**（2026-11-16）：18 份真实工作区文档（README/AGENTS/SPEC/模板/规范）隔离库跑通 compile→import→vector，memo 覆盖 100%；实测暴露排序问题，直接催生 5.3。记录见 `docs/Engineering/EMBEDDING-BENCH-2026-11-16.md` §八。
- **未做（下一步）**：冻结评测集 `data/eval/embedding-pairs.jsonl`（≥50 条、粤语 ≥15 条）、词面 IDF 通道、compile 侧 `type` 推断；通道与可见性已齐，结论仍未出。

## 五·补三 M6 能力显现入库（1/1 已落地）

| # | 任务 | 状态 | spec | 证据 |
|---|---|---|---|---|
| 6.1 | 能力显现入库（六段叙事 + 校准合并） | ✅ | `spec/SPEC-6.1-能力显现入库.md` | test-6.1-narrative-ingest 7/7：六段齐、手段/编排归位、截断与思维开关、approval 按 callId 挂工具、feedback/goal 落会话级、落库 content 带 format/turns/stats、幂等、缺料拒入、铁律 |

- **口径来自 AB**：`G:\AB.7z` → `AB/capability-narrative.js` 纯逻辑 1:1 移植（CJS 化），只取 `aing-bridge.js` 的数据契约，不搬 dsh 壳。
- **与三源并存**：3.13（reply/search/rationale）保留；六段是更完整的入库单元（产出=回复、思维≈事由分析、手段≈搜索展示与工具调用）。
- **差异登记**：手段与编排拆成两个 `###` 段（六段要数得出来）；AB 写 `raw/inbox` 中间文件，v2 直接写 Conversation 实体；校准由调用方传数组，不依赖 cordis 事件。
- **未接**：CLI / auto-ingest 尚未调用 `ingestNarrative`；swarm33 规则库（AB 的六模块 135 断言）尚未移植评估。

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
| D3 | 文档待更新：ds superagent 复刻标记、双蜂群口径 | 待补 INVENTORY |
| D4 | 轴 3 行号 prune.js:190 vs :245 | minor，随 1.13 落地一并核 |
| D5 | AGENT.md 命令超前（memo/neural/query 等未实现）| 已加可用性标注 |
| D6 | T_bound p99 真值未测 | 随 2.4 补离线实测 |
| **D7** | 双链 id 前缀（`raw-`/`wiki-`）只喺实现约定 | 已入 SPEC-0.6 §五，待 0.1 修订落列 |
| **D9** | 原院 guardrails 无调用点、四件 meko-* 无调用方 | 已裁定唔迁：guardrails 化为 `omni-gate` 强制闸（2.16）；meko-* 四件弃 |
| ~~D8~~ | ~~8 个模块直连 store~~ | **已清**：compile/tri-axis-gate 改注入；arch-lint C5 守（2026-11-16）|
