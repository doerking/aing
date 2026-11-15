---
tags: [aing-v2, spec, 进化团, 蜂巢成员池, 契约注册, M2, spec:9, evolution:9]
description: M2.14 进化团入驻 spec——五成员按组件契约注册进 meko，蜂巢成员池按信号进出场域带（5×3=15 席），成员只读只判、无写权、无独立调度入口
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.8 §三/§六/§九, SPEC-1.14, SPEC-1.15, SPEC-2.12, SPEC-2.13]
---

# SPEC-2.14 · 进化团入驻（五成员契约注册 + 蜂巢成员池）

> 旧院进化团一直旁挂：有角色设定，无挂载点（核读 §5）。今次按 1.15 契约注册进 meko，
> 让「判定」有固定座位，「执行」仍归场域件（2.12/2.13）——这是 I7 的结构面。
> 蜂巢 = 同质成员池（共享基质、按信号进出），唔系多进程蜂群。

---

## 一、目标

五成员按契约注册、可被 `runCycle` 驱动；成员池按信号进出、容量受编制约束；成员只读只判，零写权。

## 二、成员册（身份与职责不动）

| id | 职责一句 | reads | writes | band |
|---|---|---|---|---|
| `gene-keeper` | 记录 episode/route/pattern，管 gene 生老病死 | entities、meko_cycles、links | gene 表 | 6/5/4 |
| `omni-gate` | canary/holdout/acceptance 三闸，真接 promote 与提升 | 评估分、gene、基线 | 闸记录 | 6/5/4 |
| `pilot` | 七类信号 → 九动作优先级 → 只出本轮 plan | 健康快照、meko_cycles | 本轮 plan | 6/5/4 |
| `tri-cross` | explore/verify/optimize ≥2 路同意 + 双链互校 | links、双链 | 复核结论 | 6/5/4 |
| `poll` | 争议/高风险召集规则官出加权意见（唔系多数票）| 争议项 | 意见档 | 6/5/4 |

## 三、行为（spec 即契约）

### 3.1 契约注册（1.15）
- 五成员各给一份完整契约：`id / strand / band / reads / writes / budgetTick / reversible / onCycle`
- strand 统一 `cross`、band 统一 `field`、budgetTick 1、reversible true
- 注册失败（缺字段/id 重复）→ 抛错，唔静默跳过

### 3.2 只判不写（I7）
- `onCycle` 只读 store，返回**判定/提案/评分/建议**；唔写 `entities`/`links`
- 静态：本模块唔 require `knowledge-store`（C5 同样约束进化团）
- 动态：跑一轮后 `entities/links` 行数不变

### 3.3 无独立调度入口（1.14 唯一驱动）
- 模块唔导出 `start` / `schedule` / `run` 之类自启入口；成员只随 `runCycle` 被调用

### 3.4 蜂巢成员池（§九）
- 池容量 = 5 常驻单元 × 3 席 = **15**
- 每单元：1 常驻成员 + ≤2 狼位；狼位按需进出、零写权、完即弃
- `join(unitId, {wolves})` 超 2 狼位 → 抛错；`leave(unitId)` 释放狼位
- 池状态可查：`snapshot()` → [{unit, wolves, seats}]

## 四、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 五成员全注册且契约齐 | 契约 id 集合 = 五员；`MekoOrchestrator.registerStep` 全收；缺一抛错 |
| AC-2 | 成员零写权（I7）| `buildEvolutionSteps` 跑一轮后 `entities`/`links`/`field_actions` 行数不变 |
| AC-3 | 无独立入口 | 模块导出中无 `start/schedule/run` 函数；只有 `buildEvolutionSteps/registerEvolutionTeam/MemberPool` |
| AC-4 | 成员池按信号进出 | 开满 15 席；第 6 单元或第 3 狼位被拒；`leave` 后可再进；`snapshot` 席数正确 |
| AC-5 | 输出只到提案面（I10）| `onCycle` 返回对象无 `store` 句柄、无写函数引用；`pilot` 只回 plan 字段 |

## 五、Non-Goals

- 不做四时点 × 六维接线（2.15）
- 不做闸东真接（2.16）
- 不做子agent 生命周期（2.17）
- 不做外派蜂群（2.18）

## 六、契约

- 组件 id 前缀 `evo-`，统一挂在 `runCycle`（唔另起编排）
- 入口：
  - `MEMBERS`（五员定义）
  - `buildEvolutionSteps() -> contracts[]`
  - `registerEvolutionTeam(orch) -> ids[]`
  - `class MemberPool { join(unitId, {wolves}), leave(unitId), snapshot(), seats }`
  - `MAX_SEATS = 15`、`WOLVES_PER_UNIT = 2`

## 七、依赖

- 上游：SPEC-0.8、SPEC-1.14、SPEC-1.15
- 消费者：2.15 / 2.16 / 2.17
