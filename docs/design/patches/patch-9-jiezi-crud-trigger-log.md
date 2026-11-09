---
tags: [design-docs:8]
---

# 实现细节 | Jiezi CRUD & Trigger Log

> 适配丐版单 SQLite 架构，全链路可追溯，无人工介入设计，对齐双脑代谢全流程。

## 一、Trigger Log 表结构（全链路审计基石）

记录所有触发器执行痕迹，关联 KESPI 快照、代谢任务、人工操作，实现问题回溯。

### 1. 建表 SQL（SQLite 兼容）

```sql
-- 触发器执行日志表
CREATE TABLE IF NOT EXISTS trigger_log (
    -- 主键
    id TEXT PRIMARY KEY,
    -- 全链路追踪ID，关联 kespi_snapshot.trace_id / expiry_event.trace_id
    trace_id TEXT NOT NULL,
    -- 触发器类型：BEFORE(准入审查)/AFTER(后置调度)/CRON(定时任务)/MANUAL(人工操作)
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('BEFORE', 'AFTER', 'CRON', 'MANUAL')),
    -- 触发器名称：对应具体流程节点
    trigger_name TEXT NOT NULL, -- 枚举：ddd_review/germinate/auto_prune/pollinate/regenerate/kempi_snapshot
    -- 输入参数（JSON格式，存储触发时的上下文）
    input_data JSON,
    -- 输出结果（JSON格式，存储执行返回值）
    output_data JSON,
    -- 执行状态：SUCCESS/FAILED/SKIPPED
    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED')),
    -- 错误信息（仅FAILED时非空）
    error_msg TEXT,
    -- 执行耗时（毫秒，用于丐版性能监控）
    execution_time_ms INTEGER,
    -- 关联的业务实体ID（如jiezi.id/links.id/expiry_event.id）
    related_entity_id TEXT,
    -- 创建时间
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- 索引（丐版优化：仅建必要索引，避免性能损耗）
    UNIQUE(trace_id, trigger_name)
);

-- 索引优化（仅保留高频查询字段）
CREATE INDEX IF NOT EXISTS idx_trigger_log_trace_id ON trigger_log(trace_id);
CREATE INDEX IF NOT EXISTS idx_trigger_log_type_created ON trigger_log(trigger_type, created_at);
CREATE INDEX IF NOT EXISTS idx_trigger_log_related_entity ON trigger_log(related_entity_id);
```

### 2. 字段说明

| 字段 | 说明 | 关联流程 |
|------|------|---------|
| `trace_id` | 全局唯一追踪ID，贯穿整个代谢链路 | 关联 KESPI 快照、过期事件、芥子操作 |
| `trigger_type` | 触发器触发源 | BEFORE=DDD审查 / AFTER=发芽调度 / CRON=每日剪断扫描 / MANUAL=人工干预 |
| `trigger_name` | 具体流程节点标识 | 对应双脑各流程节点，如 `auto_prune` = 一周剪断流程 |
| `input_data` | 触发时的上下文参数 | 如剪断流程的 `link_id`、DDD审查的原始文本 |
| `output_data` | 执行结果 | 如DDD审查的 `claims/doubts` 列表、剪断后生成的 `jiezi_id` |
| `execution_time_ms` | 执行耗时 | 丐版性能监控，超过 1000ms 自动告警 |

### 3. 清理策略（丐版磁盘优化）

- 保留最近 3 个月的日志，超期数据自动归档到 `trigger_log_archive_YYYYMM` 表
- 归档脚本随每日 CRON 任务执行，不占用业务进程资源

---

## 二、Jiezi 表 CRUD 接口

对齐《芥子组培完整逻辑》，接口全自动执行，无需人工介入，适配丐版 Node 单进程架构。

**依赖库**：`better-sqlite3`（轻量 SQLite 客户端，丐版友好）

**前置**：Jiezi 表完整 Schema（对齐之前定义）

