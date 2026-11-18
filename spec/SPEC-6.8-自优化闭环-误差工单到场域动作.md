---
tags: [aing-v2, spec, 自优化, KESPI, 工单, 场域动作, gene, 训练师, M6, spec:9, self-optimize:8]
description: M6.8 自优化闭环 spec——KESPI 八维误差开 opt_tickets 工单，按维路由到场域动作（2.12/2.13），T2 以读数上升复核，过 omni-gate 三闸后毕业成 gene；训练六阶段本地化，不依赖外部 SkillOpt
date: 2026-11-16
status: 拍板（Hana 定嫁接姿态；owner 授权「你来定」）
owner: hana
upstream: [SPEC-1.12, SPEC-2.12, SPEC-2.13, SPEC-2.15, SPEC-2.16, SPEC-6.7, SPEC-0.8 修订 B]
---

# SPEC-6.8 · 自优化闭环（KESPI 误差 → 工单 → 场域动作 → T2 复核 → gene）

> **要补的缺口**：KESPI 八维算完只落 `kespi_scores`，没有任何节点消费误差；旧院「KESPI 产出后没有节点处理」正是知识库质量提不上的根因。
> 本件把「读数 → 工单 → 下药 → 复核 → 基因」接成一条本地闭环，训练师技能并入 `gene-keeper`，不接外部 SkillOpt / 外部编排平台。

---

## 一、目标

1. 每一维低于阈值的实体，自动开一张**带 ID 的工单**（`opt_tickets`），而不是只报一个分数。
2. 工单按维路由到场域动作：能修的走 2.12（维护）/ 2.13（提升）；修不了的走 `memo-card` 提案，不硬写。
3. 下药后重算 KESPI，**读数上升即复核通过**；连续两轮无改善即拒单，不无限重试。
4. 已验证工单经 `omni-gate` 三闸后毕业成 gene；失败则 `quarantined`，留回滚指针。
5. 全链本地：证据来自 `kespi_scores` / `field_actions` / `gate_records`，不需要 Python、SkillOpt、LobeHub。

---

## 二、行为（spec 即契约）

### 2.1 开单（`scanTickets`）

- 读 `kespi_scores`（每实体一行最新读数）⋈ `entities`（`invalid_at IS NULL`）。
- 每维一条规则：

| 维 | 触发线 | 工单 kind | 路由 action |
|---|---|---|---|
| KG 成长 | `< 0.50` | `kg-low` | `rebond` |
| KD 连接 | `< 0.30`（SPEC-6.17 修订） | `kd-low` / `kd-cited` | `rebond`（raw 缺键）/ `memo-card`（被引用不催化） |
| KM 完整 | `< 0.99` | `km-low` | `reconcile` |
| KC 双链一致 | `< 0.80` | `kc-low` | `reconcile` |
| KQ 质量 | `< 0.60` | `kq-low` | `memo-card` |
| KA 活跃 | `< 0.30` | `ka-low` | `memo-card` |
| KB 平衡 | `< 0.40` | `kb-low` | `demote` |
| KR 时效 | `< 0.30` | `kr-low` | `memo-card` |
| overall | `< 0.65`（红灯）| `overall-red` | `memo-card` |

- **幂等**：同一 `(entity_id, dim)` 已有 `open / dispatched / proposed` 工单时不重复开。
- 按分数升序取前 `MAX_TICKETS=20`；工单只增，状态推进不改历史读数。
- `persist:false` 只返回候选，不落库（供 `gene-keeper` 只读巡检）。

### 2.2 路由（`DIM_RULES`）

- `reconcile`：补双链（2.12）——先补镜像，再补键。
- `rebond`：补氢键（2.12）。
- `demote`：无证据降级（2.12）。
- `memo-card`：只出提案，不写场域；进 memo 待办，不代用户动作。

**顺序写死**：`reconcile` 先于 `rebond`——先让双链存在，再让键存在。

### 2.3 下药（`dispatchTickets`）

- 只取 `status='open'`，按 `ACTION_ORDER` 与分数排序。
- 场域动作调用 `meko-field.reconcile/rebond/demote(store, {entityId, cycleId})`，真写入与账本由 2.12 做。
- 有实际动作 → `dispatched`；无效果 → `rejected/no-effect`；`memo-card` → `proposed`。
- 每次状态推进 `attempts + 1`，证据合并入 `evidence_json`。

### 2.4 复核（`verifyTickets`）

- 只取 `status='dispatched'`。
- 读该实体最新 `kespi_scores.<dim>`：
  - `after > before + 1e-9` → `verified`，记 `before/after/delta`。
  - 无改善且 `attempts >= 2` → `rejected/no-improvement`。
  - 无改善但未满两次 → 保持 `dispatched`，下一轮再验。
- 复核前必须有一次新的 KESPI 计算（`selfOptimizeStep` 默认代跑，链上可传 `rescore:false`）。

### 2.5 毕业（`graduateToGene`）

- 只取 `status='verified'`。
- gene 名：`opt:<kind>:<action>`（例 `opt:kc-low:reconcile`）。
- 先过 `omni-gate.runGates({subject, kind:'gene', evidence:['kespi-delta','field-action']})`：
  - 过闸 → `status='active'`；未过 → `status='quarantined'`。
