---
tags: [aing-v2, kd, kd-cited, 探针, 可达性, 拍板, 量档, spec:8, handoff:8]
description: kd-cited 提案单回单达成率探针（2026-11-22）——真库 8 张 kd-cited 单，模拟理想回单后可达性 8/8；修订 B 前后 0/8 → 8/8
date: 2026-11-22
status: 已量完（tools/kd-cited-reachability-probe.js）
owner: hana
upstream: [docs/Engineering/KD-BIDIR-REPROBE-2026-11-22.md, docs/Engineering/GREENZONE-REPROBE-2026-11-22.md, spec/SPEC-6.60-kd-cited建边落地.md, src/proposal-result.js, tools/kd-cited-reachability-probe.js]
---

# kd-cited 提案单 · 回单达成率与闭环可达性（KD-CITED-REACHABILITY）

## 〇、结论先行

1. **真库 8 张 `kd-cited` 单，模拟「理想回单」后 8/8 全通**（`kd` 0 → 0.3333、提升成 `hydrogen-bond@7`、`checkAcceptance` 皆 accepted）。
2. **修订 B 之前系 0/8**——全部 `edge-exists`。根因系幂等闸**无向**，而 `links` 主键**有向**：`kd-cited` 的唯一修路（建反向边）被当重复挡死。系实现偏离数据模型，**非立场**。
3. **本量推翻「选项①反对理由系结构上空转」这句**：修完幂等口径后，「可闭环」喺真库成立。选项①（维持现状）的最大反对理由已唔再系事实。
4. **探柡自身陷阱**：同进程逐单跑 `verifyTickets` 会判**全部** `proposed` 单，前 4 轮把后 4 张推到终态——初跑 4/8 系**探针污染**，唔系真库。隔离方式见第五节。

## 一、缘起

`KD-BIDIR-REPROBE-2026-11-22.md` 三选项里，选项①（维持现状）嘅最大反对理由系「8 张 `kd-cited` 单结构上空转——回单无论写咩都唔改 `kd`」。6.60 + 修订 A 落地后该前提已变，但「真库这 8 张真能修几多」仍系经验问题，**唔该用立场答，该用数答**。

本量回答：**唔改任何口径**，量到底有几多单真能过 acceptance。

## 二、量法

`tools/kd-cited-reachability-probe.js`（只读探针，照 `tools/greenzone-probe.js` 同模式）：

1. 默认先把真库复制到临时 yard 再量（唔动真库）；`--db <副本>` 可直量。
2. 真库实况：`scanTickets({persist:false})` → 8 张 `kd-cited` 候选；`gateVerdict = prune-only`（边产 15 / 边退 1115，带 [0.8, 1.5]）。
3. **模拟理想回单**：`target = 入向强边来源`（把被引用关系镜像成出向边），证据 2 类，跑
   `scanTickets(persist) → dispatchTickets → applyProposalResult → promoteEdges → kespiStep → checkAcceptance`。
4. **每单喺独立副本上跑一轮**（隔离 `verifyTickets` 嘅顺序副作用，见第五节）。

**系「模拟可达性上限」，唔系实跑**——外部件愿唔愿意交回单系另一回事。

## 三、真库量（322 实体 / 1209 边 / 候选边 15 / 强边 294）

| 轮次 | 回单达成率 | 现象 |
|---|---|---|
| 修订 A 后、修订 B 前 | **0/8** | 8 张全 `edge-exists`（幂等闸无向）|
| 修订 B 后、探针未隔离 | **4/8** | 后 4 张 `terminal-state`——**系探针污染**（见五节），唔系真库 |
| 修订 B 后、探针隔离后 | **8/8** | `kd` 0 → 0.3333，`hydrogen-bond@7`，acceptance 皆 accepted |

8 张逐单结果（隔离后）：

