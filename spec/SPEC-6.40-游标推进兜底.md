---
tags: [aing-v2, spec, 阈值游标, 轮次, 兜底, kq, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.40 游标推进兜底——轮次源三级优先（显式 opts.round > 代谢轮计数 > 按日推进的评分轮次），不跑代谢轮的部署游标不再永远停在 20
date: 2026-11-19
status: 已落地（test-6.40-round-fallback 8/8）
owner: hana
upstream: [spec/SPEC-6.36-阈值游标.md, spec/SPEC-6.37-阈值符号串.md, spec/SPEC-1.12-kespi八维.md]
---

# SPEC-6.40 · 游标推进兜底

> **一句话**：阈值游标原本靠代谢轮数推进，可部署环境不跑代谢轮——轮数恒 0，游标整套白搭。现在定三级轮次源，最后一档按日推进。

## 一、口径

```
round = opts.round                                   # 1. 显式传入，最优先（测试/审计重放）
      | COUNT(meko_cycles)          if > 0           # 2. 有代谢轮就用轮数（原口径不变）
      | 按日推进的评分轮次                              # 3. 兜底（原为恒 0）
```

### 1.1 兜底怎么推进

| 情形 | 结果 |
|---|---|
| 首次评分（无记录） | 写入 `config[kespi.scoreDay] = {day: 今天, round: 0}`，本轮 round = 0 |
| 同日重复评分 | round 不变，不写库（幂等） |
| 跨日首次评分 | round + 1，写回当天日期与轮次 |

- **日粒度**：同日重复计算读数一致（SPEC-1.12 幂等要求）；跨一天游标走一步。
- **UTC 日**：`new Date(now).toISOString().slice(0,10)`，可复算。
- **单点存储**：`config` 表键 `kespi.scoreDay`（`value_json = {day, round}`），不新开表。

### 1.2 优先级细节

- 显式 `opts.round` 不读库、不写库（纯重放路径）。
- 有代谢轮时**完全走轮数**，兜底计数器不推进、不读——两种源不混算。
- 兜底计数器只增不减；`meko_cycles` 后来开始出现时，轮数接管，计数器原地不动。

## 二、效果

| 部署形态 | 修前 | 修后 |
|---|---|---|
| 跑代谢轮 | round = 轮数（正常游标） | 不变 |
| 不跑代谢轮 | round 恒 0 → 段门槛恒 20 | 每天 +1 → 门槛按 20→23→22→… 游标走 |

## 三、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 无代谢轮首次评分 → round 0，config 落 `{day, round:0}` |
| AC-2 | 同日重复评分 → round 不变、config 不重写（幂等） |
| AC-3 | 跨日评分 → round +1，写入新日期 |
| AC-4 | 有 `meko_cycles` → 以轮数为准；`config[kespi.scoreDay]` 不写不推进 |
| AC-5 | 显式 `opts.round` 优先于两种库内源，且不落库 |
| AC-6 | 连续 7 天评分，round 序列 0..6 与 `sectionThreshold(entityId,{round})` 逐日一致 |
| AC-7 | 兜底不改其他行：entities / links 前后一致（读端铁律不破） |
| AC-8 | 非叙事实体 kq 不受轮次源变化影响（仍 ~0.675） |

## 四、边界

- 只改**轮次从哪来**，不改游标公式（6.36）、符号串（6.37）、段有效性（6.31）、必填段（6.39）。
- 日推进上限不设：连续 30 天 = round 30，游标照公式循环。
- 不做后台定时器——推进发生在评分调用里，谁评分谁推进。

## 五、仍开着的

1. 跨日推进依赖评分真的被调用；完全不评分也不跑代谢的部署，游标仍停在最后一次评分。
2. 若将来代谢轮从 0 变为非 0，阈值会有一次跳变（轮数接管）；是否平滑过渡未定。