- 已存在同名 gene → `uses+1 / wins+1 / score=(旧+delta)/2`；否则新建。
- 工单标 `graduated` 防重复；gene `lineage` 存 `before/after/delta/gate`，可回滚。

### 2.6 一轮（`selfOptimizeStep`）

```
scanTickets(persist:true)
  → dispatchTickets
  → kespiStep（默认；rescore:false 可关）
  → verifyTickets
  → graduateToGene
```

返回 `{ok, actions:{scanned,dispatched,proposed,rejected,verified,genes}, scan, dispatch, verify, genes}`。

### 2.7 链路与开关

- 默认代谢链在 `kespi` 之后插 `self-optimize`（17→18 步）。
- **默认不自动下药**：仅当 `cycleType` 含「维护/自优化」或显式 `opts.selfOptimize=true` 时执行；其余轮返回 `{skipped:true}`。
- 这样既在链上可见，又不会在迁移/全量首跑时改库。

### 2.8 训练六阶段本地化

| 阶段 | 本地对应 |
|---|---|
| rollout | 对病灶实体跑一次场域动作（2.12）|
| reflect | 对比 before/after KESPI 该维 |
| aggregate | 生成 `opt:<kind>:<action>` gene 候选 |
| select | `omni-gate` 三闸 |
| update | gene 落库/更新 |
| gate | T2 复核 + 下一轮再验 |

不引入外部 SkillOpt、影子稿、Python 运行时。

---

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 工单表与索引 + 契约导出 | `opt_tickets` / `idx_opt_tickets_open` 存在；五个函数与六阶段常量导出 |
| AC-2 | 误差开单 + 幂等 | 低 KC/KD 实体开 `kc-low`/`kd-low`；连扫两次第二次 `created=0` |
| AC-3 | 维度→动作路由 | `kc→reconcile`、`kd→rebond`、`kq→memo-card`、`kb→demote`；reconcile 先于 rebond |
| AC-4 | 场域下药 + 账本留痕 | `reconcile` 真建 `wiki-x`；`field_actions` 有同 cycle 记录；工单转 `dispatched` |
| AC-5 | 读数上升即复核通过 | 重算 KESPI 后 KC/KD 的 `after > before`，工单 `verified` |
| AC-6 | 已验证→gene（过闸留痕） | `genes` 有 `opt:kc-low:reconcile` 且 active；`gate_records` 有 `kind='gene'` 且 passed |
| AC-7 | 技能导入 + 训练师只读 | 五成员均有非空 `skills`；`gene-keeper` 含 `skill-trainer`；`TRAINER_STAGES` 六阶段；`gene-keeper.onCycle` 返回工单候选且不增 `opt_tickets` 行 |
| AC-8 | 铁律 | 只读扫描不改 `entities/links`；组件不 require `knowledge-store`；源码无物理删字面量 |

---

## 四、Non-Goals

- 不做用户面（memo 卡片归 3.11/2.16）。
- 不做阈值自适应（改可见阈值仍走 W2 审批）。
- 不做外部 SkillOpt / LobeHub / 外部 Agent Group。
- 不做跨进程调度；节律仍只来自 `runCycle`。

---

## 五、契约

```js
scanTickets(store, {persist=true, maxTickets=20, cycleId}) -> {created, skipped, tickets}
dispatchTickets(store, {cycleId}) -> {dispatched, proposed, rejected}
verifyTickets(store, {cycleId}) -> {verified, stillOpen, rejected}
graduateToGene(store, {cycleId}) -> {graduated, quarantined}
selfOptimizeStep(store, {cycleId, rescore=true}) -> {ok, actions, scan, dispatch, verify, genes}
DIM_RULES / DIM_NAMES / ACTION_ORDER / TRAINER_STAGES / ZONES
```

CLI：`node src/cli.js self-optimize [--cycle <id>] [--no-rescore]`。

---

## 六、依赖与消费者

- 上游：1.12 KESPI、2.12 场域维护、2.13 场域提升、2.15 T2、2.16 闸东、6.7 访问事件。
- 下游：3.11 memo（`memo-card` 提案上浮）、2.15 T3（gene 衰减/回滚）。
- 表：`opt_tickets`（新增）、`field_actions`、`genes`、`gate_records`。

---

## 七、铁律

- 不碰 `last_access`；无物理删；工单只增。
- 判定与执行分离：`self-optimize` 只开单/路由/复核/毕业，真写入由 2.12/2.13 做。
- 成员零写权（I7）：`gene-keeper` 只读扫描，不落工单。
- 无闸不放行（I8）：gene 必过 `omni-gate`。
- 每轮留 T2 快照（I9）：`self-optimize` 的 `verified/genes` 计入快照读数。

## 七、修订记录

- **2026-11-18 · SPEC-6.17 修订**：KD 门槛 0.40 → 0.30（kd 取值离散为 0/1/3/2/3/1，0.40 把 1/3 判死）；kd 单分两路——raw 缺键派 `rebond`（能修），其余被引用不催化派 `memo-card`（kind `kd-cited`）；`rebond` 加越界护栏与「不谎报」约束。详见 `spec/SPEC-6.17-kd催化率与派单匹配.md`。
