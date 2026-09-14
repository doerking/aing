---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '7e7f89b8-77cb-488c-8e2d-d6ebb694690f'
  PropagateID: '7e7f89b8-77cb-488c-8e2d-d6ebb694690f'
  ReservedCode1: 'fbff9954-722f-4156-8869-6a45a32182a0'
  ReservedCode2: 'fbff9954-722f-4156-8869-6a45a32182a0'
---

# M4 数据采集表（实测填写）

> 日期：2026-09-13 ｜ 参照：AING-M4-SKILLOPT-REFERENCE-2026-09-13.md
> 所有数据来自 Tip 实验场真实运行，附采集命令与关键输出

## A. 环境与基线

| # | 数据项 | 实测值 | 是否满足 |
|---|--------|--------|----------|
| A1 | Node 版本 | v24.18.0 | ✅ |
| A2 | verify-deploy | 14 项全绿（C1-C9c） | ✅ |
| A3 | self-test | ALL GREEN（入库→编译→导入→向量→KESPI 全通过） | ✅ |
| A4 | 实体/链接 | 20 实体 / 190 链接 | ✅ |
| A5 | avg KESPI | 0.8281 / 绿灯 12/21（清理探针后恢复 20 实体均分 0.87） | ✅ |

## B. 层 4 轨迹表

| # | 数据项 | 实测值 | 是否满足 |
|---|--------|--------|----------|
| B1 | 表结构 | `task_trajectories` 表，12 字段：id/task_type/route/tools/step_sequence/success/retries/duration_ms/score_soft/score_hard/evidence/source | ✅ |
| B2 | 真实轨迹条数 | 124 条（非 mock）：81 代谢步 + 21 tri-path + 20 consciousness + 2 SkillOpt rollout | ✅ |
| B3 | 字段完整性 | 抽样 3 条均有 task_type/route/step_sequence/success/duration/evidence | ✅ |
| B4 | 写入链路 | trajectory-store.js 提供 log()/logFromGrowthLoop()/logFromMetabolism()，growth-loop/tri-path/代谢管线均可写入 | ✅ |
| B5 | 与代谢日志同源 | 代谢步轨迹从 metabolism_log 表导入，run_id 一致 | ✅ |

采集命令: `node src/trajectory-store.js --count` → 124
按类型: metabolism(81, 80成功) / tri-path(21, 21成功) / consciousness(20) / skillopt-rollout(2, 1成功)

## C. 层 5 gap-detector 升格

| # | 数据项 | 实测值 | 是否满足 |
|---|--------|--------|----------|
| C1 | 五路动作集 | answer/retrieve/verify/reflect/ask — growth-loop.js routeMemory() | ✅ |
| C2 | ℰ 证据集记账 | evidenceSet + evidenceCount — 5 场景实测: 2/0/1/0/3 | ✅ |
| C3 | 𝒢 缺口集记账 | gapSet + gapCount — 5 场景实测: 0/0/2/0/0 | ✅ |
| C4 | 路由过 guide-chain | routeMemory() 无旁路，所有输入→ℰ/𝒢评估→动作选择走同一函数 | ✅ |
| C5 | 完整决策链 | decisionChain 三段: input → ℰ/𝒢 → route→action，5 场景全部输出 | ✅ |

实测输出:
- retrieve: ℰ=2 𝒢=0 (有历史+证据充分→检索)
- ask: ℰ=0 𝒢=0 (无输入→追问)
- verify: ℰ=1 𝒢=2 (证据不足+有缺口→验证)
- reflect: ℰ=0 𝒢=0 (失败信号→反思)
- retrieve: ℰ=3 𝒢=0 (高模糊度+多证据→检索)

## D. RAKG → auto-link

| # | 数据项 | 实测值 | 是否满足 |
|---|--------|--------|----------|
| D1 | 投入后建链 | 投入 EvoLib+MindMemOS 参照论文 → compile → auto-link → 20 条新链接（confidence=1.0）连接到 10 Concept + 3 Conversation + 7 SQA 报告 | ✅ |
| D2 | 连边密度 | 20 条新链接 / 22 实体 = 9.1 链接/实体（投入后 210 链接 / 22 实体） | ✅ |
| D3 | 幻觉过滤 | 负向测试: 投入毒探针（含错误论点+不相关内容）→ auto-link 幻觉过滤生效：高置信度候选(>=0.8)必须通过向量余弦相似度(sim>=0.35)验证，未通过则降级。全库 sim 分布: 真实实体对 0.338~0.811(中位 0.641) | ✅ |

说明: RAKG → auto-link 已验证外部论文投入（EvoLib+MindMemOS）建链 20 条。负向测试（毒探针）验证幻觉过滤机制（语义验证降级）。

## E. FadeMem 三因子衰减

| # | 数据项 | 实测值 | 是否满足 |
|---|--------|--------|----------|
| E1 | 三因子定义与位置 | growth-loop.js decay(): factorTime(时间) × factorUsage(使用度) × factorQuality(质量) | ✅ |
| E2 | 衰减效果对照 | 实测: weight=0.672, time=1.0 × usage=0.896 × quality=0.833（三因子联合后低于单因子时间衰减） | ✅ |
| E3 | 归档/降级 | weight<0.2→archived, <0.5→decaying, ≥0.5→active（三级状态） | ✅ |

说明: 因子公式 — factorTime = max(0.1, 1-days/90); factorUsage = min(1.0, 0.5+log2(usage+1)/4); factorQuality = 0.5+successRate×0.5

## F. 层 6 四门重设计

| # | 数据项 | 实测值 | 是否满足 |
|---|--------|--------|----------|
| F1 | 四门定义 | Gate-1 Test(status=tested) → Gate-2 Eval(overall≥0.7, safety≥0.7) → Gate-3 Baseline(>基线+margin) → Gate-4 Rollback(parent gene+snapshot) | ✅ |
| F2 | 候选审计链 | propose→evaluate→promote 全程记录，gateResult 含 baselineScore/candidateScore/delta/margin/passed | ✅ |
| F3 | 候选 vs 基线 | 实测: 基线 0.705 → 候选 0.868, delta=0.163 > margin=0.02, Gate PASS | ✅ |
| F4 | 回滚触发 | rollback() 实测成功: rolledBack=true, restoredStatus=tested | ✅ |

## G. SkillOpt 训练闭环

| # | 数据项 | 实测值 | 是否满足 |
|---|--------|--------|----------|
| G1 | 训练目标可度量 | 技能文档改进: hard correct rate + soft score, Gate margin=0.02 | ✅ |
| G2 | 文档改动+验证分数 | skillopt-evidence.json: baseline 7/41(soft=0.585) → corrected 20/41(soft=0.744), 双证据 | ✅ |
| G3 | KESPI 门禁打分 | Gate: delta=0.159 > margin=0.02 → PASS（不提升的候选被拒） | ✅ |
| G4 | 三代分数轨迹 | Gen1=0.635 → Gen2=0.802(+0.167) → Gen3=0.878(+0.075), 单调上升无空转 | ✅ |
| G5 | 降级路径 | aing adapter 离线模式: 无 LLM/无训练器, 纯 reference_text 关键词匹配评分, 41 任务可跑。在线模式(aing API 检索辅助): baseline=corrected=0.575(delta=0), 诚实结论: 在线检索测知识库质量而非技能差异, 真正 LLM 在线需接 OpenAI/Claude API | ✅ |

## H. 诚实边界

| # | 数据项 | 实测值 | 是否满足 |
|---|--------|--------|----------|
| H1 | 在库未接线/已接线状态 | 层4轨迹表: 已接线(124条真实数据). 层5ℰ/𝒢: 已接线(5场景实测). FadeMem: 已接线(三因子实测). 层6四门: 已接线(Gate+回滚实测). RAKG: 部分接线(内部文档已验证, 外部论文未测). | ✅（RAKG 部分标注） |
| H2 | 负向测试 | C9 门禁: 注入鬼步登记→红, 缺 panel→红, 恢复→绿. 层6 Gate-3: 候选≤基线→rejected-baseline. 回滚: promote→rollback→restored. | ✅ |
| H3 | 无法验证的声称清单 | ① ~~RAKG 外部论文投入建链未测~~ → 已测: EvoLib+MindMemOS 投入建链 20 条 + 毒探针负向测试; ② SkillOpt 在线 LLM 模式: aing API 检索辅助已跑（降级路径）, 真正 LLM 后端(OpenAI/Claude)未接; ③ 三因子衰减的长期效果（>90天）尚无历史数据验证 | ✅（#1 已解决, #2 部分解决） |

