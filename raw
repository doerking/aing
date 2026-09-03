# 愿景与运行手册（Vision & Operations Playbook）

> 本文档回答三个问题：aing 的愿景是什么、如何实现、部署之后如何跑起来。
> This document answers three questions: what is aing's vision, how is it realized, and how do you run it after deployment.

[tag:vision] [tag:metabolism] [tag:training] [tag:executor] [tag:core]

---

## 1. 愿景（The Vision）

aing 是一个"会消化知识的大脑"：它不停留在存储知识，而是像神经系统一样感知、生长、修剪、回炉，让知识库越用越健康。

aing is a brain that *digests* knowledge: it does not merely store information, but senses, grows, prunes, and recycles like a nervous system, so that the knowledge base gets healthier the more it is used.

```
原始资料 raw ──编译──▶ 实体 entities ──建链──▶ 知识网络
                        │                         │
                        ▼                         ▼
                     芥子 seeds ◀──压缩── 活性评估 KESPI
                        │                         │
                        ▼                         ▼
                     回炉微粒 ──再发芽──▶ 新实体   剪枝归档
```

三层闭环构成实现路径（Three closed loops realize the vision）：

| 闭环 Loop | 内容 Content | 状态 Status |
|---|---|---|
| 设计环 Design | 六份蓝图（架构/意识神经/KESPI/代谢/自成长/进化回路） | ✅ 成文 Documented |
| 代码环 Code | 9 步代谢流水线 + 回炉闭环 + 检红灯 | ✅ 可运行 Runnable |
| 进化环 Evolution | 技能训练（SkillOpt）+ 真执行器接入 | 🔶 预埋/影子阶段 Pre-wired / shadow |

哲学只有一条（One philosophy only）：**没有失败，只有待回炉**。
红灯不是错误，是"这块知识需要消化"的信号。
**There is no failure, only material awaiting composting.** A red light is not an error — it is a signal that a piece of knowledge needs digesting.

---

## 2. 部署后能跑什么（What Runs Out of the Box）

部署完成后，代谢系统开箱即用；训练与真执行器需要按第 4、5 节接入。

After deployment, the metabolism system works out of the box; training and the real executor require the steps in Sections 4 and 5.

| 能力 Capability | 开箱即用 Out-of-box | 说明 Note |
|---|---|---|
| 9 步代谢 9-step metabolism | ✅ | compile→import→link→vector→sprout→pollinate→compress→kespi→prune |
| 回炉闭环 Recycle loop | ✅ | `node src/recycle-seeds.js`，幂等 idempotent |
| 红灯检测 Red-light check | ✅ | KESPI 维度分 < 0.65 即红灯 dimension score below 0.65 |
| 剪枝归档 Prune & archive | ✅ | 文件归档 + 数据库同步清理 file archive + DB sync |
| 技能训练 SkillOpt training | ❌ 需接入 | 见第 4 节 see Section 4 |
| 三路真执行器 Real tri-path executor | ❌ 预埋 | 见第 5 节 see Section 5 |

---

## 3. 如何跑代谢（How to Run Metabolism）

日常运行只需两条命令（Daily operation takes two commands）：

```bash
# 1) 跑完整代谢（9 步流水线；退出码非 0 表示有红灯）
#    Run full metabolism (9-step pipeline; non-zero exit code means red lights)
node src/run-metabolism.js --force

# 2) 芥子回炉（把未消费的芥子转成回炉微粒，再归档残壳）
#    Recycle mustard seeds (convert unconsumed seeds into recycled particles, archive husks)
node src/recycle-seeds.js
```

代谢数据流（Metabolism data flow）：

```
raw/*.md ─compile→ entities/*.md ─import→ DB ─auto-link→ links
              →index-vectors→ embeddings →sprout/pollinate→ 新链接
              →compress→ mustard-seeds/ →kespi-check→ 维度分
              →prune→ pruned/ 归档 + DB 清理
```

红灯处理约定（Red-light protocol）：
红灯 = 维度分不达标 = 待回炉，不是故障。跑一次回炉 + 再代谢即可；红灯持续多轮才需要人工看数据。

A red light means a dimension score fell below threshold — material to be composted, not a fault. Run recycle + one more metabolism pass; only persistent reds across multiple rounds warrant manual inspection.

