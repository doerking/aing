---
tags: [aing-v2, spec, kc, kespi, 派生边, 时序相干, 读法, engineering:7, capability:6, delivery:6, must-read:6]
description: SPEC-6.51 kc 读法对齐——raw→wiki 镜像边即加工边；修的是「import 先占 pair 边、distill 的 derived 永不落地 → kc 全库恒 0.5」
date: 2026-11-19
status: 已落地（test-6.51-kc-mirror-edge 6/6）
owner: hana
upstream: [STATUS.md §七 D18, STATUS.md §七 D21, spec/SPEC-1.12-KESPI.md, spec/SPEC-1.5-distill复制链保真.md]
---

# SPEC-6.51 · kc 读法对齐（镜像边即加工边）

> **一句话**：`kc`（时序相干）靠 `derived` 边算，而 `import` 先把同一对 `raw→wiki` 占成 `hydrogen-bond`；`links` 主键是 `(source_id, target_id)`，一对只能一条边——结果 `distill` 的 `derived` 边在正常链上一次都没落过，真库 0 条，`kc` **322/322 恒 0.5**，`kc<0.40` 永不触发。

## 一、口径（D21）

### 1.1 不移数据，改读法

「这对 raw→wiki 是不是加工关系」不靠边名，靠**身份**：`source` 是 `raw-*`、`target` 恰是它的镜像 `wiki-<base>` —— `import` 先键上的那条 `hydrogen-bond` 就是加工边。`kc` 的派生表取：

```
relation = 'derived'
OR ( relation = 'hydrogen-bond' AND source_id LIKE 'raw-%'
     AND target_id = 'wiki-' || substr(source_id, 5) )
```

- `derived` 仍照旧计入（不经 import 的路径、测试 fixture 不受影响）。
- 反向（`wiki-* → raw-*`）、非同源 pair（`raw-x → wiki-y`）、非 raw 源一律不计。
- 只动 `kc` 的输入集合；`kq / ka / kd / kr / overall` 公式一字不改。

### 1.2 为什么不给 links 加宽主键

`(source_id, target_id, relation)` 作主键要重建有 2324 行的表，且所有 `INSERT OR REPLACE` 口径、8.2 硬闸、迁移指纹都挂在现主键上。为一条标签做表重建，代价远大于收益；读法对齐是单点改动、可回退。

### 1.3 预期读数变化（真库副本实测）

86 对 raw↔wiki 全有 `hydrogen-bond`；两侧都有轮记录 → `kc` 由 0.5 升到同世占比（预期接近 1）。**这是把「中性 0.5」换成真读数，不是调参**。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | raw→wiki 镜像边（hydrogen-bond）计入派生：同世 2/2 → kc=1 |
| AC-2 | 同世 1/2 → kc=0.5（走的仍是同世占比，不是硬编码 1）|
| AC-3 | source 非 raw（如 `concept-a → wiki-b`）不计 → kc 中性 0.5 |
| AC-4 | `raw-x → wiki-y`（非同源镜像）不计 → kc 0.5 |
| AC-5 | 显式 `derived` 边仍计入（回归）|
| AC-6 | 其他四维不受影响：同 fixture 下 kd 只数 strength≥7 非候选出边，镜像边 strength 5 不进 kd |

## 三、边界

- 不新建、不迁移任何边；不动 entities / links 行。
- 不改 `distill`（它仍会在「无 import 前置」时建 `derived`）。
- 不追求 `kc` 区分度变高——本件只让读数不再是常数。