| 实体 | target（入向来源）| 建边 | `kd` | acceptance |
|---|---|---|---|---|
| `dispatch-…-drone-campaign-sources` | `dispatch-…-drone-campaign-w1` | `hydrogen-bond@7` | 0 → 0.3333 | ✅ |
| `dispatch-…-src-landscape-sources` | `dispatch-…-src-landscape-w1` | `hydrogen-bond@7` | 0 → 0.3333 | ✅ |
| `skill-registry-ai-llm-security` | `agent-skills-registry` | `hydrogen-bond@7` | 0 → 0.3333 | ✅ |
| `skill-registry-supply-chain-security` | `agent-skills-registry` | `hydrogen-bond@7` | 0 → 0.3333 | ✅ |
| `wiki-dispatch-…-drone-campaign-sources` | `wiki-dispatch-…-drone-campaign-w1` | `hydrogen-bond@7` | 0 → 0.3333 | ✅ |
| `wiki-dispatch-…-src-landscape-sources` | `wiki-dispatch-…-src-landscape-w1` | `hydrogen-bond@7` | 0 → 0.3333 | ✅ |
| `wiki-skill-registry-ai-llm-security` | `wiki-agent-skills-registry` | `hydrogen-bond@7` | 0 → 0.3333 | ✅ |
| `wiki-skill-registry-supply-chain-security` | `wiki-agent-skills-registry` | `hydrogen-bond@7` | 0 → 0.3333 | ✅ |

8 张嘅 `history` 皆 `never-landed`——真库 `opt_tickets` 里**本来冇呢批单**（佢哋系 `scanTickets` 算出嘅候选，历史轮次从未落库），故**无僵尸单**（僵尸 0 张）。

## 四、修订 B（幂等口径）

`src/proposal-result.js` `_applyEdges` 幂等检查：

```sql
-- 修前（无向，把反向边当重复）
SELECT 1 AS x FROM links WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)
-- 修后（有向，与 links 主键同口径）
SELECT 1 AS x FROM links WHERE source_id = ? AND target_id = ?
```

**唔系改立场**：唔改评分、唔改开票条件、唔推翻 D18。只系让幂等语义与数据模型（`links` 有向主键 + KESPI 只数 `source_id`）一致。无向检查系**过度防御**——佢保护嘅「反向系重复」喺本仓模型里唔成立。

新增 `AC-14`：`e-x`→`e-y` 已有正向边时，`e-y` 嘅 `kd-cited` 单对 `e-x` 交回单 → 建反向边成功（唔系 `edge-exists`）。先验红后转绿，14/14。

## 五、探针自身陷阱（可复用）

**同进程逐单跑 `verifyTickets` 会污染后段嘅单**：`verifyTickets` 处理 `status IN ('dispatched','proposed')` 嘅**全部**单，前 4 轮嘅心跳把后 4 张推到终态，致后 4 张 `applyProposalResult` 返 `terminal-state`。初跑 4/8 系呢个原因，**唔系真库事实**。

隔离方式（已落探针）：
1. 每单喺**独立副本**上跑一轮；
2. solo 模式**唔跑 `verifyTickets`**，改用 `ticket-demand.checkAcceptance(demand, now)` 直接判——语义同 `verifyTickets` 嘅判定路径，但唔波及其他单。

## 六、对拍板嘅影响

- 选项①（维持现状）嘅「结构上空转」反对理由**已唔再系事实**——真库 8 张真能修 8 张。
- 剩余争议（「被引用型实体唔该唔该背 `kd=0` 嘅债」）系**语义问题**，唔系可达性问题。
- 选项②（B′ 条件豁免）嘅代价喺本量后更清楚：**佢取消嘅系唯一真能修 `kd` 嘅入口**。

## 七、关键引用

- 探针：`tools/kd-cited-reachability-probe.js`（`--json` 出结构化结果；`--db <副本>` 直量）
- 幂等口径：`src/proposal-result.js` `_applyEdges`
- 规格：`spec/SPEC-6.60-kd-cited建边落地.md` 修订 B + AC-14
- 上游量档：`docs/Engineering/KD-BIDIR-REPROBE-2026-11-22.md`
- 真值：`test-6.60-kd-cited-edges` 14/14；176 档 / 1168 条断言全绿；33 项门禁 ALL GREEN
