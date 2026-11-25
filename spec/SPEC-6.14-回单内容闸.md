---
tags: [aing-v2, spec, 回单, 内容闸, l4, 三层流层, engineering:8, must-read:7]
description: SPEC-6.14 回单内容闸——L4 基础件：膜透性三档（只过事实+指针）、发布门五条硬拦、落盘粒度硬口径；纯函数，不碰 store
date: 2026-11-18
status: 定稿
owner: hana
upstream: [docs/M6-SWARM33-三层流层归位-2026-11-18.md §四, STATUS.md §七 D17]
---

# SPEC-6.14 · 回单内容闸（L4 基础件）

> **来处**：D17 三层流层的 L4 层在 v2 是空的——`opt_tickets` 只记 `verified` 状态，回单内容毫无闸门。
> **取材**：swarm33 归位表「留」档里最值钱的三组（core §6 膜透性、combat §4 发布门、tensions T4 落盘粒度），按术语红线全部换工程词后重写。
> **定位**：**纯函数基础件**。不碰 store、不做 I/O、不改任何实体；调用方（自优化环 / 外接屏面）自己决定怎么用。

## 一、目标

让「回单」在进入外接屏之前，先过三道硬闸：**内容能过什么**（膜）、**够不够格发布**（发布门）、**落盘够不够厚**（粒度）。三者全部可判、可测、可复算。

## 二、行为（spec 即契约）

### 2.1 膜透性三档 `membrane(level, payload)`

| 档 | 放行内容 | 丢弃内容 |
|---|---|---|
| `open` | `landing`（落点摘要） | `conclusion`（结论）、`fulltext`（全文） |
| `semi` | `facts[]`、`pointers[]` | 除事实与指针外的一切，含 `conclusion`/`fulltext`/`landing` |
| `closed` | 空 | 全部 |

- 未知档位 → 抛 `unknown-membrane: <level>`（不猜、不降级默认值）。
- `semi` 档下若无 `facts` 且无 `pointers` → 返回空（拦），不返回「有结论但没事实」的壳。

### 2.2 发布门 `publishGate(record)`

回单形如 `{ facts: string[], evidence: string[], sourceGrade: 'high'|'medium'|'low', selfAssessment: string }`。

按序判，命中即拒并给原因码：

| # | 条件 | 原因码 |
|---|---|---|
| 1 | `facts` 为空 | `no-facts` |
| 2 | `evidence` 为空（无真跑证据/证据指针） | `no-evidence` |
| 3 | `sourceGrade` 不在 high/medium/low | `no-source-grade` |
| 4 | `selfAssessment` 为空 | `no-self-assessment` |
| 5 | `sourceGrade === 'low'`（弱证据不成结论） | `weak-evidence` |
| — | 全过 | `ok: true, reasons: []` |

- 一律返回 `{ ok, reasons: string[] }`，**不抛错**（发布门是判据不是异常）。
- 多条同时不满足时，`reasons` 收全部命中项，不只第一条。

### 2.3 落盘粒度 `landingGate(record)`

- `facts` 非空 **且** `pointers`（或 `evidence`）非空 → `{ ok: true }`
- 任缺一项 → `{ ok: false, reason: 'thin-payload' }`
- 口径依据：事实与证据指针缺一不可，缺任一即无法回溯。

### 2.4 组合闸 `admit(record, opts)`

