---
tags: [aing-v2, spec, 数据迁移, 总验收, 冷备份, 零丢失, M4, spec:9, migrate:9]
description: M4 数据迁移与总验收——旧库冻结只读、迁移前冷备份字节一致、117 实体/1009 边零丢失（强度与失效期原样）、非空目标拒重迁、迁移后全量代谢首跑、旧库字节与 mtime 不动、报告可回溯
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.1, SPEC-1.14, SPEC-2.9]
---

# SPEC-4.0 · 数据迁移 + 总验收

> 迁移是整条链唯一一次「批量搬旧料」。铁律三条：旧库只读（字节与 mtime 都唔动）、
> 迁移前一定先冷备份、搬完必须用计数 + 指纹复核，唔信「应该冇问题」。

---

## 一、目标

旧库数据无损迁入 v2；迁移可证、可回溯、可拒重跑；迁移后全链首跑通过。

## 二、行为（spec 即契约）

### 2.1 冷备份（`coldBackup(sourcePath, backupDir)`）
- 读旧库字节流，写 `knowledge-<ISO>-<sha8>.db`
- 返回备份路径；备份与源字节一致

### 2.2 迁移（`migrateFrom(store, {sourcePath, force?})`）
- 目标库 `entities` 非空 → 抛 `target-not-empty`（除非 `force`）
- 实体：`id/name/type/content/tags/status/confidence/tolaria_strength/last_access/created_at/updated_at/invalid_at/invalid_reason` 原样搬
- 旧库缺列（如 v1 无 `invalid_at`）按 NULL 补，唔因缺列失败
- 边：`source_id/target_id/relation/confidence/created_at/strength/invalid_at` 原样搬
- 端点唔在两端的边计入 `droppedLinks`（正常应为 0）
- 单事务写入；任一步失败回滚
- 复核：实体与边「计数 + 排序指纹」双一致，否则抛 `migration-mismatch`

### 2.3 首跑（编排器）
- 用 `buildDefaultSteps()` 注册全 14 步，跑 1 轮（首跑显式给 `budgetMs`，唔用秒级 T_bound，避免批处理被误判超时）
- 结果 `ok=true`，`results.length ≥ 14`，落至少 1 条 `meko_cycles`

### 2.4 归档回执
- 迁移报告写 `{source:{path,sha256}, entities, links, droppedLinks, verified, archived:true}`
- 旧库字节哈希与 mtime 迁移前后一致

### 2.5 铁律
- 旧库只读：唔开写句柄、唔改文件
- 无物理 DELETE；唔碰迁移后实体的 `last_access`

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 冷备份字节一致 | 备份 SHA-256 == 源 SHA-256 |
| AC-2 | 实体零丢失 | 排序后 (id, content) 全等，计数相等 |
| AC-3 | 边零丢失 | 排序后 (source,target,strength,invalid_at) 全等 |
| AC-4 | 非空目标拒重迁 | 二次迁移抛 `target-not-empty` |
| AC-5 | 全量代谢首跑 | `ok=true` + ≥14 步 + `meko_cycles≥1` |
| AC-6 | 旧库未动 + 报告可回溯 | 源 SHA 与 mtime 不变；报告 `archived=true` |

## 四、Non-Goals

- 唔迁旧库日志表（`metabolism_log`/`error_log`/`kespi_history`）——v2 由 `meko_cycles` 重造
- 唔迁向量（旧 384 维模型 → v2 词面/强度向量）
- 唔改旧库任何一行

## 五、契约

- `coldBackup(sourcePath, backupDir) -> backupPath`
- `migrateFrom(store, {sourcePath, force?}) -> {entities, links, droppedLinks, verified, source}`
- CLI：`node tools/migrate-run.js [--source <旧库>] [--backup <目录>] [--report <文件>]`

## 六、依赖

- 上游：SPEC-0.1（schema）、SPEC-1.14（编排）、SPEC-2.9（链完整性）
- 消费者：总验收（33 项门禁 + 全库测试）
