---
tags: [aing-v2, spec, 寄生位, 寄生, 取单口, 外部件, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.19 寄生位注册表与取单口——把 P1–P7 落成声明式注册表（位置/输入/输出/写回点/两形态/拒绝条件），外部件按 slot 认领 proposed 单，系统只按写回点落库
date: 2026-11-18
status: 已落地（test-6.19-parasite-slot 8/8）
owner: hana
upstream: [STATUS.md §七 D18, spec/SPEC-6.18-提案单需求定义与寄生位.md, spec/SPEC-6.15-跟单三律.md, spec/SPEC-6.16-回单外接屏.md]
---

# SPEC-6.19 · 寄生位注册表与取单口

> **一句话**：6.18 只把 P1–P7 写在纸上，外部件无从声明「我能接哪个位、能接多深」。本件把点位落成**可查、可校、可取单**的声明面，纯声明不接真外部件——先把契约钉死，外部件才敢挂。

## 一、注册表（`SLOTS`）

每个位点八字段，缺一不成位：

| 字段 | 含义 |
|---|---|
| `slot` | `P1`–`P7` |
| `name` | 位点名（入口成形 / 蒸馏 / 关联建边 / 蒸馏点提取 / 洞察提取 / 提案承接 / 回单校验） |
| `location` | 在流程里的落点（哪一步之后、哪张表） |
| `modes` | 允许的植入形态：`semi`（补一块）/ `full`（接管整步）；P7 为空 |
| `in` | 输入物 |
| `out` | 回单要交的东西 |
| `writeBack` | 系统按此落库（外部件不碰） |
| `refuse` | 拒绝条件（整件退回，不半截落库） |

**P7 的 `modes` 故意为空**：校验是主权动作，不可外包——空表比一句注释更难被绕过。

## 二、三支口

### 2.1 `validateSlot(s)` → `{ok, reasons[]}`

拦：未知点位（`unknown-slot`）、空名（`no-name`）、形态非数组（`no-modes`）、含非法形态（`bad-mode`）、非 P7 却无可接形态（`no-modes`）。一次返回全部原因，不早停——注册方一次就能改完。

### 2.2 `claim(slotId, reg, demand)` → `{ok, reason}`

按固定顺序判，先死的先报：

1. `P7` 或表外点位 → `not-outsourceable:P7`
2. `demand.slot !== slotId` → `slot-mismatch`
3. 注册形态非法 → `bad-registration-mode`
4. 单要 `full` 而注册只有 `semi` → `mode-too-narrow`
5. 注册证据集合盖不住单上 `demand.evidence` → `evidence-missing:<缺件>`

**可替代规则**：`full` 可接 `semi` 的单（能力强可少做），`semi` 不能接 `full`（能力窄不能硬撑）。

### 2.3 `claimable(store, reg, {limit})` → rows[]

只读 `opt_tickets`，只认 `status='proposed'` 且 `evidence_json.demand` 齐全的单，再用 `claim` 过一遍。每行附解析后的 `demand`。作废/已结/无需求的单不出现——取单口不给废单，外部件就没有「认领已过期单」的机会。

## 三、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | P1–P7 齐，八个字段全非空 |
| AC-2 | `validateSlot` 对未知点位 + 空名 + 非法形态一次报 ≥2 条原因 |
| AC-3 | P7 认领被拒，原因是「不可外包」 |
| AC-4 | slot 不匹配不接单 |
| AC-5 | `full` 接 `semi` 成功；`semi` 接 `full` 报形态过窄 |
| AC-6 | 证据缺件不接单，原因点名缺哪件 |
| AC-7 | 取单口只给可接的 `proposed` 单（不含 `verified`、不含他位） |
| AC-8 | 纯函数无 I/O（唯一库访问在取单口，且只读） |

## 四、Non-Goals

- 不实现运行时调度（谁在什么时机被调用）——本轮只落契约。
- 不接真外部件，不改 `distill` / `sprout` / `verifyTickets` 的调用链。
- 不改 6.14 发布门口径与 6.16 屏口径。

## 五、下一步

1. 真外部件接入时，只需交一份 `{slot, mode, evidence[]}` 注册，用 `claimable` 取单。
2. 回单写回仍走系统：`demand.acceptance` 由 `verifyTickets` 复核，不交给外部件自评。
3. 点位如需增删，改 `SLOTS` 一处，`validateSlot` 与测试自动跟着走。
