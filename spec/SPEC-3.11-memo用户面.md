---
tags: [aing-v2, spec, memo, 用户面, 注意力, M3, spec:9, memo:9]
description: M3.11 memo 用户面 spec——以「主驾睇用户的窗」重构：recent/openLoops/patterns/plans 在前，系统细节降为一行摘要；读端纯读；空库 coldStart 诚实；唔带全文只带轻指针
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.7 §四, SPEC-3.12, SPEC-3.13, SPEC-2.10]
---

# SPEC-3.11 · memo 用户面重构

> 旧 memo = 运维仪表台：健康、派单、链路面——主驾一打开就望住系统，唔望用户。
> 新 memo = **主驾睇用户嘅窗**：以往主题、未闭环、偏好模式、预案在前；系统细节压成一行。
> 读 memo 是纯读：唔投事件、唔写简报、唔改任何表（C16）。

---

## 一、目标

`buildMemo` 输出用户面四块 + 一行系统摘要；纯读；空库诚实 coldStart。

## 二、行为（spec 即契约）

### 2.1 结构
```js
{
  user: {
    recent: [{ sessionId, at, topic, outcome }],   // 最近 N 条（默认 5）
    openLoops: [{ id, text, since }],              // 未闭环
    patterns: [{ pattern, evidenceIds, hits }],    // ≥2 次才算 pattern
    plans: [ ...预案卡（≤3） ],                     // 来自 3.12
    coldStart: boolean
  },
  systemLine: '健康 ok / 蒸馏债 0 / 场域上轮动作 2',
  agentTodos: []                                    // 内成员自用，主驾默认唔睇
}
```

### 2.2 口径
- `recent`：`type='Conversation'` 按 `created_at` 倒序取 N 条
- `openLoops`：会话正文 `outcome` 为空或 `'open'`；`text` = topic；`since` = at
- `patterns`：同 topic 出现 ≥2 次 → 一条；`hits` = 次数；`evidenceIds` = 会话 id
- `plans`：以最新 topic 为消息调 `predict`（≤3 卡）
- `systemLine`：守恒读数 + 已压籽数（active）+ 上轮 field 动作数，压成一行
- `coldStart`：无任何 Conversation 实体

### 2.3 铁律
- **纯读**：本件唔写任何表、唔投事件
- 唔带全文、唔带附件清单；只带 topic/一行指针
- 空库唔报错、唔编（coldStart=true）

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 用户面齐全 | 4 条会话 → recent=4 且字段齐 |
| AC-2 | 未闭环 | outcome 为 open/空的会话进 openLoops，text=主题 |
| AC-3 | 模式只在 ≥2 次 | 同主题 3 次 → pattern hits=3；单次主题不出现 |
| AC-4 | 预案接入 | plans 非空且 ≤3；冷启动时 1 张冷启卡 |
| AC-5 | 系统一行 | systemLine 为字符串且含健康与守恒信息 |
| AC-6 | 纯读 + 冷启动诚实 | 跑前后各表行数不变；空库 coldStart=true |

## 四、Non-Goals

- 不做渲染/排版（消费者侧）
- 不做事件投递与简报写入
- 不做派单细节（agentTodos 恒为空，主驾可按需展开）

## 五、契约

- `buildMemo(store, {limit=5, plansLimit=3}) -> memo`
- `SYSTEM_LINE_MAX = 80`

## 六、依赖

- 上游：SPEC-0.7 §四、SPEC-3.12（预案）、SPEC-3.13（会话）
- 消费者：主驾出场读端（M3 后段）

---

## 修订 A（2026-11-17）：用户面话题可读（真库形状适配）

真库读数：会话正文多为 markdown，`JSON.parse` 失败即无 `topic`，用户面直接裸露 `会话-<ISO 时间戳>`，模式（同 topic ≥2）恒空。判据不变（筛选/排序一行未动），只改读法。

- 新增 `src/conv-text.js`：`parseBody` / `firstClause` / `mdSummary` / `readableTopic` / `clip` / `compactTs`。纯函数、无 IO、无库依赖，`predict` 与 `memo` 同源（SPEC-3.12 修订 B 的读法集中到此）。
- `recent.topic`、`openLoops[].text`、`patterns[].pattern`、预案取词，统一走 `readableTopic(实体名, 正文)`。
- 话题取法：真 `topic` > 摘要段（`## 蒸馏摘要` 等）首条 > 非时间戳 `name` > 正文首句 > 压缩时间（`YYYY-MM-DD HH:MM`）> `未命名话题`。
- 首句跳过：时间戳行、结构词行、`原始资料：` 出处行、含 `session-<id>` 的 id 行、`[object Object]` 一类退化值、上一句的尾巴片段（`」…` / `→…`）；循环剥净 `【…】`、`①` 一类提炼标签。
- 截断：退到词边界与未闭合括号前，收尾不留悬空破折号；不切 ASCII 句点（版本号 `v0.3` 不被切残）。
- 测试：`test/test-3.11b-memo-readable.js` 6/6（以往主题、未闭环、JSON 主题原样、模式聚合、只读、铁律）。