```sql
CREATE TABLE IF NOT EXISTS jiezi (
    -- 主键：芥子唯一ID，格式 `jz_{timestamp}_{hash}`
    id TEXT PRIMARY KEY,
    -- 关联的原有知识边ID（links表外键）
    source_link_id TEXT REFERENCES links(id) ON DELETE SET NULL,
    -- 压缩后的核心内容（≤500 tokens，丐版存储优化）
    compressed_content TEXT NOT NULL,
    -- 所属领域标签（JSON数组，用于跨域授粉匹配）
    domain_tags JSON NOT NULL,
    -- 移植就绪度（0~1，≥0.75自动亮绿灯）
    transplant_readiness REAL DEFAULT 0.3,
    -- 已再生次数（上限3次，超限进入永久归档）
    regen_count INTEGER DEFAULT 0 CHECK (regen_count <= 3),
    -- 再生冷却截止日（NULL表示无冷却）
    cooldown_until DATE,
    -- 关联的元知识胶囊ID（meta_knowledge_capsule表外键）
    capsule_id TEXT REFERENCES meta_knowledge_capsule(id),
    -- 创建时间
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- 最后更新时间
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- 索引（丐版优化）
    INDEX idx_jiezi_readiness (transplant_readiness),
    INDEX idx_jiezi_capsule (capsule_id),
    INDEX idx_jiezi_cooldown (cooldown_until)
);
```

### 1. TypeScript 类型定义

```typescript
// Jiezi 数据传输对象
export interface JieziDTO {
  id: string;
  sourceLinkId?: string;
  compressedContent: string;
  domainTags: string[];
  transplantReadiness: number;
  regenCount: number;
  cooldownUntil?: Date;
  capsuleId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Trigger Log 数据传输对象
export interface TriggerLogDTO {
  id: string;
  traceId: string;
  triggerType: 'BEFORE' | 'AFTER' | 'CRON' | 'MANUAL';
  triggerName: 'ddd_review' | 'germinate' | 'auto_prune' | 'pollinate' | 'regenerate' | 'kespi_snapshot';
  inputData?: Record<string, any>;
  outputData?: Record<string, any>;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  errorMsg?: string;
  executionTimeMs?: number;
  relatedEntityId?: string;
  createdAt: Date;
}
```

### 2. CRUD 接口实现（Node.js + better-sqlite3）

所有接口内置事务，避免数据不一致；内置阈值校验，对齐 `growth.config.ts` 配置。

#### 2.1 CreateJiezi（创建芥子，一周剪断流程调用）

