---
tags: [aing-v2, spec, distill, 蒸馏债, 镜像, 状态, engineering:6, capability:5, delivery:7, must-read:5]
description: SPEC-6.54 蒸馏镜像状态收口——distill 只把原料翻 active，镜像一直挂在 pending-distillation，蒸馏债读数虚高且镜像再无人处理
date: 2026-11-19
status: 已落地（test-6.54-distill-mirror-status 5/5）
owner: hana
upstream: [spec/SPEC-1.5-distill复制链保真.md, spec/SPEC-7.1-双链分道.md, src/distill.js]
---

# SPEC-6.54 · 蒸馏镜像状态收口

> **一句话**：`distill` 把原料（`raw-*`）翻成 `active`，却把镜像（`wiki-*`）留在 `pending-distillation`。而 `distill` 的选择集**排除** `wiki-%`——镜像从此再无人处理，`蒸馏债` 读数也永远多一条。

## 一、口径

### 1.1 改什么

`distill` 处理完一条原料后（无论镜像是否本步新建），把该镜像行：

```
UPDATE entities SET status = 'active', updated_at = ... WHERE id = 'wiki-<base>' AND status = 'pending-distillation'
```

- **只翻这一种状态**：`done` / 已 `active` / 其他一律不动（幂等靠条件本身）。
- 不改 content、不动 `last_access` / `invalid_at` / `tolaria_strength`。
- 新建镜像本来就插成 `active`，此条只管旧库里残留的 pending 镜像。

### 1.2 为什么必须做

- **读数**：`memo` 的「蒸馏债」= `status='pending-distillation'` 计数；镜像不算债，虚高会误导维护判断。
- **闭环**：镜像卡在 pending 且不在任何步骤的选择集里 → 永久挂账。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 原料与镜像双 pending → distill 后两侧都 `active`、蒸馏债 0 |
| AC-2 | 幂等：二跑状态不变、债仍 0 |
| AC-3 | 镜像已是 `done` → 不被翻成 `active`（只翻 pending-distillation）|
| AC-4 | 本步新建的镜像为 `active`（回归）|
| AC-5 | 原料侧行为不变：raw 照旧翻 `active` |

## 三、边界

- 不清理历史 pending 的**非镜像**实体（那要按实体判，不属本件）。
- 不改 `import`（骨架照旧带原状态落，由 distill 收口）。
