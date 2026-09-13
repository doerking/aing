# GROWTH-FEEDBACK-SWITCHES：成长与反馈开关核对记录

> 日期：2026-09-13 ｜ 作者：Loomy（hana，审核岗）｜ 范围：代码只读核对 + 试跑发现，未改任何代码
> 相关提交：7218c28（第 3 号推送 HEAD）

## 一、背景

对 aing 两个"手动开关"做代码级核对，确认其设计意图、开关影响、以及主包与实验场的数据边界。发现与 M4 数据采集表（docs/M4-DATA-COLLECTION-2026-09-13.md）需对照理解。

## 二、开关 1：`trajectory-store --import-growth-loop`

### 设计意图（代码还原）

- growth-loop.js 的 `recordEpisode()` 只更新 growth-loop.json 自身状态（routes/patterns/weight），**不直接写轨迹表**
- 头部注释声明目标接口：`growth-loop.recordEpisode() → trajectory-store.logEpisode()`
- 实现为"批处理同步"：`logFromGrowthLoop()` 把 episodes 一次性导入轨迹表
- 调用：`node src/trajectory-store.js --import-growth-loop`

### 开关影响

| 状态 | 行为 | 收益/代价 |
|---|---|---|
| 开 | episodes 全量导入轨迹表（task_type/route/success/retries/duration/evidence） | ✅ growth-loop 学习成果对 M4 路线学习可见；⚠️ 全量快照复制，非持续同步 |
| 关（默认） | growth-loop 照常自学习，成果不进轨迹表 | ✅ 轨迹表干净；⚠️ 学习对 M4 路线不可见 |

### 安全性确认 ✅

`log()` 使用 **`INSERT OR REPLACE`** + `ep.id` 主键——**重复导入按 id 覆盖，幂等**，不会污染轨迹表。此开关可放心启用。

## 三、开关 2：`run-metabolism --feedback`

### 设计意图（代码还原）

- feedback-loop.js 提供"前后快照对比调优"：before 快照 → 执行 → after 快照 → calculateDelta → autoTune → logFeedback
- L1c observe 分支也拍"不动作决策"快照（`observe: true`），让反馈系统知道"判断为不动"时的系统状态
- 调用：`node run-metabolism.js --feedback`

### 开关影响

| 状态 | 行为 | 收益/代价 |
|---|---|---|
| 开 | 每次代谢多拍 2 张快照 + delta + autoTune + 写反馈日志 | ✅ 代谢效果可量化可审计；⚠️ 额外 IO/计算，代谢变慢 |
| 关（默认） | 代谢只管跑，不记录前后差异 | ✅ 快、无副作用；⚠️ 代谢效果无留痕 |

### 安全性确认 ✅（B5 红线守住）

`autoTune()` 只**生成调优建议**（actions 数组：parameter/action/value），**不写 config、不执行**。第 364 行明示：
> "调优建议已记录至反馈日志（logFeedback），但未自动执行——参数生效需经配置中枢（growth.config.js）裁定，避免调优绕过治理"

B5 红线（禁直写 growth.config.js）**未违反**。此开关可放心启用。

## 四、试跑发现：主包 vs 实验场的数据边界 ⚠️

### 试跑 `--import-growth-loop` 时的实际情况

| 检查项 | 结果 |
|---|---|
| `E:\aing\data\growth-loop.json` | ❌ **不存在** |
| `task_trajectories` 表 | ❌ **不存在**（knowledge.db 只有 11 张表：entities/entity_embeddings/entity_metadata/error_log/kespi_history/links/metabolism_log/schema_migrations/sqlite_sequence/system_log/type_index） |
| data/ 目录 | 仅 5 个 json（component-registry/ingest-hashes/opt-root/panel/tri-path-state） |

### 与 M4 数据采集表的对照

| 项目 | M4 采集表声称 | 主包 E:\aing 实际 |
|---|---|---|
| task_trajectories | 124 条真实轨迹（B2） | 表不存在 |
| growth-loop.json | episodes/memoryDecisions/improvements | 文件不存在 |

### 结论：这是"主包=代码、实验场=数据"的架构设计

- M4 的 124 条轨迹、growth-loop 数据是在 **E:\Tip 实验场**跑出来的
- 主包 E:\aing 是**干净发布态**——运行时产物（轨迹表/growth-loop.json/proof 文件）按设计**不入库**（.gitignore 已排除）
- 因此主包试跑 `--import-growth-loop` **自然无数据可导入**——**不是 bug，是预期行为**

### 需要留意的点

1. 若验收方理解"主包自带 124 条轨迹"，属**误解**——主包是代码，数据在实验场
2. 若要让主包 clone 后能自产生轨迹，需依赖真实使用（代谢/tri-path 运行后轨迹表才会建表写入）
3. `task_trajectories` 表由 trajectory-store 首次 `log()` 时建表（运行时自动），非部署期建

## 五、结论与建议

1. **两个开关均可放心启用**（幂等/不越权已验证）
2. **主包数据边界符合设计**：代码入库、运行产物留实验场，无异常
3. **建议**（待所有者拍板）：
   - `--import-growth-loop` 可挂入代谢尾步或 scheduler，让 growth-loop 学习自动进轨迹表
   - `--feedback` 可设为 scheduler 触发时默认开，让代谢效果持续留痕（支撑架构证明长期数据）
   - 两者均为"增强"，非"修复"；当前手动按需使用正确无误