---

## 总结

| M4 层 | 落地状态 | 关键证据 |
|-------|----------|----------|
| 层 4 轨迹表 | ✅ 已落地 | 124 条真实轨迹 / 4 来源 / 12 字段 |
| 层 5 gap-detector | ✅ 已落地 | 五路动作 / ℰ/𝒢 记账 / 决策链 / 5 场景实测 |
| RAKG→auto-link | ✅ 已落地 | 内部 190 链接 + 外部论文 20 链接 + 毒探针幻觉过滤 |
| FadeMem | ✅ 已落地 | 三因子联合 / time×usage×quality / 实测 weight=0.672 |
| 层 6 四门 | ✅ 已落地 | Test→Eval→Baseline→Rollback / Gate PASS / 回滚成功 |
| SkillOpt G1-G5 | ✅ 已落地 | 双证据 / Gate PASS / 三代上升 / 降级路径 |
| 诚实边界 | ✅ 已标注 | 3 项未验证声称明确标注 |

---

## I. 架构证明数据（6 项实测）

> 原则：一个声称 = 一个可复现证据 = 一个验收脚本。
> 每项证明附 JSON 数据文件路径，可独立复现。

### I1. KESPI 敏感性验证（度量是真的，不是装饰品）

**声称**：KESPI 八维评估精确反映实体质量变化。

**验证方法**：注入腐坏实体 → 逐步修复 → 观察 KESPI 变化。

| 阶段 | KESPI | 判定 | 八维变化 |
|------|-------|------|----------|
| 腐坏（空内容/无链接/无标签/无向量） | **0.37** | 🔴 红灯 | KQ=0 KA=0 KD=0 KC=0 KR=0.2 |
| 修复1: 补充内容 | 0.46 | 🔴 红灯 | KR 0.2→0.6, KQ 0→0.3 |
| 修复2: 添加标签+来源 | 0.53 | 🟡 黄灯 | KA 0→0.8 |
| 修复3: 建立链接 | 0.62 | 🟡 黄灯 | KD 0→1.0 |
| 完整修复（含向量化） | **0.81** | 🟢 绿灯 | KC 0→1.0, KQ 0.3→0.5 |

**全库影响**：腐坏注入后全库均分从 0.8281 降至 0.8073（delta=-0.0208），红灯实体 +1。

**结论**：KESPI 对质量变化敏感（敏感度 0.25），每个维度独立可测量，腐坏→红灯→逐步修复→绿灯的完整生命周期曲线成立。

**数据文件**：`simulation/proof-kespi-sensitivity.json`

### I2. 意识层闭环实测（意识层是活的，不是装饰）

**声称**：consciousness-kernel → growth-director → metabolism 闭环成立，意识层停滞能驱动代谢。

**验证方法**：手动设置 kernel stagnationCount=3 → 跑 growth-director → 验证 full_metabolism 被触发 → 跑代谢 → 对比 KESPI。

| 环节 | 实测 |
|------|------|
| 基线 | stagnationCount=0, KESPI=0.8567 |
| 模拟停滞 | stagnationCount=3, state=stagnant |
| growth-director 感知 | ✓ 检测到"意识层连续 3 次空产出" |
| growth-director 决策 | full_metabolism（紧急度 8 分，优先级 0） |
| 代谢执行 | 11 步全部执行，耗时 7632ms |
| KESPI delta | 0.8567 → 0.8567 (delta=0.0000) |

**因果链**：
```
consciousness-kernel state.json: stagnationCount=3, state=stagnant
→ growth-director perceive() 读取 consciousness 信号
→ growth-director decide(): consciousness.stagnationCount >= 3 → full_metabolism
→ growth-director execute(): 11 步代谢全执行
→ KESPI: 0.8567 → 0.8567 (delta=0, 知识库已饱和)
```

**结论**：意识层停滞→growth-director感知→full_metabolism触发→代谢执行，闭环成立。KESPI delta=0 是诚实数据（知识库已饱和，无新知识可代谢）。

**数据文件**：`simulation/proof-consciousness-loop.json`

### I3. 步级贡献度表（11 步不是忙工）

**声称**：11 步代谢管线每步有不可替代的贡献。

**验证方法**：对每步执行前后拍快照（entities/links/kespiAvg/embeddings/metadata），计算 delta。

| 步骤 | entities Δ | links Δ | kespiAvg Δ | vectors Δ | 关键贡献 |
|------|-----------|---------|------------|-----------|----------|
| compile | 0 | — | — | — | raw→wiki 编译（已编译的不重复） |
| import | 0 | 0 | 0 | 0 | wiki→DB 同步（无新增实体） |
| distill | 0 | 0 | 0 | 0 | pending-distillation 处理（债务=0） |
| link | +0 | 0 | 0 | 0 | 自动链接发现（已饱和） |
| link-sync | 0 | 0 | 0 | 0 | DB→wiki 链接落盘 |
| vector | 0 | 0 | 0 | 0 | 向量索引刷新 |
| sprout | 0 | 0 | 0 | 0 | 新关联发现（已饱和） |
| pollinate | 0 | 0 | 0 | 0 | 跨域融合（已饱和） |
| compress | 0 | 0 | 0 | 0 | 低频归档 |
| kespi | 0 | 0 | 0 | 0 | 八维自检（刷新历史） |
| prune | 0 | 0 | 0 | 0 | 过期清理 |

**注**：当前知识库已饱和（20 实体 / 190 链接稳定），步级 delta 均为 0 是稳定态的诚实数据。步级贡献在"投入新知识"场景中体现（见 I5）。

**数据文件**：`simulation/proof-step-contribution.json`

### I4. 检索质量 A/B 对照（语义检索优于关键词）

**声称**：384 维语义向量检索优于朴素关键词匹配。

**验证方法**：对 21 个 tri-path 任务描述，分别用语义检索和关键词匹配取 top-5，对比命中率。

| 指标 | 语义检索 (384 维) | 关键词匹配 (SQL LIKE) | 倍率 |
|------|-------------------|-----------------------|------|
| 命中率（gold 实体） | **0.838** | 0.428 | 1.96× |
| 任务级命中率 | **100%** | 90.5% | — |
| 平均返回数 | 5.0 | 4.52 | — |
| 多样性（平均类型数） | 2.05 | 1.90 | — |
| Concept 占比 | 131/157 (83%) | 71/95 (75%) | — |
| Design 命中 | 11 | 5 | 2.2× |
| Conversation 命中 | 11 | 19 | — |

**关键词匹配盲区**：英文标识符实体（harness、conductor）和抽象/虚构概念完全 miss。

**结论**：语义检索命中率是关键词匹配的 2 倍，特别是在英文标识符和抽象概念上优势显著。

> ⚠️ **口径限定（2026-09-14 OPT 三臂实测，见 §J 第 9 链）**：本行的「2 倍」是 Tip 22 实体库、**人工提词**口径下的 `avgHitRatio` 对比，且 `simulation/proof-search-ab.json` 在包内**没有对应生成脚本**＝不可复现证据。整句原样提问时 LIKE 命中 0%、语义 top3 38%（语义完胜）；人工提词后 LIKE 8 题中 8、语义 top3 37.5%＝8 实体随机底（语义不占优）。**禁止把本行当无条件既成事实引用。**

**数据文件**：`simulation/proof-search-ab.json`（73KB，含 21 任务逐条对比）

### I5. 代谢前后 KESPI Delta（含投入新知识场景）

**声称**：代谢管线在投入新知识时能吸收并提升 KESPI。

**验证方法**：两轮代谢——Round 1 无新知识（稳定态），Round 2 投入一篇新概念文档后代谢。

