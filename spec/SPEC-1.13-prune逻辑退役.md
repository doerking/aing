---
tags: [aing-v2, spec, 核心代谢, prune, 逻辑退役, 双铰链, M1, spec:9, must-read:8, prune:8, 双铰链:7]
description: M1.13 prune 逻辑退役 spec——不复物理删，invalid_at 打戳可逆；候选=分层到窗+无访问+无证据（SPEC-6.11 修订 A）；dry-run 默认
date: 2026-11-16
status: 定稿（已实现；2026-11-17 修订 A 切 SPEC-6.11 四件判据）
owner: ring / Hana
upstream: [SPEC-0.1, SPEC-0.4, SPEC-0.6, ARCHITECTURE.md §10]
---

# SPEC-1.13 · prune 逻辑退役（invalid_at 可逆）

> 旧院 prune 系**物理移到 archive + 可选删档**（90 天 inactivity 口径）。v2 铁律（图纸 §1.2 / 0.4 §四）：**退役=打戳，唔删档，可逆**。
> 本 spec 只管实体退役；边退役见 SPEC-1.2（retireEdge/reviveEdge）。

---

## 一、目标

把 prune 由「删除动作」改成「打 invalid_at 戳 + 可查账 + 可复活」，且候选面只喺背景带（strength ≤3），唔会误伤活跃知识。

## 二、行为（spec 即契约）

### 2.1 候选判定（只读）
- 候选 = `status='active'` AND `invalid_at IS NULL` AND `tolaria_strength <= 3` AND (`last_access IS NULL` 或 `last_access` 早于 `inactiveDays` 日)。
- `inactiveDays` 默认 90（沿用旧院口径），可由参数覆盖。
- 候选**只列出**，唔改库（dry-run 默认）。

### 2.2 退役（可逆）
- `retireEntity(store, id)`：UPDATE `invalid_at = CURRENT_TIMESTAMP`；唔删行、唔清内容。
- 已退役实体再退 → 幂等，唔报错、唔改原戳。
- 复活：`reviveEntity(store, id)`：`invalid_at = NULL`。
- **禁止**物理 DELETE —— 本步代码唔准出现 `DELETE FROM`。

### 2.3 与检索面一致
- 退役实体唔可以再被 `shouldEnterRetrieval` 认可（其边 invalid_at 仍为 NULL 时，实体本身退役不自动连带边；连边退役另步管）。
- 查账：`listRetired(store)` 返全部退役实体 id + 戳时间。

### 2.4 幂等与批量
- `pruneCycle(store, {dryRun=true, inactiveDays=90, limit})`：
  - dry-run → 返 `{ candidates: [...] }`，零写入。
  - apply（`dryRun:false`）→ 逐条 retire，返 `{ retired: [...], skipped: [...] }`。
  - 同参数连跑两趟：第二趟 `retired` 为空（已退役唔再入选）。

## 三、Acceptance Criteria

| # | 判据 | 检验 |
|---|---|---|
| AC-1 | 候选只取背景带 | 造 strength 3/5/7 三实体（均久未访问）→ 只有 3 入选 |
| AC-2 | dry-run 零写 | 跑 dry-run 后行内容逐字段不变、invalid_at 仍 NULL |
| AC-3 | 退役可逆 | retire 后 invalid_at 非空；revive 后回 NULL；内容不变 |
| AC-4 | 幂等 | 已退役再 retire 不报错；连跑两趟第二趟 retired=[] |
| AC-5 | 禁物理删 | 源码 grep `DELETE FROM` = 0；退役后行数不变 |
| AC-6 | 活跃保护 | last_access 新近（< inactiveDays）或 strength≥4 一律唔入选 |

## 四、Non-Goals

- 唔做边退役（1.2 已有 retireEdge）。
- 唔做归档目录、唔写文件。
- 唔做定时调度（属 1.14 编排）。
- 唔改 90 天默认口径嘅语义（可参数覆盖）。

## 五、依赖

- 上游：SPEC-0.1（invalid_at 列）、SPEC-0.6（三带；背景带=≤3）
- 实现：`src/prune.js`；被 `meko-orchestrator` 作为背景带步骤驱动。

---

## 六、修订 A（2026-11-17，owner 批准）

判据整体切到 **SPEC-6.11 分层留存** 的四件全中，旧「90 天＋强度≤3」作废：

1. **分层**：原稿层永不动；短料层（Conversation / Todo 等）才按时间窗退役，默认 30 天；知识层（Concept / Paper / MetaKnowledge / 未知类型）不按时间退。
2. **到窗**：`updated_at`（缺则 `created_at`）超出分层窗口。
3. **无访问**：`last_access` 与 `access_hits` 最近一次都超出窗口（近窗内命中即救回，语义同 AC-6）。
4. **无证据**：无 `strength ≥ 5` 的活边。
5. **可还原/可重建**：短料靠归档还原；本条由归档流程（SPEC-6.11 §三–§四）把关，prune 只出候选。

- 实现：`listCandidates` 委托 `src/retention.js` 的 `planRetention`（只读）；退役与物理删仍是两步，prune 本身只打 `invalid_at`，禁物理删不变。
- 旧 AC-1（strength 3/5/7）与 AC-6 的 strength 半边随之失效；测试已改为「短料层且到窗」＋「知识层不随时间退役」。
- 强度实测只有 5/8/9（无 ≤3 对象），旧判据候选恒为 0——这是切换的直接原因。
