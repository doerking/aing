---
tags: [ticket, quality, fix, kespi, consistency]
priority: P1
status: open
created: 2026-09-08
source: deep-analysis-report
---

# 工单 #003：KQ consistency 字段缺失

## 问题描述

**现状**：`kespi-check.js` 的 KQ（质量）维度计算逻辑：

```javascript
_calcKQ(entity) {
  const confidence = entity.confidence || 0;
  const consistency = entity.consistency || 0; // ← 此字段不存在
  return Math.min(1.0, (confidence * 0.6 + consistency * 0.4));
}
```

**问题**：`entities` 表无 `consistency` 列，导致 KQ 实际只计算 `confidence * 0.6`，权重失衡。

## 影响范围

- KQ 分数虚高（缺少一致性惩罚）
- 八维评估失真
- KESPI 综合分可信度下降

## 修复方案

### 方案 A：从链接一致性推导（推荐）

```javascript
_calcKQ(entity) {
  const confidence = entity.confidence || 0;
  
  // 一致性 = 共同引用比例
  const links = this.store.getLinks(entity.id);
  const commonReferences = links.filter(l => {
    const targetLinks = this.store.getLinks(l.target_id);
    return targetLinks.some(tl => tl.source_id === entity.id);
  }).length;
  const consistency = links.length > 0 ? commonReferences / links.length : 0;
  
  return Math.min(1.0, (confidence * 0.6 + consistency * 0.4));
}
```

### 方案 B：调整权重（保守）

```javascript
_calcKQ(entity) {
  const confidence = entity.confidence || 0;
  // 暂时忽略 consistency，权重调整
  return Math.min(1.0, confidence * 0.8);
}
```

### 方案 C：添加 consistency 列（完整）

```sql
ALTER TABLE entities ADD COLUMN consistency REAL DEFAULT 0.0;
```

```javascript
// compile.js 中计算一致性并写入
const consistency = this._calcConsistency(entity);
this.store.saveEntity({ ...entity, consistency });
```

## 验收标准

- [ ] KQ 分数计算逻辑正确（一致性有实际来源）
- [ ] 八维评估结果合理（无虚高）
- [ ] 添加单元测试验证 KQ 计算
- [ ] 文档更新（CONFIG-REFERENCE.md）

## 优先级

**P1** — 影响评估准确性，需修复

## 负责人

待定

## 截止日期

2026-09-22

---

*来源：deep-analysis-report（2026-09-08）*
*关联：kespi-check.js, schema.sql*
