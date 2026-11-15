---
tags: [aing-v2, spec, 数据模型, M0, spec:9, must-read:8, dna:7]
description: M0.1 数据模型 spec——entities/links/meko_cycles 三表 DDL，三轴列内建，幂等建表，带可客观检验 acceptance criteria
date: 2026-11-13
status: draft（待 owner review）
owner: ring
upstream: [ARCHITECTURE-全架构重写图纸-DNA双铰链-从零实现-2026-11-13.md §三]
---

# SPEC-0.1 · 数据模型（aing-v2 knowledge.db）

> M0 纯设计零码。本 spec 是 source of truth，code 是 spec 结果（spec-first，工程规范 §三）。
> 三轴列（强度 tolaria_strength/strength · 时效 last_access/invalid_at · 类型 type/relation）**建表时内建**，不再走旧库 ALTER 加列轨道。

---

## 一、目标

在 `aing-v2/knowledge.db` 从零建三张表（entities / links / meko_cycles），schema 按 DNA 双铰链 + 三轴判定设计，**直接建全列**（图纸 §三），不依赖旧库迁移加列。

## 二、Schema（DDL，spec 即契约）

### 2.1 entities 表
```sql
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT,
  type TEXT,                            -- 类型专一轴：Concept/Conversation/Todo/...
  content TEXT,
  tags TEXT,                            -- JSON 数组，9 段 Tolaria 标签
  status TEXT,                          -- active/pending-distillation/retired
  confidence REAL,
  tolaria_strength INTEGER DEFAULT 5,   -- 强度轴：实体自身 9 段（9免压缩/8核心/7重要/5默认/≤3弱）
  last_access DATETIME,                 -- 时效轴：检索命中写，compile 永不碰
  created_at DATETIME,
  updated_at DATETIME,
  invalid_at DATETIME                   -- 逻辑退役戳（可逆，非物理删）
);
```

### 2.2 links 表
```sql
CREATE TABLE IF NOT EXISTS links (
  source_id TEXT,
  target_id TEXT,
  relation TEXT,                        -- 类型专一轴：边类型
  confidence REAL,
  strength INTEGER DEFAULT 5,           -- 强度轴：边 9 段（confidence→段位：0.8+→8 / 0.6-0.79→7 / 0.4-0.59→5 / 0.3-0.39→3）
  invalid_at DATETIME,                  -- 时效轴：逻辑退役
  created_at DATETIME,
  PRIMARY KEY (source_id, target_id)
);
```

### 2.3 meko_cycles 表（新增，旧库无）
```sql
CREATE TABLE IF NOT EXISTS meko_cycles (
  id TEXT PRIMARY KEY,
  cycle_type TEXT,              -- 解旋/复制/再螺旋/互校
  helix_strand TEXT,            -- raw/wiki/both
  scheduled_at DATETIME,        -- 星闪确定性时延上界
  executed_at DATETIME,
  status TEXT,                  -- scheduled/executed/failed
  kespi_snapshot REAL           -- 通感一体：编排同时探测拓扑健康
);
```

### 2.4 修订 A（2026-11-16）：派生表
向量、KESPI、压缩籽需要各自的落点，不塞入 entities 列（避免主表膨胀与写放大）：

```sql
CREATE TABLE IF NOT EXISTS entity_vectors (
  entity_id TEXT PRIMARY KEY,
  dim INTEGER,
  model TEXT,             -- hash-64（无外部模型依赖）
  vector TEXT,            -- JSON 数组
  checksum TEXT,          -- 源内容指纹，变化才重建
  updated_at DATETIME
);
```

links 表补 `evidence TEXT`（JSON：候选边证据列表，1.9/1.10 用；修订 B，2026-11-16）。

修订 C（2026-11-16）：另立 `compressed_seeds`（1.11）与 `kespi_scores`（1.12）两表，均以 `entity_id` 为主键、均不反写 `entities`：

