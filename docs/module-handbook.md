# aing 部署包模块手册

> 各模块功能能力方向 + 高发问题与处置。基于 2026-08 两轮全量审计（26 处已修复问题）沉淀。

## 总体架构与数据流

```
消息/文件 ──► auto-ingest ──► raw/*.md
                                  │ shared-spine (门禁校验)
                                  ▼
   run-metabolism 9 步代谢链：
   compile ─► import ─► link ─► vector ─► sprout ─► pollinate ─► compress ─► kespi ─► prune
   (raw→wiki) (wiki→DB) (auto-link) (64d向量) (关联发现) (跨域融合) (低频归档) (八维自检) (过期清理)
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        ▼                         ▼                          ▼
   意识层(感知/元认知)        决策层(director/蜂群)        反馈层(loop/gap)
```

- 数据库：`knowledge.db`（sql.js WASM SQLite，**不是** better-sqlite3）
- 知识库目录：`raw/`（原始档）→ `wiki/`（编译产物：entities/links/compressed/）
- 状态文件：`metabolism-state.json`（--resume 游标）

---

## 一、代谢链（9 步管线）

### run-metabolism.js — 管线编排器
- **能力**：按序执行 9 步；`--resume` 从上次断点续跑；`--force` 出错继续。
- **用法**：`node src/run-metabolism.js [--resume] [--force]`
- **高发问题与处置**：
  - 中途失败后重跑总从头来 → 用 `--resume`（游标只在步骤**成功后**推进）。
  - 子进程输出丢失/报 `maxBuffer exceeded` → execSync 已配 16MB 缓冲，若自定义步骤输出巨大仍需调大。
  - 某步失败但想跳过 → `--force`（慎用， kespi 会基于脏数据打分）。

### compile.js — 秩序脑编译
- **能力**：`raw/*.md` → `wiki/entities/*.md`，抽取 frontmatter（title/tags/type）。
- **高发问题**：raw 文件缺 frontmatter 时会生成无 tags 实体，导致后续 KESPI 扣分（MISSING_TAGS）。编译前保证 raw 档有 `tags: a, b` 或 JSON 数组 `["a","b"]`（两种格式 import 侧都兼容）。

### import-from-wiki.js — wiki→数据库
- **能力**：实体/元数据入库；tags 支持数组与逗号字符串双格式；metadata 冲突时 DO NOTHING（不覆盖 KESPI 分）。
- **高发问题**：重复导入历史版本会崩 UNIQUE 冲突或把 metadata 清零 → 现已幂等；若实体内容更新了但 KESPI 没变，属正常（分数保留，等下一轮 kespi 重算）。

### auto-link.js — 自动链接发现
- **能力**：实体间相似度关联，写 `wiki/links/A__B.md` + 数据库 links 表。
- **高发问题**：链接文件命名 `A__B` 有方向性，去重必须双向查（见 sprout/pollinate）。

### index-vectors.js — 64 维向量索引
- **能力**：char-ngram-hash 64 维向量写入 entity_embeddings，model 标记 `char-ngram-hash-64`。
- **高发问题**：**向量必须用 Float32Array 编码**（`Buffer.from(new Float32Array(vec).buffer)`）。用 `Buffer.from(floatArray)` 会把 0~1 浮点截成零字节，检索全部失真且无报错——这是最难发现的一类静默数据损坏。

### sprout.js — 发芽引擎
- **能力**：基于邻居结构发现潜在关联，`node sprout.js` 生成建议。
- **高发问题**：只查 `A__B` 不查 `B__A` 会产生正反重复链接 → 已改双向查重；自写新链接逻辑时必须沿用 `linkExists` 双向模式。

### pollinate.js — 授粉引擎
- **能力**：跨类型实体融合，`--apply` 自动建跨域链接，报告落 `logs/pollination-reports/`。
- **阈值红线**：`creativeThreshold: 0.75`。**创意度公式上限 = 0.3(跨类型) + 0 + 0.5(Jaccard) = 0.8**，任何 ≥0.8 的阈值都会让 --apply 永远建不了链（历史上误设 0.85 导致功能静默失效）。
- **高发问题**：此前完全不做存在性检查，每次运行重复建链 → 现已带 linkExists 守卫。

### compress.js — 芥子压缩
- **能力**：低频/低分实体归档到 `wiki/compressed/`。
- **高发问题**：曾因对象字面量内自引用 `compressedSize` 触发 TDZ ReferenceError 崩溃 → 已改为构造后再赋值。改此文件时勿把统计字段放回字面量。

