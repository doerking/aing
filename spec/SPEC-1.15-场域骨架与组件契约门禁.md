---
tags: [aing-v2, spec, 场域, meko, 时界场域, 组件契约, M1, spec:9, must-read:9, meko:8, 时界场域:9]
description: M1.15 场域骨架 spec——中间带 6/5/4 扫描、promote/demote 可逆动作、边界与证据不变量、arch-lint 直连 store 门禁
date: 2026-11-16
status: draft（待 owner review）
owner: ring / Hana
upstream: [SPEC-0.6, SPEC-1.14, SPEC-0.4]
---

# SPEC-1.15 · 场域骨架 × 组件契约门禁

> SPEC-0.6 §四定义场域（6/5/4 带）同动作表；本 spec 落**骨架版**：扫描 + promote/demote 两个动作（完整 M/U 全表属 2.12/2.13）+ 边界不变量 + 直连 store 静态门禁。

---

## 一、目标

令中间带可被安全改动：只准喺 6/5/4 作业、提升要证据、动作全可逆；并且「组件唔直连 store」由静态门禁守，唔靠自觉。

## 二、场域引擎（`src/field-engine.js`）

```js
class FieldEngine {
  constructor({ store })
  bandOf(strength): 'entry' | 'field' | 'background'   // 9-7 / 6-4 / 3-1
  async scan(): Promise<string[]>                     // 当前 6/5/4 实体 id
  async promote(id, evidence, opts): Promise<ActionRecord>
  async demote(id, reasons, opts): Promise<ActionRecord>
  async revert(record): Promise<void>                 // 还原到 record.from
}
```
- `ActionRecord = { id, action, from, to, evidence|reasons, at }`，落 `bus`/调用方，供回喂与复原。
- `promote`：只准 strength ∈ [3,6]（3→4 进场域，6→7 进入口）；每次 +1；**evidence.length ≥ 2** 才准升。
- `demote`：只准 strength ∈ [4,9]；每次 −1；`reasons.length ≥ 1`。
- 越界（如 promote 一个 7 段实体）→ 抛错并返 `reason:'band-boundary'`。
- `revert`：把 `tolaria_strength` 还原为 `record.from`；唔删记录。

## 三、不变量

| # | 不变量 | 检验 |
|---|---|---|
| I1 | 场域只处理 6/5/4；跨界必须显式 promote/demote | 7 段实体 promote → 拒 |
| I2 | 提升 ≥2 独立证据 | 1 条证据 → 拒；2 条 → 过 |
| I3 | 动作可逆 | revert 后 strength 与 from 逐字段一致 |
| I4 | 每动作记账 | record 含 at/from/to；无记录嘅写 = 违规 |
| I5 | 无物理删 | 源码无 `DELETE FROM` |

## 四、静态门禁 C5（`tools/arch-lint.js`）

- 扫 `src/*.js`，任何文件 `require('./knowledge-store')` / `require('./knowledge-store.js')` → 违规。
- 白名单：`knowledge-store.js`（本体）、`meko-orchestrator.js`（编排入口）。
- 违规 → exit 1，列文件与行号。
- 目的：组件只可经 ctx 拿 store，唔准自建句柄。

## 五、Acceptance Criteria

| # | 判据 | 检验 |
|---|---|---|
| AC-1 | 分带正确 | 9/7→entry、6/5/4→field、3/1→background |
| AC-2 | 边界 | 7 段 promote → band-boundary；3 段 demote → band-boundary |
| AC-3 | 证据闸 | 1 证据 promote 拒；2 证据由 6→7 成功 |
| AC-4 | 可逆 | promote 后 revert → 回原值；demote 同 |
| AC-5 | 扫描面 | 造 7/6/5/4/3 → scan 只返 6/5/4 |
| AC-6 | 直连门禁 | 造违规临时文件 → arch-lint 红；本仓 → 绿 |
| AC-7 | 无物理删 | field-engine.js 无 `DELETE FROM` |

## 六、非目标

- 唔做 rebond/unwind/reconcile/sprout/pollinate（2.12/2.13）。
- 唔做场域调度（调度在 1.14 编排 + 2.4 时界）。
- 唔做证据源实现（会话三源属 3.13）。

## 七、依赖

- 上游：SPEC-0.6、SPEC-1.14
- 实现：`src/field-engine.js`、`tools/arch-lint.js`
- 被依赖：2.12/2.13、3.12