```sql
CREATE TABLE IF NOT EXISTS compressed_seeds (
  entity_id TEXT PRIMARY KEY,
  content_hash TEXT,
  last_access_at DATETIME,
  active INTEGER DEFAULT 1,      -- 1=已压缩为籽；0=被重新访问，已解压
  recycled INTEGER DEFAULT 0,    -- 1=已回炉（每粒只回炉一次，修订 D）
  compressed_at DATETIME
);
CREATE TABLE IF NOT EXISTS kespi_scores (
  entity_id TEXT PRIMARY KEY,
  kq REAL, kg REAL, ka REAL, km REAL,
  kd REAL, kc REAL, kr REAL, kb REAL,
  overall REAL,
  computed_at DATETIME
);
修订 E（2026-11-16）：`meko_cycles` 补三列度量，供守恒闸（2.10）与 T2 轮尾度量落盘（I9）；

```sql
-- meko_cycles 补列
growth INTEGER,                 -- 本窗口发芽/授粉产出数
pruned INTEGER,                 -- 本窗口退场数
conservation_ratio REAL         -- growth/pruned（pruned=0 时见 SPEC-2.10 §2.1）
```

修订 F（2026-11-16）：`links` 与 `entities` 各补 `invalid_reason TEXT`——退役须可辨识、可撤销（2.11/2.12），
唔可以靠猜边点解退役；原因码只写枚举值（`hub-trim` / `admission` / `prune`）。

修订 G（2026-11-16）：另立 `field_actions` 动作账（2.12/2.13）——每次场域动作留前像/后像与周期号，
`reversed_at` 非空即已撤销；账本只增，唔物理删（T1 复核与 I3 全可逆的凭据）。

```sql
CREATE TABLE IF NOT EXISTS field_actions (
  id TEXT PRIMARY KEY,
  action TEXT,                  -- rebond/unwind/reconcile/demote/promote
  target TEXT,
  before_json TEXT,
  after_json TEXT,
  cycle_id TEXT,
  reversible INTEGER DEFAULT 1,
  reversed_at DATETIME,
  created_at DATETIME
);
```

修订 H（2026-11-16）：另立 `genes` 表（2.15/2.16）——进化团 gene 的生老病死落点；
`lineage` 存回滚指针（前像 JSON），`archived_at` 非空即可经 rollback 复原。

```sql
CREATE TABLE IF NOT EXISTS genes (
  id TEXT PRIMARY KEY,
  name TEXT, score REAL DEFAULT 0.5,
  uses INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, failures INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  lineage TEXT,
  created_at DATETIME, updated_at DATETIME, archived_at DATETIME
);
```

修订 I（2026-11-16）：另立 `gate_records`（闸东三闸留痕，2.16）与 `approval_queue`（W2 审批队列，2.16）；
两表只增不改业务表，`gate_records` 是 I8「无闸记录 promote 必拒」的凭据。

```sql
CREATE TABLE IF NOT EXISTS gate_records (
  id TEXT PRIMARY KEY, subject TEXT, kind TEXT, passed INTEGER DEFAULT 0,
  gates_json TEXT, evidence_json TEXT, baseline_json TEXT, cycle_id TEXT, created_at DATETIME
);
CREATE TABLE IF NOT EXISTS approval_queue (
  id TEXT PRIMARY KEY, kind TEXT, payload_json TEXT, reason TEXT,
  status TEXT DEFAULT 'pending', created_at DATETIME, decided_at DATETIME
);
```

修订 J（2026-11-16）：另立 `kernel_state`（意识层内核单行状态，3.1）与 `config`（离散旋钮单源，3.4）；
`kernel_state` 的 `stagnation_count` 只有 `recordCycleResult` 一个写者（原院教训 C16/C17）。

```sql
CREATE TABLE IF NOT EXISTS kernel_state (
  id TEXT PRIMARY KEY, state TEXT, attention REAL,
  stagnation_count INTEGER DEFAULT 0, breaker_json TEXT, last_cycle_id TEXT, updated_at DATETIME
);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value_json TEXT, updated_at DATETIME);
```

## 三、Acceptance Criteria（可客观检验，非主观词）

| # | 判据 | 检验方式（隔离假院真跑） |
|---|---|---|
| AC-1 | 三表建成 | 隔离假院跑建表 → `sqlite_master` 查得 `entities`/`links`/`meko_cycles` 三行 |
| AC-2 | 幂等复跑不炸 | 同假院连跑建表 2 趟 → 第 2 趟 exit 0、无异常、表结构与第 1 趟逐列一致 |
| AC-3 | 三轴列在位 | `PRAGMA table_info(entities)` 含 `tolaria_strength`/`last_access`/`invalid_at`；`PRAGMA table_info(links)` 含 `strength`/`invalid_at` |
| AC-4 | 默认值正确 | 插一行 entities 不传 `tolaria_strength` → 读回 = 5；插一行 links 不传 `strength` → 读回 = 5 |
| AC-5 | 主键约束生效 | links 插 (A,B) 后再插 (A,B) → 抛约束冲突（PRIMARY KEY 生效） |
| AC-6 | FK 完整性（对齐 C10e） | `PRAGMA foreign_keys` 落盘后仍 ON；links.source_id 指向不存在实体时按门禁口径处理 |

## 四、Non-Goals（明确不做）

- **不做旧库迁移**——迁移是 M4 的事（任务 4.3/4.4），本 spec 只管新库从零建。
- **不做 ALTER 加列兼容**——旧库走 ALTER 是历史包袱，新库直接建全列。
- **不做查询/索引优化**——索引与查询属 M1（任务 1.1 实现 + 1.6 三轴 link），本 spec 只锁表结构。
- **不碰旧 aing/**——旧库重写期冻结只读，本 spec 不动它。

## 五、决策默认值（内置，owner 可改）

| 项 | 默认值 | 理由 |
|---|---|---|
| strength→段位映射 | 0.8+→8 / 0.6-0.79→7 / 0.4-0.59→5 / 0.3-0.39→3 | 承图纸 §三.3.2，confidence 连续值→9段离散 |
| tolaria_strength 默认 | 5 | 中段默认，弱实体不误抬 |
| invalid_at 语义 | NULL=有效，非 NULL=逻辑退役 | 可逆（物理 DELETE 改打戳） |

## 六、依赖

- **被依赖**：0.2 meko 接口 spec、0.3 星闪协议 spec、0.4 三轴判定 spec、M1 任务 1.1（knowledge-store.js 实现）
- **上游**：图纸 §三（数据模型）+ 全景图 §三（加列哲学，此处改为建全列）

---

> **M0 门**：四份 spec（0.1/0.2/0.3/0.4）齐 + owner 拍板 → 开 M1 failing test 先行。