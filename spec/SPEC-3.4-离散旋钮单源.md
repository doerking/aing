---
tags: [aing-v2, spec, 配置, 离散旋钮, 单源, C17, M3, spec:9, config:9]
description: M3.4 离散旋钮单源 spec——所有可调阈值集中在 config-runtime 一处定义并被组件读取；改 config 真变行为；未知旋钮拒写；持久化可复现
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.6, 核读 §3, C17]
---

# SPEC-3.4 · 离散旋钮单源（config-runtime）

> 原院教训：阈值散落在组件里，改一处唔知另外几处还跟唔跟（C17）。
> 本件把可调旋钮收成一张表：组件只认 `resolveOptions` 给的结果，默认值只在 `DEFAULTS` 出现一次。

---

## 一、目标

旋钮单源、可改、可持久、可复现；未知旋钮拒写；组件行为随配置真变。

## 二、行为（spec 即契约）

### 2.1 旋钮表（唯一默认值来源）
| 路径 | 默认 |
|---|---|
| `compress.inactiveDays` | 30 |
| `compress.minLength` | 50 |
| `sprout.floor` | 2 |
| `sprout.cap` | 4 |
| `conservation.band` | [0.8, 1.5] |
| `hubTrim.degreeCap` | 8 |
| `hubTrim.weakBelow` | 5 |
| `kernel.stagnantAfter` | 3 |

### 2.2 语义
- `getKnob(store, path)`：取生效值（库内覆盖 > 默认）
- `setKnob(store, path, value)`：写 `config` 表；未知路径抛 `unknown-knob`
- `resolveOptions(store, componentId)`：返回该组件可直接用的 opts
  - `sprout` → `{ floor, cap }`
  - `compress` → `{ inactiveDays, minLength }`
  - `hub-trim` → `{ degreeCap, weakBelow }`
  - `conservation` → `{ bandLow, bandHigh }`
- 持久化：同库重开仍生效

### 2.3 铁律
- 默认值只在 `DEFAULTS` 出现；组件唔准再写死同一数值
- 唔碰业务表、唔碰 `last_access`

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 默认值单源 | `getKnob` 未改时返回 DEFAULTS 值；八项齐 |
| AC-2 | 改真变行为 | `setKnob('sprout.cap',1)` → `resolveOptions` + `sproutStep` 产出 ≤1 |
| AC-3 | 持久化 | 改后重开同库 → 值仍在 |
| AC-4 | 未知旋钮拒 | `setKnob('nope.x')` 抛 `unknown-knob` |
| AC-5 | 组件不重复写死 | `sprout.js`/`compress.js` 唔含同一数值的兜底字面量（源码检查）|

## 四、Non-Goals

- 不做热重载/远程配置中心
- 不做 UI（控制面归 3.2）
- 不做审批（改可见阈值仍须走 W2，2.16）

## 五、契约

- `DEFAULTS`、`KNOB_PATHS`
- `getKnob(store, path)`、`setKnob(store, path, value)`
- `resolveOptions(store, componentId)`、`listKnobs(store)`

## 六、依赖

- 上游：SPEC-0.6、SPEC-0.1 修订 J
- 消费者：sprout / compress / hub-trim / conservation
