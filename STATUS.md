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
| 门禁 | `node verify-deploy.js` → C0–C3 ALL GREEN（2026-11-16）|
| 测试 | `npm test` → 6 档 / 35 条断言全绿 |
| test 计数守 | `npm run test:guard`（基线 `test/baseline.json`，只加唔减）|
| 任务总数口径 | **51 任务**（M0=4(+3 附) / M1=15 / M2=13 / M3=13 / M4=6）|

> **2026-11-16 owner 取态（SPEC-0.6）**：aing 全组件转 DNA 范式；meko 中间质贯彻全架构（编排唯一入口 + 组件契约）；9 段分三带，**中间 6/5/4 段跑星闪场域**负责双铰链维护与提升；全仓 md 走 Tolaria 9 段格式（门禁 C4）。本取态取代「meko 旁挂四件类」薄版。
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

## 二、M1 核心代谢双铰链化（3/14）

| # | 任务 | 状态 | spec | test |
|---|---|---|---|---|
| 1.1 | 骨架 + knowledge-store（全列 schema）| ✅ | 0.1 | test-1.1-dataschema 6/6 |
| 1.2 | failing test：双铰链拓扑锁行为 | ⬜ | — | 待建 `test/test-1.2-helix-topology.js` |
| 1.3 | compile 双铰链化 | ✅ | 1.1 | test-1.1-compile 6/6 |
| 1.4 | import 入库（双链写入）| ⬜ | — | — |
| 1.5 | distill 蒸馏（复制链）| ⬜ | — | — |
| 1.6 | link 三轴化 + 三轴 gate | ✅ | 1.2 | test-1.6-link 5/5 + test-1.6-triaxis-gate 8/8 |
| 1.7 | link-sync 同步 | ⬜ | — | — |
| 1.8 | vector 向量（strength 加权）| ⬜ | — | — |
| 1.9 | sprout 发芽（含 P3 sproutFloor）| ⬜ | — | — |
| 1.10 | pollinate 授粉 | ⬜ | — | — |
| 1.11 | compress 换锚 | ⬜ | — | — |
| 1.12 | kespi 八维 | ⬜ | — | — |
| 1.13 | prune 逻辑退役 | ⬜ | — | — |
| 1.14 | **meko-orchestrator 编排（关键路径尾）** | ⬜ | — | — |
| **1.15** | **场域编排骨架（registerStep/runCycle + 组件契约 + arch-lint C5）** | ⬜ | **0.6** | 全部组件改契约注册，唔直连 store |

## 三、M2 meko 四顶职责（4/8 已落地 + 3 新增健康修复）

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
| **2.9** | **回炉接线 P6（recycle-seeds 入 STEPS + 门禁断言）** | ⬜ | 待写 | **首战共识 critical** |
| **2.10** | **守恒闸 P2/P3（sproutFloorPerCycle 2–4，守恒比 ∈[0.8,1.5]）** | ⬜ | 待写 | **首战共识 critical** |
| **2.11** | **存量 hub 裁剪（非改准入；带误删=0 负向证）** | ⬜ | 待写 | **首战共识 major** |
| **2.12** | **场域维护动作（rebond/unwind/reconcile/demote，全可逆）** | ⬜ | **0.6** | 场域带 6/5/4 内跑，I1/I3 断言 |
| **2.13** | **场域提升动作（promote/sprout/pollinate，≥2 证据）** | ⬜ | **0.6**、2.12 | I2 断言 + 守恒闸 I5 |

> 2.9–2.11 由神经进化团队首战共识（Gate4b INTERVENE + Gate5 R1 critical）强制纳入，唔做则 M2 门唔过。

## 四、M3 意识层 + 入库 + 门禁（0/10）

| # | 任务 | 状态 |
|---|---|---|
| 3.1 | 意识层闭环 W3 | ⬜ |
| 3.2 | 控制面 W2（CLI+HTTP）| ⬜ |
| 3.3 | 读端纯读（C16）| ⬜ |
| 3.4 | 离散旋钮单源（C17）| ⬜ |
| 3.5 | 入库主线（C10g/h）| ⬜ |
| 3.6 | 身份闸 + 标签闸（C10i）| ⬜ |
| 3.7 | 门禁 C0–C9 适配 | ⬜ |
| 3.8 | 门禁 C10a–C10i 适配 | ⬜ |
| 3.9 | 门禁 C11–C19 适配 | ⬜ |
| 3.10 | 门禁 C20–C21 适配 | ⬜ |
| **3.11** | **memo 用户面重构（recent/openLoops/patterns/plans）** | ⬜ |
| **3.12** | **预案器 predict.js（发芽 + 上下文 → ≤3 预案卡）** | ⬜ |
| **3.13** | **三源入库闭环 + 回喂门禁（G1/G5）** | ⬜ |

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
| **D8** | 现有 8 个 src 模块均直连 store | SPEC-0.6 铁律：M1 收口前全部改契约注册（任务 1.15）|
