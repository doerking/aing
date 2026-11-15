---
tags: [aing-v2, 状态, 进度, single-source-of-truth:9, must-read:9]
description: aing-v2 重写进度唯一真源——40 任务状态/spec/test/证据三指针，其余文档只引用不复述
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
| 测试 | `npm test` → 35 档 / 221 条断言全绿 |
| test 计数守 | `npm run test:guard`（基线 `test/baseline.json`，只加唔减）|
| 任务总数口径 | **56 任务**（M0=4(+3 附) / M1=15 / M2=18 / M3=13 / M4=6）|

> **2026-11-16 owner 取态（SPEC-0.6）**：aing 全组件转 DNA 范式；meko 中间质贯彻全架构（编排唯一入口 + 组件契约）；9 段分三带，**中间 6/5/4 段跑星闪场域**负责双铰链维护与提升；全仓 md 走 Tolaria 9 段格式（门禁 C4）。本取态取代「meko 旁挂四件类」薄版。
> **2026-11-16 摆位裁定（SPEC-0.8）**：进化团旧院一直旁挂无定位，今次**入驻 meko 中间质**——五成员（gene-keeper / omni-gate / pilot / tri-cross / poll）按组件契约注册，蜂巢形态共享同一中间质，T0 定焦 / T1 复核 / T2 度量 / T3 演化 四时点 × 六维（结构/强度/度量/时序/成员/用户）全程维护；判定与执行分离，写入仍由场域件 2.12/2.13 做。
> **2026-11-16 修订 A（SPEC-0.8 §九–§十）**：五角色身份与职责**不动**，三分编组下沉到子层——每位自带 ≤2 子agent（狼位），5 单元 × 3 员 = 15 席，观察层由狼位补。外派蜂群照旧院条令：常驻 3 员单位、**派出前底版范式（语言+行为+工作流）先于任务链**、单间不互斥滚动派发、收口后交接自然消逝（只回残渣）。守内/对外仍互不派单不桥接，两边只共同接住 meko 的派出口与残渣吸入口。**旧五角色（neural-evolution-swarm）归 memo 做外场维护**（无 meko 写权、无场域带权限）；内场加狼位（2.17），外场**唔加常设子agent**（重活交外派）。维护纪律直接对齐**双相循环**（一轮点样转）与**决策闸**（一个动作点样拍板）；发布包内唔用内部术语。
> **2026-11-16 缘起口径（SPEC-0.7）**：本能=场域自动；意识=决策与预判；**成长只认会话三源**（回复/搜索展示/事由分析）；**预判=发芽代谢出有据预案**；memo 把主驾注意力转向用户；内成员与主驾隔着 memo。

## 一、M0 全架构 spec（4/4）

| # | 任务 | 状态 | spec | 证据 |
|---|---|---|---|---|
| 0.1 | 数据模型 | ✅ | `spec/SPEC-0.1-数据模型.md` | test-1.1-dataschema 6/6 |
| 0.2 | meko 四顶接口 | ✅ | `spec/SPEC-0.2-meko四顶接口.md` | test-2.8-meko-four 5/5 |
| 0.3 | 星闪调度协议 | ✅ | `spec/SPEC-0.3-星闪调度协议.md` | test-2.4-starlink 5/5 |
| 0.4 | 三轴判定 | ✅ | `spec/SPEC-0.4-三轴判定.md` | test-1.6-triaxis-gate 8/8 |
| 附 | 内外蜂群接线 | ✅ | `spec/SPEC-0.5-内外蜂群接线与部署重设.md` | 文档面 |
| **0.6** | **meko 贯彻全架构 × 中间三段星闪场域** | ✅ | `spec/SPEC-0.6-meko贯彻全架构-中间三段星闪场域.md` | doc-tags-lint 6/6 + C4 |
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
| 2.3 | failing test：星闪时延上界 | ✅ | 0.3 | test-2.4-starlink AC-2 |
| 2.4 | ③ StarlinkOrchestrator | ✅ | 0.3 | test-2.4-starlink 5/5 |
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

## 四、M3 意识层 + 入库 + 门禁（8/13 已落地）

| # | 任务 | 状态 |
|---|---|---|
| 3.1 | 意识层闭环 W3 | ✅ | `spec/SPEC-3.1-意识层闭环.md` | test-3.1-consciousness-kernel 6/6；五因子注意力 + stagnation≥3 断流 |
| 3.2 | 控制面 W2（CLI+HTTP）| ⬜ |
| 3.3 | 读端纯读（C16）| ✅ | `spec/SPEC-3.11-memo用户面.md` | test-3.11-memo AC-6/AC-6c：纯读前后库指纹一致、源码无写语句 |
| 3.4 | 离散旋钮单源（C17）| ✅ | `spec/SPEC-3.4-离散旋钮单源.md` | test-3.4-config-runtime 5/5；四组件共用 DEFAULTS |
| 3.5 | 入库主线（C10g/h）| ✅ | `spec/SPEC-3.5-入库主线.md` | test-3.5-auto-ingest 6/6；三源剥净 + 双向钉 + 身份闸串联 |
| 3.6 | 身份闸 + 标签闸（C10i）| ✅ | `spec/SPEC-3.6-身份闸与标签闸.md` | test-3.6-api-gate 5/5；自报 status/conf/tags 全忽略 |
| 3.7 | 门禁 C0–C9 适配 | ⬜ |
| 3.8 | 门禁 C10a–C10i 适配 | ⬜ |
| 3.9 | 门禁 C11–C19 适配 | ⬜ |
| 3.10 | 门禁 C20–C21 适配 | ⬜ |
| **3.11** | **memo 用户面重构（recent/openLoops/patterns/plans）** | ✅ | `spec/SPEC-3.11-memo用户面.md` | test-3.11-memo 8/8；冷启动诚实、systemLine≤80 |
| **3.12** | **预案器 predict.js（发芽 + 上下文 → ≤3 预案卡）** | ✅ | `spec/SPEC-3.12-预案器predict.md` | test-3.12-predict 7/7；冷启动单卡「无以往依据」 |
| **3.13** | **会话三源入库闭环（reply/search/rationale）** | ✅ | `spec/SPEC-3.13-三源入库闭环.md` | test-3.13-session-ingest 5/5；plan-hit/miss 反馈边 |

## 五、M4 数据迁移 + 总验收（0/6）

| # | 任务 | 状态 |
|---|---|---|
| 4.1 | 迁移前冷备份 | ⬜ |
| 4.2 | failing test：迁移无损 | ⬜ |
| 4.3 | 实体迁移（110 实体零丢失）| ⬜ |
| 4.4 | 边迁移（strength/invalid_at 映射）| ⬜ |
| 4.5 | 全量代谢新架构首跑 | ⬜ |
| 4.6 | 旧库归档 + 总验收 | ⬜ |

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
