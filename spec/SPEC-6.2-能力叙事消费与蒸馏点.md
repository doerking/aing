---
tags: [aing-v2, spec, 消费侧, 蒸馏点, 能力叙事, 区间捕获, M6, spec:9, distill:9]
description: M6.2 spec——补后半区消费侧：按旧院口径从活跃实体正文机械抽取原话（能力单元区间捕获 + 节白名单），产确定性蒸馏点落 distill_points，幂等不覆盖原文
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-1.5, SPEC-6.1, 旧院 distill.js extractCapabilityRaw, HANDOFF-2026-11-09-capability-narrative]
---

# SPEC-6.2 · 能力叙事消费与蒸馏点

> 缺口来源：`docs/Engineering/CONSUMER-AUDIT-2026-11-16.md` 缺口 1。
> 旧院早已把「能力单元」区间捕获写死在蒸馏端（`aing/src/distill.js:103`），并带 C10g 门禁与 greenlist；
> v2 的 distill 改为复制链保真后，内容抽取层没有承接——6.1 落库的六段被当普通正文复制，**生产件没有消费者**。
> 本任务只补**消费侧**：读正文、抽原话、产蒸馏点。不改 distill 的逐字保真契约。

---

## 一、目标

1. 从活跃实体正文机械抽取原话：叙事档走**能力单元区间捕获**；普通档走**节白名单**。
2. 抽取结果产**确定性蒸馏点**（无 LLM、不编造、可追溯），落 `distill_points` 辅助表。
3. 幂等：同源同内容（digest 相同）不重写；源退役（`invalid_at` 非空）不处理。
4. 进默认代谢链（distill 之后），让「六段入库 → 蒸馏点可检索」形成闭环。

## 二、行为（spec 即契约）

### 2.1 输入归一

- `content` 若为 JSON 且含字符串 `markdown` 字段（6.1 的 `capability-narrative-v1` 形状）→ 取 `markdown`。
- 否则按原文处理。

### 2.2 能力单元区间捕获（叙事档）

- 起端锚：`/^#{1,6}\s*(?:能力单元|Capability Unit)/i`（h1–h6 鲁棒；中英双语；大小写不敏感）。
- 止端锚：`/^#{1,6}\s*(?:提取实体|标签|蒸馏摘要)/`（**只认中文**，消费端自有节名，不双语化）。
- 区间内逐行收原话；以下行不算原话：
  - 标题行（`#{1,6}\s`）——结构不是原话；
  - 空行、`...`、`…`、`---`；
  - `>` 开头的引用行（时间戳/来源）；
  - `（` 开头的注释行。
- 按出现序去重（同一行只收一次）。
- **不做全文截断**：区间内内容全收（旧院教训：截断正则导致 94% 内容静默丢失）。

### 2.3 节白名单（普通档）

- 节名：`原始消息` / `用户提问` / `Agent 回复` / `Agent 分析` / `收集资料`。
- 进入命中节后按 2.2 同一套过滤规则收行；遇到下一个非白名单标题退出。
- 与 2.2 合并去重，顺序为「白名单先、区间后」。

### 2.4 蒸馏点（机械确定性）

- 按句切分：`/(?<=[。！？.!?])\s*/`；句长 ≥ 4 才收。
- 取最长的 5 句；长度相同按出现序；产出时按出现序排列（稳定可测）。
- `digest` = 抽取行以换行连接后的 sha256 前 16 位。

### 2.5 落表

`distill_points` 辅助表（`knowledge-store` DDL 增建，`IF NOT EXISTS` 幂等）：

| 列 | 含义 |
|---|---|
| `base_id` | 源实体 id（主键）|
| `digest` | 抽取行摘要 |
| `raw_count` | 抽取原话条数 |
| `line_count` | 句切后合格句数 |
| `points_json` | 蒸馏点数组 JSON |
| `updated_at` | 写入时间 |

- 同 `base_id` 且 digest 相同 → 跳过（`skipped`）。
- digest 变了 → 覆盖该行（UPsert）。
- 抽不到原话 → 不写行（`noRaw` 计数），不写空记录。

### 2.6 链上接线

- `metabolism.REGISTRY` 增 `distill-points`：strand `cross`、band `background`、reads `entities`、writes `distill_points`、reversible true、入口 `extractStep`。
- `DEFAULT_STEPS` 中置于 `distill` 之后（先保真复制，再消费）。

### 2.7 铁律

- 不碰 `last_access` / `tolaria_strength` / `invalid_at`；无物理删（`DELETE FROM` 零出现）。
- 组件唔直连 knowledge-store（store 注入，arch-lint C5 守）。
- 不改写实体正文——复制链逐字保真契约不变。

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 区间捕获 | 六段叙事 20 行全部入；标题/引用/省略/注释行不入；止端后内容不入 |
| AC-2 | 层级鲁棒 + 双语起锚 | `## 能力单元`、`###### Capability Unit`（混写大小写）均触发；`## 标签` 止住 |
| AC-3 | 不过捕 | 正文中的「能力单元」字样（非标题）不触发；`## 标签` 后的行不入 |
| AC-4 | 蒸馏点确定性 | 同输入两次 digest 相同；点 ≤5；最长优先且同长按出现序 |
| AC-5 | 落表形状 | 6.1 JSON 形状的 content 能取 markdown 并落一行，列齐 |
| AC-6 | 幂等 + 退役跳过 | 二次跑 `extracted=0` 且 `skipped>0`；`invalid_at` 源不处理 |
| AC-7 | 链上可见 + 铁律 | `DEFAULT_STEPS` 含 `distill-points`；`last_access` 不变；源码无 `DELETE FROM`；无直连 store |

## 四、Non-Goals

- 不做内容改写、不做摘要替换、不碰镜像正文（保真契约不动）。
- 不接 LLM、不做语义聚类、不改标签。
- 不迁旧院 `distill_meta` 列（v2 用辅助表，避免改实体会话列）。
- 不改检索排序（属 6.3）。

## 五、契约

- `extractRawMessages(content) -> string[]`
- `extractCapabilityRaw(text, out?) -> string[]`
- `buildPoints(items) -> {points, lineCount}`
- `digestOf(items) -> string`
- `extractStep(store, opts) -> {scanned, extracted, skipped, noRaw}`
- 导出常量：`RAW_SECTIONS`、`START_RE`、`STOP_RE`、`FORMAT`、`POINTS_MAX`

## 六、依赖

- 上游：SPEC-1.5（distill 转身）、SPEC-6.1（叙事入库形状）、SPEC-0.1（表结构）
- 下游：vector（蒸馏点文本进向量面）、predict/memo（可引用蒸馏点）
- 旧院证据：`aing/src/distill.js:103-152`、`aing/docs/HANDOFF-2026-11-09-capability-narrative.md`

## 七、与旧院的差异（写清楚）

| 项 | 旧院 | v2 本件 | 理由 |
|---|---|---|---|
| 落点 | 实体 `distill_meta` 列 + 改写 wiki 文件「蒸馏摘要」节 | 辅助表 `distill_points`，正文不动 | 复制链逐字保真不能破；辅助表与 kespi_scores/entity_vectors 同型 |
| 触发 | distill 主流程内联 | 独立步骤 `distill-points`（distill 之后） | 职责分离，可单独验收与回滚 |
| 区间外行为 | 节白名单 + 区间 | 同（白名单先、区间后） | 保留普通档能力，不因叙事档回归 |
