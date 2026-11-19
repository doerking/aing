---
tags: [aing-v2, spec, 六段叙事, 覆盖率, 必填段, 能力面, kq, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.39 必填段随能力面浮动——分母不再是固定六段；场景/思维/产出恒必填，手段看工具调用、编排看子agent、校准看校准素材，无能力证据时退回六段全必填
date: 2026-11-19
status: 已落地（test-6.39-required-sections 9/9）
owner: hana
upstream: [spec/SPEC-6.30-六段覆盖率进kq.md, spec/SPEC-6.31-段有效性阈值.md, spec/SPEC-6.36-阈值游标.md, spec/SPEC-6.33-P1全寄生一轮.md]
---

# SPEC-6.39 · 必填段随能力面浮动

> **一句话**：没工具、没子agent、没校准的会话，硬要它把手段段/编排段/校准段写到 20 字，等于逼它凑数。分母改成按会话实际能力面浮动——但证据必须是系统观测到的会话事实，不是写作者自己说的。

## 一、口径

### 1.1 必填集

```
required = [场景（触发）, 思维（能力内核）, 产出]                    # 恒必填 3 段，保底
        + 手段（工具执行）   if capability.toolCalls > 0
        + 编排（子agent）    if capability.subagentCalls > 0
        + 会话级校准         if capability.calibrations > 0
```

- **保底 3 段**：恒定基线永不浮动，分母下界锁死。
- **条件段各看一路事实**：有工具调用才要手段，有子agent 才要编排，有校准素材才要校准。
- **非必填段写了不加分**（不计入分子，也不计入分母）；不写也不扣。

### 1.2 覆盖率

```
coverage = 必填段中「正文 ≥ 段有效性阈值」的段数 / 必填段数
factor   = COVERAGE_FLOOR + (1 - COVERAGE_FLOOR) × coverage      # 沿用 6.30 的 0.6 地板
```

段有效性阈值仍由 6.36 游标给出（基准 20 字 ±1..±5），本 spec 不改阈值，只改分母。

### 1.3 能力证据（防缩分母）

`capability` 只认系统观测：

| 来源 | 观测点 | source |
|---|---|---|
| 内部构建（`ingestNarrative` 非 external 分支） | `buildCapabilityNarrative` 的 `stats.toolCalls / subagentCalls` + `calibrations.length` | `session` |
| 外部 full 叙事（寄生） | 系统仍拿 `payload.messages` 扫 tool_use 块与子agent 工具名，不信 `narrative.sections` 的自述 | `messages` |
| 无 `stats.capability` 字段（手工 fixture、旧档） | 无法确认能力面 → **六段全必填** | `unknown` |

- **不知情即从严**：没有证据证明「这次真的没工具」，就按六段算。6.30/6.31 的旧读数与旧测试因此原样成立。
- **写作者改不了分母**：能力面存在 `stats.capability` 里，写回路径（`applyReturnNarrative`）只换 markdown、保留 stats，外部件无法在回单里改。

## 二、效果示例

| 会话 | 必填段 | 写 3 段全有效 | 旧口径 |
|---|---|---|---|
| 纯对话（无工具/无子agent/无校准） | 3 | coverage 1.0，factor 1.0 | 0.5，factor 0.8 |
| 有 3 次工具调用 | 4 | 3/4 = 0.75 | 0.5 |
| 有工具 + 子agent | 5 | 3/5 = 0.6 | 0.5 |
| 有工具 + 子agent + 校准 | 6 | 3/6 = 0.5 | 0.5 |

## 三、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 无工具/无子agent/无校准 → 必填 3 段，三段齐 coverage = 1（factor = 1） |
| AC-2 | 有工具调用 → 手段进必填集；只写 3 段 coverage = 3/4 |
| AC-3 | 有子agent → 编排进必填集 |
| AC-4 | 有校准素材 → 会话级校准进必填集 |
| AC-5 | 无 `stats.capability` → 六段全必填（旧 fixture 读数不变） |
| AC-6 | 内部构建入库时写下 `stats.capability`（含 toolCalls/subagentCalls/calibrations/source） |
| AC-7 | 外部 full 叙事按 `messages` 实测能力面，自述少工具不能缩分母 |
| AC-8 | 非必填段写了不加分：多写无效段不抬 coverage |
| AC-9 | 必填段正文不足阈值时按 6.31 口径不算有效（阈值不回归） |

## 四、边界

- 只改覆盖率分母，不改 kq 三项权重、不改阈值游标、不改长度口径（6.32）。
- `narrativeCoverage(markdown)` 不传 `opts.required` 时仍按六段算——纯函数面老调用无感。
- 工单 want 文案按「恒必填 + 条件必填」表述，仍保留「六段」字样（6.32 断言依赖）。

## 五、仍开着的

1. 校准素材目前取 `calibrations` 入参长度；`message-edit` / `feedback` 之外的类型是否都算，等真库分布再看。
2. 语义判官未接：必填段写齐但跑题仍能过（交接档第三项）。
3. 「能力面」只认工具/子agent/校准三路；访问事件、检索证据等是否也纳入，未开。