`admit` = 膜 → 粒度 → 发布门，依次过；任一步不过即返回 `{ admitted: false, stage, reasons }`。
`stage` ∈ `'membrane' | 'landing' | 'publish'`，便于外接屏分阶段显示。

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 膜 open 只给落点 | 带 conclusion/fulltext 的载荷 → 输出无这两个字段，含 landing |
| AC-2 | 膜 semi 只过事实+指针 | 同上载荷 → 输出仅 facts/pointers，结论与全文不出现 |
| AC-3 | 膜 closed 零交换 | 任意载荷 → 输出为空对象 |
| AC-4 | 未知档位不猜 | `membrane('half', {})` 抛 `unknown-membrane` |
| AC-5 | 发布门五条硬拦 | 缺事实 / 缺证据 / 缺分级 / 缺自评 / 弱证据 各拒一次 |
| AC-6 | 原因码可收全 | 同时缺事实与自评 → `reasons` 含两个码 |
| AC-7 | 全过才发 | 四项齐且分级 high/medium → `ok:true` |
| AC-8 | 粒度硬口径 | 只有事实没指针 → `thin-payload` |
| AC-9 | 组合闸分阶段 | 膜拦时 `stage='membrane'`，粒度拦时 `'landing'`，发布拦时 `'publish'` |
| AC-10 | 纯函数 | 源码无 `require('../src/` store/db，无 `fs`/网络/子进程；同输入两次输出逐位相等 |

## 四、Non-Goals

- 不写入库、不改 `opt_tickets` 状态（调用方接）。
- 不做外接屏渲染（只是闸，不是屏）。
- 不判「结论内容对不对」（那是对抗审查与 omni-gate 的事）。

## 五、契约

```js
const { MEMBRANE_LEVELS, membrane, publishGate, landingGate, admit } = require('./ticket-gate.js');
membrane('semi', payload)            // -> { facts, pointers } | {}
publishGate(record)                  // -> { ok, reasons[] }
landingGate(record)                  // -> { ok, reason? }
admit(record, { membrane: 'semi' })  // -> { admitted, stage?, reasons[], payload? }
```

## 六、术语

「回单」= 外部执行方交回的结果单。实现与文档里**不得**出现 轨迹留痕 / 波次 / 主攻 / 掩护 / 场域渗透 / 派发人 / 营长 / 班长 / 单元长 —— 一律用 回单 / 批次 / 执行 / 校验 / 介质面 / 派单方 / 跟单方 / 执行点。

## 七、落地记录

- 2026-11-18 立件：`src/ticket-gate.js` + `test-6.14-ticket-gate.js`（护栏）。归位表「留」档 58 条中，本件先落 L4 的 14 条（core §6 膜 7 + combat §4 发布门 5 + tensions T4 粒度 2 的同义面）。

## 八、修订 A · 接入 `self-optimize.verifyTickets`（2026-11-18）

> 目的：让闸真正拦住东西——回单不达标就不许标 `verified`，这是自优化环「verifications 恒 0」以外的另一半：**不合格的回单现在会明确被拒，并留下原因码**。

### 8.1 回单从哪来

工单 `opt_tickets.evidence_json` 里可选带 `result`：

```json
{ "score": 0.31, "result": { "facts": [...], "pointers": [...], "evidence": [...],
  "sourceGrade": "high|medium|low", "selfAssessment": "...", "landing": "...",
  "conclusion": "...", "fulltext": "..." } }
```

### 8.2 判序

1. **有 `result` → 先过闸**（`admit(result, {membrane: opts.membrane || 'semi'})`），不过即 `rejected`，原因码形如 `gate:<stage>:<code1+code2>`，**不再看读数**。理由：「无自评不发布」是硬红线，读数上升也不能抵消。
2. 过闸（或无 `result`）→ 走原读数复核逻辑，**行为与之前完全一致**（向后兼容：不带 result 的工单不受影响）。

### 8.3 输出

`verifyTickets` 的 `out.rejected[]` 中，闸拒项额外带 `stage` 与 `reasons[]`，供外接屏分阶段显示。

### 8.4 铁律

- 闸是纯判据，不改工单以外的任何表。
- `result` 可以只带部分字段——缺哪项就由发布门给对应原因码，不补默认值。

### 8.5 护栏

`test-6.14b-verify-gate.js`：缺自评的达标读数仍被拒 → 回单齐且读数上升才 verified → 只有结论无事实被膜拦 → 不带 result 的工单行为不变（回归）→ 原因码可读。