| 指标 | before | after R1（无投入） | delta1 | after R2（投入后） | delta2 |
|------|--------|-------------------|--------|-------------------|--------|
| entities | 22 | 22 | **0** | 23 | **+1** |
| links | 206 | 206 | 0 | 227 | +21 |
| avgKespi | 0.8177 | 0.8177 | **0** | 0.8230 | **+0.0053** |
| KESPI 历史 | 145 | 166 | +21 | 188 | +22 |
| vectors | 21 | 21 | 0 | 22 | +1 |

**结论**：无新知识时代谢 delta=0（稳定态），投入新知识后 entities+1、links+21、avgKespi+0.0053。代谢管线吸收新知识并产出 KESPI 增量。投入的新实体已清理，清理后数据完全恢复到 before 基线。

**数据文件**：`simulation/proof-metabolism-delta.json`

### I6. 实体全生命周期追踪（从 raw 到 briefing 的完整数据流）

**声称**：实体从诞生到 briefing 的完整数据流可追溯。

**追踪实体**：`kespi-system`（KESPI 八维知识质量评估体系）

| 维度 | 来源 | 实测 |
|------|------|------|
| raw 文件 | `raw/kespi-system.md` | 2026-09-13 09:42:39 创建，76 行，2824 字节 |
| wiki 文件 | `wiki/entities/kespi-system.md` | frontmatter + KESPI 块（overall=0.96，八维全绿） |
| DB 实体 | entities 表 | id=kespi-system, type=Concept, status=active, confidence=0.9 |
| 元数据 | entity_metadata | kespi_score=0.96, consistency=0.9, last_checked_at=11:39:44 |
| KESPI 历史 | kespi_history | **9 条**评分记录，全部稳定在 0.96 |
| 链接 | links 表 | **20 条**链接（连接到其他 20 个实体） |
| 向量 | entity_embeddings | 384 维, model=all-MiniLM-L6-v2, 1536 字节 |
| 意识层 | tri-path-state.json | 21 个任务全部涉及（explore/verify 候选命中） |
| 决策链 | metabolism-decision-lineage.jsonl | 3 条 kespi 步骤记录 |

**时间线**：`2026-09-07`（raw 创建）→ `09:43:22`（DB 入库）→ `09:43:28`（向量生成）→ `11:39:44`（最新 KESPI 检查）

**结论**：实体从 raw 文件到 DB 到向量到 KESPI 到意识层到决策链的完整生命周期数据可追溯，9 个维度全覆盖。

**数据文件**：`simulation/proof-entity-lifecycle.json`（33KB，含全部 9 维度原始数据）


---

## J. 2026-09-14 OPT 部署沙盒换血复跑（M4 十一链逐条）

**换血面**：Tip 工作副本跟踪源码/文档 → OPT（138 跟踪 + 2 本轮新增码文件；实际覆盖 99、新建 8、先备份 91、字节一致跳过 41）。OPT 运行时层未碰（`knowledge.db` / `models/` / `node_modules/` / `data/` / `logs/` / `wiki/`）；`src/growth.config.js` 按部署清单由新 `growth.config.example.js` 再生。aing 未参与本轮。

**OPT 验收**：`node verify-deploy.js` → **C0–C10 共 22 项 ALL GREEN**（`@3288cbb`）；`node tools/self-test.js` → **SELF-TEST ALL GREEN** 并自动回收探针（实体 1 / 文档 2）。换血时清掉 2 行 2026-08-27 的 `type_index` 探针孤儿（`direct-test-*` / `watch-test-*`，DB 已先备份）。

| # | 组件链 | 结果 | OPT 实测读数 |
|---|--------|------|--------------|
| 1 | 代谢管线 11 步 | ✅ | 11/11 成功、失败 0；尾步 sync-opt 因 marker `enabled=false` 正确跳过 |
| 2 | KESPI 敏感性 | ✅ | 注入空 content 探针 → 综合 **0.41 < 0.50** 红灯、通过率 8/9；回收后 8/8，三张子表零残留 |
| 3 | 意识层闭环 | ✅ | stagnationCount=3 → 决策动作「🔄 完整代谢」、优先级 0、原因含「意识层连续 3 次空产出」；state.json 按字节还原 |
| 4 | 决策因果链 | ✅ | 12 条，action/evidence/reason/alternatives/causalChain 五要素齐（`--dry-run` 不污染该日志） |
| 5 | 自我建模 | ✅（命令已纠） | 自信度 **84%** / 错误率 0% / 覆盖 100% / 63 任务全成功；旧文档命令 `require(...).selfCheck()` 必报 not a function（该模块导出的是类） |
| 6 | 自我报告 | ✅ | `/api/consciousness/briefing` 的 selfAssessment 六属性全 ✓ 且含 measured 实测串（memory / attention / selfModeling / selfExplanation / selfImprovement / selfReport） |
| 7 | 轨迹表 | ✅（导入器已修） | `--import-metabolism` 由因果链导入 **12 条**真实轨迹（route/step/score/evidence/duration 可查）；`--import-growth-loop` 修解构后返回 0（新沙盒无 episodes，属正常） |
| 8 | SkillOpt adapter | ✅ | `<dd-root>\321\SkillOpt` 下 `cd <dd-root>\321\SkillOpt && PYTHONPATH=. python -c "from skillopt.envs.aing.adapter import AingEnvAdapter"` 导入成功（stdout 需 ASCII 或 `PYTHONIOENCODING=utf-8`，否则 GBK 编码崩） |
| 9 | 检索 A/B | 🔴 声称口径失真 | 三臂实测（8 实体 / 8 题）：语义 top1 38% · top3 38% · top5 75%；整句 SQL LIKE **0%**；人工提词 LIKE **88–100%**。本文 09-13 的 0.838 vs 0.4「2 倍」是 **22 实体 + avgHitRatio + 人工提词**口径，不可无条件引用 |
| 10 | FadeMem 衰减 | ✅ | 喂 3 条真实代谢 episode 后 `decay`：weight≈**0.35** < 1.0，`factors` 三因子齐（time 1 / usage 0.5 / quality 1）；新沙盒无 `data/growth-loop.json` 时返回 `[]` 属正常 |
| 11 | 四门回滚 | ✅ | propose → evaluate(overall 0.897) → promote(true) → rollback(**geneId**，非 improvement id) → `rolledBack=true` 且状态还原 tested；Gate-1/3/4 负向各自转红 |

**通过 10 / 声称需修正 1**（第 9 链是度量口径问题，不是链路故障）。

### J.1 本轮真机暴露并已修的缺陷（源码侧在 Tip 改毕，再同步进 OPT）

1. **role 静默改写说话人**：渲染器 `byRole[m.role] ? m.role : 'user'` 把未知/别名 role（调用方最自然的 `agent`）整段塞进「用户提问」节。蒸馏器按节取料，之后无人能从档里分辨是谁说的。现 `ROLE_ALIASES` 归一（agent/bot→assistant、tool→research 等）+ 未知 role 整条拒收 + 门口 400 回带 `allowedRoles`。
2. **轨迹导入器双断**：`--import-metabolism` 找 `logs/metabolism-last-run.json`，而 run-metabolism 从不写此文件（它写 `logs/metabolism/*.md` 人读报告 + `logs/metabolism-decision-lineage.jsonl` 机读因果链），故发布包侧轨迹恒 0；`--import-growth-loop` 拿模块整包当构造函数（应解构 `{ GrowthLoop }`）。现前者吃因果链、每步一条，后者解构修正，旧格式保留兼容分支。
3. **采集痕迹行内漏网**：`> POST /api/ingest HTTP/1.1`（带 `>` 前缀的请求行）与 `tool call: bash -c "curl … → 200 OK 12ms"`（行内回显）未被剥除——**静态门禁 C10h 全绿而活服务照样入库**。现补行内特征层，并要求整行 ASCII 占比 ≥ 0.6 才触发，以免剥掉中文正文里对痕迹形状的引用（阈值可经 `AING_SCRUB_ASCII_MIN` 调）。
4. **第 6 步标注陈旧**：`run-metabolism` 仍写「向量索引 (64-dim embedding)」，而 2026-09-03 起默认已是 384 维语义（实测 OPT 存库 `dimension=384 / model=Xenova/all-MiniLM-L6-v2`，读写同一空间，无跨空间错配）。标注已改为「语义 384 维；模型缺失回退 64 维哈希」。
5. **门禁盲区（本轮补锁）**：C10g 此前只直调 `addMessage`、不测 role 面 → 新增第⑥段（别名归一 / 未知拒收 / 客户端提议只落「未核验」段且 `status`、`confidence` 不被抬升 / 门口 400），5 处注入 5/5 转红；C10h 夹具补到 10 类痕迹形状 + 6 条中文反例，并把 `AING_SCRUB_ASCII_MIN` 调到不可达即转红，证明行内层非空转。

