---
tags: [aing-v2, spec, 场域提升, promote, 证据门槛, 守恒闸, M2, spec:9, promote:9]
description: M2.13 场域提升动作 spec——promote 须 ≥2 类独立证据信号（I2），只走 4→6、6→7 两跨步；提升前过守恒闸（I5）；候选边按证据提升为正式边；全可逆
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.6 I2/I5, SPEC-0.8, SPEC-1.9, SPEC-1.10, SPEC-2.10, SPEC-2.12]
---

# SPEC-2.13 · 场域提升动作（promote）

> 维护的另一半是把有据的往上提：4→6 入中段、6→7 入入口带。
> 但提升是全场最易被「看起来重要」骗到的一步，所以门槛写死两条：
> **≥2 类独立信号**（I2）与**前必过守恒闸**（I5）——只长不剪的时期唔准再提。

---

## 一、目标

按证据把实体/候选边提升一跨步：4→6、6→7；无证据或守恒失衡时拒绝并给理由；每动作记账、可撤回。

## 二、行为（spec 即契约）

### 2.1 证据信号（独立四类，同类只算一类）
| 类 | 判据 |
|---|---|
| `degree` | 有效边 ≥ 2 条且其中至少 2 条 `strength ≥ 5` |
| `mirror` | 双链同位存在且内容一致 |
| `access` | `last_access` 距今 ≤ 30 天 |
| `kespi` | `kespi_scores.overall ≥ 0.55` |

- **≥2 类**才可提升；证据清单入 `field_actions.before_json`

### 2.2 跨步（I1 的另一半）
- 只接 `4→6`、`6→7`；强度 1/2/3/5/7/8/9 一律拒绝（`reason='out-of-step'`）
- 提升后 `updated_at` 刷新；`last_access` 唔碰

### 2.3 守恒闸（I5）
- 提升前读守恒闸：`verdict='growth-only'` → 拒绝提升（`reason='conservation-band'`），提示先消化增量
- `balanced` / `prune-only` 放行

### 2.4 候选边提升
- `sprout-candidate` / `pollinate-candidate` 边，`evidence` 中独立类 ≥2
- 动：`relation='gen'`、`strength=6`（原 4 → 6）；`evidence` 原样保留
- 账：`action='promote-edge'`，`target='<src>-><dst>'`

### 2.5 可逆（I3）
- `revertFieldAction`（沿用 2.12 账）：
  - `promote` → 强度回 `before_json.strength`
  - `promote-edge` → `relation` 回 `before_json.relation`、`strength` 回 `before_json.strength`

### 2.6 铁律
- 不碰 `last_access`；无物理 DELETE；账本只增

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 无证据拒（I2）| 光秃强度 6 实体 → 拒绝，`reason='insufficient-evidence'`，强度不变 |
| AC-2 | ≥2 类成升 | 强度 6 + `mirror` + `access` 两信号 → 7；只 1 类信号仍拒 |
| AC-3 | 跨步限制 | 强度 5、8 → `out-of-step`；强度 4 + 两信号 → 6 |
| AC-4 | 记账 + 可逆 | `field_actions` 有 `promote` 行；撤回后强度复原 |
| AC-5 | 守恒闸（I5）| 造 `growth-only` 场景 → 拒绝且 `reason='conservation-band'` |
| AC-6 | 候选边提升 | 两证据候选边 → `gen` / strength 6；撤回回候选 |
| AC-7 | 铁律 | 实体 `last_access` 不变；源码无 `DELETE FROM` |

## 四、Non-Goals

- 不自动决定谁该升（裁判权归进化团 T0/T1；本件只执行带证据的具体提升）
- 不做降级（2.12 demote）
- 不做发芽/授粉本身（1.9/1.10）
- 不做 KESPI 计算（1.12）

## 五、契约

- 组件 id `field-promote`，strand `cross`，band `field`，reads `['entities','links','kespi_scores','meko_cycles']`，writes `['entities','links','field_actions']`，budgetTick 1，reversible true
- 入口：
  - `promoteEntity(store, { entityId, cycleId }) -> { promoted: {id, from, to, evidence} } | { refused: {id, reason} }`
  - `promoteEdges(store, { cycleId }) -> { promoted: [{src,dst}], refused }`
  - `evidenceFor(store, entityId) -> { kinds: [...] }`

## 六、依赖

- 上游：SPEC-0.6（I2/I5）、SPEC-2.10（守恒闸）、SPEC-2.12（动作账与撤回）
- 消费者：SPEC-0.8 T1 复核、2.15 度量
