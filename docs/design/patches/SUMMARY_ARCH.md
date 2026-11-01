# Tolaria(LLM) 核心架构篇

> 本篇章定义了 Tolaria(LLM) 的核心架构、存储基石、权力法则与自检体系。
> 它是 Tolaria(LLM) 的“骨骼”与“神经系统”。

---

## 目录

1. [Tolaria(LLM) 命名与架构定义](./patch-11-tolarian-naming-and-architecture.md)
2. [Tolaria 宿主系统与集成边界](./patch-1-tolaria-dual-identity.md)
3. [单 SQLite 存储架构](./patch-4-single-sqlite-schema.md)
4. [冲突仲裁与 Harness 规则](./patch-5-conflict-resolution.md)
5. [KESPI 八维自检指标体系](./patch-6-kespi-red-light-criteria.md)

（以下两篇为 2026-11-01 从 DeepSeek Harness 生态 dsh-orchestrate / dsh goal 子系统吸收的机制改造设计稿，**设计中、未接线**，源码实现待所有者拍板后走纪律 9 分支流程；本两篇不动 C0–C20 门禁计数、不动 11 步代谢）

6. [对抗审查角色并入蜂群共识收敛（dsh-orchestrate 对抗式审查+收敛）](./patch-12-adversarial-reviewer.md)
7. [持久化 Goal 多轮追踪与收敛判定（dsh goal 子系统 → 备忘录 Todo 面）](./patch-13-persistent-goal-loop.md)

---

## 1. Tolaria(LLM) 命名与架构定义

**Tolarian** = **Tolaria**（宿主）+ **-ian**（内化/属格后缀）

*   **命名哲学**：你不是在 Tolaria 上「装了一个 LLM 插件」，你是在 Tolaria 体内「培育了一个知识代谢器官」。
*   **架构形态**：单一系统，LLM 内化为器官，而非外挂应用。
*   **核心层级**：
    *   **宿主层**：Markdown 编辑器、Git 管理、双向链接、前端 UI。
    *   **Harness 控制层**：Spec Design, Diff Review, Eval Loops, Guardrails, Tool Use, Feedback。
    *   **多 Agent 执行层**：Opus (编排), Mistral (核查), Ollama (批量), Codestral (代码)。
    *   **代谢引擎**：Sprouting, Decay, Compression, Regeneration, Inception。
    *   **存储层**：Markdown 文件、SQLite (aing.db)、Git。

## 2. Tolaria 宿主系统与集成边界

*   **双重身份**：
    *   **意象层**：源自 MtG Tolaria 海岛，对应“编译范式→代谢范式”的升级。
    *   **实底层**：refactoringhq/tolaria (Tauri+React+TS)，原生支持 Git/Type/双向链接。
*   **集成边界**：
    *   Tolaria 负责：MD 文件的 CRUD、Git 版本管理、前端展示、用户输入入口。
    *   aing 负责：图谱 Schema 维护、生长脑逻辑调度、KESPI 自检、代谢任务执行。
    *   共享存储：Tolaria 的 MD 文件目录直接作为 aing 的 `data/docs` 目录。
*   **AI Provider 双层抽象**：
    *   **编译层 Provider**：Tolaria 原生，用于 Raw→Wiki 的基础编译。
    *   **代谢层 Provider**：aing Growth Brain，用于发芽/授粉/再生等代谢决策。

## 3. 单 SQLite 存储架构

*   **架构**：单文件 `aing.db`，丐版友好，零外部依赖。
*   **表空间划分**：
    *   **图谱核心层**：`entities`, `links`, `meta_knowledge_capsule`。
    *   **代谢层**：`jiezi`, `pollination_log`, `expiry_event`。
    *   **自检层**：`kespi_snapshot`, `trigger_log`。
    *   **索引层**：`fts5_content` (全文), `vec_index` (语义)。
*   **丐版优化规则**：
    *   **索引分离**：fts5 和 vec 索引单独建表。
    *   **快照分区**：kespi_snapshot 按月份自动分区。
    *   **查询限流**：代谢任务默认限速 5 次/小时。
    *   **向量降维**：sqlite-vec 使用 384 维向量。

## 4. 冲突仲裁与 Harness 规则

*   **Harness 定位**：Tolaria(LLM) 的“神经系统”，控制知识如何被生产、验证和发布。
*   **冲突仲裁优先级**：
    1.  **Tolaria Schema 约束** > LLM.wiki 生成内容（被 BEFORE 触发器拦截）。
    2.  **人工编辑** > 代谢决策（用户手动修改 MD 后，自动跳过当日代谢）。
    3.  **KESPI 红灯** > 生长任务（红灯状态下，暂停所有非紧急生长任务）。
    4.  **跨域授粉张力** > 现有图谱（优先生成 `verify_conflict` 任务）。
*   **人工介入边界**：
    *   KESPI 连续 3 次红灯无法自动恢复。
    *   跨域授粉发现核心逻辑矛盾。
    *   资产化阈值调整。
    *   再生冷却规则变更。

## 5. KESPI 八维自检指标体系

*   **定位**：Tolaria 的周期性体检仪，回答“系统健不健康”。
*   **八维指标**：
    | 维度 | 代号 | 权重 | 红灯门禁 | 黄灯阈值 | 数据源 |
    |------|------|------|---------|---------|--------|
    | 质量 | KQ | 0.15 | ≥0.80 | 0.65~0.79 | meta_knowledge_capsule.confidence |
    | 生长 | KG | 0.12 | N/A | <0.05 (周环比) | jiezi.created_at, pollination_log |
    | 资产 | KA | 0.13 | N/A | <0.60 | jiezi.transplant_readiness |
    | 代谢 | KM | 0.12 | ≥0.75 | 0.60~0.74 | expiry_event.status |
    | 密度 | KD | 0.13 | N/A | <0.50 | 图谱连通率, 孤儿节点占比 |
    | 检索 | KC | 0.10 | N/A | HitRate <0.70 | 查询日志, tool_log |
    | 回答 | KR | 0.15 | N/A | Accuracy <0.85 | 人工反馈, 幻觉拦截率 |
    | 阻断 | KB | 0.10 | ≥1次 | N/A | 红灯事件计数, 人工驳回 |
*   **综合公式**：`KESPI_Score = Σ(维度得分 × 权重)`
*   **状态判定**：
    *   🟢 **健康 (≥0.80)**：允许自动发布/移植。
    *   🟡 **黄灯 (0.65~0.79)**：生成优化任务，限流生长。
    *   🔴 **红灯 (<0.65)**：阻塞发布，进入人工干预模式。

---

*文档版本：v1.0 | 最后更新：2026-07-16 | 维护者：aing-core-team*
