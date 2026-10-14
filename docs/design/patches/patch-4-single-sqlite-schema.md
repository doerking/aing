# 单 SQLite 存储架构 | Single SQLite Schema

> 补现有 Wiki「Tech Stack / 技术栈」章节的实现留白。明确零外部依赖的单文件存储方案，适配丐版。

## 表空间划分

```
aing.db（单SQLite文件）
├── 图谱核心层
│   ├── entities               -- 知识实体（对应MD文件）
│   ├── links                  -- 知识关联边（双脑核心图谱）
│   └── meta_knowledge_capsule -- 元知识胶囊（芥子锚点）
├── 代谢层
│   ├── jiezi                  -- 芥子表
│   ├── pollination_log        -- 授粉记录
│   └── expiry_event           -- 过期事件表
├── 自检层
│   ├── kespi_snapshot         -- KESPI每日快照
│   └── trigger_log            -- 触发器执行日志
└── 索引层
    ├── fts5_content           -- 全文检索索引（fts5扩展）
    └── vec_index              -- 语义检索索引（sqlite-vec扩展）
```

## 丐版优化规则

| 规则 | 说明 |
|------|------|
| **索引分离** | fts5 和 vec 索引单独建表，避免主表膨胀 |
| **快照分区** | kespi_snapshot 按月份自动分区，历史快照可归档 |
| **查询限流** | 代谢任务（如授粉、再生）默认限速为每小时最多执行 5 次，避免占用过多 CPU |
| **向量降维** | sqlite-vec 使用 384 维向量（而非 1024 维），平衡检索精度和性能 |

---

*版本：v1.0 | 日期：2026-07-16*
