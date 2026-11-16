---
tags: [aing-v2, spec, memo, 检索, 向量后端, 状态反馈, M5, spec:7, memo:8]
description: M5.2 spec——memo 增加向量库状态反馈：当前后端 / 覆盖率 / 旧后端残留 / 测试开关告警，压进系统一行且不破五字段与 80 字上限
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-5.1, SPEC-3.11]
---

# SPEC-5.2 · memo 向量库状态反馈

> 起因：后端可插拔之后，**「现在检索到底走哪条路」对主驾不可见**。评测开关漏进日常、换后端后没重建、向量没覆盖全库，这三种情况都不会报错，只会悄悄让检索变差。
> 对策：memo 多一块只读诊断 + 系统一行里加一小段；**不改用户面五字段，不破 80 字上限，不写表**。

---

## 一、目标

1. memo 返回 `diagnostics.vector`：当前后端、覆盖率、旧后端残留、告警。
2. 系统一行显示「向量 <后端> <覆盖率>%」，测试开关开着时带「(测试)」。
3. 异常不静默：未覆盖、旧后端残留、测试开关在跑，各给一条带固定 code 的告警。

## 二、行为（spec 即契约）

### 2.1 诊断字段

```js
memo.diagnostics.vector = {
  backend,      // 实际生效后端名
  dim, model,   // 与 entity_vectors 比对用
  source,       // 'default' | 'env'（env = AING_VECTOR_BACKEND 在设）
  active,       // 有效实体数（invalid_at IS NULL）
  indexed,      // 当前后端已建向量的有效实体数
  stale,        // 有效实体上「非当前后端」的向量行数
  missing,      // active - indexed
  percent,      // round(indexed / active × 100)；active=0 → 100
  alerts: []    // [{ code, level, text }]
}
```

### 2.2 告警（固定 code，前端/自动化按 code 判）

| code | level | 触发 |
|---|---|---|
| `env-override` | warn | `AING_VECTOR_BACKEND` 在设（测试开关漏进日常） |
| `backend-fallback` | warn | 请求的后端名不存在，已回退 `hash-64` |
| `stale-rows` | warn | `stale > 0`（换过后端但没重建） |
| `low-coverage` | warn | `missing > 0`（有有效实体没有当前后端向量） |

- 无异常时 `alerts = []`。
- 告警只描述事实，不给建议动作（动作由主驾拍板）。

### 2.3 系统一行

- 格式：`健康 <判定> / 向量 <后端> <percent>%[ (测试)] / 蒸馏债 … / 籽 … / 场域动作 … / 守恒比 …`
- 向量段放在健康之后、其余之前，**保证超长截断时它不会被截掉**。
- 总长仍 ≤ `SYSTEM_LINE_MAX`（80）；超长按**段**收口（见修订 A）。

### 2.4 纯读铁律

- 只 SELECT：不写表、不投事件、不改 `last_access`。
- 用户面五字段（`recent` / `openLoops` / `patterns` / `plans` / `coldStart`）语义与顺序不变。

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 诊断字段齐全 | `diagnostics.vector` 八字段存在，类型正确 |
| AC-2 | 默认态健康 | 默认后端建齐向量 → `alerts = []`、`percent = 100`、`source = 'default'` |
| AC-3 | 未建向量告警 | 不跑 vectorStep → `missing = active`、含 `low-coverage` |
| AC-4 | 旧后端残留告警 | 换后端后不重建 → `stale > 0`、含 `stale-rows` |
| AC-5 | 测试开关告警 | 设 `AING_VECTOR_BACKEND` → `source = 'env'`、含 `env-override` |
| AC-6 | 系统一行 | 含后端名与覆盖率，长度 ≤ 80 |
| AC-7 | 纯读 | 前后各表计数不变；源码无写语句 |
| AC-8 | 五字段不变 | `recent/openLoops/patterns/plans/coldStart` 齐（characterization） |

## 四、Non-Goals

- 不在 memo 里跑向量化（诊断只读表，不嵌模型）。
- 不自动重建、不自动清旧行——交代谢步与主驾决定。
- 不改 `agentTodos`、不改 CLI 输出格式。

## 五、契约

- `buildMemo(store, opts)` 返回值新增 `diagnostics.vector`；原有字段不动。
- 后端解析复用 `src/vector.js` 的 `resolveBackend`（同源，不另写一套判断）。

## 六、依赖

- 上游：SPEC-5.1（后端解析与 model/dim 口径）、SPEC-3.11（memo 用户面）
- 消费者：CLI 输出、日后仪表台

## 七、与评测口径的关系

- 本任务让「走了哪条路」可见，**不等于**判定了哪条路更好；好不好仍按 `docs/Engineering/EMBEDDING-BENCH-2026-11-16.md` 的口径，用自己的语料复核。
- 仪表台说「后端 X 100%」只代表「向量齐、同源」，不代表「检索准」。

---

## 修订 A（2026-11-17）：超长按段收口

- 原实现硬切到 79 字加 `…`，会把末段切出「场域动作 5…」——半个字段比少一段更误导。
- 改为按 ` / ` 整段让位：从尾部逐段丢弃，直到加省略号后 ≤ 80；健康 / 向量两段必留。
- 真库副本实测：`健康 growth-only / 向量 hash-64w2 100% / 守恒 71:1035 / 蒸馏债 0 / 缺口 0 ─ / 籽 0 …`。
- 测试：`test/test-3.11d-memo-line-clip.js` 4/4（不留半字段、头两段必留、按段收口、短行原样）。