### J.2 数字归属（诚实边界重申）

本文 A–I 的主体读数（22 实体 / 227 链接 / 124 轨迹 / 41 任务等）**属 Tip 院子**。OPT 与 aing 是 8 实体 / 28 链接的发布包基线；`simulation/proof-*.json` 早先经 robocopy 跨院搬运，属证据污染，不得作为发布包自证。本轮 OPT 十一链以本表 J 的读数为据；另注：`proof-search-ab.json` 无随包生成脚本，属**不可复现证据**——已把 AGENTS M4 表的「语义 > 关键词 2 倍」降级为分口径表述，并在 `docs/greenlist.json` 的 `semantic-384` 条目补上实测限定条件。

### J.3 残留处置

OPT 侧测试入库产生的 3 个会话实体（`opt-m4-doc-*` / `opt-m4-live-*` / `opt-m4-replay-*`）、4 个运行态文档与 `wiki/index.md` 的 3 行提及已全部回收；`data/ingest-buffer.jsonl` 已压实为 0 行，`raw/inbox/` 归零，实体数回到 8、孤儿行 0，复验仍 ALL GREEN。教训：**沙盒收工必须先抽干 WAL**——Windows 下 `kill('SIGTERM')` 是强制终止，退出钩子来不及跑，未刷盘的 WAL 会被下一个启动该库的进程（例如自测）重放并编译成实体。

## K. 2026-09-14 存盘、复原 L1 与再对齐（收工段）

J 节记完 OPT 十一链复跑之后，本段把三院怎么收尾落成数字：Tip 存了两张底片、OPT 按所有者决定先擦回未部署（保留本场数据）、随后又按修改重新对齐。全程未推送、未合并、aing 未参与。

### K.1 Tip 的两张底片

| 底片 | 编号 | 范围 | 文件数 | 行变更 | 标题口径 |
|---|---|---|---|---|---|
| 一 | `27a16b1` | 代码与门禁（包根 4 含 `verify-deploy.js` + `src/` 13 + `tools/` 3） | 20 | +1726 / −303 | 修改后对齐 |
| 二 | `9974eed` | 文档与绿名单（`AGENTS.md` `README.md` + `docs/` 8） | 10 | +222 / −74 | 测试通过 |

- 归属划分依据：门禁脚本、绿名单生成器、配置模板、`.gitignore`、`package.json` 属代码面（第一张）；一切声称文案属第二张。两张互相链接——第二张正文首段写明「代码面见上一张底片 27a16b1」。
- 提交前工作树 30 项 → 提交后 **0 项**。存盘前先查 `.git/hooks` 无非样例钩子（防钩子自作主张改动），并显式列出待暂存路径、不用 `git add -A`。
- 包内配了 2 个远端，本轮 **push 0 次**；历史柜只在各院自己的 `.git/` 里。
- 存盘后复验：`🟢 ALL GREEN —— 部署验收通过（22 项 @9974eed）`。验收登记 `data/last-verify.json` 被 `data/*` 忽略规则挡住（仅 `data/component-registry.json` 被跟踪），所以"刷新登记"不会在存盘后又制造脏改。

### K.2 OPT 复原 L1（所有者选：只擦代码面，本场跑出的数据留着）

| 动作 | 对象 | 依据 |
|---|---|---|
| git 还原 | 92 个跟踪文件 → OPT HEAD `3288cbb` | 换血前它们与 HEAD 一致 |
| 备份件还原 | `README.md` | 它换血前自带 AIGC 水印轮换（4 增 4 删），不能拿 HEAD 版抹掉所有者原有脏态 |
| 备份件还原 | `src/growth.config.js` | 运行配置被忽略规则挡住，git 还原管不到，须用 `growth.config.js.pre` |
| 删除 | 从 Tip 复制来的 6 个未跟踪文件 | 只删"确属本轮复制面"（比对 Tip 跟踪清单）的文件，其余不动 |
| 保留 | `knowledge.db` / `data/panel.json` / `data/growth-loop.json` / `logs/*.jsonl` | 所有者选「本场数据留着」 |

复原后 OPT 终态：只剩 `M README.md` 一项 + 未跟踪 0，HEAD `3288cbb` 与 50 个提交未变（**OPT 本轮一次都没存过盘**）。它自己那份旧门禁（C0–C9c 共 15 项）自验 `🟢 ALL GREEN`——注意未部署态不等于本轮修复态，本轮新增的 C10x 门禁不在那份代码里。留存运行态读数：8 实体 / 28 链接 / **12 轨迹（来源全部 `metabolism-decision-lineage`）** / 8 向量，panel 877B，growth-loop 8811B，决策因果链 12 条。

### K.3 复原漏删（本轮我自己的缺陷，已补）

`git status --porcelain` 会把未跟踪**目录**折叠成一行 `?? references/`，而我的删除规则只按单文件比对 Tip 清单 → 从 Tip 复制过去的 2 篇 `references/*.md` 差点留下，事后核对未跟踪面才发现并补删（连带空目录）。对策：**未跟踪项遇目录必须先展开成文件清单再比对**；删除前先跑演练模式，打印「命中 / 保留」两份清单核对无误再执行。

### K.4 再对齐（Tip → OPT，本段实测）

