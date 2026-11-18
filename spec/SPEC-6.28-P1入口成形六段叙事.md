---
tags: [aing-v2, spec, 六段叙事, 入口成形, P1, 寄生位, 入库, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.28 P1 入口成形位接入六段叙事——外部件可半寄生只给标题标签，或寄生交出完整六段；系统只验不重写，缺段空段整件退回
date: 2026-11-19
status: 已落地（test-6.28-p1-narrative 7/7）
owner: hana
upstream: [spec/SPEC-6.01-能力显现入库.md, spec/SPEC-6.18-提案单需求定义与寄生位.md, spec/SPEC-6.19-寄生位注册表与取单口.md]
---

# SPEC-6.28 · P1 入口成形位：六段叙事

> **一句话**：六段叙事的渲染器早就有了，但 P1 位只在注册表里躺着——外部件给的高质量叙事进不来。本轮把它接上：给多少用多少，缺件整件退回。

## 一、两种形态

| 形态 | 外部件给什么 | 系统做什么 |
|---|---|---|
| `semi` | 标题 + 标签（至少之一） | 六段仍由系统从 messages 渲染；标题用外部的，标签并入 |
| `full` | 完整六段 `sections` | **只渲染与校验，不重写**；turns 为空 |

六段固定键：`场景（触发）/ 思维（能力内核）/ 手段（工具执行）/ 编排（子agent）/ 产出 / 会话级校准`。

## 二、校验（`validateNarrative`）

- `mode` 必须 `semi` / `full`，否则 `bad-mode`。
- `full`：缺键 → `missing-section:<键>`；空串 → `empty-section:<键>`；一个都不许缺。
- `semi`：标题与标签都空 → `nothing-provided`（宁可不接，别收白单）。
- 校验失败 → `narrative-invalid: <原因>`，**整件退回，不半截落库**。

## 三、可追溯

入库 content JSON 多一段（仅外部件介入时）：

```json
"narrative": { "mode": "full", "slot": "P1", "provided": true }
```

没有外部件时该字段不存在——「系统自拼」与「外部件给的」在库层面可区分。

## 四、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | semi：外部标题生效、标签合并、六段仍系统拼 |
| AC-2 | full：六段照收、系统不重写（段数=6） |
| AC-3 | full 缺/空段 → 拒入，且不落库 |
| AC-4 | 非法 mode → 拒 |
| AC-5 | 校验器可单独调用（外部件自查同口径） |
| AC-6 | 无外部件时旧行为不变，不记 narrative 形态 |

## 五、边界

- 外部件仍不写库：它只交 `narrative` 对象，写入由 `ingestNarrative` 做。
- `full` 不生成结构化 `turns`——外部件只负责叙事，轨迹仍由消息链算；这是有意的分工，避免两套轨迹打架。
- 不改 `buildCapabilityNarrative` 的渲染口径。

## 六、仍开着的

1. P1 目前由调用方（`auto-ingest` 的 payload）注入，还没有「注册—取单」的自动化：外部件要先被调用，而不是自己认领。
2. 外部件给的质量没有评分：只验形状，不判好坏。质量评估要落到 KESPI 的 kq（正文质量）上，是下一层的事。
