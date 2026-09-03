# aing 部署包模块手册 / Module Handbook (Ops Doc, Chinese-primary)

> 各模块功能能力方向 + 高发问题与处置。基于 2026-08 两轮全量审计（26 处已修复问题）沉淀。英文读者：标题、阈值表与铁律条目均有英文关键词，可按模块名检索；本文以中文为主。

## 总体架构与数据流

```
消息/文件 ──► auto-ingest ──► raw/*.md
                                  │ shared-spine (门禁校验)
                                  ▼
   run-metabolism 10 步代谢链：
   compile ─► import ─► link ─► link-sync ─► vector ─► sprout ─► pollinate ─► compress ─► kespi ─► prune
   (raw→wiki) (wiki→DB) (auto-link) (双脑同步) (64d向量) (关联发现) (跨域融合) (低频归档) (八维自检) (过期清理)
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        ▼                         ▼                          ▼
   意识层(感知/元认知)        决策层(director/蜂群)        反馈层(loop/gap)
```

- 数据库：`knowledge.db`（sql.js WASM SQLite，**不是** better-sqlite3）
- 知识库目录：`raw/`（原始档）→ `wiki/`（编译产物：entities/links/compressed/）
- 状态文件：`metabolism-state.json`（--resume 游标）

---

## 一、代谢链（10 步管线）

### run-metabolism.js — 管线编排器
- **能力**：按序执行 10 步；`--resume` 从上次断点续跑；`--force` 出错继续。
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

### index-vectors.js — 向量索引（默认语义）
- **能力**：默认 384 维本地语义向量（模型内置 models/，零外呼；模型缺失自动回退 64 维哈希）；`--hash` 强制哈希；`--reindex` 全量重建。model 标记区分维度（`char-ngram-hash-64` / MiniLM 384）。
- **设计变更（2026-09-03）**：原默认 64 维致「入库即建索引但语义搜索搜不到新笔记」，改为模型在即语义，保证入库即可被语义召回。
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

### shared-spine.js — 共享脊梁（校验/门禁，真实 KESPI 版）
- **能力**：`compile`（raw 档门禁：库内实体用 KespiChecker.calculateEntity 真评分，未入库实体只做结构预检标 PENDING_INGEST，不凭启发式分数拒收）/ `audit`（验证审计，含八维明细）。
- **评分铁律**：评分唯一来源 = 知识库实体 + 真 KESPI，门槛唯一来源 = growth.config（`triPath.kespiPass`，同源绑定 `kespi.yellowLight`）；不要在门禁里自建启发式打分（曾致 9/9 健康实体被误杀拒收，真分实测 0.83-0.85）。
- **高发问题**：目录不存在要返回空集而非崩溃；所有 `a/b` 百分比都要除零防护（显示 N/A）；KnowledgeStore 是直接导出类，`require('./knowledge-store')` 不可解构。

### vector-search.js — 语义检索
- **能力**：@xenova/transformers all-MiniLM-L6-v2（384 维），`env.allowRemoteModels = false` 纯本地模式，模型在 `models/Xenova/all-MiniLM-L6-v2/`。
- **环境依赖**：模型文件来自 hf-mirror.com（Node fetch 不走系统代理，直连 HuggingFace 会超时）；sharp 需 `npm install --platform=win32 --arch=x64 sharp`；transformers 安装用 `--ignore-scripts`。
- **降级**：isReady=false 时自动退关键词搜索，不会崩但语义精度下降——日志里看到 fallback 要检查模型目录。

### auto-ingest.js — 自动入库入口
- **能力**：消息→raw 档→触发 compile→import→向量链（chained，失败即断）；**内容指纹去重**（批次 SHA-1 账本落盘 `data/ingest-hashes.json`，同内容重发直接跳过）；会话 ID 入文件名前自动净化非法字符（租户前缀冒号等致 Windows ENOENT）。
- **高发问题**：kbRoot 必须相对 `__dirname` 解析（历史上硬编码路径导致换目录部署全链路失效）；被 api-server 等外部进程 require 时，批冲洗定时器需宿主自备（主模块 10s 轮询不会启动）。

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