```typescript
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/growth.config';

/**
 * 创建芥子（一周剪断流程调用）
 * @param params.sourceLinkId 被剪断的原知识边ID
 * @param params.compressedContent 压缩后的核心内容（≤500 tokens）
 * @param params.domainTags 领域标签
 * @param params.traceId 全链路追踪ID
 * @returns 创建的芥子ID
 */
export function createJiezi(
  db: Database.Database,
  params: {
    sourceLinkId: string;
    compressedContent: string;
    domainTags: string[];
    traceId: string;
  }
): string {
  const startTime = Date.now();
  const jieziId = `jz_${Date.now()}_${uuidv4().slice(0, 8)}`;
  
  // 匹配元知识胶囊（按领域标签命中）
  const matchCapsuleStmt = db.prepare(`
    SELECT id FROM meta_knowledge_capsule 
    WHERE json_extract(anchor_keywords, '$') LIKE ?
    LIMIT 1
  `);
  const capsule = matchCapsuleStmt.get(`%${params.domainTags[0]}%`) as { id: string } | undefined;

  // 事务：创建芥子 + 记录触发器日志
  const transaction = db.transaction((params) => {
    // 1. 创建芥子
    const insertJieziStmt = db.prepare(`
      INSERT INTO jiezi (
        id, source_link_id, compressed_content, domain_tags, 
        transplant_readiness, capsule_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertJieziStmt.run(
      jieziId,
      params.sourceLinkId,
      params.compressedContent,
      JSON.stringify(params.domainTags),
      config.jiezi.initialTransplantReadiness, // 初始值0.3，来自growth.config.ts
      capsule?.id || null
    );

    // 2. 记录触发器日志
    const insertLogStmt = db.prepare(`
      INSERT INTO trigger_log (
        id, trace_id, trigger_type, trigger_name, 
        input_data, output_data, status, execution_time_ms, related_entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertLogStmt.run(
      uuidv4(),
      params.traceId,
      'CRON',
      'auto_prune_create_jiezi',
      JSON.stringify({ sourceLinkId: params.sourceLinkId }),
      JSON.stringify({ jieziId, capsuleId: capsule?.id }),
      'SUCCESS',
      Date.now() - startTime,
      jieziId
    );
  });

  transaction(params);
  return jieziId;
}
```

**业务逻辑说明**：
- 自动匹配领域标签对应的元知识胶囊，无匹配则置空
- 初始 `transplant_readiness` 为 0.3（来自配置文件，无需硬编码）
- 自动记录全链路日志，关联 `trace_id`

#### 2.2 GetPendingJiezi（获取待评估芥子，KESPI流程调用）

```typescript
/**
 * 获取待评估芥子（KESPI每日快照调用）
 * @param limit 单次获取数量（丐版限流，默认10条）
 * @returns 待评估芥子列表
 */
export function getPendingJiezi(
  db: Database.Database,
  limit: number = 10
): JieziDTO[] {
  const stmt = db.prepare(`
    SELECT * FROM jiezi 
    WHERE transplant_readiness < ?
      AND (cooldown_until IS NULL OR cooldown_until < CURRENT_DATE)
      AND regen_count < ?
    ORDER BY created_at ASC
    LIMIT ?
  `);
  const rows = stmt.all(
    config.jiezi.transplantThreshold, // 阈值0.75，来自growth.config.ts
    config.jiezi.maxRegenCount, // 最大再生次数3，来自growth.config.ts
    limit
  ) as any[];

  return rows.map(row => ({
    ...row,
    domainTags: JSON.parse(row.domain_tags),
    cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }));
}
```

**业务逻辑说明**：
- 仅返回未达阈值、无冷却、未超再生次数的芥子
- 按创建时间升序，优先处理旧芥子
- 内置限流，避免丐版 CPU 占用过高

#### 2.3 UpdateJieziReadiness（更新移植就绪度，KESPI评估结果写入）

```typescript
/**
 * 更新芥子移植就绪度（KESPI评估后调用）
 * @param jieziId 芥子ID
 * @param readiness 新的就绪度（0~1）
 * @param traceId 全链路追踪ID
 */
export function updateJieziReadiness(
  db: Database.Database,
  jieziId: string,
  readiness: number,
  traceId: string
): void {
  const startTime = Date.now();
  
  const transaction = db.transaction((params) => {
    // 1. 更新芥子就绪度
    const updateStmt = db.prepare(`
      UPDATE jiezi 
      SET transplant_readiness = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateStmt.run(readiness, jieziId);

    // 2. 若达标，自动亮绿灯（写入有用队列，关联links表）
    if (readiness >= config.jiezi.transplantThreshold) {
      const insertLinkStmt = db.prepare(`
        INSERT INTO links (id, source, target, type, confidence, created_at)
        VALUES (?, ?, ?, 'generated', ?, CURRENT_TIMESTAMP)
      `);
      insertLinkStmt.run(
        `lk_${jieziId}`,
        `jiezi://${jieziId}`,
        `useful_queue://main`,
        readiness
      );
    }

    // 3. 记录触发器日志
    const insertLogStmt = db.prepare(`
      INSERT INTO trigger_log (
        id, trace_id, trigger_type, trigger_name,
        input_data, output_data, status, execution_time_ms, related_entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertLogStmt.run(
      uuidv4(),
      traceId,
      'AFTER',
      'kespi_update_readiness',
      JSON.stringify({ jieziId, oldReadiness: params.oldReadiness }),
      JSON.stringify({ newReadiness: readiness, isGreenLit: readiness >= config.jiezi.transplantThreshold }),
      'SUCCESS',
      Date.now() - startTime,
      jieziId
    );
  });

  // 获取旧就绪度用于日志
  const oldReadiness = db.prepare('SELECT transplant_readiness FROM jiezi WHERE id = ?').get(jieziId) as { transplant_readiness: number };
  transaction({ oldReadiness: oldReadiness.transplant_readiness });
}
```

**业务逻辑说明**：
- 就绪度达标（≥0.75）自动写入有用队列，无需人工审批
- 全链路日志可追溯就绪度变化
- 事务保证更新和亮绿灯操作的原子性

#### 2.4 UpdateJieziRegenCount（更新再生次数，再生流程调用）

```typescript
/**
 * 更新芥子再生次数（再生流程调用）
 * @param jieziId 芥子ID
 * @param traceId 全链路追踪ID
 */
export function updateJieziRegenCount(
  db: Database.Database,
  jieziId: string,
  traceId: string
): void {
  const startTime = Date.now();
  
  const transaction = db.transaction((params) => {
    // 1. 获取当前再生次数，计算冷却期
    const jiezi = db.prepare('SELECT regen_count FROM jiezi WHERE id = ?').get(jieziId) as { regen_count: number };
    const newRegenCount = jiezi.regen_count + 1;
    
    // 冷却期规则：1次→30天，2次→90天，3次→365天
    const cooldownDays = config.jiezi.cooldownRules[newRegenCount] || 365;
    const cooldownUntil = new Date();
    cooldownUntil.setDate(cooldownUntil.getDate() + cooldownDays);

    // 2. 更新再生次数和冷却期
    const updateStmt = db.prepare(`
      UPDATE jiezi 
      SET regen_count = ?, cooldown_until = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND regen_count < ?
    `);
    const result = updateStmt.run(newRegenCount, cooldownUntil.toISOString().split('T')[0], jieziId, config.jiezi.maxRegenCount);

    if (result.changes === 0) {
      throw new Error(`Jiezi ${jieziId} exceeds max regen count or not found`);
    }

    // 3. 记录触发器日志
    const insertLogStmt = db.prepare(`
      INSERT INTO trigger_log (
        id, trace_id, trigger_type, trigger_name,
        input_data, output_data, status, execution_time_ms, related_entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertLogStmt.run(
      uuidv4(),
      traceId,
      'AFTER',
      'regenerate_update_count',
      JSON.stringify({ jieziId, oldRegenCount: jiezi.regen_count }),
      JSON.stringify({ newRegenCount, cooldownUntil: cooldownUntil.toISOString().split('T')[0] }),
      'SUCCESS',
      Date.now() - startTime,
      jieziId
    );
  });

  transaction({});
}
```

**业务逻辑说明**：
- 自动按再生次数应用冷却规则，无需人工计算
- 超 3 次再生自动失败，触发错误日志
- 事务保证次数和冷却期更新的原子性

#### 2.5 DeleteExpiredJiezi（逻辑删除过期芥子，归档流程调用）

```typescript
/**
 * 逻辑删除过期芥子（归档流程调用，不物理删除，避免数据丢失）
 * @param beforeDate 删除该日期前的过期芥子
 * @param traceId 全链路追踪ID
 */
export function deleteExpiredJiezi(
  db: Database.Database,
  beforeDate: Date,
  traceId: string
): number {
  const startTime = Date.now();
  
  const transaction = db.transaction((params) => {
    // 1. 逻辑删除（设置source_link_id为null，标记归档）
    const updateStmt = db.prepare(`
      UPDATE jiezi 
      SET source_link_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE created_at < ? 
        AND regen_count >= ?
        AND transplant_readiness < ?
    `);
    const result = updateStmt.run(
      beforeDate.toISOString(),
      config.jiezi.maxRegenCount,
      config.jiezi.transplantThreshold
    );

    // 2. 记录触发器日志
    const insertLogStmt = db.prepare(`
      INSERT INTO trigger_log (
        id, trace_id, trigger_type, trigger_name,
        input_data, output_data, status, execution_time_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertLogStmt.run(
      uuidv4(),
      traceId,
      'CRON',
      'archive_expired_jiezi',
      JSON.stringify({ beforeDate: beforeDate.toISOString(), maxRegenCount: config.jiezi.maxRegenCount }),
      JSON.stringify({ deletedCount: result.changes }),
      'SUCCESS',
      Date.now() - startTime
    );

    return result.changes;
  });

  return transaction({});
}
```

**业务逻辑说明**：
- 逻辑删除而非物理删除，符合丐版数据安全要求
- 仅归档超再生次数且未达标的芥子
- 返回删除数量，用于监控归档效率

---

## 三、丐版优化注意事项

| 规则 | 说明 |
|------|------|
| **SQL 执行限制** | 所有查询添加 `LIMIT` 限制，单次操作不超过 10 条，避免 CPU 占用过高 |
| **事务使用** | 所有多表操作必须使用事务，避免数据不一致 |
| **索引优化** | 仅保留必要索引，新增索引前需评估查询频率 |
| **日志清理** | 每月自动归档 3 个月前的 `trigger_log`，避免磁盘占满 |
| **配置外置** | 所有阈值（就绪度阈值、再生次数、冷却规则）均来自 `growth.config.ts`，无需改代码 |

---

## 四、关联流程调用示例

```typescript
// 一周剪断流程示例
async function weeklyAutoPrune() {
  const db = new Database('aing.db');
  const traceId = uuidv4();
  
  try {
    // 1. 扫描7天无活动的知识边（省略扫描逻辑）
    const staleLinks = scanStaleLinks(db, 7);
    
    for (const link of staleLinks) {
      // 2. DDD审查（省略审查逻辑）
      const dddResult = await runDDDReview(link.content, traceId);
      
      if (dddResult.passed) {
        // 3. 压缩内容生成芥子
        const compressedContent = compressContent(link.content);
        const jieziId = createJiezi(db, {
          sourceLinkId: link.id,
          compressedContent,
          domainTags: extractDomainTags(compressedContent),
          traceId
        });
        
        // 4. 删除原知识边（剪断）
        deleteLink(db, link.id, traceId);
      }
    }
    
    // 5. KESPI评估待处理芥子
    const pendingJiezi = getPendingJiezi(db, 10);
    for (const jiezi of pendingJiezi) {
      const readiness = calculateTransplantReadiness(jiezi); // KESPI KA维度计算
      updateJieziReadiness(db, jiezi.id, readiness, traceId);
    }
  } finally {
    db.close();
  }
}
```

---

## 五、部署清单

### 1. 新建 Wiki 文件

路径：`wiki/Implementation/Jiezi-CRUD-and-Trigger-Log.md`

### 2. 确认 `growth.config.ts` 配置

```typescript
// growth.config.ts 示例片段
export const config = {
  jiezi: {
    initialTransplantReadiness: 0.3,
    transplantThreshold: 0.75,
    maxRegenCount: 3,
    cooldownRules: {
      1: 30,   // 第1次再生冷却30天
      2: 90,   // 第2次再生冷却90天
      3: 365   // 第3次再生冷却365天
    }
  }
};
```

### 3. 安装依赖

```bash
pnpm add better-sqlite3 uuid
```

---

*文档版本：v1.0 | 最后更新：2026-07-16 | 维护者：aing-core-team*
