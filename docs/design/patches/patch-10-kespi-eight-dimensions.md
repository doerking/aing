---
tags: [design-docs:8]
---

# KESPI 八维自检 | KESPI-8D Self-Check

> **Knowledge Ecosystem Self-Inspection Index**

> 定位：Tolaria（秩序脑）的周期性体检仪，Phase 3 核心组件。不同于传统日志（log），KESPI 负责回答「系统健不健康」，而非「系统干了什么」。

> 触发时机：每日定时快照（Cron） / 重大变更后（Post-Commit Hook） / 人工巡检（Manual Review）

---

## 一、八维概览表

| 维度 | 代号 | 全称 | 权重 | 红灯门禁 | 黄灯阈值 | 数据源 |
|------|------|------|------|---------|---------|--------|
| 质量 | KQ | Knowledge Quality | 0.15 | ≥0.80 | 0.65~0.79 | `meta_knowledge_capsule.confidence`, DDD 审查结果 |
| 生长 | KG | Knowledge Growth | 0.12 | N/A | <0.05 (周环比) | `jiezi.created_at`, `pollination_log` |
| 资产 | KA | Knowledge Assetization | 0.13 | N/A | <0.60 | `jiezi.transplant_readiness`, 复用次数 |
| 代谢 | KM | Knowledge Metabolism | 0.12 | ≥0.75 | 0.60~0.74 | `expiry_event.status`, 剪断/再生成功率 |
| 密度 | KD | Knowledge Density | 0.13 | N/A | <0.50 | 图谱连通率, 孤儿节点占比 |
| 检索 | KC | Knowledge Retrieval | 0.10 | N/A | HitRate <0.70 | 查询日志, tool_log |
| 回答 | KR | Knowledge Response | 0.15 | N/A | Accuracy <0.85 | 人工反馈, 幻觉拦截率 |
| 阻断 | KB | Knowledge Blocking | 0.10 | ≥1次 | N/A | 红灯事件计数, 人工驳回 |

### 综合公式

```
KESPI_Score = Σ(维度得分 × 权重)
```

### 状态判定

| 状态 | 分数区间 | 系统行为 |
|------|---------|---------|
| 🟢 健康 | ≥0.80 | 允许自动发布/移植 |
| 🟡 黄灯 | 0.65~0.79 | 生成优化任务，限流生长 |
| 🔴 红灯 | <0.65 | 阻塞发布，进入人工干预模式 |

---

## 二、八维详解

### 1. KQ · 质量（Knowledge Quality）

**定义**：知识的置信度与合规性。

**采集**：
- `meta_knowledge_capsule.confidence`（0~1）
- DDD 审查（Doubt-Driven Development）通过率
- 来源权威性（`source_type`: 学术 > 官方 > 社群 > 推测）

**红灯逻辑**：
- 单条核心知识 `confidence < 0.7` 即触发黄灯
- 若引发逻辑冲突，直接 KB 红灯

---

### 2. KG · 生长（Knowledge Growth）

**定义**：系统的创新与连接能力。

**采集**：
- 新增 `jiezi`（芥子）数量
- 新增 `pollination_log`（授粉/跨域连接）数量

**黄灯逻辑**：
- 连续一周无新芥子或新连接，判定为生长停滞
- 触发 `pollinate_orphan`（孤儿页授粉）任务

---

### 3. KA · 资产化（Knowledge Assetization）

**定义**：知识从「临时笔记」转化为「可复用资产」的比例。

**采集**：
- `jiezi.transplant_readiness`（移植就绪度）
- 知识被调用的频次（Hit Count）

**黄灯逻辑**：
- 高复用潜力知识（如通用方法论）未及时资产化（`transplant_readiness < 0.6`）
- 触发资产化提醒

---

### 4. KM · 代谢（Knowledge Metabolism）

**定义**：系统清理废料、自我更新的效率。

**采集**：
- `expiry_event` 处理成功率
- 「一周无活动剪断」的执行次数

**红灯逻辑**：
- 过期知识未处理堆积超过阈值（如 5%）
- 剪断后再生失败率过高

**关联流程**：
```
No activity for 1 week → auto prune → reinsert into capsule → green-light if KESPI passed
```

---

### 5. KD · 密度（Knowledge Density）

**定义**：图谱的紧凑程度与关联质量。

**采集**：
- 平均节点度数（Avg Degree）
- 孤儿节点（Orphan Nodes）占比

**黄灯逻辑**：
- 孤儿节点占比 > 20%，触发 `link_suggest`（链接建议）任务

---

### 6. KC · 检索（Knowledge Retrieval）

**定义**：知识被准确找到的能力。

**采集**：
- 向量检索命中率（Hit Rate）
- 空结果查询占比

**黄灯逻辑**：
- 高频查询词命中率低，触发索引优化任务

---

### 7. KR · 回答（Knowledge Response）

**定义**：基于知识库的回答准确率。

**采集**：
- 人工反馈评分（Thumbs Up/Down）
- 幻觉拦截率（Hallucination Block Rate）

**黄灯逻辑**：
- 回答准确率低于 85%，触发 `verify_conflict` 或微调任务

---

### 8. KB · 阻断（Knowledge Blocking）

**定义**：系统自我纠错、防止污染的能力。

**采集**：
- 红灯事件计数
- 人工驳回次数

**红灯逻辑**：
- 一旦出现 KB 计数（如误删核心数据、严重幻觉发布），立即冻结系统写权限

---

## 三、黄灯优化任务映射表

当 KESPI 判定为黄灯（0.65~0.79）时，系统自动生成以下异步任务：

| 触发维度 | 自动生成任务类型 | 任务描述 |
|---------|----------------|---------|
| KG (低) | `pollinate_orphan` | AI 扫描孤儿节点，尝试建立跨域连接 |
| KD (低) | `link_suggest` | AI 分析孤立内容，建议双向链接 |
| KM (中) | `regenerate_expired` | AI 对过期边缘进行剪断、重组、再生 |
| KQ (中) | `verify_confidence` | AI 复核低置信度知识，寻找佐证或标记存疑 |
| KC (低) | `optimize_index` | AI 优化 fts5 / sqlite-vec 索引策略 |

---

## 四、与 Tolaria / LLM.wiki 的交互

### 1. 写入

KESPI 快照写入 `kespi_snapshot` 表，关联 `trace_id`。

### 2. 读取

- **Tolaria UI**：展示仪表盘（Dashboard），红黄绿灯状态
- **LLM.wiki**：生长引擎在决策前读取当前 KESPI 分数，若低于阈值，拒绝执行高风险操作（如删除、大幅改写）

### 3. 阻断

KB 红灯触发时，Tolaria 的 Git Hook 阻止 `post-commit`，直至人工解锁。

---

## 五、实施 Note（给开发者）

| 事项 | 说明 |
|------|------|
| **存储** | `kespi_snapshot` 表建议按月分区，避免单表过大 |
| **性能** | 八维计算逻辑应置于 Node Background Service，避免阻塞 Tolaria UI 主线程 |
| **校准** | 权重系数（0.15/0.12...）需在 Phase 3 试运行期间根据丐版硬件表现进行微调 |

---

> **设计者注**：KESPI 不是为了好看的数据，而是为了让系统拥有「痛觉」。当知识腐烂时，系统应能感到「不适」（黄灯），并在中毒时「休克」（红灯），而非继续麻木地运行。这正是 aing 区别于传统 LLM Wiki 的关键所在。

---

*文档版本：v1.0 | 最后更新：2026-07-16 | 维护者：aing-core-team*