### kespi-check.js / recalc-kespi.js / fix-kespi.js — KESPI 八维体系
- **能力**：八维（KQ 质量/KG 成长/KA 活跃/KM 代谢/KD 多样/KC 连接/KR 关联/KB 平衡）打分，通过线 0.65。
- **阈值红线**：综合 ≥0.65 通过，0.8 为优秀线。
- **高发问题与处置**：
  - 平均分突然归零 → 历史根因：recalc 用 `REPLACE INTO` 重写 entity_metadata 把分数抹了。现在必须用 `ON CONFLICT DO UPDATE`。
  - fix-kespi 给实体追加"关系段"后又被旧值覆盖 → 根因是局部 `const content` 未同步追加结果；改内容拼接时保证变量提升为 let 且每步追加后回写。
  - 单独重算：`node src/recalc-kespi.js`（幂等，可随时跑）。

### prune.js — 剪枝清理
- **能力**：清理长期不活跃/低质量实体；brokenLinks 现为**建议项**，不再触发剪枝。
- **高发问题**：正则必须兼容带连字符的 id（`source:\s*([\w.-]+)`），否则关系链接被误判损坏而误删。

---

## 二、基础设施

### knowledge-store.js — 数据访问层（核心）
- **能力**：sql.js 封装；UPSERT 语义的 saveEntity；Float32Array 向量编码；**原子写**（tmp+rename，崩溃不损库）。
- **铁律**：
  1. 构造后必须 `await store.init()` 才能用（db 初始为 null）。
  2. 所有写路径经 `store.run()` 自动持久化；直接拿 `store.db` 写完必须手动 `_save()`。
  3. schema 改动必须与 setup-db.js 同步（见下）。
- **高发问题**：`this.db is null` → 忘了 init；重复插入 UNIQUE 崩溃 → 用 UPSERT 不要裸 INSERT。

### setup-db.js — 建库/校验
- **能力**：`node src/setup-db.js`（建表）/ `--verify`（八表完整性检查 + 统计）。
- **高发问题**：与 knowledge-store 的 `_initTables` **schema 漂移**（历史踩坑：model 默认值不一致、漏 system_log 表）。两处表结构必须成对修改，verify 清单 8 张表：entities/links/type_index/entity_metadata/entity_embeddings/error_log/kespi_history/system_log。

### sql-migrate.js — 迁移工具
- **能力**：`migrations/*.sql` 按版本号顺序幂等应用；`--status` 查看进度；基于 sql.js（不要引入 better-sqlite3，原生编译在这台机器装不上）。
- **约定**：迁移文件命名 `001-xxx.sql`；已应用版本记在 schema_migrations 表。

### error-handler.js — 错误分级处置
- **能力**：错误码→策略（重试次数/告警/丢弃）；未知错误码返回 null → 归为 UNKNOWN_ERROR，**不重试**、留痕后放行。
- **高发问题**：getAction 别再兜底返回 500 策略——那会让未知错误被静默重试 3 次且 handle 的 UNKNOWN 分支永远不可达。改策略表时同步检查 logError 的空指针防护（error.type 兜底 getErrorType）。

### shared-spine.js — 共享脊梁（校验/门禁）
- **能力**：`compile`（raw 档 KESPI 门禁 + 标签检查，拒收进 error_log）/ `audit`（验证审计）。
- **高发问题**：目录不存在要返回空集而非崩溃；所有 `a/b` 百分比都要除零防护（显示 N/A）。

### vector-search.js — 语义检索
- **能力**：@xenova/transformers all-MiniLM-L6-v2（384 维），`env.allowRemoteModels = false` 纯本地模式，模型在 `models/Xenova/all-MiniLM-L6-v2/`。
- **环境依赖**：模型文件来自 hf-mirror.com（Node fetch 不走系统代理，直连 HuggingFace 会超时）；sharp 需 `npm install --platform=win32 --arch=x64 sharp`；transformers 安装用 `--ignore-scripts`。
- **降级**：isReady=false 时自动退关键词搜索，不会崩但语义精度下降——日志里看到 fallback 要检查模型目录。

### auto-ingest.js — 自动入库入口
- **能力**：消息→raw 档→触发 compile→import→向量链（chained，失败即断）。
- **高发问题**：kbRoot 必须相对 `__dirname` 解析（历史上硬编码路径导致换目录部署全链路失效）。

---

## 三、意识层

