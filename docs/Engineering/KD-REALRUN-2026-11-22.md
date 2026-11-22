---
tags: [aing-v2, kd, kd-cited, 真库实跑, P3, 承接, 拍板, 量档, spec:9, handoff:9]
description: kd-cited 真库实跑（2026-11-22）——副本真库跑一轮 runP3Once，系统自己跑通 8/8，kd 0→1、票 verified；支撑「维持现状」拍板
date: 2026-11-22
status: 已量完（真库副本实跑，唔动真库）
owner: hana
upstream: [docs/Engineering/KD-CITED-REACHABILITY-2026-11-22.md, docs/Engineering/KD-BIDIR-REPROBE-2026-11-22.md, spec/SPEC-6.61-P3位寄生承接.md, src/parasite-runner.js]
---

# kd-cited · 真库实跑真值（KD-REALRUN）

## 〇、结论先行

1. **副本真库上跑一轮 `runP3Once`，系统自己跑通 8/8**——唔系手工模拟。`kd` 0 → **1**（唔系 0.3333），票全 `verified`。
2. **`kd<0.30` 占比 272/322（84.5%）→ 264/322（82.0%）**，正好修掉 8 张，与量档预期逐张对上。
3. **选项①（维持现状）的反对理由「结构上空转」已彻底唔成立**：唔只量得出，系系统自己一轮跑通。D18 可以关闭。
4. **回退条件**：若后续任一轮真库实跑 `kd-cited` 达成率 **< 50%**，选项②（B′ 条件豁免）需重新拍板。

## 一、量法

副本真库（`data/knowledge.db` → 临时 yard，**唔动真库**），完整链：

```
kespiStep → scanTickets(persist) → dispatchTickets → runP3Once
```

`runP3Once`（`src/parasite-runner.js`，SPEC-6.61）系真承接者：领 P3 单 → 外部件 `externalPartEdges` 镜像入向强边来源 → `applyProposalResult` 写回 → `promoteEdges` → 重算 → `verifyTickets`。

**与上一轮模拟的区别**：上一轮系人工构造「理想回单」（target = 入向强边来源）；本轮外部件系代码、由系统自己跑，**无手工干预**。

## 二、真库实跑读数（322 实体 / 2324 边）

| 项 | 读数 |
|---|---|
| scan 候选单 | 13 张 |
| `kd-cited` 开单 | **8 张**（全 `proposed`）|
| claim 领单 | 8 张 |
| 回单成功 | **8 / 8**（`ok: true`）|
| `promoteEdges` 提升 | **57 条** |
| 拒绝 | 15 条 `insufficient-evidence` |
| 边数 | 2324 → **2381**（+57）|
| **`kd-cited` 达成率** | **8 / 8** |
| **`kd`** | **0 → 1**（全部）|
| **票状态** | **全部 `verified`** |
| `kd<0.30` 占比 | 272/322 → **264/322**（-8）|

### 逐单

| 实体 | 状态 | `kd` |
|---|---|---|
| `dispatch-…-drone-campaign-sources` | verified | 1 |
| `dispatch-…-src-landscape-sources` | verified | 1 |
| `skill-registry-ai-llm-security` | verified | 1 |
| `skill-registry-supply-chain-security` | verified | 1 |
| `wiki-dispatch-…-drone-campaign-sources` | verified | 1 |
| `wiki-dispatch-…-src-landscape-sources` | verified | 1 |
| `wiki-skill-registry-ai-llm-security` | verified | 1 |
| `wiki-skill-registry-supply-chain-security` | verified | 1 |

`kd` 上到 1 唔意外：呢 8 张实体有**多个**入向强边，镜像出多条出向边，`kd = clamp01(出向强边/3)` 顶满。

### 15 条 `insufficient-evidence`

系提升闸在**正常工作**（`distinct < 2` 类证据 → 唔提升），唔系缺陷。真库原有 15 条候选边证据单薄，被挡喺候选态——符合「≥2 类独立证据才成种」口径。

## 三、对拍板的意义

- 选项②（B′ 条件豁免）嘅代价喺本轮更清楚：**佢取消嘅恰恰系唯一真能修 `kd` 嘅入口**，而呢个入口喺真库跑通 8/8。
- `kd<0.30` 剩 264/322（82%）**系库拓扑事实**（多数实体既唔催化又唔被引用），唔该用改口径去掩盖。
- B′ 唔系修 bug，系改立场：把「被引用唔催化」从「债」重定义为「豁免」。

### 边界：唔该夹带落 D18 嘅事

若真要处理「被引用型实体唔该唔该背 `kd=0` 嘅债」，正确姿势系**新增维度语义**（「被引用」系资产非负债，单独记账），**另立新任务、另立 spec**——夹落 D18 就系用改评分去拍立场争议。

## 四、回退条件

> **若后续任一轮真库实跑 `kd-cited` 达成率 < 50%，选项②（B′ 条件豁免）需重新拍板。**
> 本轮 100%（SPEC-6.62 归并后基数 4 张）。

## 五、关键引用

- 真库实跑脚本：`G:\DPD\.mimosa\realrun-p3.js`（副本真库，只读真库）
- 承接实现：`src/parasite-runner.js` `runP3Once`；外部件 `tools/parasite-round.js` `EDGES_REG` / `externalPartEdges`
- 规格：`spec/SPEC-6.61-P3位寄生承接.md`
- 上游量档：`docs/Engineering/KD-CITED-REACHABILITY-2026-11-22.md`（可达性上限）、`docs/Engineering/KD-BIDIR-REPROBE-2026-11-22.md`（三选项量化）
- 真值：177 档 / 1181 条断言全绿；33 项门禁 ALL GREEN