---

## 4. 训练：如何接入（Training: How to Wire It In）

训练器 SkillOpt 是独立 Python 仓，概念上与技能文档捆绑，交付上独立分发。接入需要补三样东西（约 4~6 人日）。

The trainer, SkillOpt, ships as a standalone Python repository — conceptually bundled with the skill documents it optimizes, but distributed separately. Wiring it in requires three pieces (roughly 4–6 person-days):

| 缺口 Gap | 要做什么 What to build | 产出 Deliverable |
|---|---|---|
| 环境适配器 Adapter | 实现 EnvAdapter 四接口：build_train_env / build_eval_env / rollout / get_task_types | `adapter.py` |
| 任务包 Task package | ≥30 条结构化矛盾任务（同主题两说、口径冲突、新旧版本矛盾等） | `tasks/*.json` |
| 反馈信号 Feedback | 代谢日志 details 落库（kespi_before/after），供 Gate 评分使用 | run-metabolism 日志改造 |

接入后进入影子训练（Once wired, training runs in shadow mode）：
训练在 robocopy 出的副本上进行，绝不触碰真实知识库；候选技能分超过当前基线才允许晋升。

Training runs on robocopy'd copies and never touches the live knowledge base; a candidate skill is promoted only when its Gate score beats the current baseline.

```
SkillOpt 六阶段循环 Six-stage loop:
Rollout → Reflect → Aggregate → Select → Update → Gate
                                        │
                              Gate 不过 → 留档不应用
                              Gate fails → archived, not applied
```

---

## 5. 真执行器：预埋策略（Real Executor: Pre-wiring Strategy）

三路编排器（tri-path orchestrator）当前用 mock runPath 驱动。策略是**现在预埋、到货即插**：把执行器接口和配置位先留好，等真实安装量出现（信号：多环境真实运行数据回流），再把 mock 替换为真实现。

The tri-path orchestrator currently drives a mock runPath. The strategy is **pre-wire now, plug in later**: reserve the executor interface and configuration slots today, and swap the mock for a real implementation once real installation signals arrive (i.e., real run data flowing back from multiple environments).

预埋件清单（Pre-wiring checklist）：
- 执行器接口签名与 mock 并存（interface signature coexisting with mock）
- 熔断器状态已持久化（circuit breaker state already persisted）
- 环境变量/配置文件切换 mock ↔ real（config switch between mock and real）

这样设计的原因：没有真实安装数据时实现真执行器是无的放矢；接口先立住，成本近零。
Rationale: building a real executor without real installation data is shooting in the dark; reserving the interface costs almost nothing.

---

## 6. 路线图（Roadmap）

| 里程碑 Milestone | 内容 Content | 前置条件 Prerequisite |
|---|---|---|
| M1 代谢自持 Self-sustaining metabolism | 已达成 Done | — |
| M2 影子训练 Shadow training | **已跑通首轮**（六阶段全绿，基线 hard 0.8696，见 raw/training-simulation.md 附二）；下一步：轨迹带失败归因让 accept/reject 被行使 | `training/run_m2.py` + `training/aing.yaml` |
| M3 真执行器上线 Real executor | mock → real 切换 | 真实安装信号 Real installation signals |
| M4 意识属性达标 Six-attribute pass | 自我建模/自我解释机制落地 | M2 训练循环转动 M2 loop spinning |

---

## 附：验收口径（Acceptance Criteria）

- 代谢：`run-metabolism --force` 退出码 0，KESPI 无维度红灯。
- Metabolism: `run-metabolism --force` exits 0 with no dimension-level red lights.
- 回炉：`recycle-seeds.js` 重复执行无副作用（幂等），残壳全文可在芥子 compressed_content 中找回。
- Recycle: `recycle-seeds.js` is idempotent; full husk text remains recoverable from seed compressed_content.
- 训练：影子模式下 Gate 候选分 > 基线才晋升，失败候选只留档。
- Training: in shadow mode, candidates are promoted only on Gate score > baseline; failed candidates are archived only.
- 双脑一致：任何修复先写 wiki 文件、后落 DB；prune 既归档文件也清 DB。
- Dual-brain consistency: every fix writes wiki files first, then DB; prune archives files and cleans the DB.
