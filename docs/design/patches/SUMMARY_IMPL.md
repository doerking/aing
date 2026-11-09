---
tags: [design-docs:8]
---

# Tolaria(LLM) 实现细节篇

> 本篇章定义了 Tolaria(LLM) 的运行逻辑、代谢管道、接口实现与审计机制。
> 它是 Tolaria(LLM) 的“肌肉”与“血液循环”。

---

## 目录

1. [芥子组培完整逻辑 (Schema & Flow)](./patch-2-mustard-seed-tissue-culture.md)
2. [一周剪断代谢链路 (Pipeline)](./patch-3-weekly-auto-prune.md)
3. [pending_prune 保留与清理策略](./patch-7-pending-prune-retention.md)
4. [芥子压缩差异化调参](./patch-8-mustard-seed-compression-tuning.md)
5. [Jiezi CRUD 接口与 Trigger Log](./patch-9-jiezi-crud-trigger-log.md)
6. [KESPI 八维自检详细实现](./patch-10-kespi-eight-dimensions.md)

---

## 1. 芥子组培完整逻辑 (Schema & Flow)

*   **核心 Schema**：
    *   `jiezi` 表：存储压缩后的微观知识单元（≤500 tokens）。
    *   `meta_knowledge_capsule` 表：芥子匹配的锚点（methodology/concept/fact/rule）。
*   **组培全流程**：
    1.  低频旧知识（≥30天无访问）进入芥子压缩器。
    2.  提取核心信息，压缩至≤500 tokens。
    3.  匹配元知识胶囊（按 anchor_keywords 命中）。
    4.  生成 jiezi 记录，`transplant_readiness` 初始值=0.3。
    5.  KESPI 周期性评估（每周一次）。
    6.  达标（≥0.75）→ 进入有用知识队列，可被检索/调用。
    7.  未达标 → 继续冷却，等待下一次授粉/再生。
*   **再生冷却规则**：
    *   0 次：30 天（首次再生，快速验证）。
    *   1 次：90 天（二次再生，延长验证）。
    *   ≥2 次：365 天（多次再生无效，标记为永久归档）。

## 2. 一周剪断代谢链路 (Pipeline)

*   **完整流水线**：
    1.  定时触发器（每日凌晨运行）。
    2.  扫描 `links` 表：筛选 `last_activated < NOW() - INTERVAL '7 DAY'` 的知识边。
    3.  **BEFORE 触发器：DDD 审查**
        *   若为核心知识（confidence≥0.8/被高频引用）：跳过剪断，标记为「保护状态」。
        *   若为普通知识：进入剪断流程。
    4.  执行剪断：删除 `links` 表中对应记录，将原内容移入 `pending_prune` 临时区。
    5.  芥子压缩：调用 Mustard Seed Compressor 生成 jiezi 记录。
    6.  元知识匹配：关联 `meta_knowledge_capsule` 表，插入对应胶囊。
    7.  次日 KESPI 快照：评估新生成 jiezi 的 `transplant_readiness`。
        *   ≥0.75：自动亮绿灯，移入有用知识队列。
        *   <0.75：保持 pending 状态，等待后续授粉/再生。
    8.  日志记录：写入 `expiry_event` 表，关联 trace_id。
*   **设计说明**：
    *   剪断不是删除：原 MD 文件仍保留在 Tolaria 中，仅删除图谱关联边。
    *   亮绿灯不是人工审批：由 KESPI 自动判定。
    *   可回收性：即使剪断后亮绿灯失败，仍可通过手动触发 `regenerate_expired` 任务重新激活。

## 3. pending_prune 保留与清理策略

*   **目录结构**：`.metabolism/pending_prune/{date}/{entity_id}_{type}.{ext}`
*   **保留期限**：
    *   普通知识：30 天。
    *   核心知识：90 天。
    *   矛盾知识：7 天。
    *   人工标记保护：∞。
*   **清理流程**：
    1.  每日凌晨 03:00 触发清理任务。
    2.  扫描 `pending_prune/{date}/` 目录。
    3.  检查每个条目的保留期限。
    4.  超期条目 → 移入 `archive/` 目录（软删除）。
    5.  `archive/` 中的条目保留 365 天 → 365 年后 → 永久删除（hard delete）。
    6.  清理完成后生成清理报告 → `METABOLISM_LOG.md`。

## 4. 芥子压缩差异化调参

*   **默认压缩策略**：
    *   最大压缩比：10:1。
    *   绝对上限：500 tokens。
    *   最小保留率：70%。
