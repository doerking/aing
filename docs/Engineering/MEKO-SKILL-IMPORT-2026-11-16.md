---
tags: [aing-v2, engineering, meko, 进化团, 技能导入, 决策记录, 嫁接, must-read:8, meko:9]
description: meko 五成员技能导入决策记录——11-10 物业改名丢了原始角色技能，11-16 五成员又按代码组件映射、训练师无继任；本记录逐角色定导入/改写/丢弃，并把训练师并入 gene-keeper
date: 2026-11-16
status: 拍板（owner 授权 Hana 定嫁接姿态）
owner: hana
upstream: [SPEC-0.8 修订 B, SPEC-6.8]
---

# meko 五成员 · 技能导入决策记录（2026-11-16）

> **一句话**：meko 不缺角色，缺角色的技能。11-10 把专业角色改名成物业名时只复制了骨架，11-16 又把五成员按代码组件映射，训练师整条掉了。本记录把技能按角色搬回五成员，训练师并入 `gene-keeper`。

---

## 一、问题链（两次改名，两次掉技能）

### 1.1 第一次：专业角色 → 物业名（2026-11-10）

来源：`三版通杀/docs/团队/MEKO-物业团队-五角色设定-2026-11-10.md`

该文自述：

> 复制 `assets/skills/neural-evolution-swarm` 五角色**骨架**，**专业名隐藏、对外另起物业系名**，用 meko 寄生松骨语义重填。

「重填」= 改名 + 语义重写。骨架（五角色 + 流水线）留下，技能（`skills:` 绑定 + Inline Persona + Output Schema + Gate）没搬。

| 原角色 | 原名 | 改名后 | 原技能 | 改名后剩什么 |
|---|---|---|---|---|
| 理论评审 | neuro-theorist | 物业总规划师 | 六属性标尺 + 全局工作空间/注意力/元认知映射 | 只剩「寄生落点理论」 |
| 工程实现 | senior-engineer | 物业工程师 | 最小可验证改动 + 回归证据 | 只剩「寄生调度器实现」 |
| **技能训练** | **skill-trainer** | **物业管理费司理** | **SkillOpt 六阶段 + best_skill + Gate4a** | **改成管预算/限流，训练职能整条掉了** |
| 拓扑体检 | plasticity-analyst | 物业设施体检员 | 六维拓扑体检 + 守恒比 | 只剩「寄生件拓扑」 |
| 对抗审查 | adversarial-reviewer | 物业审计师 | rebuttals[] + 假前提 + 群体漂移 | 基本保留 |

关键遗漏：`neural-evolution-swarm/SKILL.md` 明确要求派发前提取每个角色文件的 `## Inline Persona for Teammate` 贴进 prompt，并注明「Most adopting agents do NOT auto-load role files for teammates」。物业设定没有任何 Inline Persona，也没有 `skills:` 字段。

### 1.2 第二次：物业名 → v2 五成员（2026-11-16）

来源：`aing-v2/spec/SPEC-0.8-进化团入驻meko-全程多维维护.md` §三

五成员从**代码组件**映射，不是从五角色继承：

| 原组件 | 新成员 |
|---|---|
| growth-loop | gene-keeper |
| guardrails | omni-gate |
| growth-director | pilot |
| tri-path + HelixCrosscheck | tri-cross |
| guide-chain-swarm | poll |

`skill-trainer` 没有对应项。v2 成员册字段是 `reads / writes / band / reversible / onCycle`——组件契约，不是 agent 设定；无 `skills`、无 persona、无 Output Schema、无 Gate。

### 1.3 代码面的证据

- `src/meko-board.js` / `meko-patrol.js` / `meko-service-loop.js` / `meko-switchboard.js` 派的是 4 个寄生头（insight-extractor / gap-detector / feedback-loop / eval-retrieval），不是五角色。
- `meko.json` 全仓 14 处引用均为设计稿，无实际文件。
- 原技能依赖 `consciousness-neural-methodology` / `senior-developer` 在 `aing/assets/skills/` 下不存在，原团队本来就是 inline 降级跑。
- 首轮五角色监听（`SWARM-MONITOR-RUN-2026-11-10.md`）里，训练师结论是「候选 348 条攒而不收，待主机侧 SkillOpt Sleep 接上才兑付」——训练动作在包外，永远等不到。

---

## 二、裁定：域边界照旧，技能内容搬入

11-10 的「Do NOT 碰 aing 本体代谢（KESPI/SkillOpt）」是**域锁**，本意是防止 meko 抢 aing 的理论域。owner 新设计已拆域锁（meko 接手 KESPI 全栈调教），但 v2 的**能力锁**还在（五成员无训练技能）。

