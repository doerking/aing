---
name: kespi-disconnect-audit-2026-11-03
type: Engineering
tags: ["kespi:9", "断线审计:9", "剪枝:8", "接线:8", "工程层:7"]
---

# KESPI 读取断线审计（2026-11-03）

> 审计发现：aing 多处组件试图读取实体 KESPI 分数/趋势，但**读取格式或数据源同实际写入脱节**，导致「唔够靓就剪断继续循环」嘅质量判定、意识层活力、KESPI 趋势检测全部失效。本文档记录问题全貌与修复。

## 一、病根（一个）

KESPI 分数由 `src/kespi-check.js:36` 写喺 wiki 档**正文** `## KESPI 状态` JSON block：

```json
{
  "status": "computed",
  "overall": 0.8,
  "dimensions": { "KQ": 0, "KG": 1, "KA": 0.87, "KM": 1, "KD": 1, "KC": 1, "KR": 0.8, "KB": 1 }
}
```

但多个组件用 **frontmatter 风格正则**（`overall: 0.8` 无引号）去读，同 JSON 格式（`"overall": 0.8` 有引号+空格）**唔同源**。

## 二、断线清单

### A. 读 KESPI 分数但 regex 同 JSON 格式脱节

| # | 组件:行 | 用途 | 病征 |
|---|---|---|---|
| 1 | `prune.js:82` `overall:\s*([\d.]+)` | 剪枝质量判定 | 揾唔到 → `lowQuality` 永远 false → **质量剪枝形同虚设** |
| 2 | `prune.js:81` `freshness:\s*([\d.]+)` | 剪枝新鲜度判定 | `dimensions` 根本冇 `freshness` key → 判定失效（字段名对唔上） |
| 3 | `consciousness-layer.js:321` `overall:\s*([\d.]+)` | 实体活力 `_getVitality` | 永远返 0.5 默认 → 意识层活力评估失真 |
| 4 | `neural-guide-chain.js:154` `overall:\s*([\d.]+)` | 实体活力（同款） | 永远返 0.5 默认 → 神经引导链活力失真 |

**连带**：`consciousness-layer.js:81` 计算 hotspot 热度用 `_getVitality`（断线）→ 意识层热点检测 + recommendation 失真。全部实体活力=0.5、连接=25 → `heat=0.75` ≥0.6 → 26 实体全入 hotspot 无区分度。

### B. `system_log` 写读 type 对唔上

| 位 | 动作 | type |
|---|---|---|
| `feedback-loop.js:267` | **写** `system_log` | `'feedback'` |
| `growth-director.js:334` | **读**（计 KESPI 趋势） | `'kespi_check'` |
| `guide-chain-swarm.js:257` | **读**（决策历史） | `'decision'` |

三个 type 各自对唔上。加上 `system_log` 0 条（净係 feedback-loop 写，未跑过）→ 所有读呢张表嘅组件返空/默认。

### C. 用错趋势表（正确真源隔离咗）

`kespi_history` 表先係正确趋势真源——85 条，每实体 4-5 次历史评分，列 `entity_id/overall_score/created_at` 完美适合。但 `growth-director.js:324-346` `_calcKespiTrend` 用 `system_log`（空 + type 错）→ `previous = current`（fallback）→ `decline = 0` 永远 → **KESPI 趋势检测失效**（唔会因 KESPI 下降触发修复）。

### D. `guide-chain-swarm` 读错真源（策略 Agent 辅助判断失效）

`guide-chain-swarm.js:253-264` `_getDecisionHistory` 读 `system_log type='decision'` 计「近期决策」，但**三重重对唔上**：

1. **读错表**：读 `system_log`（0 条）——真正嘅决策历史喺 `logs/metabolism-decision-lineage.jsonl`（25KB，每行一个决策谱系 JSON：`step`/`action`/`target`/`outcome`/`reason`/`causalChain`）
2. **type 对唔上**：`feedback-loop.js:267` 写 `type='feedback'`，读 `type='decision'`——写读 type 对唔上
3. **语义对唔上**：`a.action === 'observe'`（第 217 行）判断——但真源记录嘅 `action` 係 `'execute'`/`'summarize'`（代谢步骤动作），**冇 `'observe'`**；`growth-director` 嘅 `decisionHistory` 净内存（`this.decisionHistory`，第 206 行，唔持久化）

