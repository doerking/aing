---
tags: [aing-v2, spec, 消费侧, 检索融合, 慢回忆, 伪精排, M6, spec:9, retrieval:9]
description: M6.3 spec——补检索消费侧：向量/词面/名称三路加权融合，低置信时沿有效边慢回忆扩一跳，再用 KESPI 与新鲜度伪精排；predict 改接本模块，检索不写 last_access
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-1.8, SPEC-5.3, 旧院 query.js, docs/Engineering/CONSUMER-AUDIT-2026-11-16.md]
---

# SPEC-6.3 · 检索融合消费

> 缺口来源：`docs/Engineering/CONSUMER-AUDIT-2026-11-16.md` 缺口 2。
> 旧院 `aing/src/query.js` 有五件：三路融合、慢回忆、伪精排、阈值单源、附 KESPI。
> v2 只有 `vector.search` 单通道，`predict` 直接吃 top-N。本任务把确定性部分迁回，**不引语义模型、不引 LLM**。

---

## 一、目标

1. 三路召回归一池：向量（复用 `vector.search`）、词面覆盖（name/type/tags）、名称/ID 匹配。
2. 加权融合：默认 向量 0.6 / 词面 0.25 / 名称 0.15。
3. 慢回忆：整体向量置信低时，沿有效边扩一跳邻居入池。
4. 伪精排：融合 KESPI 与新鲜度。
5. `predict` 改接本模块；**检索不写 `last_access`**（与旧院的唯一硬差异）。

## 二、行为（spec 即契约）

### 2.1 三路召回

- **向量路**：`vector.search(store, q, {k: limit*3})`（沿用 5.3 的强度加权、简繁归一、双链去重）。
- **词面路**：对 `name + type + tags` 做简繁折叠后小写；查询按空白/中文标点切词。
  - 整词命中记 1；中文长词任一 2 字滑窗命中记 0.5；分数 = 命中数 / 查询词数，上限 1。
- **名称路**：`name` 或 `id` 与查询折叠后相等 → 1；包含 → 0.8；否则 0。
- 词面/名称路只收真命中（>0），不全库倾倒。

### 2.2 融合

- `fused = 0.6 × vector + 0.25 × lexical + 0.15 × name`。
- 权重可被 `opts.weights` 逐项覆盖（测试与调参用）；默认值导出 `DEFAULTS.weights`。

### 2.3 慢回忆

- 触发：`opts.forceSlow` 为真，或（存在向量命中且平均向量分 < `slowRecallThreshold`，默认 0.35）。
- 种子：向量分 > 0.01 的前 3 条。
- 扩展：沿 `links` 表双向、`invalid_at IS NULL` 且**通过三轴判定**（`tri-axis-gate.shouldEnterRetrieval`）的边，每种子最多 `expandTop`（默认 6）个邻居。
- 邻居基础分 = `0.3 × 最高种子向量分`；融合后再加 `0.05`；标记 `slowRecall: true`。
- 邻居须为有效实体；已在池中不重复。

### 2.4 伪精排

- `final = fused × (1 − 0.15 − 0.1) + kespi × 0.15 + recency × 0.1`。
- `kespi` 取 `kespi_scores.overall`；缺失按 0。
- `recency = 1 / (1 + 天数 / 30)`，按 `updated_at`（空库时间视 UTC）；缺失按 0。
- 权重可被 `opts.rerank` 覆盖。

### 2.5 去重与截断

- 按双链基名（`id.replace(/^wiki-/, '')`）去重，只留分最高一条；同分优先 raw。
- `k` 在去重后计，默认 8。
- `invalid_at` 非空的实体不召回。

### 2.6 返回形状

`search(store, query, opts) -> {candidates, meta}`：

- `candidates[]`：`{id, base, name, type, score, final, channels:{vector, lexical, name}, slowRecall?}`（`score` = 向量分，保持旧字段名）。
- `meta`：`{avgSim, slowExpanded, weights, rerank}`。

### 2.7 接线

- `predict` 的召回由 `vector.search` 改为本模块 `search`（保持 cold-start 与 Conversation 过滤不变）。
- 不新增 CLI（AGENT 的 `query` 行维持未接；CLI 属后续）。

### 2.8 铁律

- **不写 `last_access`**（旧院 P0 写回；v2 铁律禁写，衰减锚由场域带管）。
- 不碰 `tolaria_strength` / `invalid_at`；无物理删；只读库。
- 组件唔直连 knowledge-store（store 注入，arch-lint C5 守）。

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 三路融合形状 | 候选带 `channels.vector/lexical/name`；关闭精排后 `final = 0.6v+0.25l+0.15n` |
| AC-2 | 名称路生效 | 仅开名称权重时，名称精确命中实体排第一且 `name=1` |
| AC-3 | 词面路生效 | 仅开词面权重时，tags 命中者排在无命中者之前 |
| AC-4 | 慢回忆 | 高阈值触发后，有效边邻居入池并标 `slowRecall`；阈值 0 不扩 |
| AC-5 | 伪精排 | 同内容同时间，KESPI 高者排前 |
| AC-6 | 去重 + k + 退役 | raw/wiki 只出一条且优先 raw；k 生效；`invalid_at` 不召回 |
| AC-7 | predict 接线 + 铁律 | predict 能凭名称命中找到会话；`last_access` 不变；无 `DELETE FROM`；无直连 store |

## 四、Non-Goals

- 不引语义模型（384 维）、不引 LLM、不做 cross-encoder。
- 不写词面倒排索引/BM25（词面路只覆盖元数据；内容词面属后续评测任务）。
- 不做检索命中写回（`last_access` 铁律）。
- 不改 `vector.js` 的排序与去重契约。

## 五、契约

- `search(store, query, opts) -> {candidates, meta}`
- 纯函数导出：`keywordScore(entity, query)`、`nameScore(entity, query)`、`recencyScore(entity)`
- 常量：`DEFAULTS`（weights / slowRecallThreshold / expandTop / rerank / limit）

## 六、依赖

- 上游：SPEC-1.8、SPEC-5.3（向量与去重）、SPEC-1.12（KESPI 表）
- 下游：SPEC-3.12（predict）、SPEC-3.11（memo 读数）
- 旧院证据：`aing/src/query.js` `searchCandidates()`

## 七、与旧院的差异（写清楚）

| 项 | 旧院 | v2 本件 | 理由 |
|---|---|---|---|
| 命中写回 | 检索后写 `last_access`（P0 衰减锚） | **不写** | v2 铁律：`last_access` 只由场域带维护 |
| 慢回忆 | 经 guide-chain 按名字取邻居 | 直接读 `links` 有效边 | v2 无边名索引，links 是单源 |
| 邻居触发条件 | 依赖语义模型可用 | 向量分可用即可（v2 恒可用） | 去掉模型分支 |
| 权重来源 | `growth.config.query` | 模块 `DEFAULTS` + `opts` 覆盖 | v2 旋钮单源只管四代谢组件，避免扩面 |
| 语义路 | 384 维模型（可用则升） | hash-64w2（可插拔） | 沿用 M5 决定 |
