---
tags: [aing-v2, spec, 核心代谢, distill, 复制链, 保真, M1, spec:9, distill:8]
description: M1.5 distill 蒸馏 spec——pending-distillation 的 raw 实体转 active，原文逐字保真复制入 wiki 镜像（唯一允许覆盖镜像的步），幂等、不碰 last_access
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-1.1, SPEC-1.4, SPEC-0.1, INVENTORY A 行 distill]
---

# SPEC-1.5 · distill 蒸馏（复制链保真）

> import 建骨架、**不覆盖**镜像（差分是信号）；distill 相反：它是**唯一允许把 raw 原文写进 wiki 链**的步。
> 所以 distill 的判据不是一个「大致相同」，而是**逐字保真**——复制链一旦失真，双链互校就再也校不出东西。

---

## 一、目标

把 raw 链里 `status = pending-distillation` 的实体蒸馏为 `active`，同时把原文逐字复制进其 wiki 镜像，并同步元数据。

## 二、行为（spec 即契约）

### 2.1 取件
- 取 raw 链（id 不以 `wiki-` 开头）且 `status = 'pending-distillation'` 且 `invalid_at IS NULL` 的实体
- 非 pending 的 raw 实体一律不动（已蒸馏或本来 active）

### 2.2 保真复制
- 目标镜像 id = `wiki-<base>`（base 规则同 SPEC-1.4）
- 镜像不存在 → 按 SPEC-1.4 规则建骨架，再复制
- 复制内容：`name / type / content / tags / confidence` 逐字段照抄；`status` 置 `active`
- **保真校验**：写后读回，`wiki.content` 与 `raw.content` 必须**逐字相等**（含空白与换行）；不等即抛 `fidelity-violation`
- 写 `updated_at` = now；`tolaria_strength` 不碰（场域带管）

### 2.3 源侧转身
- raw 实体 `status` 改 `active`；`updated_at` = now
- **不碰** `last_access`（两侧）、`invalid_at`、`tolaria_strength`

### 2.4 幂等
- 已 active 的 raw 实体不再入选，第二趟 `distilled = 0`

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 双链同时转 active | raw 与 wiki 的 status 均 = active |
| AC-2 | 逐字保真 | wiki.content === raw.content（含多行/首尾空白样本）|
| AC-3 | 元数据同步 | name/type/tags/confidence 与源一致 |
| AC-4 | 幂等 | 第二趟 distilled=0，行数与内容不变 |
| AC-5 | 非 pending 不动 | 已 active 的 raw 实体跑后 content/updated_at 不变 |
| AC-6 | 退役源不蒸馏 | invalid_at 非空 → 跳过且不改 status |
| AC-7 | 不碰 last_access + 无物理删 | 两侧 last_access 不变；源码无 `DELETE FROM` |

## 四、Non-Goals

- 不做内容改写/摘要（蒸馏的「蒸馏」在此**只指状态转身 + 保真复制**，改写属后续期）
- 不做差分复校（2.12 reconcile）
- 不做强度升降（2.12/2.13）
- 不建边（1.6 link）

## 五、契约

- 组件 id `distill`，strand `raw`，band `background`，reads `['entities']`，writes `['entities']`，budgetTick 1，reversible true
- 入口：`async distillStep(store, opts) -> { scanned, distilled, skipped, created }`

## 六、依赖

- 上游：SPEC-1.1（实体形状）、SPEC-1.4（镜像规则）
- 消费者：1.14 编排、2.12 互校
