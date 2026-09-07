---
tags: ["aing", "评审", "进化团队", "四角色", "对抗结构", "拓扑"]
---

# 评审组：四角色进化团队派发

## 什么时候派团队，什么时候单干

单 agent 干：查代码、小修、文档、部署验收——治理组红线足够约束。
派团队：架构设计、系统性体检、训练闭环评估——这类任务的盲区在"一个 agent 既当运动员又当裁判"。工程师天然偏向"能跑就行"，理论家天然偏向"机制不成立就是空转"，这个矛盾必须分角色才能暴露。

## 首选：派发 neural-evolution-swarm

已安装时（`.meituan-catpaw/<uid>\skills\neural-evolution-swarm\`），按其 workflow.md 派发四角色：

| 角色 | 职责 | Gate |
|---|---|---|
| neuro-theorist | 计算意识六属性 + GWT/赫布映射评审 | 六属性 ✓ ≥4 且无关键 ✗ |
| senior-engineer | 语义级实现与排障 | 回归全过、无新增 lint |
| skill-trainer | SkillOpt 式训练闭环 | 候选分 > 当前基线 |
| plasticity-analyst | 拓扑健康与回炉闭环 | 守恒比 0.8~1.5 且闭环成立 |

派发前先跑其 Pre-flight：读 dependencies.yaml 核验依赖；技能全缺可退化为 inline-persona 模式。

## 降级：inline 四角色（swarm 未安装时）

同一任务内串行扮演四个角色，但必须**保留对抗结构**：理论评审先于实现、实现后必须体检、角色结论矛盾时原样呈现不调解。偷懒合并角色 = 回到单裁判盲区，宁可只跑理论评审一个角色。

## aing 特有的评审输入

评 aing 相关设计时，把这两样喂给理论家：`docs/Engineering/` 架构文档（含想/记分离血脉）与 GREEN-LIST 能力边界（防评审出"能力不存在"的假阳性）。体检报告落 <sqa-root> 归档，结论走双证据仲裁。
