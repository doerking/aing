---
tags: [aing-v2, spec, 核心代谢, link-sync, 双链边一致, M1, spec:8, link-sync:8]
description: M1.7 link-sync spec——raw 链内部有效边镜像到 wiki 链（同 relation/strength），缺镜像端点不建幽灵边，退役边不同步，幂等
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-1.2, SPEC-1.4, SPEC-0.1, INVENTORY A 行 sync-links-to-fs]
---

# SPEC-1.7 · link-sync（双链边一致）

> 旧院 sync-links-to-fs 把 DB 边落 wiki/links 文件，做「双脑同步」。新架构 wiki 链就在 DB 里，
> 所以 link-sync 改成**跨链镜像**：raw 链上已经成立的边，wiki 链也要有一条对应边——两链的拓扑必须同构，否则互校会比错东西。

---

## 一、目标

把 raw 链内部的有效边镜像到 wiki 链（端点换成各自镜像），保证双链拓扑一致；缺端点不建幽灵边。

## 二、行为（spec 即契约）

### 2.1 取边
- 取 links 中 `invalid_at IS NULL` 的边
- 只处理**两端都属于 raw 链**的边（id 不以 `wiki-` 开头）
- 跨链边（raw↔wiki）与 wiki 内部边不动——跨链边由场域互校（2.12）管

### 2.2 镜像
- 目标边 = (`wiki-<base(src)>` → `wiki-<base(dst)>`)，`relation` 与 `strength`、`confidence` 照抄源边
- 源边与目标边相同（自环）→ 跳过
- **缺端点不建**：任一镜像实体不存在 → `skippedNoMirror++`，不落幽灵边
- 目标边已存在（含已退役）→ 不重复插、不自动复活

### 2.3 铁律
- 不碰任何实体 `last_access`
- 无物理 DELETE
- 幂等：第二趟 `synced = 0`

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | raw 内部边镜像 | wiki-src→wiki-dst 存在，relation/strength/confidence 与源边一致 |
| AC-2 | 缺镜像不建幽灵边 | 终点无 wiki 实体 → 不建边，`skippedNoMirror` 计数 |
| AC-3 | 跨链/wiki 边不动 | 预置 wiki↔wiki 边 0 条；跨链边条数不变 |
| AC-4 | 退役边不同步 | invalid_at 非空的源边不产生镜像 |
| AC-5 | 幂等 | 第二趟 synced=0，links 行数不变 |
| AC-6 | 无物理删 + last_access 不变 | 源码无 `DELETE FROM`；实体 last_access 不变 |

## 四、Non-Goals

- 不建新语义边（1.6 link）
- 不裁 hub（2.11）
- 不做跨链复校（2.12）
- 不写文件（旧院 wiki/links 落盘在 v2 废止）

## 五、契约

- 组件 id `link-sync`，strand `cross`，band `background`，reads `['entities','links']`，writes `['links']`，budgetTick 1，reversible true
- 入口：`async linkSyncStep(store, opts) -> { scanned, synced, skipped, skippedNoMirror }`

## 六、依赖

- 上游：SPEC-1.2（边形状与 strength 映射）、SPEC-1.4（镜像 id 规则）
- 消费者：2.12 互校、1.8 向量
