---
tags: [aing-v2, engineering, kespi, thresholds, calibration, spec:9, evidence:9]
description: KESPI 消费者阈值校准实测（2026-11-21）——真库 322 行：注释声明 overall p25 0.46 / p50 0.51 / p90 0.71 逐位吻合（差 0），阈值为数据校准非拍脑袋；四阈值落点：promoteMin 过线 35.4%、geneMin 过线 83.9%（低于中位 0.51、闸近乎全开）、greenZone 声明但未入逻辑；工具 tools/kespi-calibrate.js
date: 2026-11-21
status: active
owner: hana
---

# KESPI 消费者阈值校准（2026-11-21）

> **性质**：测量记录，非门禁。配套工具 `tools/kespi-calibrate.js`。
> **缘起**：STATUS §五·补五 8.6 把四个 KESPI 消费者阈值（`promoteMin 0.55` / `geneMin 0.45` / `redZone 0.45` / `greenZone 0.60`）从三处硬编码集中进 `src/config-runtime.js` `DEFAULTS.kespi`。集中之后，「呢啲数定得准不准」系唯一能回答「阈值该唔该动」嘅问题——本档系答案。

## 一、测量口径

- **源**：`data/knowledge.db`（真库，5.50 MB），拷副本后纯读，**绝不碰源**
- **样本**：`kespi_scores` 322 行
- **工具**：`node tools/kespi-calibrate.js [--db <源库>] [--json]`

## 二、九列分布（真库实测）

| 列 | n | NULL | p25 | p50 | p75 | p90 |
|---|---|---|---|---|---|---|
| 质量 kq | 322 | 0 | 0.577 | 0.62 | 0.85 | 0.85 |
| 广度 kg | 0 | **322** | — | — | — | — |
| 活性 ka | 322 | 0 | 0.2 | 0.2 | 1 | 1 |
| 关联 km | 0 | **322** | — | — | — | — |
| 催化 kd | 322 | 0 | 0 | 0 | 0 | 1 |
| 置信 kc | 322 | 0 | 0.5 | 0.5 | 0.5 | 0.5 |
| 重复 kr | 322 | 0 | 1 | 1 | 1 | 1 |
| 基础 kb | 0 | **322** | — | — | — | — |
| **总体 overall** | 322 | 0 | **0.46** | **0.51** | **0.62** | **0.71** |

## 三、注释声明对账

`self-optimize.js` 注释声明「真库五维实测 p25 0.46 / p50 0.51 / p90 0.71」——逐位吻合，差 0：

| 分位 | 声明 | 实测 | 差 | 判 |
|---|---|---|---|---|
| p25 | 0.46 | 0.46 | 0 | ✅ 吻合 |
| p50 | 0.51 | 0.51 | 0 | ✅ 吻合 |
| p90 | 0.71 | 0.71 | 0 | ✅ 吻合 |

**结论**：阈值为数据校准，非拍脑袋。`overall` 分布喺 8.6 落地前后未漂移。

## 四、四个阈值落点

| 旋钮 | 值 | 落点 | 消费组件 |
|---|---|---|---|
| `kespi.promoteMin` | 0.55 | 过线 **114/322（35.4%）** | field-promote 提升门槛 |
| `kespi.geneMin` | ~~0.45~~ → **0.62**（2026-11-21 owner 拍板） | 过线 **270/322（83.9%）**@0.45 → **103/322（32.0%）**@0.62 | evolution-team 基因候选门槛 |
| `kespi.redZone` | 0.45 | 逐维比对 | self-optimize 红区 |
| `kespi.greenZone` | 0.60 | 过线 **106/322（32.9%）** | 已声明、**未入逻辑** |

## 五、读数提示（供拍板，非建议改动）

1. **`geneMin` 已推高至 0.62（owner 2026-11-21 拍板）**：原 0.45 低于真库中位 0.51 → 83.9% 实体过线，基因候选闸实际几乎唔筛。改取 p75 口径 0.62，实测过线由 270/322（83.9%）降至 **103/322（32.0%）**。改动系 config-runtime `DEFAULTS.kespi` 一处，test-3.4b 锁默认值。
2. **`greenZone 0.60` 声明但未消费**：`self-optimize.js` 逻辑只比 `redZone`，绿区冇入判据。若日后要「绿区自动毕业」，先补逻辑再动数。
3. **`kg` / `km` / `kb` 三列系刻意 NULL，非「恒 0」**：`kespi.js` 嘅 upsert 直接写 `NULL`（`kg`/`km`/`kb` 三列），五维实际系 `dims = [kq, ka, kd, kc, kr]`，`overall` = 五行均值。系**刻意未定义嘅占位列**，已有 test-1.12（`rp.kg === null`）与 test-6.8（`!DIM_RULES.kg`）锁住。本工具早期版用 `Number(null)→0` 把它们混入分位数，误读成「恒 0、系评分口径问题」——已修（NULL 单独计数）＋ AC-4 锁。真起分辨作用嘅只有 `kq`（0.577→0.85 有展）与 `ka`（0.2/1 双峰）；`kd` 大部分为 0、`kc` 恒 0.5、`kr` 恒 1。

## 六、复现

```bash
cd G:\DPD\aing-v2
node tools/kespi-calibrate.js          # 表格
node tools/kespi-calibrate.js --json   # 机读
```

门禁状态：`npm test` → 168 档 / 1115 断言全绿；`node verify-deploy.js` → 33 项 ALL GREEN。
