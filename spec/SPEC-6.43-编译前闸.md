---
tags: [aing-v2, spec, 编译, 门槛, 完整性, 审计, shared-spine, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.43 编译前闸——旧院 shared-spine 的替代物：完整性核验默认开、质量门槛按需开、KESPI 门槛只防「低分档被更差内容覆盖」，每轮编译落审计行
date: 2026-11-19
status: 已落地（test-6.43-compile-gate 8/8）
owner: hana
upstream: [docs/COVERAGE-旧院功能面覆盖判定-2026-11-18.md, spec/SPEC-1.1-编译.md, spec/SPEC-1.12-kespi八维.md, spec/SPEC-6.42-标签白名单与存量洗消.md]
---

# SPEC-6.43 · 编译前闸

> **一句话**：旧院 shared-spine 有三件事——编译前核验、低分拒收、审计日志——v2 一件都没有。现在补一道分级闸，默认只挡「空壳与坏 id」，质量与 KESPI 两档按配置开。

## 一、口径

### 1.1 三级闸（逐级独立，L0 默认开）

| 级 | 开关 | 判据 | 理由码 |
|---|---|---|---|
| **L0 完整性** | 默认开 | 正文 trim 后为空；或 id 为空 / 含空白 | `empty-content` / `bad-id` |
| **L1 质量** | `opts.quality`（默认关） | 净化后 tags 为空；正文 < `minContent`（默认 200） | `no-tags` / `short-content` |
| **L2 KESPI** | 有分数才生效 | 实体已有 `kespi_scores.kq < minKq`（默认 0.40）且新正文**不比旧正文长** | `kespi-downgrade` |

- **L2 只防降级**：低分档被更短/等长的内容覆盖时才拒；新内容更长 = 有补充，放行。低分本身不是拒收理由——v2 的 kq 是入库后算的，编译期拿它当准入等于循环论证。
- **L1 默认关**：v2 的 compile 面向 raw 笔记，短档合法；要「生产档」才开。
- 拒收 = 该档本轮不写库（不 insert、不 update），其余档照常。

### 1.2 审计

每轮 compile 落一行 `compile_audit`：

```
scanned / created / updated / skipped / rejected
rejected_json = [{ id, reasons[], at }]
```

- 只追加、不修改。
- 拒收记录带理由码，供人工复核（旧院是 JSONL 文件，v2 入库单源）。

### 1.3 返回值

`compile()` 返回 `stats = { scanned, created, updated, skipped, rejected, tagsDropped, auditId }`。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | L0：空正文 / 坏 id 的档被拒，不写库，理由码正确 |
| AC-2 | L1 默认关：短正文、无 tags 的档照常入库（行为与 1.1 一致） |
| AC-3 | L1 开：短正文、无 tags 被拒，理由码正确 |
| AC-4 | L2：既有低分实体被更短新文覆盖 → 拒收 `kespi-downgrade`，库内旧内容不变 |
| AC-5 | L2：低分实体收到更长新文 → 放行并更新 |
| AC-6 | 审计行写入，五项计数与 `rejected_json` 一致 |
| AC-7 | 拒收不影响其他档：同轮其他档正常 created/updated |
| AC-8 | 同一批重跑：拒收档仍拒、合规档全 skipped，审计追加新行（只追加） |

## 三、边界

- 不改 compile 的解析、id 派生、类型推断；闸只决定「写不写」。
- 不改 kespi 计算；L2 只读既有分数。
- 审计表 `compile_audit` 由 schema 建（`CREATE TABLE IF NOT EXISTS`），旧库自动补。
- 真库默认行为零变化（L1 关、L2 只在有低分实体且内容变短时触发）。

## 四、仍开着的

1. KESPI 门槛的位置仍尴尬：编译期拿入库后的分做准入，是「事后闸」；更合理的位置可能是蒸馏/提升的 past 转换，待议。
2. 审计只记编译，不记手动 `reviseEntity`。
3. L1 的 200 字门槛是旧院数值，未经 v2 真库校准。