**后果**：`history.length=0` 永远 → 策略型 Agent 嘅「近期多次 observe 无动作 → boost_growth」辅助判断（第 215-224 行）**永唔触发**。

> **诚实边界**：`observe` 係 `growth-director` 嘅决策动作（第 56 行 `observe`），但佢记录喺内存 `decisionHistory`（第 206 行），**唔持久化**——所以「observe 决策历史」**根本冇持久化数据源**，而唔係单纯读错表。

### E. 剪枝断链清理：`\w` 唔匹配中文 → **误删 307 个有效链档**（破坏性）

`prune.js:228-229` `cleanupBrokenLinks()` 用 `/source:\s*([\w.-]+)/` 从链档 frontmatter 提取 `source`/`target`，然后 `existsSync` 判定实体存在与否，**唔存在就 `unlinkSync` 删链档**。

**爆点**：JS `\w` = `[A-Za-z0-9_]`，**唔匹配中文字**——实体 ID 含中文时（`memory-01-引言与问题`），提取喺「引」度断，得 `memory-01-` → `existsSync(entities/memory-01-.md)=false` → **删走有效链档**。

**实测（2026-11-03）**：
- 362 个链档中 **307 个会被误删**（全部 target/source 含中文嘅档）
- 用正确正则（整行提取 `/^source:\s*(.+?)\s*$/m`）重测：**362/362 全部有效、0 真断链**——307 个全部係误删，一个都唔应该删

**触发条件**：CLI 默认 dry-run（保护住）；但 `prune --force` 或 `AING_PRUNE_AUTO_FORCE=1`（growth.config `prune.autoForce`，代谢链 F2 开闸）就会引爆。**呢个係破坏性 bug**：一次跑删 85% 链档，双脑同步（DB links 不动、FS 链档被删）后 import 回卷会造成链接面大混乱。

**前科注脚**：`prune.js:227` 原注释「实体 ID 含连字符，`\w` 不够」——之前修过一次（加咗 `.-`），但**漏咗中文**。

### F. 断线 L：`new Date(DB 时间串)` 按本地解析 → 8h 偏移（同形 P2-4/K，2026-11-03 第五轮补漏）

> K 修（api-server since）教训「同病根要全仓扫」——照做后扫出 **5 处**漏网：JS `new Date("YYYY-MM-DD HH:MM:SS")`（SQLite `datetime('now')` 空格 UTC 串）按**本地时区**解析（V8 非 ISO 格式回退本地）→ 时间轴偏移 8 小时。P2-4 修 query.js、K 修 api-server，但「JS Date 直接食 DB 时间串」呢个形**无扫过**。

| # | 位 | 用途 | 活性 |
|---|---|---|---|
| L1 | `kespi-check.js:100` `_calcKG` | KG 生长维（updated_at 时效分档 7/30/90/180 天） | **活**（11 步代谢 kespi 步） |
| L2 | `kespi-check.js:149` `_calcKM` | KM 代谢维（last_checked_at，≤24h=1.0 阈值） | **活** |
| L3 | `gap-detector.js:52` | 缺口检测「N 天未更新」 | **活**（面板聚合） |
| L4 | `kespi-check-fixed.js:128` | 孪生档同款 | **死档**（全仓 0 引用） |
| L5 | `kespi-check-fixed.js:170` | 孪生档同款 | **死档** |

**探针坐实（2026-11-03，真库）**：
- 实体 `architecture-overview` DB 原串 `"2026-11-02 12:52:03"` → V8 默认解析得 `2026-11-02T04:52:03Z`（本地），正确应 `2026-11-02T12:52:03Z`（UTC）——**偏移正好 8 小时**
- **当前库 0/26 实体跨档**（KG/KM 分档边界），属**潜伏面**非即时红——但 KM 阈值 24h 最敏感：实体 checked 后 16-24h 之间跑 kespi 就会由 1.0 误降 0.8（或反向）

**修法指針（交跨库侧）**：复用 `query.js:82` `parseDbTime()`（P2-4 已修嘅同形工具——空格 UTC 串补 `Z` 再 `new Date`），三处活位改用佢；L4/L5 孪生死档按 P1-1 先例处置（收敛或登记不修）。