本记录同时拆两把锁：

1. **域锁**：训练与 KESPI 调教归 meko 内场，不再委寄 memo 外场。
2. **能力锁**：按角色导入技能，不按组件继承。

---

## 三、导入账（唯一真源）

| 原角色 | 原技能 | 导入到 | 处理 | 理由 |
|---|---|---|---|---|
| neuro-theorist | 六属性标尺、全局工作空间/注意力/元认知、BLOCK/打回/放行 | `pilot` | 保留方法，改用于七类信号→九动作定焦 | 定焦需要可证伪判据，不是拍脑袋 |
| senior-engineer | 最小可验证改动、回归证据、变更清单 | `tri-cross` | 保留方法，改用于双链复核与回归 | 复核要能说清「改了什么、证据在哪」 |
| **skill-trainer** | **SkillOpt 六阶段、best_skill/history、Gate4a、守恒 0.8–1.5** | **`gene-keeper`** | **本地化六阶段，不接外部 SkillOpt/Python** | **训练师就是自成长闭环缺的那一半** |
| plasticity-analyst | 六维拓扑体检、守恒比、密度/孤儿/回流/年龄/活性相关 | `tri-cross` | 保留六维口径，接 D1 结构维 | 双链体检与场域判定同源 |
| adversarial-reviewer | rebuttals[]、假前提清单、群体漂移判断、BLOCK/PASS | `omni-gate` | 保留对抗格式，接三闸 | 闸东不能只盖章，要能列反例 |
| guide-chain-swarm | 三路意见、加权（非多数票）| `poll` | 保留召集/加权，改用于争议面 | 高风险动作需要第二意见 |

### 3.1 技能绑定（写入 `evolution-team.MEMBERS[].skills`）

| 成员 | skills |
|---|---|
| `gene-keeper` | `skill-trainer`, `growth-loop` |
| `omni-gate` | `adversarial-reviewer`, `guardrails` |
| `pilot` | `neuro-theorist`, `growth-director` |
| `tri-cross` | `plasticity-analyst`, `senior-engineer` |
| `poll` | `guide-chain-swarm` |

### 3.2 训练六阶段本地化（`TRAINER_STAGES`）

| 阶段 | 本地对应 | 落点 |
|---|---|---|
| rollout | 对病灶实体跑一次场域动作 | `meko-field.reconcile/rebond/demote` |
| reflect | 对比 before/after KESPI 该维 | `kespi_scores` |
| aggregate | 生成 `opt:<kind>:<action>` gene 候选 | `opt_tickets` |
| select | 过 `omni-gate` 三闸 | `gate_records` |
| update | gene 落库/更新 | `genes` |
| gate | T2 复核 + 下一轮再验 | `verifyTickets` |

无 Python、无 SkillOpt、无 LobeHub、无外部 Agent Group。`passive-trainer.js` 的「决策谱系 → episode → 成长闭环」是这条本地训练的前身，本记录把它升级为「KESPI 误差 → 工单 → 场域动作」的可测闭环（SPEC-6.8）。

---

## 四、与 SPEC-0.8 §9.3 的关系

§9.3 原写「旧五角色委寄 memo 做外场维护，含技能训练」。本次修订：

- **技能训练**：移回内场 `gene-keeper`，由 SPEC-6.8 闭环承接。
- **设计评审 / 实现把关 / 拓扑体检 / 对抗审查**：仍可保留在 memo 外场，服务主驾出活，不碰双链。
- **senior-engineer 例外**照旧：实现类工作归场域执行件与外派蜂群，不入外场册。

---

## 五、验收

| # | 判据 | 证据 |
|---|---|---|
| 1 | 五成员均有非空 `skills` | `test-6.8` AC-7 |
| 2 | `gene-keeper` 含 `skill-trainer` | `test-6.8` AC-7 |
| 3 | 六阶段常量齐 | `test-6.8` AC-7 |
| 4 | `gene-keeper` 只读巡检，不落工单 | `test-6.8` AC-7（前后行数相等）|
| 5 | KESPI 误差能开单、下药、复核、毕业 | `test-6.8` AC-1–AC-6 |
| 6 | 无外部运行时依赖 | `test-6.8` AC-8 + 源码扫描 |

---

## 六、不做

- 不把五角色做成独立进程或外部编排组。
- 不引入外部 SkillOpt / 影子稿 / Python 训练器。
- 不改 KESPI 八维公式与阈值；只消费其读数。
- 不把「语义重填」当导入；名字可以换，技能必须跟。
