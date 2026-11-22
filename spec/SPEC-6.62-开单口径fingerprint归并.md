---
tags: [aing-v2, spec, 开单口径, fingerprint, 归并, 去重, 自优化, spec:9, engineering:8]
description: SPEC-6.62 开单口径按 fingerprint 归并——同一内容每维只开 1 张工单，真库候选 13→7，零铁律冲突
date: 2026-11-22
status: 已落地
owner: hana
upstream: [spec/SPEC-6.8-自优化闭环-误差工单到场域动作.md, spec/SPEC-1.12-KESPI.md, src/self-optimize.js, src/identity.js, docs/Engineering/TICKET-SLOT-OWNERSHIP-2026-11-22.md]
---

# SPEC-6.62 · 开单口径按 fingerprint 归并

## 一、要解决咩

真库 322 实体 = **118 个真内容 × 2–3 份拷贝**（`bare` + `wiki-` + `raw-` 三抄），
由 `distill.js` 直接 `insertStmt.run` 绕过 `identity.js` 嘅 fingerprint 归一产生。
后果：同一内容嘅每张拷贝**各背一份工单**——真库候选 13 张，
其中 `kq-low` 5 张实为 3 个真内容、`kd-cited` 8 张实为 4 个真内容。

## 二、点算算对

1. 同一 `fingerprint` 组内，**每个维度只开 1 张工单**。
2. 组内取**分数最低**嘅实体作代表（真库量过：候选按 `score` 升序，首个入组者即代表）。
3. **同维在途单系组级幂等**：组内任一成员已有在途单（`open`/`dispatched`/`proposed`），
   其余成员唔再重开——唔使等 TTL 3 轮 `proposal-expired` 重开。
4. **唔动实体、唔动边、唔写 `invalid_at`**——零铁律冲突。
5. 评分口径（`kespi.js`）**一字未改**：`fingerprint` 唔参与评分。

## 三、口径

- `fingerprint` 列系库层单一来源（`identity.js#fingerprint`，`knowledge-store` 已回填，
  真库 118 个不同值、仅 1 条空值）。本件**唔自己算**内容指纹。
- `fingerprint` 为空嘅实体 `fpKey` 回落自身 id → **永不与他人归并**，行为与旧口径一致（安全默认）。

## 四、实现要点

在 `self-optimize.js#scanTickets` 嘅候选循环加一处闸，两个分支（`kd` 提案 / 其余维度）同口径：

```js
// SPEC-6.62：同一 fingerprint 组内每维只开 1 张——真库 322 实体 = 118 内容 × 2–3 抄，
// 不合并则每张拷贝各背一份单。组内取分数最低者作代表（cands 已按 score 升序）。
const fpKey = fpByKey.get(entityId) || entityId;
const seenKey = fpKey + '\u0000' + dim;
if (seenDims.has(seenKey) || fpOpen.has(seenKey)) continue;
seenDims.add(seenKey);
```

- `fpByKey`：一次性读 `SELECT id, fingerprint FROM entities WHERE invalid_at IS NULL`。
- `fpOpen`：现有 `_openKeys` 展开成「组内任一成员在途」→ 该 `fpKey+dim` 已占。

## 五、验收标准

| 编号 | 验收 |
|---|---|
| AC-1 | 两张同 `fingerprint` 实体皆命中 `kq-low` → 只开 1 张，`entity_id` 系 `score` 最低者 |
| AC-2 | 代表入组后，第二轮 `scanTickets`（`persist:false`）对同组其余成员**唔再重开** |
| AC-3 | 同维在途单系组级幂等：组内任一成员有在途单 → 整组唔重开（唔使等 TTL） |
| AC-4 | 不同 `fingerprint` 嘅实体各自照旧开单（归并唔误伤） |
| AC-5 | `fingerprint` 为空嘅实体唔与他人归并（回落自身 id），行为与旧口径一致 |
| AC-6 | 评分口径未动：归并前后同一实体嘅 `kq`/`kd`/`overall` 读数一致 |
| AC-7 | 真库口径：候选 13 张 → **9 张**（`kd-cited` 8→4；`kq-low` 5→5 但系 **5 个唔同内容**——todo 3 抄→1、insight 2 抄→2（`wiki-insight-1383c174` fp 为 NULL 唔归并）、quota 名额让俾另外 2 个真内容），达成率 4/4 |

## 六、已知边界（唔在本件）

- **上游根**：`distill.js` 入库前唔查 `fingerprint`，系三抄嘅真根。本件只改**开单口径**，
  唔回溯、唔去重实体。上游归一另立线。
- **基数变化**：`kd-cited` 基数 8 → 4。D18 回退条件口径同步为「归并后基数 4 张」；
  达成率仍 100%，`KD-REALRUN` 嘅 `8/8` 读数为归并前口径。
- **`fingerprint` 回填缺口**：真库 `wiki-insight-1383c174` 嘅 `fingerprint` 为 NULL（全库唯一，
  回填遗漏），本件对 NULL 回落自身 id（安全默认）→ 该副本唔与 `raw-insight` 归并。
  回填缺口另立线；唔在本件修（唔改库、唔回溯）。
