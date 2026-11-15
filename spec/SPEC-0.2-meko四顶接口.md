---
tags: [aing-v2, spec, meko, 接口, M0, spec:9, must-read:8, meko:7]
description: M0.2 meko 四顶接口 spec——HydrogenBond/HistoneLayer/StarlinkOrchestrator/HelixCrosscheck 四类签名，可 mock，带 acceptance criteria
date: 2026-11-13
status: draft（待 owner review）
owner: ring
upstream: [ARCHITECTURE-全架构重写图纸-DNA双铰链-从零实现-2026-11-13.md §四, SPEC-0.1-数据模型.md]
---

# SPEC-0.2 · meko 四顶职责接口

> M0 纯设计零码。meko 中间质四顶职责 = ①氢键结合 ②组蛋白分层 ③星闪编排 ④双链互校。
> 决策默认（内置）：**meko 全并入 aing 双链编排**（非只借哲学）——四顶职责各自成类、可独立 mock。
> 依赖 SPEC-0.1（数据模型），操作 entities/links/meko_cycles 三表。

---

## 一、目标

钉死 meko 四顶职责的**类名 + 方法签名 + 入参出参 + 可 mock 边界**，让 M1/M2 的 failing test 能拿接口 mock 锁行为（R1 failing test 先行的前提）。

## 二、四顶接口（spec 即契约）

### 2.1 ① HydrogenBond 氢键结合（弱键可逆）`src/meko-hydrogen-bond.js`
```js
class HydrogenBond {
  // 结合：双链靠弱键连（对应渐进迁移，wired 可开可断）
  async bond(rawEntity, wikiEntity): Promise<{ bondId: string, wired: boolean }>
  // 解旋：弱键可逆断开（唔锁死，对应迁移回滚）
  async unwind(bondId: string): Promise<{ unwound: boolean, rawEntity, wikiEntity }>
}
```

### 2.2 ② HistoneLayer 组蛋白分层（9 段分层表达）`src/meko-histone-layer.js`
```js
class HistoneLayer {
  // 入口门槛：只准 7-9 强度进检索入口（组蛋白隔离噪声）
  getEntryThreshold(): 7
  // 分层加载：左 9,8,7=快车道 / 中 6,5,4=切换 / 右 3,2,1=慢车道
  routeByStrength(strength: int): 'SLB' | 'SLE' | 'switch'
}
```

### 2.3 ③ StarlinkOrchestrator 星闪编排（最大缺口，净新增）`src/meko-starlink-orchestrator.js`
```js
class StarlinkOrchestrator {
  // G 节点中心调度（借星闪 C 帧中心）
  async scheduleCycle(cycleType: string, helixStrand: 'raw'|'wiki'|'both'):
    Promise<{ scheduledAt: Date, deadline: Date, mode: 'SLB'|'SLE' }>
  // 确定性时延上界（借 SLE 超短帧哲学：每轮有界）
  computeDeterministicDeadline(cycleType: string): Date
  // 通感一体：编排同时探测拓扑健康（KESPI 内嵌）
  async probeTopologyHealth(): Promise<{ kespiSnapshot: number }>
}
```
> 详算法见 SPEC-0.3（星闪调度协议）。

### 2.4 ④ HelixCrosscheck 双链互校（螺旋互校，漏需求互补链对返）`src/meko-helix-crosscheck.js`
```js
class HelixCrosscheck {
  // 互校：raw↔wiki 交替校验，每轮留互补痕迹
  async crosscheck(): Promise<{
    rawGaps: string[],   // wiki 有 raw 无
    wikiGaps: string[],  // raw 有 wiki 无
    reconciled: number   // 漏需求被互补链对返数（P0 防漏）
  }>
}
```

## 三、Acceptance Criteria（可客观检验）

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 四类可 mock | 四个类各能 `new` 出实例、四顶方法可 stub（签名齐、返回 Promise 形状对） |
| AC-2 | HydrogenBond 可逆 | 假院 bond(raw,wiki) 得 bondId → unwind(bondId) → rawEntity/wikiEntity 原样返，wired 翻 false |
| AC-3 | HistoneLayer 门槛 | `getEntryThreshold()===7`；routeByStrength(9/8/7)='SLB'、(6/5/4)='switch'、(3/2/1)='SLE' |
| AC-4 | StarlinkOrchestrator 时延有界 | scheduleCycle 返回的 `deadline` 恒 > `scheduledAt` 且差值 ≤ T_bound（详见 0.3）|
| AC-5 | HelixCrosscheck 互补发现 | 造 wiki有raw无 1 条 → crosscheck().rawGaps 含该 id；返回含 rawGaps/wikiGaps/reconciled 三字段（reconciled 形状锁死，对返数 ≥1 属 M2 完整代谢任务，本 AC 只锁发现能力） |

## 四、Non-Goals

- **不含星闪调度算法细节**——SLB/SLE 双模算法、T_bound 计算、G 节点调度协议在 SPEC-0.3。
- **不含三轴判定逻辑**——strength≥7/配对合法/invalid_at 在 SPEC-0.4。
- **不实现**——M0 零码，实现属 M1（任务1.14 meko 编排）/M2（任务2.1-2.8 四顶）。
- **不并入外部存储/编排层**——meko 是 aing 自有中间质，存储与编排全在 aing 内部闭环，不并入任何第三方方案。

## 五、依赖

- **上游**：SPEC-0.1（三表 schema）
- **被依赖**：SPEC-0.3（③接口的调度算法）、SPEC-0.4（三轴判定喂给②③）、M1 任务1.14、M2 任务2.1-2.8

---

> **M0 门**：四份 spec 齐 + owner 拍板 → 开 M1。