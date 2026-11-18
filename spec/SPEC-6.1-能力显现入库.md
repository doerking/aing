---
tags: [aing-v2, spec, 会话入库, 能力叙事, 六段, 校准, M6, spec:9, ingest:9]
description: M6.1 spec——按 AB（aing-bridge）口径把会话入库单元改成「一次能力显现」六段叙事：场景/思维/手段/编排/产出/校准，校准按 callId 归位或落会话级
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-3.13, AB/capability-narrative.js, AB/aing-bridge.js]
---

# SPEC-6.1 · 能力显现入库（六段叙事）

> 依据：`G:\AB.7z` → `AB/capability-narrative.js`（纯逻辑）与 `AB/aing-bridge.js`（壳）。
> 口径：**知识是 agent 思维的体现；入库单元 = 一次能力显现**，不是一段回复。
> 与 SPEC-3.13 的关系：三源（回复/搜索展示/事由分析）是六段的一个子集——产出=回复，思维=事由分析，
> 手段=搜索展示与工具调用。三源通道保留不动，六段是更完整的新单元。

---

## 一、目标

1. 把会话消息组织成**六段叙事**：场景 / 思维 / 手段 / 编排 / 产出 / 校准。
2. 校准事件（feedback / approval / goal / message-edit）合并进叙事：审批按 `callId` 挂到具体工具，其余落会话级。
3. 落库为一条 `Conversation` 实体，`content` 同时带**可读 markdown** 与**结构化 turns + stats**，供检索与蒸馏各取所需。

## 二、行为（spec 即契约）

### 2.1 切段（纯逻辑，不碰 store）

- `user` 消息开一个新的「能力单元」；缺 user 开头时防御性自开一个。
- `assistant` 消息按 block 类型分流：
  - `reasoning` → 思维（`reasoningMode: none` 不入；`truncated` 按 `reasoningMaxChars` 截断标 `…[截断]`）
  - `text` → 产出
  - `tool_use` / `toolCall` → 工具调用：名称命中 `subagentToolNames`（agent/task/subagent/dispatch/spawn）归**编排**，其余归**手段**
- `tool` / `tool_result` 消息 → 回填最近一个未拿到结果的工具（`result` 为 null 的那个）
- 工具参数、工具结果分别按 `toolInputMaxChars`（默认 600）/ `toolResultMaxChars`（默认 1200）截断

### 2.2 六段渲染

单 turn 渲染顺序：`场景（触发）` / `思维（能力内核）` / `手段（工具执行）` / `编排（子agent）` / `产出`；会话级校准单独一段 `会话级校准`。空段不渲染。

### 2.3 校准合并

- `type='approval'` 且带 `target.callId` → 挂到该工具行（`**审批校准**: …`）。
- 其余（feedback / goal / message-edit）→ 会话级校准段，按原类型标签渲染（反馈 / 目标变更 / 消息编辑 / 其他）。

### 2.4 落库

- `ingestNarrative(store, payload)`，`payload = {sessionId, at, topic, trigger, messages, calibrations}`。
- 实体 id `conv-<sessionId>`，`type='Conversation'`；同名已存在 → `{skipped:true}`（幂等）。
- `content` JSON 字段：`{format:'capability-narrative-v1', topic, at, trigger, markdown, turns, stats, calibrations}`。
- `tags`：`conv:9` + `src:narrative`；有校准时加 `src:calibration`。
- `messages` 缺/空 → 抛 `narrative-required`，一行不写。

### 2.5 铁律

- 不碰 `last_access` / `tolaria_strength` / `invalid_at`；无物理删。
- 组件唔直连 knowledge-store（store 注入，arch-lint C5 守）。

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 六段齐全 | 一条含 reasoning + 普通工具 + subagent 工具 + 工具结果的消息序列 → markdown 六个标题齐 |
| AC-2 | 手段/编排归位 | 普通工具进「手段」，`agent/task/...` 进「编排」；stats.subagentCalls 计对 |
| AC-3 | 截断与思维开关 | 超长参数/结果被截断并标 `…[截断]`；`reasoningMode:'none'` 时无思维段 |
| AC-4 | 校准分流 | approval 按 callId 挂到对应工具行；feedback/goal 落会话级校准段 |
| AC-5 | 落库形状 | 一条 Conversation 实体，content 含 format/markdown/turns/stats/calibrations，tags 含 `conv:9`+`src:narrative` |
| AC-6 | 幂等 + 缺料拒入 | 二次调用 skipped；无 messages 抛 `narrative-required` |
| AC-7 | 铁律 | `last_access` 不变；源码无 `DELETE FROM`；无直连 store |