| 项 | 读数 |
|---|---|
| 待按文件 | 55 个（真实内容差异 30 / 仅行尾差异 19 / OPT 缺失 6） |
| OPT 原件备份 | `<backup-root>\OPT-2026-09-14\realign-2026-09-14\`（49 个原件） |
| 运行配置 | `src/growth.config.js` 按部署流程由 `growth.config.example.js` 重生（补齐 `gates` / `distill` / `ingest` 三段，C10d 才同构） |
| OPT git | HEAD 仍 `3288cbb`、未在 OPT 存盘；工作树 49 项修改 + 6 项未跟踪（即部署态） |
| 面板 | `node src/metabolism-panel.js` 重生成 877B，C10b 新鲜度过 |
| 验收 | `🟢 ALL GREEN —— 部署验收通过（C0-C10 ALL GREEN @3288cbb，22 项）` |
| 院际台账 | `✅ 全量同源 对比 OPT 真实漂移 0 · 仅行尾 0 · 对方缺失 0 · 对方独有 0` |

再对齐会把 Tip 的 `README.md` 按进 OPT，覆盖其水印轮换（原件已存 `realign-2026-09-14\README.md`）——这是"对齐"的必然后果，不是误删。

### K.5 三院终态（2026-09-14 现测）

| 院 | 分支 | HEAD | 提交数 | 待存(修改/未跟踪) | 跟踪文件 | 库读数 |
|---|---|---|---|---|---|---|
| Tip | main | `9974eed` | 49 | 0 / 0（写本节前） | 141 | 20 实体 / 190 链 / 124 轨 / 20 向量 |
| OPT | master | `3288cbb` | 50 | 49 / 6 | 157 | 8 / 28 / 12 / 8 |
| aing | fix/yards-consistency-2026-09-14 | `650e106` | 52 | 1 / 0 | 158 | 无库（真源不携带运行库） |

三院库读数**不可横向比**：Tip 的 124 条轨迹是历史累计，OPT 的 12 条是本轮首跑产物，aing 不带 `knowledge.db`。这也解释了 J 节的数字归属问题——同一份文案在不同院会跑出不同数。

### K.6 院际文件面不对称 + 核验工具三项盲点（均未修，待拍板）

- aing 跟踪 158 个文件、Tip 141：aing 有 **24** 个 Tip 无（`assets/skills/aing-operator/**` 整套操作员技能包 + `docs/Engineering/` 4 篇），Tip 有 **7** 个 aing 无（含本轮新增 `src/ingest-scrub.js`，以及 `docs/index.html`、`references/` 2 篇、`src/package.json`、`growth.config.example.ts`、`tri-path-state.json`）。（**只在 Tip 侧跟踪**，主包 aing/OPT 无此档）
- aing 那 1 项待存 = `docs/Engineering/GROWTH-FEEDBACK-SWITCHES.md`（**只在 aing 侧**，Tip/OPT 无此档） 尾部 9 行「跟进旁注（2026-09-13 复核）」，内容是两个开关仍手动、默认关，符合"部署包干净、数据运行时产生"的既定姿态。**该旁注非本轮所写，本轮 aing 零改动。**
- `tools/verify-sibling-roots.js`（本轮新写、随包走）有三处核验面小于声称面，与 Pitfall 8 同源：
  1. 比对面只含 `src/`、`tools/`、包根文件共 68 个，**不含 `docs/` 与 `assets/`** → 上面的 24/7 文档面不对称在台账上完全隐形；
  2. 扩展名白名单不含 `.ps1` → OPT 独有的 `tools/verify-baseline.ps1`（**只存在于 OPT 侧**，Tip/aing 包内无此文件——见 AGENTS 坑 9） 被报成「对方独有 0」（手算 `git ls-files` 才抓到）；
  3. 未跟踪面依赖 `git status --porcelain`，遇目录会折叠（见 K.3）。
  修法（扩比对面 / 加 `.gitattributes` 统一 eol）本轮**不动工具**，留待所有者拍板。

### K.7 本段诚实边界

- 本段所有读数为 2026-09-14 在 `<tip-root>` 与 `<opt-root>` 现测，命令输出未做修饰；底片只在本地历史柜，未推送、未合并、未动 aing。
- OPT 现处「已对齐的部署态」，不是未部署态；要再回未部署，按 K.2 那五项动作重跑即可（备份件都还在原位）。
- J 节第 9 链的结论不因本次对齐改变：「语义命中率 > 关键词 2 倍」仍属分口径表述，8 实体发布包上语义 top3 37.5% ＝ 随机底。
- 本节文字本身属"文档面"改动：写完后 Tip 工作树会多出 1 项待存（本文件），未擅自存盘。

---

## [L] 意识层闭环·控制面·读端纯净化·旋钮单源·资产随包·计数单源 + OPT 第 2–5 轮（2026-09-14 深夜 → 2026-09-15）

> 本段记录「全绿 ≠ 可用」之后的七组改动。每组都带**负向自证**（纪律第 8 条），凡是只在文档里写着、没有跑过的，一律标注为边界而不是结论。

| 子项 | 做了什么 | 实测证据 | 门禁 | 边界（没粉饰的部分） |
|---|---|---|---|---|
| L1 W3 意识层闭环写端 | `run-metabolism.js` 尾部（P0 退出码块之后）真调 `kernel.recordCycleResult()`——它是 `stagnationCount` 的**唯一写者**而历史上全仓零调用点，三个读者（`growth-director.js:150/235`、`metacognition-layer.js:459`）因此长期空等 | 隔离假院 `raw/` 清空连跑 3 趟：计数自己 `1→2→3`、第 3 趟转 `stagnant`、自动往 `raw/` 落 `meta-breaker-*.md`、`growth-director --dry-run` 决策框印「🔄 完整代谢」；再喂一篇真文档跑一趟 → 归 0 且解闩回 `idle`。全程未手改 `state.json` | C14（第 26 项）负向 4/4 | 判据只用离散存在性（活跃实体>0 且活跃事件>0 且无失败无中止），`>=3` 的阈值仍只在 kernel 一处；`MetaKnowledge` 落在 `raw/` 会被当知识消化（设计如此）；停滞原因字符串是固定的，不带归因 |
| L2 C13 旁系（init 链） | `init-knowledge-base.js --git` 的首次提交改为 `AING_AUTOCOMMIT=1` opt-in，且**只在院子原本没有 `.gitignore` 时才创建**（原先会无条件把 Tip 那份 44 行含 `knowledge.db`/`.temp/` 的 ignore 压成 4 行桩，紧接 `git add -A` 把库和一次性探针提进历史） | 假院双向真跑：未 opt-in → 提交数不动 + 哨兵行存活；opt-in → 出现 `chore: initial knowledge base setup` 且 ignore 未被覆盖 | C13 第④式 | `compile.js` 的自动提交同已关掉（默认 `AING_NO_AUTOCOMMIT=1`） |
| L3 W2 意识层控制面 | 新建 `src/neural.js`（`status/event/inhibit/assess/verify/record/deliberate`，`--kb <院>` 探针，stdout 只出 JSON、模块日志走 stderr）；`api-server.js` 补 `POST /api/consciousness/inhibit\|deliberate\|verify\|record` 四条并同步头部注释；`package.json` 加 `npm run neural` | 假院 CLI 真跑 **18/18**（inhibit 后 event 必被拒 `target-inhibited`、`verify/record` 必增 `logs/agent-decision-lineage.jsonl`、`--hours 0` 必拒、`status` 前后 `state.json` 字节一致）+ 真起 server HTTP **9/9**（四条路由 + lineage 回读） | C15（第 27 项）负向 5/5 | **纠正我此前说过头的话**：adapter 本就自带 CLI 且 `deliberateMaintenance` 有真实现，真缺的是 `inhibit` 零调用点与 `verify/record` 无入口；kernel **无撤销 API**（只能等 `until` 到期）；`setAttention/setConfidenceState` 仍无人调用 |
| L4 ④ 读端纯净化 | `generateBriefing({ingestSignals, saveBriefing})` **默认全关**（读表不再投意识事件、不再写 briefing 存档）；组件链接「元认知」改吃只读档 `data/metacognition/self-state.json`；`--peek` 增出 `links` | 真院实测：Tip 纯跑 `memo` → `state.json` 字节与 mtime **均未动**；跑 `--archive` → briefing 档 md5 **改变**（证明是"默认不写"而非"不能写"）；假院连跑两轮 memo 双证（哨兵 + mtime） | C16（第 29 项）负向 2/2 | 元告警与 `adjustments` 明细仍需写端跑过才产生；memo 仍会开 SQLite 库，若触发迁移仍会动库（故 L3 步仍要重生成面板）；`--feed` 才喂信号 |
| L5 ⑤ 旋钮单源 | `growth.config.example.js` 新增 `consciousness` 段（`stagnationBreakerCycles: 3` / `inhibitDefaultHours: 1` / `dedupeWindowSeconds: 300` / `maxRetainedEvents: 200`），`config-runtime.js` 出 `consciousnessTuning()`，kernel / `growth-director.js`（两处）/ `memo.js`（一处）统一取数——`>= 3` 曾在四个文件各写一遍 | 假院行为证明：改 2 → 第 1 趟不熔、**第 2 趟自动 stagnant**，`neural.js status` 的 `breakerCycles` 与 `growth-director --dry-run` 同步按 2 判；`inhibitDefaultHours: 5` → 不带 `--hours` 的 inhibit 缺省止于 5h；改回 3 → 第 3 趟才熔、读者立刻报 3 | C17（第 30 项）负向 2/2（第②式顺带把 C10d 同构校验钉红） | 有意未搬：唤醒共振规则（channels≥3 / attention≥0.6）与六条融合权重仍在 kernel 内部单一逻辑处；改旋钮是热读，已熔断的 `stagnant` 不会因改小阈值回溯清除 |
| L6 W5 资产随包 | `assets/skills/aing-operator/**`（取自 aing，中英 SKILL + 5 份 references）+ `assets/skills/neural-evolution-swarm/**`（取自宿主安装件，含四角色说明书）= 20 文件 92KB 随包走；`swarmRolesReady()` 拆三种「有」并用包根（不再 `process.cwd()`）；`verify-sibling-roots.js` 比对面扩 `assets/` | 真跑 `memo --dispatch`：`inRuntime=false / bundled=true / mode=inline-degraded`，搜索目录带 `[runtime\|host\|bundled]` 标签；迷你院对证明 assets 差异可被台账抓到 | C18（第 31 项前为 30）负向 4/4 | **口径修正**：过去 `mode` 拿 `installed` 判 → 本运行时未装却长期虚报 `swarm-skill`；包内有说明书 ≠ 本运行时已装载，本场仍调不动团队 |
| L7 C19 计数单源 | 新建 `tools/gate-counts.js`：从验收器注册的 `check` 反算项数与编号集合，核对三处文档抄写 + AGENTS 清单表行集合；`npm run gate-counts` | 完好副本退出码 0；把副本 README 故意抄成「9 项部署门禁（C0–C0）」必须转红且指向 README；解析不出编号时报退出码 2（绝不谎报 0 项） | C19（第 31 项）负向 4/4（含"把工具改成永远 exit 0"的橡皮章式注入） | 只覆盖项数与编号集合，不校验每道门的语义；依赖 `await check('C<n> …')` 顶格两空格的写法 |

### L8 OPT 第 2–5 轮（换血 → 活院复证 → 复原纯未部署）

| 轮 | 动作 | 关键读数 |
|---|---|---|
| 第 2 轮 | 换血 + 部署 + 验收 | ALL GREEN 24 项（C0–C12）@`3288cbb`，其后复原未部署 |
| 第 3 轮 | 只换血（`--no-config`，不造运行配置以保持纯未部署） | 9 文件带过去，Tip↔OPT 真实漂移 0 |
| 第 4 轮 | 换血 + **真代谢** + 验收 27 项 + 复原 | 代谢 11/11 成功、尾部记账行印「有效产出（活跃实体 8 / 活跃事件 11）」、HEAD 与提交数未动（C13 活院成立）；换血面漏 `src/neural.js` 导致 C15 在别院红 → 修脚本为 `git ls-files ∪ 未跟踪源码` |
| 第 5 轮 | 换血 15 文件 + 补带 8 资产 + 二次补带 6 文件 + 真代谢 + 验收 **31 项（C0–C19）** + 复原 | 代谢 11/11、HEAD 仍 `3288cbb`/50 笔；C16/C17/C18/C19 四道新门在别院逐条绿；`verify:siblings` 判 Tip↔OPT **全量同源 0/0/0**（比对面含 assets）；纯度终查 0 项运行态（`data/` 只剩 `component-registry.json` + `opt-root.json`）。本轮又漏一次：换血白名单没放 `assets/` → 20 件资产一个没进别院，**同一形状第三次**（前两次：只取 `git ls-files` 漏 `neural.js`、比对工具不 assets） |

备份目录（原件可回退）：`_yards-backup/OPT-2026-09-14/` 下 `realign-…-round2/3/4/5/5b/5c`、`un-deploy-…/-round2/-round4/-round5/-round5d`。

### L9 本轮我自己写出来、又被抓出来的缺陷（诚实清单，全部已修并有红账）

1. **假门禁一枚**：C15 第③式（"status 顺手 saveState"）注入后门禁仍绿——写入是幂等的，第二次比字节必然相等 → 改**埋哨兵 + 比 mtime**，重跑即精准转红（登记为坑 13：接线断言必须真跑且至少两轮）。
2. **静态断言可被一行注释满足**：C18 负向②把 `walk('assets')` 换成同名注释，裸子串断言判绿 → 锚定行首 `^[ \t]*walk\(` 并保留行为层（坑 15）。
3. **门禁取错行导致假红**：C18 行为②在台账"状态行"（只带计数）上找路径 → 改锚明细行。
4. **门禁比工具更严却严错地方**：C19 要求 README 那句右括号紧跟，把带逗号尾的真句判假红 → 改解析数字，与工具同口径。
5. **部分跑冒充全量**：新加的 `VD_ONLY` 最初仍印「ALL GREEN 部署验收通过」→ 改「部分跑全绿…不等于部署验收通过」，且不写 `last-verify.json`、过滤器写错退出 1。
6. **`package.json` splice 漏逗号** → JSON 解析失败被 C11 当场抓住（红→修→绿）。
7. **扫描器吞掉 `../` 前缀** → 报了 6 条"断链"假案（其中 `docs/module-handbook.md` 的 `scripts/compile.js` 是手册刻意举的历史反例，**不该改**；`tools/calibrate-set.json` 在发布说明里明写"缺省自动生成"，也不是声称拥有）。真正的一条是 `assets/skills/aing-operator/en/SKILL.md` 少一层 `../`（zh 版对、en 版继承时没跟着加深）。
8. **`find` 路径算术错** → 把 `.temp` 残留报成"272 个文件"，实际是 3 个 09-13 的 SkillOpt rollout 目录（各 1 文件），已留底 `_yards-backup/TIP-2026-09-15/temp-nested-residue/` 并移除。
9. **长期虚报**：派单 `mode` 把"宿主装过"当"本场能派"（见 L6）。
10. **手抄债**：门禁计数「N 项（C0–CMAX）」在 AGENTS/README/greenlist 三处各抄一遍，本轮从 26 加到 31 抄了五遍，README 英文行还残留过 `23-item (C0–C11)` → 已由 C19 收口（同轮修掉）。
11. **Tip 自己的跟踪面里带着 4 个不该跟包走的文件**（2026-09-15 深扫实测，aing 一个都没有）：`tri-path-state.json`（三路突击运行态，tasks/stats）、`src/package.json`（`src/` 里嵌套的第二个包清单，`main=self-growth.js` 自带 dependencies —— 它就是 aing/OPT 出现 `src/node_modules/` 的根因）、`growth.config.example.ts`（与 `.js` 版**内容已分叉**：去注释 802 vs 2612 字符，且不含本轮 `consciousness` 段，本包口径是"no TypeScript, no build"）、`docs/index.html`（12KB 手搓文档页）。四者已在复制到 aing 时**排除在复制面外**；把它们从 Tip 跟踪面摘掉需要 `git rm`（git 写权归人，**未自行执行**）。（**只在 Tip 侧跟踪**，主包 aing/OPT 无此档）
12. **用临时脚本重算面 = 把排除项悄悄丢掉**（本轮自伤，已当场还原）：为了精确补带差额，我手写了一个临时同步循环，重新定义了"面"却没沿用复制器里的排除项 → 把 **aing 自己的机器本地运行配置** `src/growth.config.js`（4406 字节、无 consciousness 段）用 Tip 版（6254 字节）覆盖了。院际工具明明已在信息栏标出「运行配置差异（不计代差）」，是我绕过了它。所幸原件在 `pre-copy2` 留底里，逐字节还原并二次确认（还原后该文件不含 consciousness 段 = 确为 aing 自己那份）。教训：**任何跨院写入都必须复用同一个面定义（含排除项），不得就地重写一份**。
13. **比对面要第三次才扩到整包面**（同日）：先把 68 文件面扩成 143（补 docs 与包根必读档），又把 `references/`、`training/`、`simulation/`、`.ps1`、`.svg`、无扩展名档全漏在外面——第二次扩面当轮就抓出 **Tip 的 `references/` 两档两院皆缺、OPT 另缺 11 个 `simulation/` 证据档**（我复制到 aing 的那 150 文件面同样漏了 `references/`，属同一形状）。终局做法：给工具加 `--print-face`，**跨院复制器改为消费工具输出的面**，不再各自算一份（这是对本轮自伤的正解）。现面 170 文件，两院复测真实漂移 0。
14. **`.temp/backup-20260914/api-server.js` 是砍除前的多租户实现副本**（仍带 `x-tenant-id` 与 `tenant::` 会话键拼接）。它在 gitignore 的暂存里，门禁（C10f 扫跟踪码面）永远看不见它，但任何人在院里 grep 都会撞上一份"看着能用"的旧能力实现 → 已整目录搬至 `_yards-backup/TIP-2026-09-15/temp-tenant-backup/`（git 历史里本来就有这份，副本属冗余）。搬出后 `src tools docs README AGENTS` 内 `x-tenant-id` 命中 0。

### L10 核验意见与未决口径

- **文档覆盖缺口**：`docs/M4-DATA-COLLECTION-2026-09-13.md` 在本段之前完全没有 C13–C19 / W2 / W3 / W5 的任何记录（A–K 停在第 4 轮时代）；SQA 侧 `PUSH-HANDOFF-AING-2026-09-13.md` 缺 C14–C19 与 `neural.js`/`assets/skills`，`PUSH-REPORT-…` 缺 C13–C19——**SQA 不是 git 仓库、覆盖不可回退，未同步**（待点单）。
- **别把「31 项全绿」读成「能力都可用」**：本包仍有一处运行链未收（`src/sprout.js:44` 直读 `state.json`，不走 refCount/aging；`src/neural-architecture.js` 无调用方；`guide-chain-swarm.js:162` 读不到 `lastArousalAt` 恒 `light`）。
- **院际现状（2026-09-15 实测，只读）**：Tip↔OPT 真实漂移 0；Tip→aing 真实漂移 19、仅行尾 2、对方缺失 12（8 件 swarm 资产 + `memo.js`/`ingest-scrub.js`/`neural.js`/`gate-counts.js`）。aing 自带 `docs/Engineering/GROWTH-FEEDBACK-SWITCHES.md`（**只在 aing 侧**，Tip/OPT 无此档） 4 处盘符字面量（提交于 `f953238`）→ **把 Tip 的验收器原样放进 aing 后，C8 在 aing 院里必红**，这是 aing 侧待处置项而非本包缺陷。
- 三院 git 跟踪面对照：Tip 164 / OPT 157 / aing 158 个文件；Tip 唯一跟包走的运行态是 `tri-path-state.json`（已登记待办），`package-lock.json` 三院都未跟踪 → `npm ci` 仍不可用。

### L11 把 Tip 包面复制进 aing（2026-09-15，用户明令"查完就复制到 aing"）

- 复制器 `.temp/sync-to-aing.js`（默认演练，`--go` 才写）：复制面 = Tip `git ls-files` ∪ 未跟踪源码，剔除运行态与 L9-11 那四个垃圾文件，保留 `data/component-registry.json`（登记簿是包内容，`data/` 一刀切会把它切掉——第一版就犯过这个错，已修）。
- 实测：面 150 文件 → 与 aing 已一致 64 / 写入 74 / aing 原本没有 12（8 件 swarm 资产 + `memo.js` + `ingest-scrub.js` + `neural.js` + `gate-counts.js`）；原件全部留底 `_yards-backup/AING-2026-09-15/pre-copy/`（74 件）。aing **未 commit**：HEAD 仍 `650e106`、52 笔、分支 `fix/yards-consistency-2026-09-14`。
- 复制后只读复核（**没在 aing 跑验收**，那属部署动作、会动 aing 自己的库与面板）：`node tools/gate-counts.js` 在 aing 判 31 项且文档抄写一致 ✓；65 个 `.js` 全过 `node --check` ✓；`.gitignore` 被 Tip 版覆盖（32 行→37 行，aing 原有无 lost 规则）；盘符字面量扫描 153 个跟踪文件命中 **1 个 aing 原有文件** `docs/Engineering/GROWTH-FEEDBACK-SWITCHES.md`（**只在 aing 侧**，Tip/OPT 无此档）（4 处），Tip 复制过去的面贡献 0 处。
- aing 侧另有一处**本轮之前就存在**的未提交改动（非我带的）：同一篇 `GROWTH-FEEDBACK-SWITCHES.md` +9 行，内容是 2026-09-13 的"两个开关仍为手动、默认关"复核旁注——即该文档正被人本地编辑中，处置盘符前须先与这份未提交改动合并。
- **因此 aing 现在跑 `node verify-deploy.js` 会在 C8 转红**（红的是 aing 自己那篇文档，不是这次复制的内容）。要么把 4 处盘符改占位符（待点单第 4 项），要么在 aing 验收时按"该文件属 aing 侧待处置"记录。
- 终局读数（只读复测）：扩面到 143 个比对文件后，**Tip→OPT 真实漂移 0**（OPT 保持纯未部署：运行态残留 0 项、`data/` 只剩 `component-registry.json` + `opt-root.json`）、**Tip→aing 真实漂移 0**；工具仍判 🔴，剩两项都能解释：① `docs/index.html` 是本轮判定"刻意不带"的垃圾（对方缺失 1）② 库表层差异（aing 缺 `task_trajectories`、Tip 缺 `schema_migrations`）——表结构要靠真跑迁移才对齐，而在 aing 跑迁移=部署动作，**未经点单不做**。（**只在 Tip 侧跟踪**，主包 aing/OPT 无此档）
  备份：`_yards-backup/AING-2026-09-15/pre-copy`（首轮 74 件）与 `pre-copy2`（补带 6 件，内含被误覆盖又还原的 aing 原配置）、`_yards-backup/OPT-2026-09-15/realign-round6`（8 件）。

### L12 C20 文档命令可执行性门禁（含两起自伤，其中一起是我把文档示例真写进了库）

| # | 事实 | 读数 | 证据 |
|---|---|---|---|
| L12-① | **aing 盘符清零**：`docs/Engineering/GROWTH-FEEDBACK-SWITCHES.md`（**aing 侧**档，Tip 无此档）4 处盘符字面量改占位符，并在文首加「占位符图例」交代 `<repo-root>`/`<exp-yard>`/`<opt-copy>`/`<dd-root>` 各指哪院 | 改 4 行 + 图例 3 行；该文件原有 **9 行别人未提交旁注**，改前留底 `<backup-root>/AING-2026-09-15/pre-drive-fix/`（`<backup-root>` = 院外备份根，按 `<院名>-<日期>/<轮次tag>` 分目录），改后旁注仍在（98→101 行只多图例） | aing 跟踪面 158 档复扫：盘符/家目录 **0 命中** ✓（此前 1 档 4 处） |
| L12-② | 按「先逐条真跑再钉门」做全仓清点：AGENTS/README/docs/**/training/simulation/demo 抽出 **282 条**命令（node 157 / npm-run 41 / python 5 / powershell 3 / 其他 76） | 清点暴露：`tools/lsp-server.js`（不存在）这类悬空引用 4 条已处置；`npm run` 名 0 条不存在；`training/task-package.json` 的 30 条 `source` 里 10 条指向院属语料 `raw/**`（Tip 20 篇 / OPT·aing 各 8 篇）→ 判为院属不入包面；`docs/reference/api.md` 三院皆无 → 改标「外部检出文档，非本包路径」 | `.temp/inventory-commands2.js` |
| L12-③ | **新增门禁 C20**（四段）：① 文档引用的包内路径逐条核在位，确需提不存在的档必须**同行带标记**（反例/历史/外部/院属/只在…中英文都收）；② `npm run X` 名字必须真在 `package.json` scripts；③ `python`/`PYTHONPATH` 命令必须自带执行位置（`cd …`），禁裸 `PYTHONPATH=.`；④ **行为证明**：显式数组 7 条只读命令逐条真跑要求 exit 0，且清单每条都要能在文档里回指（防清单成空头账） | Tip 实跑：引用 **360 处**核在位 · 外部命令 100% 带 `cd` · 7/7 真跑 exit 0 ✓ 验收器注册 **32 项（C0–C20）** · 全量 ALL GREEN | `verify-deploy.js` + AGENTS 清单行 + README 部署段 + greenlist 新绿灯声称 `doc-command-executable` |
| L12-④ | 负向自证 **6/6**：注入不存在路径 / 造出不存在的 npm 名 / 去掉 AGENTS 外部命令的 `cd` / 把裸 python 藏进 docs 深层档 / 断掉清单回指（空头账）/ 把清单命令改成真会失败；各式独立注入→跑→判红→还原→字节比对 | 6/6 转红 · 被改文档还原字节一致 · 还原后基线绿 | `.temp/c20-negative2.js` |
| L12-⑤ | **新自证纪律：注入后必须先断言「注入真生效」再判红**——第一版负向用 `「## 已知坑」` 当锚点替换，而 AGENTS 里没这个标题 → 注入是空操作，「没红」被我误读成门禁假绿（差点去修一道正常的门）；同一版还原清单还漏了被改的 `docs/module-handbook.md`，注入的裸 python **反例行**留在档里，靠基线转红才发现 | 残留清除后 handbook 与 OPT 副本内容重新完全一致；harness v2 加 `must` 断言 + 全量文件还原 | 与 C17「负向命中要证明注入真生效」同源，本轮升级为 harness 自检 |
| L12-⑤b | **同类空操作第二次**：本段（L12）第一次追加用 `## 未闭合项` 当锚点，而 [L] 之后并无该标题 → `replace` 空操作，脚本却照样打印「追加成功」 | 三院回读 `L12-` 命中 0 暴露；改为**文末追加 + 写后 grep 断言**（本节即第二次尝试的产物） | 教训：**写后不回读的成功打印，等于没有打印** |
| L12-⑥ | **自伤（本轮第 15 起）探针自己写库**：清点脚本的「只读」正则写成 `(--summary|--peek|--todos|)…` ——分支末尾的**空选择 `()`** 等于放行任意 `node src/memo.js …`，于是把 AGENTS/README 里的示例命令行（含 `<用户挂着的事>` 占位符）真跑成 **4 条 `todo add`** 写进 knowledge.db；`todo add` 建 `Todo` 实体 → 活跃 32→36 → **C10b 红**（面板 32 ≠ 库 36） | 4 条按「留痕不删」改 `status=voided` 并在正文写明来路，活跃回到 32 ✓；C20 加 `WRONG_WORDS` 防呆（清单里出现 add/done/set/record/… 直接判红，验收器不许自持写命令）；AGENTS 补**坑 17**（frontmatter 16→17，gate-counts 复核一致） | 实体表按 `created_at LIKE “2026-09-14 18:57%”` 命中 4 条，正是真跑时刻 |
| L12-⑦ | **自伤（第 16 起）门禁豁免写松**：C20 首跑「绿」其实是漏检——早退条件用了**未锚定的子串** `stdout|stderr`，M4 的 SkillOpt 行只因顺带含 `stderr` 就逃检；我在 aing 用同逻辑复扫时报出该行，两边不一致才暴露 | 早退收紧为「行首即输出标签」才豁免；M4 该行补 `cd <dd-root>\321\SkillOpt && …`（与 AGENTS 第 111 行同构）；收紧后负向 6/6 仍全咬、Tip 复跑仍绿、aing 复扫 0 违规 | 与坑 15（注释可骗过静态断言）同族：**子串式豁免会被顺带命中吃掉** |
| L12-⑧ | 三面终读：本轮 9 档改动（AGENTS/README/greenlist/GREEN-LIST/M4/releases/task-package/verify-deploy）分四批带入两院，面由 `--print-face` 现算 | Tip↔OPT、Tip↔aing **真实漂移 0 · 仅行尾 0 · 对方缺失 0**（各 170 档）；`src/growth.config.js` 在两院均**拒带** ✓；OPT 仍是未部署裸院（`data/` 只 2 档、无库无日志无面板无运行配置；其 `raw/` 是源院 git 跟踪的 8 篇语料，非部署痕迹） | 备份 `<backup-root>/OPT-2026-09-15/round9..11`、`AING-2026-09-15/pre-copy5..7` |
| L12-⑨ | **边界**：aing 侧只跑了 C20 的**静态半**（75 档 · 382 处引用 · 34 条 npm · 4 条 python → 0 违规）与 C8 复扫。行为半要跑 `memo`/`neural` 等命令＝打开 aing 的 `knowledge.db`（可能触发迁移）→ 属**部署动作**，未获授权不跑 | 故 aing 的 C20 目前只有静态证据；aing 若要「验收通过」仍需授权后跑全量。另：`VD_ONLY` 单跑 C10b 会因依赖 C4 而报「C4 未通过，跳过」——这是部分跑的效应，不是回归（全量跑 C10b 绿） | 同 L11-④ 口径 |