### tri-path-orchestrator.js — 三路突击（真实评分版）
- **能力**：探索/验证/优化三路径**真实执行**（语义检索/链接佐证/KESPI 均值，无 mock）+ 队正裁决 + 熔断器；`run <task> / status / 熔断 / 复位`；`TRI_PATH_DB` 环境变量可指向副本库（影子模式）。
- **裁决规则**：各路径取各自核心指标（探索=diversity≥0.5、验证=confidence≥0.7 且 crossCheck=passed、优化=finalScore≥0.7），**至少 2 路同意才通过**；结果反馈熔断器（连续失败 5 次开闸，`复位` 恢复）。
- **阈值来源**：唯一来源 `growth.config.js` 的 `triPath` 段（`TRI_PATH_TH_*` 环境变量可覆盖；`kespiPass` 同源绑定 `kespi.yellowLight`）。
- **教训**：别用统一字段取分（曾 `finalScore||quality||0.5` 致 verify 恒 0.5、裁决永不通过）；单路径异常要 catch 隔离，别拖垮整个任务；语义模型缺失自动回退 hash 64 维，功能可用但精度降。

### feedback-loop.js — 反馈闭环
- **能力**：`snapshot`（系统快照）/ `--before`（代谢前后 Delta 对比）/ 自动调参建议。快照在 `snapshots/`。
- **高发问题**：加载快照必须校验必填字段（entities/kespi/links/vectors/gaps），损坏 JSON 直接崩会误导排查。

### gap-detector.js / neural-guide-chain.js / self-growth.js — 缺口检测/导链神经网/自生长
- gap：五维扫描（原创性/一致性等）；guide-chain：基于 wiki/links/index.md 找意外关联邻居（_getNeighbors 要求单行 ≥2 个 wiki-link）；self-growth：自主生长循环。
- **guide-chain 铁律（bug#11 教训，2026-09-03）**：routeSignals 内算出的 attentionScore 必须显式传入 _generateRecommendation（曾传原始 data 致优先级永远 low，高优先级唤醒机制从未生效）。凡「算出的字段 A 传给下游函数」的场景，传的必须是 A 本身，不是恰好包含别的字段的宿主对象。

### init-knowledge-base.js — 知识库脚手架
- **能力**：为新知识库生成目录骨架（raw/wiki/logs/pruned/src 等）+ README/AGENTS 模板 + 错误码与质量门禁参考；`--git` 可顺带初始化仓库。
- **路径铁律（2026-09-03，推送方发现）**：引擎脚本全在 `src/`，本脚本生成的一切指引必须指向 `src/compile.js`、`src/run-metabolism.js`；历史上曾生成 `scripts/` 目录并引导用户跑不存在的 `scripts/compile.js`（MODULE_NOT_FOUND）。教训：脚手架里的示例命令必须与包真实布局逐字对齐。
- **连带修复**：docs/Engineering AUTO-INGEST 与 TOLARIA-INTEGRATION（双语共 8 处）同病同修；其中 run-metabolism 不支持 `--base-dir`（只认 --force/--resume/--smart/--feedback/--step=），文档假 flag 一并清除；compile.js 的 --base-dir 为真实能力，保留。

### recycle-seeds.js — 芥子回炉（进化回路）
- **能力**：evolution-loop.md 蓝图的代码实现——芥子库达到条件后回炉再生长，形成「决策→反馈→剪枝→回炉→血统」进化闭环。
- **高发问题**：主包组件在库但未接入代谢管线（第 11 步在 OPT 侧验证中，M3 窗口 09-05 结束后评估移植），未全绿前不得在 README/汇报中声明为可用能力（绿灯解锁制）。

### growth.config.js — 全局阈值中枢
- **阈值红线速查**：

