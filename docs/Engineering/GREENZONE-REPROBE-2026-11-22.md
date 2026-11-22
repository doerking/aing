---
tags: [aing-v2, greenzone, kespi, 量档, 探针, 拍板, spec:8, handoff:8]
description: greenZoneGate 开闸影响面复量（2026-11-22）——拍板依据「开闸 0 影响」已失效：真库 13 单里 4 张 overall 已漂过绿线；根因系 ka 时效维漂移，唔系库变脏
date: 2026-11-22
status: active
owner: hana
upstream: [STATUS.md, spec/SPEC-6.8-自优化闭环-误差工单到场域动作.md, docs/Engineering/KESPI-CALIBRATE-2026-11-21.md]
---

# greenZoneGate 开闸影响面复量（GREENZONE-REPROBE）

## 〇、结论先行

1. **「greenZoneGate 保持关」仍正确**——默认 `0`（关）已被 `test-6.8b-greenzone.js` AC-1 锁死，唔靠人记。
2. **但拍板当时嘅理由要作废**：2026-11-21 写「真库 13 个 ticket 候选全部 overall<0.60 → 开闸 0 影响」。**今日复量：13 单里有 4 张嘅实体 overall 已漂过绿线**（0.6367 / 0.6533 / 0.67 / 0.67）→ 开闸会剔 4/13。
3. **根因唔系库变脏，系 `ka` 时效维漂移**：`ka`（访问时效）喺七天内为 1、之后按 `exp(-days/30)` 衰减。这些实体近期被访问 → `ka=1` → overall 由 <0.60 漂上 0.60+。所以「开闸剔几张」唔系固定数，**会随库活跃度漂**。
4. **4 张全系 kd 结构性误报**：`kd` = 出向强边 / 3。呢啲实体**出向强边 0、入向边 3–12**——系「被引用」嘅索引/来源型实体，唔系「催化」型。`kd=0` 对它们唔系质量病，系维定义唔适用。

## 一、方法

- 工具：`node tools/greenzone-probe.js`（新增，只读探针）
- 缺省行为：先把 `data/knowledge.db` 复制到临时 yard 再量（**唔动真库**）；`--db <副本>` 可直量指定副本。
- 闸扫用 `scanTickets(store, {persist:false})`——唔落工单、唔改库。
- 闸关扫一次、`setKnob('kespi.greenZoneGate', 1)` 后再扫一次，差集即被剔单。

## 二、今日真值（2026-11-22，真库副本）

| 项 | 值 |
|---|---|
| `kespi.greenZone` | 0.60 |
| 实体 / 已评分 | 322 / 322 |
| overall ≥ 0.60 | 106 张 |
| 闸关单数 | 13 |
| 闸开单数 | 9 |
| **被剔** | **4 张（全 kd）** |

## 三、被剔实体逐个读

| 实体（前缀） | type | kq | ka | kd | kc | kr | overall | 出向强边 | 入向边 |
|---|---|---|---|---|---|---|---|---|---|
| `dispatch-…-drone-campaign-sources` | Conversation | 0.7667 | 1 | 0 | 0.5 | 1 | **0.6533** | 0 | 3 |
| `dispatch-…-src-landscape-sources` | Conversation | 0.6833 | 1 | 0 | 0.5 | 1 | **0.6367** | 0 | 3 |
| `skill-registry-ai-llm-security` | Conversation | 0.85 | 1 | 0 | 0.5 | 1 | **0.67** | 0 | 12 |
| `skill-registry-supply-chain-security` | Conversation | 0.85 | 1 | 0 | 0.5 | 1 | **0.67** | 0 | 12 |

`kq` 全高（0.68–0.85）、`ka=1`、`kr=1`，`kc` 中性 0.5 —— 四个维都冇问题，净系 `kd=0` 拖住。
`kd=0` 嘅读法：`links` 里佢哋只系**被引**（入向边 3/12），出向强边 0；`dispatch-` 两张各有一条 `hydrogen-bond@1`（弱边，唔入强边口径）。

## 四、口径裁定

1. **`greenZoneGate` 维持默认 0（关）**——唔改。闸系安全阀，按需开；开咗剔得对（4 张 kd 误报），但唔急。
2. **「开闸 0 影响」呢句作废**，替换成：**开闸剔张数随 `ka` 漂移，当前 4/13**。
3. **根治唔系开关**：`kd` 系单向（出向强边）口径，对「被引用型」实体结构性唔适用。若要治，系给 `kd` 加双向催化口径或索引型实体豁免——**另立任务**，唔喺闸上打补丁。

## 五、教训（可复用）

- **`db.prepare().get()` 唔系仓内正解 API**：本次先手写探针用 `.get()`，读出实体 410（错）；改用 `step()`/`getAsObject()`（`knowledge-store.js` / `kespi.js` 嘅写法）得 322（对，与 KESPI-CALIBRATE 322 行吻合）。量库数字务必走正解 API，唔好猜。
- **拍板依据要记「点样量出嚟」，唔只记结论**：「0 影响」系某一刻 `ka` 快照下嘅读数，库一转就漂。量档须写方法，先令后人能复量。

## 六、关键引用

- 工具：`tools/greenzone-probe.js`（新增）
- 闸实现：`src/self-optimize.js`（`greenZoneGate > 0 && greenZone > 0 && overall >= greenZone → continue`）
- 旋钮单源：`src/config-runtime.js` `DEFAULTS.kespi.greenZoneGate = 0`
- 锁：`test/test-6.8b-greenzone.js` 4/4（AC-1 默认 0 关 / AC-2 闸关都开票 / AC-3 闸开 green 毕业 / AC-4 阈值 0 无效）
- 上游量档：`docs/Engineering/KESPI-CALIBRATE-2026-11-21.md`
