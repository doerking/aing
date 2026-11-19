---
tags: [aing-v2, spec, 标签卫生, 白名单, 洗消, 检索污染, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.42 标签白名单与存量洗消——标签只认 name 或 name:1..9，写入面统一净化，存量脏标签走副本洗消工具（默认 dry-run）
date: 2026-11-19
status: 已落地（test-6.42-tag-hygiene 9/9）
owner: hana
upstream: [docs/COVERAGE-旧院功能面覆盖判定-2026-11-18.md, spec/SPEC-1.1-编译.md, spec/SPEC-2.10-标签面.md]
---

# SPEC-6.42 · 标签白名单与存量洗消

> **一句话**：标签直接参与检索的词面分（`TAG_WEIGHT=0.6`），一句正文漏进 tags 列就能长期污染召回。现在写入面统一按形状净化，存量脏标签有工具可洗。

## 一、口径

### 1.1 合法形状

```
tag := name                 // 无强度
     | name ":" 1..9        // 带强度
     | ns ":" word          // 已登记命名空间（首个登记：src），word = 字母开头、[A-Za-z0-9_-]{0,15}
name := 1..24 字符，不含空白、不含冒号
```

- 全角冒号 `：` 归一半角后再判。
- 强度只认 1–9 单个数字；`x:0`、`x:10`、`x:abc`、`due:2026-11-19` 一律不合形状（v2 事件/待办各自走独立列，不借 tags 列）。
- 命名空间白名单目的：`src:narrative`、`src:calibration` 这类「来源标记」是合法词面，但值不是强度；未登记的 `前缀:值` 一律按 `bad-strength` 丢弃，新增命名空间须在本 spec 登记。
- 合法标签**原样保留、不改顺序、不改大小写**——老读数零漂移。

### 1.2 净化规则（写入面）

| 情形 | 处理 | 理由码 |
|---|---|---|
| 非数组（null / 字符串 / 对象） | 整份作废为 `[]` | `non-array` |
| 空白串 / 空白字符 | 丢弃 | `empty` / `whitespace` |
| 冒号但强度非法 | 丢弃 | `bad-strength` |
| name 超过 24 字 | 丢弃 | `too-long` |
| 重复（净化后同形） | 保留首个 | `duplicate` |
| 超过 24 条 | 丢弃溢出部分 | `over-limit` |

- 只丢弃、不发明：净化不会补标签、不改写词面。
- 每条丢弃都带理由与原文，供审计。

### 1.3 存量洗消

- 工具 `tools/tag-scrub.js`：**必须 `--db <副本>`**，与真库同路径直接拒跑。
- 默认 **dry-run**：只报命中（实体 id / 原 tags / 净化后 tags / 丢弃理由），不写库。
- `--apply` 才写回，且**只改 tags 列**，其他列（content/status/confidence/updated_at 之外）不动。
- 幂等：洗完再跑，命中 0。
- **迁移面不洗**：旧库搬入照原样（保真优先），脏标签交给洗消工具按需处理。

### 1.4 接线面

| 路径 | 是否净化 |
|---|---|
| `compile`（raw markdown frontmatter → tags） | ✅ 写入前净化，丢弃数计入 `stats.tagsDropped` |
| `api-gate` | 已忽略客户端自报 tags，维持 |
| `import` / `migrate` | ❌ 保真照搬，交给洗消工具 |

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 合法标签原样保留（顺序、大小写、强度不变） |
| AC-2 | 全角冒号归一半角 |
| AC-3 | 空白 / 过长 / 坏强度 / 空串 → 丢弃并给理由码 |
| AC-4 | 净化后重复 → 保留首个 |
| AC-5 | 超过 24 条 → 溢出丢弃并记 `over-limit` |
| AC-6 | 非数组输入 → `[]` + `non-array` |
| AC-7 | compile 端到端：frontmatter 写脏标签，入库后 tags 干净且 `stats.tagsDropped` 计数正确 |
| AC-8 | 洗消 dry-run 不写库，`--apply` 只改 tags 列 |
| AC-9 | 洗消幂等：apply 后再跑命中 0 |

## 三、边界

- 不改 `TAG_WEIGHT`、不改检索融合权重、不改任何 kq 口径。
- 不改已入库合法标签的语义；不排序、不归一大小写。
- 洗消只处理 `invalid_at IS NULL` 的活跃实体；退役档不动。

## 四、仍开着的

1. 标签词表本身没有白名单清单（只约束形状）——语义级白名单（哪些 name 才算类目）未定，等真库分布再说。
2. 洗消不产生 trajectory / 工单记录，审计靠工具输出的 JSON 报告。
3. `import` 保真照搬意味着脏标签可能在洗消前进入检索面（时间窗），是否改为「导入即净化」待议。
