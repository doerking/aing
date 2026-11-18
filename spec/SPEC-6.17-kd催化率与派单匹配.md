---
tags: [aing-v2, spec, 催化率, kd, 自优化, 场域动作, engineering:8, must-read:7, quality, delivery, operations]
description: SPEC-6.17 kd 催化率与派单匹配——镜像键封底为强边、门槛落在离散步长之间、kd 单作用域对齐 rebond 真能修的对象、rebond 不许谎报成功
date: 2026-11-18
status: 定稿
owner: hana
upstream: [spec/SPEC-6.8-自优化闭环.md, spec/SPEC-1.12-KESPI八维.md, spec/SPEC-2.12-场域维护动作.md, spec/SPEC-7.1-序列号身份与派生词发芽面.md]
---

# SPEC-6.17 · kd 催化率与派单匹配

> **来处**：真库自查发现自优化闭环 14 轮、865 次场域动作、20 张工单、**0 张 verified**。四处断裂定死后，owner 裁定先修「计量＋作用域」。
> **要修的四条，都同一句话**：**指标测的东西、动作造的东西、单子派的对象，三者不在同一件事上。**

## 一、四处断裂与对应修法

| # | 断裂 | 证据 | 修法 |
|---|---|---|---|
| ① | rebond 造的镜像键 strength=1，kd 只数 ≥7 | 真库 126 条有效氢键中 118 条 strength=1 | 带内母件的镜像键**封底 7**（§二.1） |
| ② | kd 离散步长是 1/3，门槛却是 0.40——单条出向边（0.333）被永久判死 | kd 只能取 0 / 1/3 / 2/3 / 1 | 门槛 **0.40 → 0.30**（§二.2） |
| ③ | kd 单要求「入向强边≥2」，命中的全是 wiki-/dispatch- 卡；rebond 硬过滤 `raw-*` | 8 张 kd 单 `stats.scanned=0` | 分两路：raw 缺键 → rebond；非 raw → 提案（§二.3） |
| ④ | rebond 把库层闸/主键冲突一律吞成「复键」，边没建也记账 | 真库 3 次 rebond 记账、0 条边 | 只认主键冲突，其他错误抛出；已有任何有效边即跳过（§二.4） |

## 二、修法

### 2.1 镜像键封底为强边

`rebond` 建立 `raw-* → wiki-*` 的 `hydrogen-bond` 时：

```
strength = max(7, _mapStrength(confidence))
```

**理由**：镜像键记录的是**结构事实**（派生件确实存在），不是语义强度。按 confidence 映射会让真库（confidence=0）的键全部落在 1，于是「补键」这个动作在催化率上永远不可见——不是动作无效，是指标看不见它。

### 2.2 门槛落在离散步长之间

`DIM_RULES.kd.below`：**0.40 → 0.30**。

kd = min(1, 出向强边数 / 3)，取值只能是 0、1/3、2/3、1。0.40 把 1/3 这一档判死，等于隐含要求「至少两条出向强边」——而任何单次补键动作最多造一条。门槛取 `0 < below ≤ 1/3` 才能让「一条正经结构出边」算合格；取 0.30，留出与 0 档之间的判别余量。

### 2.3 kd 单作用域分两路

`scanTickets` 对 kd 维：

- **能自愈**：实体是 `raw-*`、非未来档、有活跃 `wiki-` 孪生、该对无任何有效边 → 开 `rebond` 单（kind 仍为 `kd-low`）。
- **不能自愈**：其余低催化实体，若「入向强边 ≥2」（被引用却不向外催化）→ 开 `memo-card` 提案单（kind `kd-cited`）。
- 都不满足则不开单——**不为注定打空的对象开单**。

`dispatchTickets` 加护栏：`rebond` 目标非 `raw-*` → 直接 `rejected: out-of-scope`，不执行、不记账。

### 2.4 rebond 不许谎报

- 未来档母件（`strand='future'`）→ `skippedFuture`，不建边、不记账（库层 AC-18 硬闸本来就会 ABORT）。
- 该对已有任何有效边（如 distill 的 `derived`）→ `skippedExisting`，不覆盖、不记账（links 主键只看 `source+target`，一对只能挂一条关系）。
- `catch` 只把 `UNIQUE / PRIMARY KEY / constraint` 当主键冲突走复键；其他错误（库层闸等）**抛出**。

## 三、Acceptance Criteria

| # | 判据 | 检验 |
|---|---|---|
| AC-1 | 镜像键封底为强边 | 带内母件 confidence=0 → bond strength ≥7，`bonded=1` |
| AC-2 | 强镜像键计入 kd | 补键后该实体 kd = 1/3 |
| AC-3 | 门槛与离散步长对齐 | `0 < DIM_RULES.kd.below ≤ 1/3` |
| AC-4 | 作用域对齐 | raw + 孪生 + 缺键 → 开 `rebond` 单 |
| AC-5 | 非 raw 走提案 | 被引用不催化 → `memo-card` / kind `kd-cited` |
| AC-6 | 越界护栏 | 非 raw 的 rebond 单 → `rejected: out-of-scope`，场内零动作 |
| AC-7 | 闭环真转 | 补键 → 重算 kd 升 → 工单 `verified` |
| AC-8 | 回归 | kq/ka/kc 规则不变；候选关系边不计 kd |
| AC-9 | 未来档不建边 | `skippedFuture=1`、无链接、无场域记账 |
| AC-10 | 已有边不覆盖 | `skippedExisting=1`、关系仍为 `derived` |

## 四、Non-Goals

- 不改 kd 的分子公式（仍是「出向非候选强边数 / 3」）与 `CANDIDATE_RELATIONS` 口径。
- 不动 `proposed` 的状态机（提案 TTL 属另一条线，本件不碰）。
- 不改 kq/ka/kr/overall/kc 的任何规则。

## 五、已知边界（不在本件修）

- 真库 87 个 raw 实体**全部已有镜像边**，因此修后真库上**没有可补的键**——kd 闭环在真库上「无事可做」是正确的，不是失效。
- 提案单（ka-low / kd-cited）仍会逐轮堆积，因为 `proposed` 没有消费方与 TTL。
- kd 只数出向强边，而 v2 目前没有任何代谢步骤产出 `strength≥7` 的 `related` 边（真库那 286 条全是旧库迁移遗产）——催化率的长期口径待派生链铺开后再定。
