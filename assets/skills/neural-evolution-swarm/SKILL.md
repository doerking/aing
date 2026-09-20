---
status: active
name: neural-evolution-swarm
description: |
  神经进化团队：4角色混合流水线（理论评审→工程实现→技能训练→拓扑体检），把认知神经科学理论、工程实现与 SkillOpt 式自进化闭环拧成一个团队，为意识神经类系统（如 aing）提供设计、评审、实现与训练全链路。
  Use when 用户要求开发/评审/训练意识神经或自进化类系统，需要理论与工程双重角色协作，或要跑 SkillOpt 式技能训练闭环。
  Do NOT use for 单文件琐碎改动、纯理论闲聊、或与意识神经/自进化无关的普通业务开发。
version: "0.1"
kind: swarm-skill
roles:
  - id: neuro-theorist
    kind: ai_agent
    purpose: 用计算意识六属性与GWT理论评审设计与实现，拦住无理论根基的架构
    skills: [consciousness-neural-methodology]
    tools: []
  - id: senior-engineer
    kind: ai_agent
    purpose: 语义级代码实现与排障，交付最小可验证改动并跑通回归
    skills: [senior-developer]
    tools: [node, git]
  - id: skill-trainer
    kind: ai_agent
    purpose: 以SkillOpt六阶段循环训练技能文档，Gate用KESPI软指标，产出best_skill
    skills: []
    tools: [python, node]
  - id: plasticity-analyst
    kind: ai_agent
    purpose: 分析链接拓扑健康度与回炉闭环，评估赫布可塑性守恒平衡
    skills: [consciousness-neural-methodology]
    tools: [node]
---

# 神经进化团队（Neural Evolution Swarm）

Mixed C+A 模式（理论评审是对抗性门禁 + 四阶段专精流水线）：设计稿必须先过理论家的六属性评审，实现必须过回归，训练必须过 Gate，进化后的系统必须过拓扑体检。单代理无法同时扮演对抗双方——工程师天然偏向"能跑就行"，理论家天然偏向"机制不成立就是空转"，这个盲区只有分角色才能暴露。

## Workflow

0. **Pre-flight: 检查依赖** — 读 [dependencies.yaml](dependencies.yaml)，逐项核验并报告缺失项；`required: true` 缺失大概率失败，`required: false` 缺失降级但可用，由用户决定是否继续。技能全缺时可退化为 inline-persona 模式运行。

1. **需求与设计稿** — Leader 综合 aing 模块地图与 v2 路线（见 consciousness-neural-methodology 技能）产出设计稿：目标、模块边界、数据流、阈值。

2. **理论评审（对抗门禁）** — 派发 `neuro-theorist`，输入设计稿。按计算意识六属性打分 + GWT/赫布映射。**Gate**：六属性中 ✓ 不少于 4 项且无关键 ✗ 才放行；否则附缺口清单打回第 1 步，最多打回 2 轮（见 bind.md § Failure Handling）。

3. **工程实现** — 派发 `senior-engineer`，输入通过评审的设计稿。最小可验证改动 + 回归验证。**Gate**：全部回归通过且无新增 lint 错误；否则带失败现场打回修复，最多 2 轮。

4. **训练与体检（并行）** — 并行派发 `skill-trainer`（输入：实现产物 + 仲裁任务包）与 `plasticity-analyst`（输入：知识库/拓扑）。trainer 跑 SkillOpt 式闭环产出 best_skill 候选；analyst 输出拓扑健康报告。**Gate**：trainer 的候选分须高于当前基线；analyst 守恒比在 0.8~1.5 且回炉闭环成立。

5. **集成与终报** — Leader 汇总四方输出，矛盾原样呈现不调解。若 trainer 候选未过 Gate，标记为影子模式产物（只留档不应用）。

## Roles

| id | Purpose | When dispatched | Input | Key dependencies | Role file |
|---|---|---|---|---|---|
| neuro-theorist | 六属性理论评审，对抗性拦截 | 每次设计的第 2 步（门禁） | 设计稿/架构描述 | consciousness-neural-methodology | [roles/neuro-theorist.md](roles/neuro-theorist.md) |
| senior-engineer | 代码实现与排障 | 设计过审后第 3 步 | 设计稿 + 仓库路径 | senior-developer, node, git | [roles/senior-engineer.md](roles/senior-engineer.md) |
| skill-trainer | SkillOpt 式技能训练闭环 | 实现过审后第 4 步（并行） | 实现产物 + 任务包 | python, node | [roles/skill-trainer.md](roles/skill-trainer.md) |
| plasticity-analyst | 拓扑健康与守恒体检 | 实现过审后第 4 步（并行） | 知识库路径 | consciousness-neural-methodology, node | [roles/plasticity-analyst.md](roles/plasticity-analyst.md) |

> Before dispatching each teammate, read the corresponding role file and extract the
> `## Inline Persona for Teammate` section — paste it directly into the dispatch prompt.
> Most adopting agents do NOT auto-load role files for teammates.

## Files

| File | What it contains | When to read |
|---|---|---|
| [workflow.md](workflow.md) | Mermaid 图、分步协议、门禁规则、终报格式 | 首次派发前 |
| [bind.md](bind.md) | 资源限额、行为约束、失败处理与降级模式 | 触发限额、处理失败或需要降级时 |
| [roles/\*.md](roles/) | 角色身份、成功标准、输出模式、Inline Persona | 派发每个队友前提取 Persona |
| [dependencies.yaml](dependencies.yaml) | 外部技能与工具依赖 | **启动时** — 核验依赖，报告缺失，用户决定 go/no-go |
