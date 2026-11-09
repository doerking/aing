---
tags: [design-docs:8]
---

# pending_prune 保留与清理规则

> 补现有 Wiki「代谢层」章节的留白。明确剪断后临时区的保留期限和清理策略。

## pending_prune 临时区设计

`pending_prune` 是剪断操作后的知识边缓冲区域，用于在正式归档前保留可回收窗口。

### 目录结构

```
.metabolism/
└── pending_prune/
    ├── {date}/
    │   ├── {entity_id}_links.json      # 被剪断的关联边
    │   ├── {entity_id}_content.md      # 被剪断的原始内容快照
    │   └── {entity_id}_metadata.json   # 剪断元数据（原因、时间、触发器）
    └── index.json                      # 全局索引
```

### 保留期限

| 知识类型 | 保留期限 | 说明 |
|---------|---------|------|
| 普通知识 | **30 天** | 标准保留期，到期自动进入归档 |
| 核心知识 | **90 天** | 高置信度/高频引用知识，延长保留期 |
| 矛盾知识 | **7 天** | 已被标记为矛盾的知识，快速清理 |
| 人工标记保护 | **∞** | 用户手动标记为「暂不归档」的知识 |

### 清理流程

```
每日凌晨 03:00 触发清理任务
    ↓
扫描 pending_prune/{date}/ 目录
    ↓
检查每个条目的保留期限
    ↓
超期条目 → 移入 archive/ 目录（软删除）
    ↓ archive/ 中的条目保留 365 天
    ↓ 365 天后 → 永久删除（hard delete）
    ↓
清理完成后生成清理报告 → METABOLISM_LOG.md
```

### 可回收机制

用户在保留期内可随时通过以下方式恢复被剪断的知识：

```bash
# 手动恢复指定知识边
curl -X POST http://localhost:8080/api/regenerate_expired \
  -d '{"entity_id": "some-entity", "date": "2026-07-16"}'

# 批量恢复某日期的所有知识
curl -X POST http://localhost:8080/api/regenerate_expired \
  -d '{"date": "2026-07-16", "batch": true}'
```

### 清理日志格式

```markdown
## [2026-07-16T03:00:00Z] prune_cleanup | daily cleanup
- Entries scanned: 45
- Entries archived: 12
- Entries permanently deleted: 3
- Protected entries skipped: 2
- Recovery window remaining: 18 days (for today's pruned items)
```

---

*版本：v1.0 | 日期：2026-07-16*
