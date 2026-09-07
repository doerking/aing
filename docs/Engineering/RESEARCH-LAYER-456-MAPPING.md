---
tags: ["aing", "业务层", "路线学习", "记忆路由", "受控自改进", "论文映射", "理论靠山"]
---

# 业务层 4/5/6 × 外部论文映射规格（2026-09-05）

## 一、定位声明（先读这个）

外部论文**不是资料库，是理论靠山**。用法固定为一条回流链：

```
论文清单
  → 拆成 章节/论点/方法/证据/适用边界（入 raw/）
  → 映射到 aing 组件、脚本、数据表
  → 结构路 + 语义路自动建链
  → 4/5/6 做路线、记忆、改进处理
  → 结果写回 raw/
  → 再编译、建链、代谢、KESPI 验证
```

节点分工：**论文=外部理论节点，源码=实现节点，4/5/6=业务成长节点，KESPI=验证反馈节点**。目标是让"论文观点→组件→脚本→运行数据→经验→新候选改进"连成可回流的数据链，而不是堆一份文献综述。

## 二、层定义与理论靠山

| 层 | 代号 | 职责 | 一句话 |
|---|---|---|---|
| 4 | Agents 2.0 | 路线学习 | 学习怎么做：任务类型、工具组合、执行顺序、成功率、重试 |
| 5 | MemR³ | 记忆路由 | 学习什么时候检索/反思：answer / retrieve / reflect / verify / ask |
| 6 | Gödel Agent | 受控自改进 | 学习如何受控改进自己：候选必须过四门 |

### 验真状态（双证据）

- **Gödel Agent**：✅ 已验真。arXiv 2024-10（北大/UC/Arizona），自指递归自改进，四步循环 self_inspect → interact → self_update → continue_improve。
- **MemR³**：✅ 已验真。Memory Retrieval via Reflective Reasoning：Router（retrieve/reflect/answer 动作选择）+ Evidence-Gap Tracker（证据集 ℰ 与缺口集 𝒢 记账，单调性/完备性/可解释性）+ 闭环迭代，即插即用控制器，QA 提升 5-9%。
- **Agents 2.0（作为具体论文）**：⚠️ 标题检索未命中，搜到的均为范式性文章。MPO / R2D2 同样待验。**暂按项目内部代号处理**，拿到 arXiv ID 后补验。层的职责定义不依赖该论文成立。
- 姊妹靠山（验真状态见 `RESEARCH-DOERONE-PAPERS-2026-09-04.md`）：FluxMem/MPR/Memento2/Hindsight → 5 与 6；RAKG/KG2RAG → 建链底座；AMA-Bench 类 → 评估。

## 三、层 × 现有组件锚点

### 层 4：路线学习（Agents 2.0）

| 现有锚点 | 角色 |
|---|---|
| `src/guide-chain-swarm.js` + `src/neural-guide-chain.js` | 决策与投票骨架 |
| `src/tri-path-orchestrator.js` | 执行编排 |
| `src/growth-director.js` | 路线晋升门 |
| EvoMap GEP-A2A（A组现役管线） | EvolutionEvent candidate→promoted 两段式 = 路线候选的天然载体 |
| `src/metabolism-log.js` | 现有日志偏代谢事件，**非任务路线统计** |

**缺口（M4 待补）**：任务类型 / 工具组合 / 执行顺序 / 成功率 / 重试的结构化轨迹数据表。没有这张表，路线学习是空转。表设计先于算法。

### 层 5：记忆路由（MemR³）

| 现有锚点 | 角色 |
|---|---|
| `src/gap-detector.js` | 与 MemR³ 的 Evidence-Gap Tracker **天然同构**——缺口记账已有骨架 |
| `src/query.js` + `src/tri-path-orchestrator.js` | retrieve 动作（双路/三路读取） |
| `src/sensory-ends.js` | 末梢感知喂路由 |
| `src/guide-chain-swarm.js` | 路由决策骨架 |
| `src/consciousness-layer.js` | 反思动作的宿主（**在库未接线**，按 GREEN-LIST 口径声明） |

**缺口（M4 待补）**：动作集从现有 retrieve/answer 扩到 verify/ask/reflect 五路；ℰ,𝒢 状态显式记账（gap-detector 已有雏形，需升格为路由输入）；路由决策必须过 guide-chain，**不允许旁路直连**。MemR³ 论文用 RAG/Zep 当底座证明即插即用——aing 的对应姿态是：MemR³ 逻辑扣在 tri-path 上，不动库层。

### 层 6：受控自改进（Gödel Agent）

| Gödel Agent 四步 | aing 对应 |
|---|---|
| self_inspect（内省） | `metacognition-layer.js` + `generate-analysis-report.js`（metacognition 在库未接线，接线属 B5 重设计范围） |
| interact（交互） | 真实任务执行数据（层 4 的轨迹表同源） |
| self_update（自更新） | **候选**（技能文档 / 脚本 / 配置候选），落到影子或候选区，不直接改主包 |
| continue_improve（递归） | `growth-director.js` 门禁 + KESPI 基线比较 |

**四门（用户定死，写入纪律）**：候选必须过 **测试 → 评估 → 基线比较 → 回滚门槛**，缺一不入。这与 B5 重设计的"裁决在环 + 审计"完全一致。

**红线（不可协商）**：
1. feedback-loop（B5）禁直写 `growth.config.js`——候选只能作为候选存在，裁决必须过 growth-director 门禁且有审计记录。
2. 阈值唯一来源 growth.config.js（envNum 模式），自改进不得产生第二真源。
3. "元认知/自改进未接线"期间，一切声明按"在库未接线"口径，绿灯解锁制有效。

## 四、建链底座（三层共用）

| 论文 | 落点 |
|---|---|
| RAKG（文档级实体抽取+幻觉过滤） | `src/auto-link.js` 增强：论文笔记入 raw/ 后自动建"论点↔组件↔脚本↔数据表"连边 |
| KG²RAG（块间事实级关系扩展） | tri-path 图臂的融合策略对照 |
| Agent-as-a-Graph | 叙事引用（映射属类比拉伸，不作实现蓝本） |

回流链落到脚本就是：`auto-ingest.js`（raw/ 入库）→ `compile.js`（编译）→ `auto-link.js` + `sync-links-to-fs.js`（建链）→ `run-metabolism.js`（代谢）→ `kespi-check.js`（验证）。

## 五、评估与分期

- **KESPI 八维饱和观察**（AMA-Bench 类问题）：数据量上来后八维是否饱和、失真或维度塌陷，进 Wave 3 评测规格（与已定四指标合并）。
- **分期**：M3 影子窗口 09-05 结束。窗口内只做规格登记（本文件即登记）；窗口结束评审后，按 缺口清单 → 影子实现 → 双证据验收 → GREEN-LIST 解锁 的顺序进 M4。层 5（gap-detector 同构度最高）建议第一优先，层 4 轨迹表其次，层 6 最后（B5 重设计捆绑裁决在环）。
