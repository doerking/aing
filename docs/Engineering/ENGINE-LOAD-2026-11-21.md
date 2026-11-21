---
tags: [aing-v2, engineering, engine, load, spec:9, evidence:9]
description: 引擎负载对比实测（2026-11-21）——同副本同负载下 sqljs vs nodesqlite：nodesqlite 峰值内存 -25%、开库 10x 快、写放大 ~30x 小（WAL vs 整库覆写）、查询时延持平、轮耗时 +20%；工具 tools/engine-load.js
date: 2026-11-21
status: active
owner: hana
---

# 引擎负载对比 · 2026-11-21

> 目的：给「默认引擎切不切 nodesqlite」（SPEC-8 修订 A / 交接单 §十三#2）提供真实负载数据。
> 原则：不拍脑袋切——只量，切由 owner 拍板。测量工具 `tools/engine-load.js`（测量工具，非门禁）。

## 一、方法

- **源**：`data/knowledge.db`（真库，只读源；每个引擎各拷一份，绝不碰源）。
- **负载**：① 2 轮完整代谢（`orchestrate runCycle('代谢')`，21 步，写路径）② 每轮后 6 条检索融合查询（读路径）③ 全程 OS 侧峰值 RSS（`process.resourceUsage().maxRSS`）。
- **写放大**：parent 每 8ms 看 db 文件 mtime，数整库文件写次数（sqljs 每次 persist 重写全文件；nodesqlite 走 WAL 追加，不覆写）。`dbBytesWritten` 对 sqljs 系真值（写次数 × 全文件），对 nodesqlite **不代表真值**（不覆写全文件，只作 mtime 变化计数）。
- **采样说明**：setInterval 内采样 RSS 在同步负载下靠唔住（timer 阶段未必行到），改用 OS 追踪的 `maxRSS`，结尾读一次即真值。
- **后端**：onnx-e5-small 未注册 → 回退 hash-64w2（两引擎一致，不影响对比）。

## 二、结果（rounds=2, queries/round=6）

| 指标 | sqljs（默认） | nodesqlite | 赢家 |
|---|---|---|---|
| 峰值 RSS | **295.4 MB** | **221.8 MB** | nodesqlite（-25%） |
| 开库 | 70 ms | 7 ms | nodesqlite（10x） |
| 轮耗时 ①/② | 1973 / 1565 ms | 2406 / 1884 ms | sqljs（约 -20%） |
| 查询 p50 | 30 ms | 33 ms | 平 |
| 查询 p95 | 2452 ms | 2480 ms | 平 |
| 整库写次数 | 24 次 | 9 次（mtime 变） | — |
| **写放大（落盘）** | **≈138 MB**（24 次整库覆写） | **≈4.1 MB WAL** | nodesqlite（~30x） |

复跑一致性：首跑 288.4 vs 222.9、二跑 295.4 vs 221.8 —— 方向与量级一致。

## 三、判读

- **内存**：nodesqlite 省 ~74 MB（25%）。真库 5.75 MB 下两引擎峰值都高（280+/220+），峰值由轮内分配（vector/kespi/JSON）主导，非库本身；但 file-backed 引擎省掉「整库读入 + wasm 堆」这一层，随库体量放大差距更大（6.12 已录：10 MB 库 → wasm 堆 103 MB / RSS 峰 142 MB）。
- **开库**：nodesqlite 直接开文件（7 ms），sqljs 整库读入 + wasm 初始化（70 ms）。冷启动快 10x。
- **查询**：两引擎几乎持平（p50 30 vs 33 ms；p95 均 ~2.4 s，首查询含懒初始化）。
- **轮耗时**：sqljs 快约 20%（内存库无 WAL/锁开销），但单轮仍 ~2.4 s 级，实务可接受。
- **写放大**：nodesqlite 占优显著——sqljs 每 persist 覆写全库（2 轮 ≈ 138 MB 落盘），nodesqlite WAL 追加（≈4.1 MB）。移动端 flash 写寿命 / 容量 / 崩溃自愈（WAL 原子性）全受益。

## 四、结论（供拍板）

nodesqlite 在**内存、开库、写放大**三项占优（且随库体量放大更明显），代价是**轮吞吐 -20%**。若目标场景含移动/嵌入式/频繁冷启动/flash 写寿命敏感，nodesqlite 胜；若纯高性能服务器且库常驻内存，sqljs 仍可。

**拍板（2026-11-21，owner）**：默认引擎切 `nodesqlite`。已落地：`src/db-adapter.js` 默认 `'sqljs'`→`'nodesqlite'`；SPEC-8 §一配置项默认值同步；全量 166 档/1107 断言 + verify-deploy 33 项 ALL GREEN（sqljs 仍可经 `AING_DB_ENGINE=sqljs` 显式选择，SQLJS 专属语义测试强制 sqljs）。
