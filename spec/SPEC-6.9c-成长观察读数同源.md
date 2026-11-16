---
tags: [aing-v2, spec, KESPI, 成长观察, 读数同源, M6, spec:7]
description: M6.9c 成长观察读数同源 spec——feedback-delta 与 insight-extract 只取 kespi_source='kespi_scores' 的周期，占位读数不再进入走势与洞察
date: 2026-11-16
status: 拍板（6.9b 收口后清残留）
owner: hana
upstream: [SPEC-6.5, SPEC-6.9b]
---

# SPEC-6.9c · 成长观察读数同源

> **残留**：6.9b 给 `meko_cycles` 加了 `kespi_source`，但 `feedback-delta`（6.5）与 `insight-extract`（6.5）仍按 `rowid` 取最近周期，不区分真读数与占位。结果是：编排器在无 KESPI 时写的 `placeholder` 行会污染轮间 Delta 与洞察候选。
> 本件把这两个读者对齐到同一口径：**只用 `kespi_source='kespi_scores'` 的周期**；真读数不足时诚实报 `insufficient`，不拿占位凑数。

---

## 一、目标

1. `feedback-delta` 的「最近两轮」只从真读数周期里取。
2. `insight-extract` 的轮级序列只由真读数周期组成。
3. 真读数不足两轮 → 返回 `insufficient` / 不产洞察，不猜。
4. 不改 6.5 的四件只读契约；不碰 `kespi_scores` / `entities` / `links`。

---

## 二、行为

### 2.1 `feedback-delta.delta`

- 取数 SQL 增加 `WHERE kespi_source = 'kespi_scores'`，仍按 `rowid DESC LIMIT 2`。
- 不足 2 行 → 维持既有 `verdict:'insufficient'`，`delta.kespi=null`；`growth/pruned/ratio` 同样为 `null`（同一周期口径，不混行）。
- 计数（entities/edges）与轨迹成功率不受影响。

### 2.2 `insight-extract.extractInsights`

- 周期序列查询增加 `WHERE kespi_source = 'kespi_scores'`，仍按 `rowid ASC` 后取末 `CYCLE_WINDOW` 轮。
- 不足 2 行 → 维持既有 `{insufficient:true}`，不产候选。
- 效果值 `effect` 只由真读数相邻轮差分得出。

### 2.3 不改的

- `gap-scan` / `self-model` 不读 `meko_cycles`，不动。
- `evolution-cycle.t2Snapshot` 已用 `kespi_scores` 真均值，不动。
- 旧库历史占位行保留原样（不删、不回填）；新读者直接跳过。

---

## 三、验收（AC）

| # | 判据 | 证据面 |
|---|---|---|
| AC-1 | 真读数 0.5→0.7 + 占位 0.3：Delta = +0.2，`improving` | `feedback-delta.delta` |
| AC-2 | 仅 1 条真读数 + 占位：`insufficient`，`delta.kespi=null` | `feedback-delta.delta` |
| AC-3 | 真读数 0.5→0.7 + 占位 0.4：洞察效果 `+0.2000`，不是混算值 | `insight-extract` 候选正文 |
| AC-4 | 两文件均带 `kespi_source = 'kespi_scores'` 条件；无 `DELETE`；跑前后双链零变化 | 源码 / 表快照 |

---

## 四、非目标

- 不回填历史 `kespi_source`，不把占位行改写成真值。
- 不新增读者；`feedback-delta` / `insight-extract` 之外的模块不在本件范围。
- 不改 6.5 的阈值、窗口与洞察上限。

---

## 五、铁律

- 两件仍只读：不写 `config`、不改 DEFAULTS、不碰 `last_access`、无物理删。
- store 注入，不直连 `knowledge-store`。
