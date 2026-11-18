---
tags: [aing-v2, spec, 寄生, 半寄生, 端到端, 回单, 验收判据, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.24 P2 半寄生端到端——取单→回单→系统写回→按需求判→上屏，四道口闭合；锁边界：外部件只产回单不写库
date: 2026-11-19
status: 已落地（test-6.24-parasite-e2e 6/6；真库副本跑通一轮）
owner: hana
upstream: [spec/SPEC-6.18-提案单需求定义与寄生位.md, spec/SPEC-6.19-寄生位注册表与取单口.md, spec/SPEC-6.20-需求穿透-回单按需求判.md, spec/SPEC-6.23-回单屏分两种失效.md]
---

# SPEC-6.24 · P2 半寄生端到端

> **一句话**：6.18–6.23 每件单独绿，不等于串起来能跑。本轮用一份外部件注册把整条链走一遍：取单 → 回单 → 系统写回 → 按需求判 → 上屏。

## 一、链路

```
scanTickets        系统发现 kq<0.50 → 提案单（带 demand：slot=P2, mode=semi）
dispatchTickets    → status=proposed
claimable(reg)     外部件注册 {P2, semi, 四样证据} → 只取 P2 单
externalPart       读单 + 读原料 → 产回单（不写库）
applyReturn        系统按 P2 写回点落库：补正文、并标签、写 result
kespiStep          重算读数
verifyTickets      内容闸 → checkAcceptance → verified / acceptance-failed
boardOf            上屏（已收单节）
```

## 二、边界（本轮真正锁住的东西）

- **外部件只产回单**：`externalPart(db, claim)` 只 SELECT，测试在调用前后比对 `entities` 与 `opt_tickets` 全表快照，必须一字不差。
- **写入只走系统**：`applyReturn(store, claim, ret)` 是唯一写点，按 P2 的 `writeBack` 执行。
- **回单缺件先被内容闸拦**：缺自评的整批回单在 `gate:publish` 就被拒，轮不到判据兜底。

## 三、真库副本结果（2026-11-19）

副本：`data/knowledge.db` 的拷贝（真库未动）。

| 项 | 读数 |
|---|---|
| 轮次 / 待蒸馏 / kq<0.5 实体 | 14 / 2 / 56 |
| 扫单 | 200 上限下创建 56 张 kq-low 提案单（此前 20 上限时全被 kd/ka 占满，kq 单进不来） |
| 接单 | `P2 + semi`，只取 P2 单 |
| 回单 | 补 414 字、标签增至 3 个，四样证据齐 |
| kq | **0.2393 → 0.85** |
| 判定 | `verified / accepted`（acceptance ok） |
| 屏 | 已收单 1 条，`kq 0.24→0.85` |

**一个发现**：`MAX_TICKETS=20` 的全局上限会被 kd（0 分）与 ka（0.2）的单占满，kq 单进不来。想修哪一维，得按维配额度，而不是全局抢 20 个位——这条记进下一步。

## 四、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 取单口只给 P2 单（P6 的 ka-low 不被认领） |
| AC-2 | 外部件产回单且不写库（全表快照不变） |
| AC-3 | 系统写回后正文变长、标签 ≥3 |
| AC-4 | 重算后 kq 达判据（≥0.50） |
| AC-5 | 按需求判成 `verified / accepted` |
| AC-6 | 回单缺自评 → `gate:publish` 先拒 |

## 五、Non-Goals

- 不接真模型：本轮外部件是确定性夹具，验的是链路与边界，不是产出质量。
- 不改扫描额度策略（发现已记，未修）。

## 六、下一步

1. **按维配额**：`MAX_TICKETS` 改成每维上限（如 kq 5 / ka 5 / kd 5 / kr 5），避免一维挤占全部名额。
2. 真外部件接入：把 `externalPart` 换成模型调用，回单格式不变，链路不动。
3. 屏上按 `kind` 过滤（`board --stale`）。
