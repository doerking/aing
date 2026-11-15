---
tags: [aing-v2, spec, 核心代谢, kespi, 八维, M1, spec:8, kespi:8]
description: M1.12 kespi spec——八维评分全部从库内可测事实计算（质量/成长/活跃/完整/连接/一致/时效/平衡），KD 只认有效邻居，KC 走双链一致，落 kespi_scores 不反写实体
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.1 修订 C, SPEC-1.4, SPEC-1.7, SPEC-1.11]
---

# SPEC-1.12 · kespi（八维评分）

> 旧院 KESPI 有六套实现、阈值漂移（核读 S5）。v2 只留一套：**每一维都必须从库内事实算出来**，
> 算不出的维度不许发明。KD 改「有效邻居」，KC 改「双链一致」——两处都是旧院最名不副实的地方。

---

## 一、目标

为每个有效实体算 8 个 0–1 维度与 overall（均值），写 `kespi_scores`。

## 二、八维定义（全部可测）

| 维 | 含义 | 公式 |
|---|---|---|
| KQ 质量 | 内容厚度 | `min(1, len/200)*0.7 + 有标签*0.15 + confidence*0.15` |
| KG 成长 | 近期更新 | 30 天内 = 1；否则 `exp(-d/90)` |
| KA 活跃 | 检索活跃 | 7 天内 = 1；NULL = 0.2；否则 `exp(-d/30)` |
| KM 完整 | 字段齐备 | name/type/content/tags 齐 → 四分之一计 |
| KD 连接 | **有效**邻居 | `min(1, 有效邻居数 / 5)`（`invalid_at` 边不计）|
| KC 一致 | **双链**一致 | 镜像存在且内容逐字相同 = 1；有镜像不同 = 0.4；无镜像 = 0.3 |
| KR 时效 | 新鲜度 | `exp(-createdDays/365)` |
| KB 平衡 | 强度-连接匹配 | `1 - abs(strength/9 - min(1, 有效邻居/5))` |

- overall = 八维算术均值，保留 4 位
- 日粒度衰减（同日内重复计算结果一致，保证幂等可测）

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 八维落表 + overall=均值 | kespi_scores 列齐；overall ≈ mean(8) |
| AC-2 | 退役不评 | invalid_at 非空 → 无行 |
| AC-3 | KD 只认有效邻居 | 一条有效边 + 一条退役边 → KD=0.2；只有有效边 |
| AC-4 | KD 随连接上升 | 0 邻居 < 2 邻居 < 5 邻居 |
| AC-5 | KC 双链一致 | 一致=1；不一致=0.4；无镜像=0.3 |
| AC-6 | 幂等（同日） | 两趟 overall 相同，行数不变 |
| AC-7 | 铁律 | last_access 不变；源码无 `DELETE FROM` |

## 四、Non-Goals

- 不做红黄阈值判定（growth 配置，后续期）
- 不做 KESPI 历史表（`kespi_history` 属旧院，v2 暂不建）
- 不改实体列

## 五、契约

- 组件 id `kespi`，strand `wiki`，band `background`，reads `['entities','links']`，writes `['kespi_scores']`，budgetTick 1，reversible true
- 入口：`async kespiStep(store, opts) -> { scanned, scored }`；纯函数 `scoreEntity(ctx)`

## 六、依赖

- 上游：SPEC-0.1 修订 C、SPEC-1.4（镜像）、SPEC-1.7（边一致）
- 消费者：2.9/2.10 健康口径、2.12 动作判定