| 参数 | 值 | 说明 |
|---|---|---|
| kespi 通过线 | 0.65 | 低于则 prune/compress 重点关注；triPath.kespiPass 同源绑定此值 |
| pollinate 创意阈值 | 0.75 | **上限 0.8，超了功能静默失效** |
| verify 置信线 | 0.7 | tri-path 裁决用 |
| tri-path 三路阈值 | 0.5/0.7/0.7 | explore/verify/optimize 同意线，`TRI_PATH_TH_*` 可覆盖 |
| 熔断连续失败 | 5 次 | tri-path 开闸阈值，`TRI_PATH_CB_FAILURES` 可覆盖 |

---

## 五、常驻服务与查询

### scheduler.js — 常驻代谢调度器
- **能力**：定时代谢（默认 30 分钟，`AING_SCHEDULER_INTERVAL_MS` 可调）+ raw/ 变化触发（mtime 快照轮询，15s 间隔）+ 单实例互斥（上轮未完不叠加，结束后补跑挂起触发）+ `--once` 模式（验证/CI 用）。
- **铁律**：raw/ 检测用轮询快照，**不用 fs.watch**（Windows 上 watch 事件不可靠，sensory-ends 同款教训）。
- **日志**：`logs/scheduler.log`，代谢输出内嵌 `[metabolism]` 前缀。

### api-server.js — HTTP API 服务（零依赖）
- **端点**：`GET /health`（公开）/ `GET /api/entities` / `GET /api/entity/<id>` / `GET /api/query?q=` / `POST /api/ingest`；端口 3789（`AING_API_PORT` 可调）。
- **认证**：设 `AING_API_KEY` 后除 /health 外全部要求 `Authorization: Bearer`，且监听改 `0.0.0.0`；未设则仅监听 `127.0.0.1`（本机信任模式）。缺凭据返回 401。
- **多租户**：写入端点按 `X-Tenant-ID` 头隔离会话（缺省 default），租户前缀进会话 ID，文件名自动净化。
- **输入防护**：实体 ID 白名单字符校验（阻断路径穿越）；请求体 1MB 上限。
- **高发问题**：宿主进程必须自备会话批冲洗定时器（10s 轮询 checkAndIngest），否则消息滞留内存永不出库。

### query.js — 查询 CLI（精排版，2026-09-03）
- **能力**：`node src/query.js "关键词" [--limit N] [--names] [--slow]`——三路加权融合排序（语义 + 关键词覆盖 + 名称/ID 匹配，权重在 growth.config.js `query.fusionWeights`）+ 双路径慢回忆（候选均相似度 < `slowRecallThreshold` 或 `--slow` 时，复用 neural-guide-chain 邻居遍历二跳扩展，入池分 = 0.3×种子相似度）+ 伪精排（KESPI/新鲜度融合，替代重型 reranker）。
- **教训（影子期自捕）**：检索池只收真命中（语义/关键词/名称三路 >0），不得全库倾倒——否则慢回忆邻居永远"已在池中"，扩展恒为空。
- **待接**：origin-trust 低信任降权排序点已在代码留 TODO，等 origin_trust 列落地（见 E:\SQA\DESIGN-ORIGIN-TRUST-2026-09-03.md）。

---

## 六、运维速查

- **本地 LSP 服务**（可选组件，见 tools/lsp-server.js）：端口 4317；若本机配置了 HTTP 代理，调用前必须设置 `$env:NO_PROXY="localhost,127.0.0.1"`，否则代理会拦截 localhost 致 502。TypeScript 需完整发行版（含 tsserver.js），全局 npm 安装的是阉割版，缺失时服务会回退扫描项目的 node_modules。
- **数据库损坏恢复**：库文件是单文件 knowledge.db；写路径已原子化（tmp+rename），若仍损坏从最近快照 + 重跑代谢链重建（raw→wiki→DB 全程幂等可重放）。
- **首次部署顺序**：`setup-db.js` → 放 raw 档 → `run-metabolism.js` → `setup-db.js --verify`。
- **改动守则**：动 schema 两处同步；动阈值先查公式上限；动链接写入必带双向查重；动向量编码必用 Float32Array。
