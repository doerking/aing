---
name: kespi-disconnect-fix-2026-11-03
type: Engineering
tags: ["kespi:9", "断线审计:9", "剪枝:8", "接线:8", "工程层:7"]
---

# KESPI 读取断线修复记录（2026-11-03）

> 对应审计：`docs/Engineering/KESPI-DISCONNECT-AUDIT-2026-11-03.md`。修复 4 处「读 KESPI 分数但 regex 同 JSON 格式脱节」+ 1 处「KESPI 趋势用错表」。

## 一、修复原则

统一令读方**能读到 KESPI 分数/趋势嘅正确数据源**，唔改写入端（`kespi-check.js`/`compile.js` 唔郁，避免 compile 重写 frontmatter 清走分数）。修法用**宽松 regex**（同时兼容 JSON 同 YAML 两种形态），因为 KESPI 分数写喺 wiki 档正文 `## KESPI 状态` JSON block（`"overall": 0.81`），而唔系 frontmatter。

## 二、改动清单

### 1. `src/prune.js:81-82` — 剪枝质量判定
- **旧**：`overall:\s*([\d.]+)`（只揾 YAML 无引号，揾唔到 JSON → `lowQuality` 永远 false → 质量剪枝形同虚设）
- **新**：`["']?overall["']?\s*:\s*([\d.]+)`（同时兼容 JSON 带引号 + YAML 无引号）
- **freshness 唔改**：`freshnessMatch` 计咗但**从未使用**（死代码），且 `dimensions` 根本冇 `freshness` key——唔郁死代码
- **kespi_status 检查唔改**：`kespi_status:\s*pending` 读嘅系 **frontmatter**（`compile.js:163` 有写 `kespi_status: pending`），无断线

### 2. `src/consciousness-layer.js:321` — 实体活力 `_getVitality`
- **旧**：`overall:\s*([\d.]+)` → 永远返 0.5 默认 → 意识层活力评估失真（连带 hotspot 热度失真）
- **新**：`["']?overall["']?\s*:\s*([\d.]+)` → 而家返真实 KESPI（0.8/0.81）

### 3. `src/neural-guide-chain.js:154` — 实体活力（同款）
- **旧**：`overall:\s*([\d.]+)` → 永远返 0.5 默认
- **新**：`["']?overall["']?\s*:\s*([\d.]+)` → 而家返真实 KESPI

### 4. `src/growth-director.js:324-346` — KESPI 趋势 `_calcKespiTrend`
- **旧**：读 `system_log`（`type='kespi_check'`）——但 `feedback-loop.js:267` 写嘅 type 係 `'feedback'`，**写读 type 对唔上**，且 `system_log` 0 条 → `previous = current`（fallback）→ **decline 永远 0** → 趋势检测失效
- **新**：改读 `kespi_history`（正确趋势真源）——按 `created_at` 分组计「轮」，取最新一轮为 current 基准、上一轮为 previous，`AVG(overall_score)` 计轮均
- `kespi_history` 实测：6 轮、85 条、每实体 4-5 次历史评分——**趋势数据完整**

## 三、验证

| 项 | 修复前 | 修复后 |
|---|---|---|
| `overall` regex（4 处共用） | 揾唔到（NULL） | 揾到 0.8/0.81 |
| 剪枝 dry-run | 「✅ 无需剪枝」（假象：揾唔到分数） | 「✅ 无需剪枝」（诚实：26 条 KESPI 0.78-0.81 高过阈值 0.5） |
| consciousness 活力 | 永远 0.5 | 0.81 / 0.8 / 0.8 |
| KESPI 趋势 | `{current:0.8, previous:0.8, decline:0}`（system_log 空 fallback） | `{current:0.8, previous:0.8, decline:0}`（由 kespi_history 6 轮真数据计） |
| 语法检查（4 文件） | — | 全 ✓ |

