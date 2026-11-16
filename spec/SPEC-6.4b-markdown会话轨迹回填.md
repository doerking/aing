---
tags: [aing-v2, spec, 轨迹, 会话, markdown, 回填, M6, spec:7, trajectory:8]
description: M6.4b markdown 会话轨迹回填 spec——非 JSON 的 Conversation 正文按小节落 session 轨迹，139 份旧会话不再产 0 条；空正文不入，幂等不变
date: 2026-11-16
status: 拍板（实测 139→0 后补口）
owner: hana
upstream: [SPEC-6.4, SPEC-6.1, SPEC-3.13]
---

# SPEC-6.4b · markdown 会话轨迹回填

> **实测缺口**：真库 139 条 `type='Conversation'` 全是 markdown 正文（`# 会话-…` / `## 来源` / `## 内容` / `## 蒸馏摘要`），而 `buildSessionTrajectory` 只认两种 JSON 形状（6.1 六段 / 3.13 三源）。结果 `syncSessions` 全部落进 `noBody`，`task_type='session'` 轨迹为 0，`self-model` 的成功率与 `feedback-delta.trajectory()` 因此没有样本。

---

## 一、目标

1. 非 JSON（或 JSON 解析失败）的 Conversation 正文，按 markdown 小节落一条 `session` 轨迹。
2. 空正文/纯空白仍不落（`noBody` 计数保留）。
3. 两种既有 JSON 形状的派生规则与 `source` 不变。
4. 不改实体、不碰 `last_access`；只追加、同 id 跳过。

---

## 二、行为（spec 即契约）

### 2.1 判定顺序（`buildSessionTrajectory`）

1. JSON 且 `format='capability-narrative-v1'` 或 `turns` 数组 → 六段轨迹（原规则）。
2. JSON 且 `reply` 非空 → 三源轨迹（原规则）。
3. **正文不是 JSON**（`JSON.parse` 抛错）且 trim 后非空 → markdown 轨迹（本件新增）。
4. 其余 → `null`（计入 `noBody`）。

> 能解析成 JSON 但不认识的对象，不按 markdown 处理，避免把 JSON 原文当正文。

### 2.2 markdown 轨迹派生

- `id = traj-<entity.id>`（确定性，与既有会话同 id 口径）。
- `task_type='session'`、`source='session-markdown'`。
- `route = [entity.name || 首个标题 || entity.id]`。
- `step_sequence`：取 `##`–`######` 标题文本，按出现序去重；无二级以下标题则 `['正文']`。
- `success = 1`（正文非空即视为有产出）。
- `tools = []`；`duration_ms / score_soft / score_hard` 用默认值。
- `evidence = {convId, format:'markdown-conversation', bodyChars, sectionCount, sections}`。

### 2.3 不变

- 六段：`source='session-narrative'`，工具/段序/成功判据照旧。
- 三源：`source='session-three-source'`，段序/成功判据照旧。
- `syncSessions` 的 `scanned/logged/skipped/noBody` 四计数语义不变。

---

## 三、验收（AC）

| # | 判据 | 证据面 |
|---|---|---|
| AC-1 | markdown 会话落轨迹：`source=session-markdown`、`success=1`、段序=小节、证据含 `bodyChars/sections` | `task_trajectories` |
| AC-2 | 空/纯空白正文不落轨迹，`noBody` 计入 | `syncSessions` 返回 |
| AC-3 | 二次同步同 id 跳过（幂等） | `syncSessions` 返回 |
| AC-4 | 六段与三源两种 JSON 形状的 `source` 与段序不回归 | `task_trajectories` |
| AC-5 | 跑前后实体与 `last_access` 零变化；无 `DELETE`；不直连 store | 表快照 / 源码 |

---

## 四、非目标

- 不解析 markdown 正文里的工具调用（没有结构化来源，不猜）。
- 不把 JSON 原文当 markdown 回填。
- 不改 6.4 的代谢轮轨迹、查询与统计接口。
- 不清理历史 `noBody` 计数（无独立表）。

---

## 五、铁律

- 轨迹只追加，同 id 跳过；不改实体正文、不碰 `last_access`、无物理删。
- store 注入，不直连 `knowledge-store`。
