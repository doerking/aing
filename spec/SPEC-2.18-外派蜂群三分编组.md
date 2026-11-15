---
tags: [aing-v2, spec, 外派, 三分编组, 底版范式, 滚动派发, M2, spec:9, dispatch:9]
description: M2.18 外派蜂群 spec——常驻 3 员单位（主责/协同/校验），派出前底版范式（语言+行为+工作流）先于任务链，单间不互斥滚动派发，收口只回残渣、交接不继承，外派零写权
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.8 §十 修订 A, SPEC-0.5, SPEC-0.7]
---

# SPEC-2.18 · 外派蜂群（三分编组）

> 外派是「派出去办事」，不是「多开几个内成员」。条令三句：
> **常驻 3 员、底版先于任务链、用完即弃**。收口只回残渣，人走人路、料归料堆——
> 下一单从零底版起，唔继承上一单的上下文。

---

## 一、目标

派单前校验底版范式齐；单间并行互不等待；收口校验轨迹与标签并解散；外派全程零写权。

## 二、行为（spec 即契约）

### 2.1 常驻单位 3 员
- 固定三角色：`主责`（单元长）/`协同`/`校验`
- 职责面不重叠、不留缝：三者 `responsibility` 互不相同
- 数量随业务增减，最低 1 单元

### 2.2 底版范式先于任务链（顺序写死）
- 派单必须带齐：`language`（语言思维与输出）、`behavior`（行为规范）、`workflow`（工作流）
- 缺任一项 → 抛 `baseline-missing`，**不建单位、不启动任务**
- 底版随单生成，唔跨单复用

### 2.3 滚动派发（单间不互斥）
- 新单唔等旧单收口：`dispatch` 即刻建单位并置 `running`
- 在跑单位数无上限（受外部编制约束，本件只报数）

### 2.4 收口（用完即弃）
- `close(unitId, {traces, tags})`：
  - 轨迹必齐：`traces` 为非空数组（每步留痕）
  - 标签必齐：`tags` 至少含 `unit/ticket/outcome`
  - 缺一 → `refused` 并保持单位在跑
- 收口成功 → 返回残渣 `{unitId, ticket, traces, tags, residue}`，单位移出编制
- **交接唔继承**：下一单的底版与上下文从空白起（`inherited: []`）

### 2.5 零写权
- 外派单位对知识库零写权；任何写意图 → 抛 `swarm-no-write`
- 残渣只能回流 meko 的吸入口，由场域件决定是否落库

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 缺底版拒派 | 缺 workflow → 抛 `baseline-missing`，单位数不变 |
| AC-2 | 单间不互斥 | 连派两单 → 两单位同时 running，互不等待 |
| AC-3 | 收口校验 + 交接不继承 | 缺轨迹/标签 → 拒收且单位在跑；齐 → 收口解散、残渣齐；新单 `inherited` 为空 |
| AC-4 | 3 员职责不重叠 | 角色集合恰 3 个、职责两两不同 |
| AC-5 | 零写权 | `write()` 抛 `swarm-no-write`；无任何实体/边写入 |

## 四、Non-Goals

- 不做内蜂群（2.14/2.17）
- 不做外派资料库与模板渲染
- 不做守内↔对外桥接（条令：互不派单）

## 五、契约

- `BASELINE_REQUIRED = ['language','behavior','workflow']`
- `REQUIRED_TAGS = ['unit','ticket','outcome']`
- `class DispatchDesk { dispatch({ticket, baseline, inherited}) ; close(unitId, {traces, tags}) ; units() ; write(unitId) throws }`
- `class DispatchUnit { id, ticket, members:[3], state }`

## 六、依赖

- 上游：SPEC-0.8 §十、SPEC-0.5（内外不桥接）
- 消费者：memo 派工口（M3）