*   **领域差异化调参**：
    | 领域 | 压缩上限 | 压缩比 | 说明 |
    |------|---------|--------|------|
    | 事实型 (Fact) | 200 tokens | 15:1 | 事实信息密集，可大幅压缩 |
    | 方法型 (Methodology) | 800 tokens | 5:1 | 步骤和细节重要，需保留更多上下文 |
    | 概念型 (Concept) | 600 tokens | 8:1 | 定义和关系需要一定篇幅 |
    | 规则型 (Rule) | 300 tokens | 12:1 | 规则通常简洁，压缩率高 |
    | 对比型 (Comparison) | 1000 tokens | 4:1 | 对比需要保留双方特征 |
*   **压缩质量评估**：
    *   信息完整性：原始核心信息保留率 ≥ 70%。
    *   语义一致性：压缩后语义与原意偏差 ≤ 10%。
    *   可检索性：压缩后仍可被关键词和向量检索命中。

## 5. Jiezi CRUD 接口与 Trigger Log

*   **Trigger Log 表结构**：
    *   `id`: 主键。
    *   `trace_id`: 全链路追踪 ID。
    *   `trigger_type`: BEFORE/AFTER/CRON/MANUAL。
    *   `trigger_name`: ddd_review/germinate/auto_prune/pollinate/regenerate/kespi_snapshot。
    *   `input_data`: 触发时的上下文参数 (JSON)。
    *   `output_data`: 执行结果 (JSON)。
    *   `status`: SUCCESS/FAILED/SKIPPED。
    *   `execution_time_ms`: 执行耗时（用于丐版性能监控）。
*   **Jiezi CRUD 接口**：
    *   `createJiezi`: 创建芥子（一周剪断流程调用）。
    *   `getPendingJiezi`: 获取待评估芥子（KESPI 流程调用）。
    *   `updateJieziReadiness`: 更新移植就绪度（KESPI 评估结果写入）。
    *   `updateJieziRegenCount`: 更新再生次数（再生流程调用）。
    *   `deleteExpiredJiezi`: 逻辑删除过期芥子（归档流程调用）。
*   **丐版优化注意事项**：
    *   SQL 执行限制：所有查询添加 LIMIT 限制。
    *   事务使用：所有多表操作必须使用事务。
    *   索引优化：仅保留必要索引。
    *   日志清理：每月自动归档 3 个月前的 trigger_log。
    *   配置外置：所有阈值均来自 `growth.config.ts`。

## 6. KESPI 八维自检详细实现

*   **KQ · 质量 (Knowledge Quality)**：
    *   采集：meta_knowledge_capsule.confidence, DDD 审查通过率, 来源权威性。
    *   红灯：单条核心知识 confidence < 0.7 触发黄灯；若引发逻辑冲突，直接 KB 红灯。
*   **KG · 生长 (Knowledge Growth)**：
    *   采集：新增 jiezi 数量, 新增 pollination_log 数量。
    *   黄灯：连续一周无新芥子或新连接，触发 pollinate_orphan 任务。
*   **KA · 资产化 (Knowledge Assetization)**：
    *   采集：jiezi.transplant_readiness, 知识被调用的频次 (Hit Count)。
    *   黄灯：高复用潜力知识未及时资产化，触发资产化提醒。
*   **KM · 代谢 (Knowledge Metabolism)**：
    *   采集：expiry_event 处理成功率, “一周无活动剪断”的执行次数。
    *   红灯：过期知识未处理堆积超过阈值，或剪断后再生失败率过高。
*   **KD · 密度 (Knowledge Density)**：
    *   采集：平均节点度数 (Avg Degree), 孤儿节点 (Orphan Nodes) 占比。
    *   黄灯：孤儿节点占比 > 20%，触发 link_suggest 任务。
*   **KC · 检索 (Knowledge Retrieval)**：
    *   采集：向量检索命中率 (Hit Rate), 空结果查询占比。
    *   黄灯：高频查询词命中率低，触发索引优化任务。
*   **KR · 回答 (Knowledge Response)**：
    *   采集：人工反馈评分 (Thumbs Up/Down), 幻觉拦截率 (Hallucination Block Rate)。
    *   黄灯：回答准确率低于 85%，触发 verify_conflict 或微调任务。
*   **KB · 阻断 (Knowledge Blocking)**：
    *   采集：红灯事件计数, 人工驳回次数。
    *   红灯：一旦出现 KB 计数，立即冻结系统写权限。
*   **黄灯优化任务映射表**：
    | 触发维度 | 自动生成任务类型 | 任务描述 |
    |---------|----------------|---------|
    | KG (低) | pollinate_orphan | AI 扫描孤儿节点，尝试建立跨域连接 |
    | KD (低) | link_suggest | AI 分析孤立内容，建议双向链接 |
    | KM (中) | regenerate_expired | AI 对过期边缘进行剪断、重组、再生 |
    | KQ (中) | verify_confidence | AI 复核低置信度知识，寻找佐证或标记存疑 |
    | KC (低) | optimize_index | AI 优化 fts5 / sqlite-vec 索引策略 |

---

*文档版本：v1.0 | 最后更新：2026-07-16 | 维护者：aing-core-team*