> **备注**：trend `decline=0` 系**诚实结果**（26 实体 KESPI 0.78-0.81 未跌过），唔係修复失效——修复前係「永远 fallback 到 0」，修复后係「由真数据计出嚟 0」。

## 四、修复后诚实边界

- 剪枝而家真系读到分数——但 26 条实体全部高过阈值 0.5，**所以而家唔剪係正确**（唔係机制失效）
- `freshness` 判定仍失效（字段名对唔上）——但属死代码（计咗唔用），唔影响剪枝
- `guide-chain-swarm.js:257` 读 `system_log` `type='decision'`（都係 type 对唔上）——**未修**（决策历史，属另一条线，留待下次）
- `feedback-loop.js` 写 `system_log` 用 `'feedback'`——**未改写入端**（避免影响现有调用方；趋势修复已改读 `kespi_history` 绕过）

## 四、追加修复：`guide-chain-swarm.js` 读错真源（2026-11-03 第二轮）

### 4. `src/guide-chain-swarm.js:253-264` — 策略 Agent 决策历史
- **旧**：读 `system_log`（`type='decision'`）——但 `feedback-loop.js:267` 写 `type='feedback'`，**写读 type 对唔上**，且 `system_log` 0 条 → 永远返空 → 策略型 Agent「多次 observe 无动作 → boost_growth」辅助判断永唔触发
- **新**：改读 `logs/metabolism-decision-lineage.jsonl`（真正决策历史真源，持久化）——最近 10 条，`{action, created_at, step, outcome}`
- **诚实边界**：真源记录嘅 `action` 係代谢步骤动作（`'execute'`/`'summarize'`），**冇 `'observe'`**——所以 `action === 'observe'` 判断（第 217 行）揾唔到（`stagnantCount=0`），如实反映，唔硬造数据。`history.length >= 5` 而家满足（10 条），辅助判断嘅「有历史」呢部分修复咗；「observe」语义部分留待 growth-director 决策持久化先真正生效

### 验证（第二轮）
| 项 | 修复前 | 修复后 |
|---|---|---|
| `_getDecisionHistory` 返回条数 | 0（永远空） | 10（lineage 36 行真数据） |
| 语法检查 | — | ✓ |

## 五、追加修复：`prune.js` 断链清理误删中文链档（2026-11-03 第三轮，破坏性 bug）

### 5. `src/prune.js:228-229` — `cleanupBrokenLinks()` 提取正则
- **旧**：`/source:\s*([\w.-]+)/`——JS `\w` = `[A-Za-z0-9_]`，**唔匹配中文**；实体 ID 含中文时（`memory-01-引言与问题`）提取成 `memory-01-` → `existsSync` 误判实体唔存在 → **`unlinkSync` 误删有效链档**
- **实测**：362 链档中 **307 个会被误删**（85%）；用正确提取重测 362/362 全有效、0 真断链
- **触发面**：CLI 默认 dry-run 保护住；`prune --force` 或 `AING_PRUNE_AUTO_FORCE=1`（代谢链 F2 开闸）即爆
- **新**：`/^source:\s*(.+?)\s*$/m` / `/^target:\s*(.+?)\s*$/m`（frontmatter 行首锚定 + 整行值 + 去尾空白/CR）——中文 ID 完整提取，实测 0/362 误删
- **前科注脚**：原注释「实体 ID 含连字符，`\w` 不够」——之前修过一次加 `.-`，漏咗中文

### 验证（第三轮）
| 项 | 修复前 | 修复后 |
|---|---|---|
| 会误删链档数 | 307 / 362 | **0 / 362** |
| 中文 ID 提取 | `memory-01-`（断半截） | `memory-01-引言与问题`（完整） |
| prune dry-run | — | ✅ 无需剪枝（正常） |
| 语法检查 | — | ✓ |
| verify-deploy | — | 🟢 ALL GREEN（32 项 @abe50c1） |

## 关联

[[kespi-disconnect-audit-2026-11-03]] · [[metabolism-pipeline]] · [[kespi-system]] · [[prune-pipeline]]
