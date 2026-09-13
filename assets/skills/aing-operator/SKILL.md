---
name: aing-operator
description: |
  aing 知识生命体专项技能组：给任何 agent 一套操作 aing 的完整能力组——运维组（部署验收/代谢/常驻服务）、修复组（影子纪律/定点同步）、治理组（双证据/绿灯解锁/汇报面板）、训练组（SkillOpt 式技能文档训练闭环）、评审组（四角色进化团队派发）。凡任务涉及 aing、<repo-root>、<opt-copy>、影子目录、知识生命体、代谢管线、KESPI、SkillOpt、芥子回炉、意识神经（sensory-ends/guide-chain/consciousness-layer）等，必须先读本技能再动手——aing 的治理红线不在代码里，不读就动手必然踩线（历史上因此产生过 11 个 bug 与多次误报）。
  Use when 用户提到 aing 生态任何院子（主包/训练副本/影子目录/推演器/第二机），要求部署、验收、运维、修复、训练、评审 aing，或任务的写入目标在 aing 仓库内。
  Do NOT use for 与 aing 无关的普通 Node.js 项目开发（那是 senior-developer 的事）。
version: "0.2"
tags: ["aing", "技能组", "院子地图", "治理", "训练", "评审", "运维", "修复"]
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '00a37886-490b-42c6-b227-7448b4cf09c1'
  PropagateID: '00a37886-490b-42c6-b227-7448b4cf09c1'
  ReservedCode1: '67381800-2283-42ef-9874-48dfc294419f'
  ReservedCode2: '67381800-2283-42ef-9874-48dfc294419f'
---

# aing Operator — aing 知识生命体操作技能组

装上本技能，你就多了一个技能组：**运维组、修复组、治理组、训练组、评审组**。每组的能力细节按需加载 `references/`，本文件只给地图与路由——这是刻意设计：aing 的规则真源在仓库内文档（AGENTS.md / GREEN-LIST / module-handbook），本技能永不复制其正文，只指向它们。复制会造成双真源漂移，那正是 aing 治理史上最大的病。

## 一、院子地图与红线（动手前先背下来）

| 院子 | 路径 | 你能做什么 | 红线 |
|---|---|---|---|
| 主包（发布包） | `<repo-root>` | 读代码、改文档（走"全补"流程）、跑 verify-deploy / 代谢 / 常驻服务 | 严禁跑训练或实验，不留运行痕迹（__pycache__/runs/ckpt）；源代码修改必须先过影子 |
| 训练副本 | `<opt-copy>` | 训练、推演、实验一律在这里 | M3 影子窗口内 src 冻结（可只读复制，不可改） |
| 影子目录 | `<sqa-root>/aing-shadow-*` | 一切代码修改与验证的现场 | 修完定点同步回主包，影子保留作审计证据 |
| 推演器 | EvoX 底盘（A组） | EvoX 负责想，aing 负责记 | 不要把 EvoX 的运行产物搬进 aing 库 |
| 第二机 | B组 | 只收报告，不直接访问 | B组报告必须双证据仲裁后才入账 |

## 二、真源指针表（规则以这些文件为准，本技能只给结论）

| 真源 | 路径 | 什么时候读 |
|---|---|---|
| **新 agent 上手引导（五步）** | `docs/AGENT-ONBOARDING.md` | **首次操作 aing 之前，先走完五步** |
| Agent 行为纪律 + 一键部署 | `AGENTS.md` | 任何动手之前，必读 |
| 能力真源（绿灯清单） | `docs/GREEN-LIST.md` | 声称任何能力可用之前 |
| 模块手册（含坑与铁律） | `docs/module-handbook.md` | 改任何模块之前 |
| 部署体检处方 | `docs/DEPLOY-CHECK-2026-09-02.md` | 部署/验收出问题时 |
| 架构与血脉 | `docs/Engineering/` | 架构类讨论 |

## 三、任务路由与半拉起协议

**半拉起契约（硬规则，非建议）**：
- L0 常驻：本技能的 description（触发判断用，几十词）。
- L1 触发即读：本 SKILL.md（≤60 行，含院子地图与红线，永远全读）。
- L2 按需拉取：`references/` 五份文件**默认全部不读**；仅当任务命中下表某个 tag 时，只拉对应那一份；一次任务最多拉 2 份；禁止为"了解全貌"一次读全部。
- 轻问答豁免：纯 aing 概念问答（"X 是什么"）只凭 L1 回答，不拉 L2；L1 答不了的才升级。

| 用户要做什么 | 组 | 一句话摘要（决定拉不拉，先看这列） | 文件 |
|---|---|---|---|
| 部署 / 验收 / 代谢 / API / 查询 | 运维组 [tag:运维] | 部署 C1-C6 处方、日常命令、冒烟纪律 | [operations.md](references/operations.md) |
| 修 bug / 改代码 / 加功能 | 修复组 [tag:修复] | 五步影子 SOP + Windows 坑清单 | [shadow-sop.md](references/shadow-sop.md) |
| 判真伪 / 写文档声明 / 汇报 / 向用户介绍组件 | 治理组 [tag:治理] | 七条红线（组件透明化 / 部署零偏移）、绿灯面板、B报告仲裁姿态 | [governance.md](references/governance.md) |
| 训练 / 技能文档优化 / SkillOpt | 训练组 [tag:训练] | SkillOpt 闭环 + 无训练师降级路径 | [training-group.md](references/training-group.md) |
| 架构设计 / 体检 / 对抗评审 | 评审组 [tag:评审] | 四角色进化团队派发与门禁 | [evolution-team.md](references/evolution-team.md) |

**标签加载（Tolaria 格式，随取随用）**：本技能全部文件带 frontmatter `tags`，标签是加载单位。行内标签支持 9 段数值 `[tag:xxx:N]`（N=1-9 关联强度，不带 `:N` 默认 5）。标签约定见 `AGENTS.md` 纪律第 7 条。

路由原则：拿不准时先读 governance.md——先知道什么不能做，再决定怎么做；这份算 L2 预算内的那份。多组任务（如"修 bug 并汇报"）按 修复→治理 顺序串行加载，仍不超 2 份。

## 四、汇报纪律（所有组共用）

任何对 aing 的部署/修改完成后，向用户汇报必须附 **verify-deploy.js 的完整全绿面板**（六项 ✅ + ALL GREEN 行）。没有面板 = 汇报不完整。面板模板见 `AGENTS.md` 汇报格式节。

## 五、版本与复审

v0.2（2026-09-04）：任务路由升级为硬性半拉起协议（L2 默认不读、一次最多 2 份、轻问答豁免），路由表增一句话摘要列。v0.1（09-03）首发。M3 影子窗口 09-05 结束、第 11 步芥子回炉移植评估后复审；届时以 GREEN-LIST.md 为准更新路由表。

**发布快照**：本技能随 aing 包分发于 `assets/skills/aing-operator/`（`en/` 为英文镜像，内容与本仓逐字对齐）。改技能先改本仓，再同步快照——快照不是真源。