**同形谱系（P2-4 → K → L）**：同一病根「SQLite 空格 UTC vs JS 时间串」至今三波：① query.js recencyScore（P2-4）② api-server /api/delta since（K）③ 本轮 `new Date(entity.updated_at/last_checked_at)` 直接食（L×5）。**教训重申：同病根要全仓扫，唔系修一处。**

### G. 断线 M：`type_index` 死索引（零功能读者，2026-11-03 第六轮）

| 项 | 值 |
|---|---|
| 事实 | `type_index` 全仓引用只有**写入维护**（`knowledge-store.js:282/285` 每次 saveEntity DELETE+INSERT OR REPLACE、`prune.js:282`/`recycle-seeds.js:124` 清引用）+ verify C10e 孤儿检查（`verify-deploy.js:371`，只当子表清点）——**零功能读者**：无任何查询用佢做 type 检索（按 type 查全部直读 `entities.type`） |
| 现况 | 26 行（与 entities 1:1，数据一致，冇脱节）——**唔係写读断线，係「在库未接管线」shape**（同 system_log I 面同款） |
| 代价 | 每次 saveEntity 白维护一轮（DELETE+INSERT），纯写开销 |
| 处置建议 | **登记不修**（纪律 2/4：唔造假读者）；将来要做「按 type 快取检索」先接线，或者决定砍表（须走 C10f 防复活流程） |

### 本轮销账（干净面）

- **DB 时间混写族**：`entities.created_at/updated_at` 全部写入位（saveEntity `datetime('now')`、api-server INSERT 表默认 `CURRENT_TIMESTAMP`、PATCH `datetime('now')`、seed-demo `${created} 10:00:00` 空格格式）——**全部空格 UTC，零混写** ✅
- **metabolism_log 契约**：写手 `metabolism-log.js:61` ↔ 读者 `metabolism-log.js:52`（kespi_after）+ `metacognition-layer.js:69`（AVG duration，DB 侧时间比较）——对得上 ✅
- **芥子管线契约**：compress 写 `mustard-seeds/compressed/index.json` ↔ recycle-seeds 读同一路径——对得上；档唔存在 ↔ memo reflowPending=0 吻合 ✅

### 附带 hardening 疑点（探针踩到）

`KnowledgeStore` **唔验 `dbPath` 类型**：传 object 时 `path.join` 阶段唔炸，到 `_save()` 先 `${this.dbPath}.tmp` 强制转字符串 → 静默写 `aing/[object Object].tmp`（90KB SQLite），rename 先 throw——垃圾档留喺 root。本探针（`new GrowthDirector({})`）已踩到并清理。**修法建议（交跨库侧）**：constructor 入口 `typeof dbPath !== 'string'` 即 throw（fail-fast），或者 `_save()` 写 tmp 前验 path 类型。

## 三、正确真源

| 数据 | 真源 | 覆盖度 | 更新机制 |
|---|---|---|---|
| KESPI 分数 | `entity_metadata.kespi_score` | **26/26 实体全部有分数**（0.78-0.81） | `kespi-check.js` 每次首评/复评 UPDATE |
| KESPI 趋势 | `kespi_history`（`entity_id/overall_score/created_at`） | 85 条，每实体 4-5 次 | 每次 kespi-check INSERT |
| 实体连接数 | `wiki/links/index.md` 同 DB `links` 表一致 | 25/实体（投喂建链密，无区分度） | auto-link/代谢 |
| 向量嵌入 | `entity_embeddings` 26 条齐 | 26/26 | index-vectors |

## 四、正确榜样（冇断线，修复应跟佢）

- `growth-director.js:327/362/365` 已正确读 `entity_metadata`（kespi_score/originality/relevance/consistency/provability）
- `feedback-loop.js:65` 读 `entity_metadata` avg_kespi——正确
- `import-from-wiki.js:59` 用 `parseFrontmatter`——正确
- `prune.js:269` 已用 `KnowledgeStore`（有 DB 访问权，修复可读 `entity_metadata`）

## 五、修复方向（见修复记录文档）

统一改读**唯一真源**：KESPI 分数读 `entity_metadata.kespi_score`，趋势读 `kespi_history`。修复逻辑另记于 `docs/Engineering/KESPI-DISCONNECT-FIX-2026-11-03.md`。

## 关联

[[metabolism-pipeline]] · [[kespi-system]] · [[prune-pipeline]] · [[architecture-overview]]
