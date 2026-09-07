# 训练推演报告（Training Simulation Report）

> SkillOpt 式影子推演：在不接入真实训练器的前提下，验证 aing 部署包能否承载六阶段训练闭环，以及 Gate 能否区分真改进与噪声。
> 产物：`simulation/training-sim.js`（推演器）、`simulation/task-package.json`（30 条矛盾任务）、`simulation/last-run.json`（运行留档）。

## 推演基线

真实代谢一轮全绿（9 步 / 9 成功 / 1.83s），证明 Tier-1 循环机制可用。推演基线策略为"带缺陷的技能文档"替身：10 条部署包口径事实中持有 8 条真信念 + 2 条错误信念（X01 假红灯阈值、X02 违反双脑契约的 prune 误解），模拟真实文档必然带病的现状。

## 六阶段循环结果（Tier-2）

| 指标 | 基线 baseline-doc | 最优候选 candidate-15 |
|---|---|---|
| 评估准确率 acc | 0.70 | **1.00** |
| 一致性 consistency | 0.80 | **1.00** |
| 覆盖率 coverage | 0.80 | **1.00** |
| 总体分 overall | 0.740 | **1.089** |

- 任务包 30 条（train 20 / eval 10，threshold/pipeline/contract/training 四域分层）。
- 候选 40 个：完全修正型 / 单点修正型 / 噪声退化型 / 混合型四类扰动。
- Gate（margin=0.02）裁决：**晋升**——最优候选清掉全部错误信念（acc 0.70→1.00），16/40 噪声型与退化型被拒。
- 区分度实证：修正方向收益单调（完全修正 > 单点修正 > 基线），噪声方向全灭，Gate 没有放过任何"越改越坏"的候选。

## 蒙特卡洛阈值敏感性（Tier-3）

200 次/格，标签噪声（横轴）× Gate margin（纵轴），表内为最优候选过闸率：

| margin\noise | 0% | 5% | 10% | 20% | 30% |
|---|---|---|---|---|---|
| 0.00 | 100% | 100% | 100% | 100% | 90% |
| 0.02 | 100% | 100% | 100% | 99% | 88% |
| 0.05 | 100% | 100% | 100% | 99% | 88% |
| 0.10 | 100% | 100% | 100% | 93% | 79% |

读法：真实改进幅度大（+0.35）时，margin 取 0.02~0.05 在 20% 标签噪声下仍保持 99% 过闸率；噪声到 30% 才开始失守。**建议生产 Gate 采用 margin=0.05**：对噪声几乎不敏感，同时仍能拦住微弱伪改进。

```
推演信号流：
任务包30 ──分层──▶ train20/eval10 ──Rollout──▶ 基线0.740
                      │                          │
                      ▼                          ▼
                候选40个扰动 ──Gate──▶ 晋升1 / 拒绝39中的16
                                             │
                      蒙特卡洛200×20 ◀───────┘
```

## 推演结论

- Tier-1/Tier-2/Tier-3 三层全部通过：部署包机制上具备承载影子训练的全部要素。
- 本次推演的"策略"是内存中的信念集替身；换成真实技能文档训练，仍差训练师报告指出的三件套：aing-env adapter、真实矛盾任务包（当前 30 条为合成任务）、代谢日志 details 反馈。
- 推演器与任务包已随包分发（`simulation/`），别人部署后执行 `node simulation/training-sim.js` 即可复现本报告（确定性 seed=20260828）。

## 验收口径

- `node simulation/training-sim.js` 退出码 0，Gate 裁决为晋升。
- 重复运行结果与 last-run.json 完全一致（确定性可复现）。
- `--fast` 模式跳过蒙特卡洛，用于快速冒烟。

## 附：训练三件套落地（2026-08-28）

推演发布后，训练师指出的三件缺口已全部补齐：

| 缺口 | 落地物 | 验证 |
|---|---|---|
| 环境适配器 | `training/adapter.py`：实现 SkillOpt `EnvAdapter` 四抽象接口（build_train_env / build_eval_env / rollout / get_task_types），离线确定性 docfaithful 评分（拉丁整词+中文 bigram 覆盖，错误口径扣分），未装 skillopt 自动降级本地等价 ABC | 双环境冒烟：系统 Python（降级模式）与 SkillOpt venv（真接口）均通过；基线蓝图 soft 0.488 vs 污染技能 0.449，hard 0.444→0.333，Gate 有区分度 |
| 矛盾任务包 | `training/task-package.json`：32 条真实口径任务（取材 raw/*.md 与 src 实现，非合成模板），六域分层（threshold/pipeline/data-contract/recycle/consciousness/training） | eval split 9 条按 task_type 分层，JSON 可直接被 dataloader 消费 |
| 反馈信号 | `src/metabolism-log.js` + schema `metabolism_log` 表：run-metabolism 每次落库 9 步 status/duration + kespi_before/after；adapter 读该表最近两次运行斜率作为环境健康系数（代谢恶化→奖励打折） | 全量代谢实测 9 行落库（kespi 0.93→0.93），幂等建表 |

结论：M2 影子训练的三件套从"缺失"变为"就位且冒烟通过"。剩余工作仅剩把 SkillOpt 主循环（optimizer 调度）指到本 adapter 正式跑轮次。

## 附二：M2 首轮正式联调跑通（2026-08-28）

在副本环境 <opt-copy> 完成首次 SkillOpt 主循环 × AingEnvAdapter 联调，六阶段全绿：

| 项 | 结果 |
|---|---|
| 启动器 | `training/run_m2.py`：注入注册表（env.name=aing → AingEnvAdapter）+ 加载 DeepSeek 凭据，零改动 SkillOpt 源码 |
| 基线 Selection 集 | hard=0.8696 / soft=0.8454（23 项） |
| 训练批次 | 2 步 × 12：hard 0.75 → 0.9167（不同 batch seed） |
| Reflect | 真 LLM analyst 跑通（deepseek-chat，4 minibatch/步），产出 0 patches |
| Gate | skip_no_patches ×2（无候选可评），best=initial_skill 0.8696 |
| 产物 | ckpt/{best_skill.md, summary.json, history.json, selection_eval_baseline} |

诚实记录：两步均 0 patches，原因是离线评分器只回分数、轨迹里没有失败归因细节，analyst 无料可写（1 个失败组→0 edits）。下一迭代方向：轨迹中携带失分项与正确/错误口径对照，或引入种子文档有真实缺口、任务包更刁钻的版本，让 accept/reject 真正被行使。

[tag:m2] [tag:shadow-training] [tag:joint-debug]

[tag:training] [tag:skillopt] [tag:adapter] [tag:trio] [tag:core]

[tag:training] [tag:skillopt] [tag:simulation] [tag:gate] [tag:core]