### L13 aing 收院：跑真验收、清 3 条探针孤儿行、C10d 从"文本比形状"升级为"数据比键值"

| # | 事实 | 读数 | 证据 |
|---|---|---|---|
| L13-① | 先做只读体检再动手：84 项脏文件按"包面 / aing 自有 / 垃圾"分桶 | 已跟踪改动 78 + 未跟踪目录 6（展开后 **14 个新档**：`assets/skills/neural-evolution-swarm/**` 8 个、`references/` 2 个、`src/ingest-scrub.js`、`src/memo.js`、`src/neural.js`、`tools/gate-counts.js`）；**aing 自有改动只有 1 个文件**（`docs/Engineering/GROWTH-FEEDBACK-SWITCHES.md`，含 09-13 别人 9 行旁注 + 我这次的占位符化）；垃圾/运行态 **0 项** | `.temp/aing-check.js`（全程只读） |
| L13-② | 决定性前提核对：**跑验收会不会脏 git 工作区** | `knowledge.db`/`data/panel.json`/`data/last-verify.json`/`logs/`/`models/`/`node_modules/` 全部未跟踪 ✓；被跟踪的 `data/` 只有 `component-registry.json`（验收会刷新它）→ 故**先验收后提交**，把最终态一次拍干净。`.gitignore` HEAD 版 25 条规则**一条没丢**，新增 3 条（`raw/inbox/`、`data/ingest-buffer.jsonl`、`data/ingest-duplicates.jsonl`） | 同上 |
| L13-③ | **aing 全量验收首跑**（用户授权，部署动作） | 29 绿 / 4 红：C10b 面板过期 **29.9h>6h**、C10d 段漂移、C10e 孤儿行、C17 缺 `consciousness.stagnationBreakerCycles`。**四道红全是 aing 院属状态问题，无一是包面缺陷** | `.temp/aing-verify.txt` |
| L13-④ | 按根因逐条清（写库前先留底 `<backup-root>/AING-2026-09-15/pre-verify/`：`knowledge.db` 188416B + 原 `growth.config.js` 4406B） | ① **本地运行配置补两段**——aing 那份是旧代结构（`const config = {…}`，121 行），缺 `consciousness`/`ingest`；只按模板原样**新增段**、不动本院任何已有取值，补后运行期可见段 `kespi,jiezi,triPath,query,gates,distill,consciousness,ingest` ✓ ② **清 3 条探针孤儿行**：`type_index.entity_id` 悬空于 `direct-test-2026-08-27…`/`selftest-probe-2026-09-07…`/`watch-test-2026-08-…`，`DELETE … NOT IN (SELECT id FROM entities)` → `type_index` 11→8，实体表活跃 8/全库 8 **未动一行** ③ **重生成面板** `node src/metabolism-panel.js` → `kespi=0.84 实体=8 链接=28` | `.temp/aing-cleanup.js` |
| L13-⑤ | 复跑只剩 C10d，且报的是**没人能照着修好的提示**：「段: 嵌套差异」 | 根因是我自己的修法——把两段追加到 aing 配置**末尾**，而旧实现用 `JSON.stringify` 整段比字面 → **键顺序被当成漂移**（外层 `if` 与内层比较都是文本比） | `.temp/aing-verify2.txt`：32 绿 1 红 |
| L13-⑥ | **C10d 升级（源侧修，不松门）**：换成规范化深比较 `flatCfg()` 比到**叶子路径**，缺键/多键/值不同才算漂移并直接点名（如 `consciousness.dedupeWindowSeconds(院缺 / 模板=300)`）；键顺序、注释、换行不再算漂移。AGENTS 的 C10d 行措辞同步讲清"比键值不比文本" | 三式证明：基线 ✅ 绿 · 改一个值（`stagnationBreakerCycles` 3→10）✅ **仍咬** · 删一个整键 ✅ **仍咬并点名** · 纯交换两行键序 ✅ **不再误报**（还原后字节一致）；Tip 全量 **ALL GREEN 32** | `.temp/c10d-canon2.js`、`.temp/c10d-final.js` |
| L13-⑦ | 负向自证途中我自己又踩一次"注入无效当成绩"：第一次顺序扰动漏了尾逗号 → 配置语法坏，C10d 报的其实是 `Unexpected identifier`（而门把解析错**原样抛出没吞**，反而帮我看清是注入坏了） | 改用最小平扰动（交换段内两个相邻标量键行序）并**先 `node --check` 注入结果**再判定 | 与 L12-⑤ 同族：负向必须先证明"注入合法且生效" |
