---
tags: [aing-v2, spec, 提案单, 需求定义, 寄生, 寄生位, 派生链, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.18 提案单需求定义与寄生位点位——提案单必须带"要什么/怎样算好/给谁接/几时作废"，寄生位按派生链逐点定义半寄生与寄生两种植入形态
date: 2026-11-18
status: 设计稿（点位表待 owner 点名后落实现）
owner: hana
upstream: [STATUS.md §七 D17 / D18, spec/SPEC-6.8-自优化闭环-误差工单到场域动作.md, spec/SPEC-6.15-跟单三律.md, docs/Engineering/MEKO-SKILL-IMPORT-2026-11-16.md]
---

# SPEC-6.18 · 提案单需求定义与寄生位

> **一句话**：提案单现在只有一张「读数低了」的条子，没人知道要补成什么样、补到哪、几时作废——所以它只能堆。要让它能被接走，每张单必须自带**需求**；而「谁来补」就是**寄生位**：派生链上逐个点位，外部件可以半寄生（补一块）或寄生（接管整步）。

## 一、提案单的需求定义

### 1.1 现在的单子

```json
{ "score": 0.20, "zone": "red", "source": "kespi", "reason": "proposal-only" }
```

只有「哪一维低了、低到多少」，没有要什么、怎样算好、谁接、几时作废。

### 1.2 需求字段（`demand`）

每张 `memo-card` 提案单的 `evidence_json.demand` 必须齐五段：

```json
{
  "want": "一句话说清缺什么",
  "acceptance": [{ "dim": "kq", "op": "gte", "value": 0.50 }],
  "evidence": ["facts", "pointers", "sourceGrade", "selfAssessment"],
  "mode": "semi",            // semi=补一块 / full=接管整步
  "slot": "P2",              // 接单的寄生位（见 §三）
  "ttlRounds": 3             // 几轮没人接就作废
}
```

- **want**：人读得懂的一句话，不许写「提升质量」这种废话（如「补正文到 400 字以上并有 ≥3 个标签」）。
- **acceptance**：可测判据，跑一遍读数就能判；与 §六 的复核口径同源，不另立一套。
- **evidence**：回单必须带的东西，与发布门同源（事实 / 指针 / 来源分级 / 自评）。缺一件不接收。
- **mode / slot**：这张单该由哪一种寄生形态、在哪个点位接走。
- **ttlRounds**：默认 3 轮。

### 1.3 各维的默认需求

| kind | want | acceptance | slot | mode |
|---|---|---|---|---|
| `kq-low` | 补正文与标签 | `kq >= 0.50` | P2 | semi |
| `ka-low` | 重新激活或体面退场 | 有新的 `access_hits` 记录，或实体退场 | P6 | semi |
| `kr-low` | 进入下一轮代谢且在场 | 下一轮在场 | P6 | semi |
| `kd-cited` | 生成结构出边（派生或关联） | `kd >= 0.30` | P3 | full |
| `overall-red` | 任一维改善 | 任一维 `after > before` | P6 | semi |

### 1.4 作废规则（TTL）

提案单每过一轮 `verifyTickets`：

- 心跳 +1（复用 SPEC-6.15 律三）；
- `beats > ttlRounds` → `rejected`，原因 `proposal-expired`，并入 `out.rejected[]`；
- 作废单立即释放 `(entity_id, dim)` 名额（`_openKeys` 只算 `open` / `dispatched`，不算已作废）。

**为什么不靠时间**：轮次是系统自己的节拍，墙钟时间在空闲库上不成立。

## 二、料（模拟用）

| 料 | 量 | 用途 |
|---|---|---|
| 库内 `pending-distillation` | 2 | 走 P2 蒸馏位，验证半寄生产物能落 future 档 |
| 库内 `raw-*`（已有 wiki 镜像） | 87 | 走 P3 关联位，验证寄生件建议边被闸筛 |
| 库内会话（`type='Conversation'`） | 139（>2000 字仅 2） | 走 P1 成形位，验证六段叙事补全 |
| 库内 `distill_points` | 133 | 走 P4 蒸馏点位的原料 |
| 库外成文（工作区 `articles/`、`CGD/`） | 按需 | 造「长料」模拟，避免只用库里短会话 |

**结论**：库内料偏薄（长会话只有 2 条），模拟要另配 3–5 条**真料**（取工作区成文，压成 ingest payload），否则测不出长文的派生行为。

## 三、寄生位点位表

> 每个位点：**位置** → **输入（需求）** → **输出（回单）** → **写回点** → **半寄生 / 寄生两形态** → **拒绝条件**。

### P1 · 入口成形（auto-ingest 之后）

- **位置**：`auto-ingest.js` 分流后、落库前。
- **输入**：原始会话 `{sessionId, topic, messages}`。
- **输出**：标题 / 标签 / 六段叙事骨架。
- **写回**：`entities.title` `tags` `content`（六段 JSON）。
- **半寄生**：外部件只补 `title` 与 `tags`，六段由系统自己拼。
- **寄生**：外部件交出完整六段，系统只验段数与字段，不重写。
- **拒绝**：段数不足六段 / 字段缺——整件退回，不半截落库。

### P2 · 蒸馏（distill：原料 → 产物）

- **位置**：`distill.js` 的 `pending-distillation` 处理循环。
- **输入**：原料实体 + 需求（`kq` 低/补正文）。
- **输出**：产物内容（合并/摘要/结构化）。
- **写回**：`wiki-*` 产物（`strand='future'`）+ `derived` 边。
- **半寄生**：外部件只补产物的一段（如「要点」节），其余照抄原料。
- **寄生**：整篇产物由外部件给，系统只做保真校验（写后读回逐字相等）。
- **拒绝**：产物为空 / 与原料逐字相同（没加工）/ 写后读回不一致。

### P3 · 关联建边（sprout / pollinate / 场域关联）

- **位置**：`sprout.js` / `pollinate.js` / `field-maintain`。
- **输入**：目标实体 + 需求（`kd` 低：缺结构出边）。
- **输出**：候选边 `[{target, relation, confidence, reason}]`。
- **写回**：`links`（候选关系先落 `*-candidate`，过闸才提升）。
- **半寄生**：外部件只给候选，强度与提升由系统按证据算。
- **寄生**：外部件直接给最终边（关系 + 强度 + 证据），系统只过守恒闸与类型配对闸。
- **拒绝**：无证据 / 类型配对非法 / 强度与证据不符 / 指向 future→past（库层硬闸）。

### P4 · 蒸馏点提取（distill-points）

- **位置**：`distill-points.js` 的 `points_json` 产出。
- **输入**：会话原文。
- **输出**：可蒸馏点数组（含区间、主题、依据）。
- **写回**：`distill_points` 表（只增）。
- **半寄生**：外部件补点，系统保留原抽取结果并合并去重。
- **寄生**：整批点由外部件给，系统只验区间可对回原文。
- **拒绝**：区间对不回原文 / 重复点。

### P5 · 洞察提取（insight-extract）

- **位置**：`insight-extract.js`，轮末。
- **输入**：本轮场域动作与读数变化。
- **输出**：洞察候选（`raw-insight-*`，`strand='future'`）。
- **写回**：新实体（future 档），不写过去边。
- **半寄生**：外部件给候选文案，系统定档与去重。
- **寄生**：外部件连档位一起给，系统只验 future 不落 past。
- **拒绝**：写过去边（库层 AC-18 会 ABORT）/ 与已有洞察重复。

### P6 · 提案承接（proposal tickets）

- **位置**：`opt_tickets` 中 `status='proposed'` 的单。
- **输入**：§1.2 的 `demand`。
- **输出**：回单 `{facts, pointers, evidence, sourceGrade, selfAssessment}` + 实际改动。
- **写回**：对应实体的改动 + `evidence_json.result`（供 6.14 闸与 6.16 屏消费）。
- **半寄生**：外部件只做需求的一部分（如只补标签），其余系统补。
- **寄生**：外部件全包，系统只过闸。
- **拒绝**：缺自评 / 缺事实 / 弱证据（SPEC-6.14 发布门）；超 TTL 未接 → `proposal-expired`。

### P7 · 回单校验（ticket-gate）

- **位置**：`verifyTickets` 的闸阶段。
- **输入**：回单。
- **输出**：`admitted` / `reasons[]`。
- **写回**：无（纯判定）。
- **半寄生**：外部件提供来源分级与自评，系统判膜与粒度。
- **寄生**：不设——校验层必须由系统自己判，**不可外包**（主权动作）。

## 四、植入契约（外部件怎么接）

1. **注册**：外部件声明 `{slot, mode, in, out, refuse[]}`，登记到档案（不落业务表）。
2. **取单**：只能取 `status='proposed'` 且 `demand.slot` 与自己匹配的单。
3. **交回**：交回形态必须与 `demand.evidence` 对齐，缺件即拒。
4. **不回**：超过 `ttlRounds` 由系统作废，外部件不得再认领已作废单。
5. **边界**：外部件**不写库**——只交回单，写入由系统按 §三 的写回点执行。这是「零泄漏」在寄生位的落地。

## 五、Acceptance Criteria（本轮落地部分）

| # | 判据 | 检验 |
|---|---|---|
| AC-1 | 提案单带五段 demand | 扫出的 `memo-card` 单 `evidence_json.demand` 齐 `want/acceptance/evidence/mode/slot/ttlRounds` |
| AC-2 | 各维需求不同 | `kq-low` / `ka-low` / `kr-low` / `kd-cited` / `overall-red` 的 want 与 slot 可区分 |
| AC-3 | 验收判据可测 | `acceptance[].dim` ∈ 五维或 overall，`op` ∈ 比较符集 |
| AC-4 | TTL 到期作废 | 连续 N+1 轮无承接 → `rejected` + `proposal-expired` |
| AC-5 | 作废释放名额 | 作废后同 `(entity, dim)` 可再开单 |
| AC-6 | 心跳复用 6.15 | 未到期提案每轮 `beats` +1、`beatAt` 在 |
| AC-7 | 不误伤分派单 | `dispatched` 单不走 TTL，仍由 6.15 三律管 |
| AC-8 | 空需求不落库 | 需求段缺任一必填项 → 不开单（宁可不提） |

## 六、Non-Goals

- 本轮**不实现寄生位运行时**（谁被调用、怎么调），只落 §1 需求定义与 TTL。
- 不改 `ticket-gate` 的发布门口径（P7 不外包）。
- 不新增流程层，点位表是**挂载点清单**，不是新模块。

## 七、下一步

1. 落 §1（demand + TTL）——本轮可做，有隔离库可验。
2. 点位表待 owner 逐点确认后，再落 `parasite-slot` 声明式注册表与取单口。
3. 模拟：先备 3–5 条真料，跑 P2 半寄生一轮。