## 四、Non-Goals

- 不移植 dsh 壳（`aing-bridge.js` 的 `defineMod` / `$` API）——那是宿主接口，v2 只要纯逻辑。
- 不移植 `aing-calibration.js` 的 cordis 挂载；只吸收它的**记录格式与合并规则**。
- 不改 3.13 三源通道，不改检索与蒸馏。

## 五、契约

- `buildCapabilityNarrative(messages, cfg, calibrations) -> {markdown, stats, turns}`
- `renderTurn(turn, idx) -> string`；`partitionCalibrations(calibrations, byCall, sessionLevel)`
- `ingestNarrative(store, payload) -> {ingested, id, stats} | {skipped, id}`
- 常量为导出：`DEFAULTS`、`SECTIONS`、`SUBAGENT_TOOL_NAMES`

## 六、依赖

- 上游：SPEC-3.13（三源，保留）、SPEC-1.1（实体形状）
- 来源：`G:\AB.7z` 的 `AB/capability-narrative.js`（纯函数 1:1 移植，CJS 化）与 `AB/aing-bridge.js`（只取数据契约）
- 消费者：夜间会话归档、蒸馏、检索（叙事文本进向量面）

## 七、与 AB 的差异（写清楚，不藏）

| 项 | AB 原版 | v2 本件 | 理由 |
|---|---|---|---|
| 手段与编排 | 同一段内用 `#### 手段/编排 · 名` 区分 | 拆成两个 `###` 段 | 「六段」要能数得出来，且检索按段取用 |
| 落库 | 写 `raw/inbox/dsh-<sid>.md` | 直接写 Conversation 实体（带结构化 turns） | v2 是库内实体制；不落中间文件 |
| 校准来源 | cordis 事件 → `feed.jsonl` | 调用方直接传 `calibrations` 数组 | 壳层差异；v2 不依赖 dsh 运行时 |
| 幂等水位 | `$.store` 键 | 实体存在即跳过 | 库内单一真源 |

## 八、修订 A · 接线（2026-11-18，owner 定：六段叙事是给新版定的，要接）

> 背景：本件模块与七条 AC 早已绿，但**从未接到任何真实入口**——`grep ingestNarrative` 只命中测试。owner 定：六段是新版入库单元，必须接。

### 8.1 接入点（唯一一处，CLI 自动继承）

`src/auto-ingest.js` 的 `autoIngest(store, payload)` 按**载荷形状**分流，CLI 的 `ingest`（`cli.js:52` → `autoIngest`）无需另加分支：

| 形状判据 | 路由 | 说明 |
|---|---|---|
| `payload.messages` 是非空数组 | **六段叙事**（`capability-narrative.ingestNarrative`） | 带 `calibrations` 一并传 |
| 否则 | 三源（`session-ingest`，3.13 不动） | 缺 reply 仍按 G1 拒入 |

返回值统一带 `route: 'narrative' | 'three-source'`，调用方可判读。

### 8.2 双形同号：先到先得，后到跳过

两条路径的实体号同为 `conv-<sessionId>`。同一会话先以任一种形状落库，另一形状再来一律 `{skipped:true}`——**不覆盖、不合并、不补写**（只追加铁律）。

### 8.3 身份面（承 SPEC-7.1 AC-1）

六段落库时 `name = id`（`conv-<sessionId>` 作该档序列号），`title` 由话题或正文首句派生（`conv-text.readableTopic`），**不裸露 sessionId 与时间戳**。此前 `ingestNarrative` 写 `name = 话题`、`title` 为空，本修订一并纠正。

### 8.4 铁律不变

不碰 `last_access`；无 `DELETE FROM`；组件不直连 store。

### 8.5 护栏

`test-6.1b-narrative-wiring.js`：六段走 `autoIngest` 落库（format/六段/route）→ `name=id` 且 `title` 非空无时间戳 → 同会话重复投 skipped → 三源形状仍走旧路（回归）→ 身份闸（非 hana 拒）→ 缺 messages 仍报 `narrative-required`。
