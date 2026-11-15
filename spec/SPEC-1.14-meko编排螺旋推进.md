---
tags: [aing-v2, spec, 核心代谢, meko, 编排, 螺旋, DNA双铰链, M1, spec:9, must-read:9, meko:9, 双铰链:8]
description: M1.14 meko 编排 spec——组件契约注册，按 raw→场域→wiki 螺旋多轮推进替代直线 11 步；每轮结算落 meko_cycles 且有界
date: 2026-11-16
status: draft（待 owner review）
owner: ring / Hana
upstream: [SPEC-0.6, SPEC-0.3, SPEC-1.1, SPEC-1.2, SPEC-1.13]
---

# SPEC-1.14 · meko 编排（螺旋推进，替代直线 11 步）

> 旧院 `run-metabolism.js` 用 `execSync` 串 11 个独立进程：直线、无事务、任一步爆断链。
> v2 改为**单进程内螺旋编排**：步骤注册契约 → 编排器按链/带排序 → 多轮推进（后一轮见到前一轮改动）→ 每轮结算落 `meko_cycles` → 全程有界。

---

## 一、目标

钉死编排器嘅注册契约、轮序、边界，令「螺旋」可测——唔系单趟顺序执行就叫双铰链。

## 二、组件契约（沿用 SPEC-0.6 §3.2）

```js
registerStep({
  id: 'compile',          // 必填，唯一
  strand: 'raw'|'wiki'|'cross',  // 必填，链归属
  band: 'entry'|'field'|'background'|'cross', // 必填
  reads: ['entities'],    // 必填，数组
  writes: ['entities'],   // 必填，数组
  budgetTick: 1,          // 必填，正整数
  reversible: true,       // 必填，boolean
  onCycle: async (ctx) => ({ ok, actions?, evidence? })  // 必填
})
```
- 缺字段 → `registerStep` 抛错（fail-fast）。
- 同 id 重复注册 → 抛错。
- 组件**唔准自己 require knowledge-store**（门禁 C5 静态查）；store 由 ctx 注入。

## 三、螺旋轮序（核心，可测）

单轮（round）内固定三拍，按链交替：

```
第 1 拍 raw 链步骤 → 第 2 拍 cross/场域步骤 → 第 3 拍 wiki 链步骤
```

- 多轮默认 **2 轮**（`opts.rounds`），后一轮重跑全部步骤，**见到前一轮写入嘅状态**——呢个就系「螺旋 ≠ 直线」嘅可断言定义。
- 同轮内按注册顺序稳定执行；跨轮重入次数计入结果。
- `ctx` 每步都带：`{ store, round, strand, bus, cycleId }`；`bus` 系轮内共享对象（供步骤间交换，唔准直连）。

## 四、结算与边界

- 每轮结束写一行 `meko_cycles`：`cycle_type = '<cycleType>:round<N>'`，`helix_strand='both'`，`kespi_snapshot` 非空，`executed_at` 落真实时间，`status='executed'`。
- 整轮超时（`deadline = scheduled_at + T_bound`，T_bound 来自 SPEC-0.3）→ 当前轮标 `failed`，中止余下步骤，返 `{ ok:false, failedRound }`，唔无限跑。
- 步骤抛错 → 记 `{ id, error }` 入 `results`，标当轮 failed；唔静默吞。
- 返回结构：
```js
{ ok, cycleId, rounds, results: [{ round, id, ok, actions?, error? }], deadline, elapsedMs }
```

## 五、Acceptance Criteria

| # | 判据 | 检验 |
|---|---|---|
| AC-1 | 契约校验 | 缺字段/重复 id 注册 → 抛错 |
| AC-2 | 螺旋可证 | raw 步骤与 wiki 步骤各注册 1 个、2 轮 → 各跑 2 次；每轮 raw 先于 wiki |
| AC-3 | 状态穿透 | 第 2 轮 raw 步骤能读到第 1 轮 wiki 步骤写嘅 bus/库状态 |
| AC-4 | 结算留痕 | 2 轮 → meko_cycles 新增 2 行，kespi_snapshot 非空，status=executed |
| AC-5 | 有界 | 造超时步骤 → 当轮 failed、后续步骤唔执行、总耗时 ≤ T_bound + 容差 |
| AC-6 | 错误可见 | 抛错步骤入 results.error，ok=false，唔吞 |

## 六、非目标

- 唔做分布式/多进程；唔引入队列。
- 唔替代场域动作本体（2.12/2.13）。
- 唔做 cron（scheduler 属 M3 之后）。

## 七、依赖

- 上游：SPEC-0.6（契约/三带）、SPEC-0.3（T_bound）
- 实现：`src/meko-orchestrator.js`
- 被依赖：1.15（场域骨架注册为 cross 步骤）、3.11-3.13