### sensory-ends.js — 神经末梢
- **能力**：定时**轮询** raw/ 目录快照对比（明确不是 fs.watch，Windows 上 watch 事件不可靠）+ 定时器。
- **注意**：常驻进程，后台 PowerShell 任务跨会话会死，用计划任务或常驻服务跑它。

### neural-architecture.js — 意识架构
- **能力**：组装末梢→信号→意识流；`start()/stop()` 生命周期。
- **铁律**：**先注册 `on('signal')` 再 `sensory.start()`**——start 可能同步触发首次扫描，顺序反了第一批信号全丢且无报错。

### consciousness-layer.js / metacognition-layer.js — 意识/元认知
- **能力**：consciousness 做觉察聚合；metacognition 三层循环（自我认知→批判评估→调整），CLI：`self-check / evaluate / adjust / run`。
- **高发问题**：metacognition 的 CLI 块必须包在 `if (require.main !== module)` 守卫里，否则被 require 就执行 CLI 且导不出类。

---

## 四、决策层与反馈层

### growth-director.js — 生长决策器（9 动作 + 紧急度评分）
- **能力**：综合 KESPI 趋势/停滞天数/代谢状态输出决策动作与执行序列。
- **高发问题**：stats 字段名历史上不统一（`totalEntities` vs `entities`），读取要 `??` 兜底；活跃数用 SQL COUNT 现查，别信内存计数。

### guide-chain-swarm.js — 导链蜂群（3 Agent 加权投票）
- **能力**：紧急度→Agent 编组→建议投票→共识；`--dry-run` 只看不动。
- **高发问题**：报告打印曾因字段缺失（agent/confidence undefined）输出错乱 → 统一 `String(r.agent || r.label || 'unknown')` 式兜底。

### tri-path-orchestrator.js — 三路突击
- **能力**：探索/验证/优化三路径并行 + 队正裁决 + 熔断器；`run <task> / status / 熔断 / 复位`。
- **裁决规则**：各路径取各自核心指标（探索=diversity≥0.5、验证=confidence≥0.7 且 crossCheck=passed、优化=finalScore≥0.7），**至少 2 路同意才通过**；结果反馈熔断器（连续失败 3 次开闸，`复位` 恢复）。
- **教训**：别用统一字段取分（曾 `finalScore||quality||0.5` 致 verify 恒 0.5、裁决永不通过）；单路径异常要 catch 隔离，别拖垮整个任务。

### feedback-loop.js — 反馈闭环
- **能力**：`snapshot`（系统快照）/ `--before`（代谢前后 Delta 对比）/ 自动调参建议。快照在 `snapshots/`。
- **高发问题**：加载快照必须校验必填字段（entities/kespi/links/vectors/gaps），损坏 JSON 直接崩会误导排查。

### gap-detector.js / neural-guide-chain.js / self-growth.js — 缺口检测/导链神经网/自生长
- gap：五维扫描（原创性/一致性等）；guide-chain：基于 wiki/links/index.md 找意外关联邻居（_getNeighbors 要求单行 ≥2 个 wiki-link）；self-growth：自主生长循环。

### growth.config.js — 全局阈值中枢
- **阈值红线速查**：

| 参数 | 值 | 说明 |
|---|---|---|
| kespi 通过线 | 0.65 | 低于则 prune/compress 重点关注 |
| pollinate 创意阈值 | 0.75 | **上限 0.8，超了功能静默失效** |
| verify 置信线 | 0.7 | tri-path 裁决用 |
| 熔断连续失败 | 3 次 | tri-path 开闸阈值 |

---

## 五、运维速查

- **本地 LSP 服务**（可选组件，见 tools/lsp-server.js）：端口 4317；若本机配置了 HTTP 代理，调用前必须设置 `$env:NO_PROXY="localhost,127.0.0.1"`，否则代理会拦截 localhost 致 502。TypeScript 需完整发行版（含 tsserver.js），全局 npm 安装的是阉割版，缺失时服务会回退扫描项目的 node_modules。
- **数据库损坏恢复**：库文件是单文件 knowledge.db；写路径已原子化（tmp+rename），若仍损坏从最近快照 + 重跑代谢链重建（raw→wiki→DB 全程幂等可重放）。
- **首次部署顺序**：`setup-db.js` → 放 raw 档 → `run-metabolism.js` → `setup-db.js --verify`。
- **改动守则**：动 schema 两处同步；动阈值先查公式上限；动链接写入必带双向查重；动向量编码必用 Float32Array。
