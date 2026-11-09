---
tags: [ticket, index, tracking, tickets:8]
status: active
created: 2026-09-08
---

# aing 风险修复工单索引

> 生成时间：2026-09-08  
> 来源：deep-analysis-report

---

## 风险修复（P0-P1）

| 工单 | 标题 | 优先级 | 状态 | 截止日期 |
|------|------|--------|------|----------|
| [#001](./risk-fix-001-silent-corruption.md) | 静默腐坏风险（C7 补丁层指纹） | P0 | open | 2026-09-15 |
| [#002](./risk-fix-002-concurrent-lock.md) | 并发冲突（原子锁陈旧回收） | P1 | open | 2026-09-22 |
| [#003](./quality-fix-003-kq-consistency.md) | KQ consistency 字段缺失 | P1 | open | 2026-09-22 |
| [#004](./quality-fix-004-unit-tests.md) | 单元测试覆盖 | P1 | open | 2026-09-30 |

## 功能增强（P2）

| 工单 | 标题 | 优先级 | 状态 | 截止日期 |
|------|------|--------|------|----------|
| [#005](./quality-fix-005-yaml-parser.md) | YAML 解析升级 | P2 | open | 2026-10-15 |
| [#006](./feature-006-metacognition-wiring.md) | 元认知接线（Phase 2.6） | P2 | open | 2026-10-30 |
| [#007](./feature-007-hot-reload.md) | 热重载支持 | P2 | open | 2026-10-15 |
| [#008](./feature-008-ner-integration.md) | NER 集成 | P2 | open | 2026-10-30 |

---

## 统计

- **总工单数**：8
- **P0**：1
- **P1**：3
- **P2**：4
- **风险修复**：4
- **功能增强**：4

---

## 跟进流程

1. **创建工单** → 本索引
2. **分配负责人** → 工单文件
3. **定期评审** → 每周站会
4. **关闭工单** → 验收通过 + 更新 GREEN-LIST

---

*维护：Agnes Deep Analysis Agent*
