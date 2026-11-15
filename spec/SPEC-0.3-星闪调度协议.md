---
tags: [aing-v2, spec, 星闪, 调度协议, M0, spec:9, must-read:8, starlink:7]
description: M0.3 星闪调度协议 spec——SLB/SLE 双模 + G 节点中心 + 确定性时延上界 T_bound 算法，带 acceptance criteria
date: 2026-11-13
status: draft（待 owner review）
owner: ring
upstream: [ARCHITECTURE-全架构重写图纸-DNA双铰链-从零实现-2026-11-13.md §四.3, 全景图 §2.3, SPEC-0.2]
---

# SPEC-0.3 · 星闪确定性调度协议

> M0 纯设计零码。meko ③星闪编排 = **最大缺口，净新增**（全景图 §6.1）。
> 借星闪原理（非实现星闪通信）：SLE 超短帧→确定性时延上界；SLB/SLE 双模→强弱分流；Polar 码→抗干扰；C 帧中心→G 节点调度；通感一体→编排同时探健康。
> 依赖 SPEC-0.2（StarlinkOrchestrator 接口）。

---

## 一、目标

钉死星闪调度的**双模分流规则 + G 节点调度 + 确定性时延上界 T_bound 算法**，让 M2 任务 2.3 failing test 能锁「时延有界」这个核心断言（唔係「几时收敛唔知」）。

## 二、SLB/SLE 双模分流（强度轴 → 通信模式）

| 段位 | 分层 | 模式 | 语义 |
|---|---|---|---|
| 9,8,7 | 左 | **SLB 宽带快车道** | 高强度边走快车道（入口级） |
| 6,5,4 | 中 | **switch 切换** | meko 模式切换区 |
| 3,2,1 | 右 | **SLE 窄带慢车道** | 低强度/背景边走慢车道 |

> 分流函数 = `HistoneLayer.routeByStrength()`（SPEC-0.2 §2.2），本 spec 定义其调度语义。

## 三、G 节点中心调度

- **G 节点 = meko 编排中心**（借星闪 C 帧中心协调空口时机）。
- 每轮代谢 = 一次 G 节点调度：`scheduleCycle(cycleType, helixStrand)` 分配 `scheduled_at` + `deadline`。
- cycle_type ∈ {解旋, 复制, 再螺旋, 互校}（meko_cycles 表，SPEC-0.1 §2.3）。

## 四、确定性时延上界 T_bound（核心）

### 4.1 算法
```
T_bound(cycleType) = base(cycleType) × loadFactor
  base: 解旋=1 / 复制=2 / 再螺旋=2 / 互校=3（单位：调度节拍 tick）
  loadFactor = ceil(pendingEdges / edgeBatchSize)   // 待处理边分批
deadline = scheduled_at + T_bound
```
- **有界承诺**：任一 cycle 必在 `deadline` 内完成或标记 `failed`，绝不无限等待。

### 4.2 Polar 抗干扰（≤3 弱边拒入口）
- 强度 < 3 的边 = 噪声边，**拒做检索入口**（分层隔离噪声，借 Polar 灵敏度 +7dB）。
- 判定与 SPEC-0.4 三轴判定协同（`shouldEnterRetrieval` 的 strength≥7 已覆盖，此处是调度的前置过滤）。

### 4.3 通感一体
- 编排同时探测拓扑健康：每轮 `scheduleCycle` 顺带写 `kespi_snapshot`（meko_cycles 表列）。

## 五、Acceptance Criteria（可客观检验）

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | T_bound 可计算 | 给定 cycleType + pendingEdges → `computeDeterministicDeadline` 返回确定 `deadline`，纯函数可复现 |
| AC-2 | 时延有界 | 造 100 待处理边跑 scheduleCycle → deadline−scheduled_at ≤ T_bound（loadFactor 已计入），不出现无限 |
| AC-3 | 双模分流 | strength 9→SLB / 5→switch / 2→SLE，三段各归其位 |
| AC-4 | 噪声拒入口 | strength<3 的边被 scheduleCycle 拒（返回 reject/noise 标记），不排入快车道 |
| AC-5 | 通感写回 | 跑一轮 scheduleCycle → meko_cycles 表新增行含非空 kespi_snapshot |

## 六、Non-Goals

- **不实现真实星闪通信**——只借原理（时延上界/双模/抗干扰/G节点/通感），非通信协议栈。
- **不并入任何外部编排方案**——本 spec 是 aing 内部 meko 调度，独立实现，不依赖也不点名任何第三方编排台。
- **不实现**——M0 零码，实现属 M2 任务 2.4-2.7。
- **不碰意识层事件调度**——意识层 W2 控制面属 M3 任务 3.2，本 spec 只管代谢编排。

## 七、依赖

- **上游**：SPEC-0.2（StarlinkOrchestrator 接口）、SPEC-0.1（meko_cycles 表）
- **被依赖**：M2 任务 2.3（failing test 锁时延）、2.4-2.7（实现）

---

> **M0 门**：四份 spec 齐 + owner 拍板 → 开 M1。