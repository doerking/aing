---
tags: [aing-v2, spec, md9, tolaria, 格式门, 实体面, 文档面, spec:7, 验收把关:8, 工程层:6]
description: md9 分两面——文档面要入口标签，实体面只认 description + tolaria_strength；linter 增加 --profile，并修掉 JSON 引号标签的误判
date: 2026-11-16
status: 拍板（85 档实体 md 实测 0/85 后定界）
owner: hana
upstream: [SPEC-0.6]
---

# SPEC-0.9 · md9 两面：文档面与实体面

> **实测缺口**：`doc-tags-lint.js` 对 `wiki/entities` 85 档实体 md 报 401 处违规，其中 205 处是解析不了 `tags: ["a:9", ...]` 的引号（假红）；剩下真问题里 54 档卡在「无 :7-:9 入口标签」，而这 54 档的真实强度就是 5 段或原本无标签——硬塞入口标签即造假。

---

## 一、目标

1. 把 md9 的检查对象分成两面，各自有明确的必填项。
2. 修掉标签解析对 JSON 风格数组的误判。
3. `--profile doc`（默认）与现有 C4 行为完全一致，不得弄红任何既有文档。

---

## 二、行为（spec 即契约）

### 2.1 两面定义

| 面 | 范围 | 必填 | 不要求 |
|---|---|---|---|
| 文档面 `doc` | `spec/` `docs/` 根文档 `tools/` | frontmatter、description 非空、tags 非空（≤20）、标签语法合法、**至少一个 :7-:9 入口标签** | —— |
| 实体面 `entity` | 从库导出的实体 md（`wiki/entities/`） | frontmatter、description 非空、`tolaria_strength` 为 1-9 整数、`tags` 行存在（可为空数组）、标签语法合法 | **不要求入口标签** |

理由：入口标签是「这档文档值得先读」的宣称；实体的段位是事实，由 `tolaria_strength` 承载，不该靠编标签冒充。

### 2.2 标签解析

`tags: [...]` 内每个元素剥掉包裹的双引号或单引号后再校验。`tags: ["a:8", "b:6"]` 与 `tags: [a:8, b:6]` 等价。

### 2.3 命令行

- `node tools/doc-tags-lint.js [--dir <目录>] [--profile doc|entity] [--json]`
- 缺省 `--profile doc`；未知名回退 `doc`。
- 退出码 0 全绿 / 1 有违规（与现状一致）。

### 2.4 不变

- 目录遍历跳过 `node_modules` `.temp` `.git`。
- JSON 输出形状 `{scanned, problems}` 不变。
- `verify-deploy` C4 不传 `--profile`，行为不变。

---

## 三、验收（AC）

| # | 判据 |
|---|---|
| AC-1 | 带引号的 tags（`["x:8"]`）在 doc 面被正确解析，不再报「标签语法坏」 |
| AC-2 | entity 面：description 非空 + `tolaria_strength: 5` + `tags: []` → 通过 |
| AC-3 | 同一档在 doc 面失败（无入口标签）、在 entity 面通过 |
| AC-4 | entity 面仍抓：description 空、`tolaria_strength` 缺失/越界、标签语法坏 |
| AC-5 | 默认 profile 对 v2 本仓全量 md 仍 0 违规 |

---

## 四、非目标

- 不改写任何实体 md（改写由旧院 `tools/md9-backfill.js` 负责）。
- 不给实体凭空补入口标签。
- 不把 `wiki/links/` 纳入检查面（5723 个链接桩会淹没真信号）。

---

## 五、铁律

- 默认行为向后兼容；C4 不许因此变红。
- 只在工具面加能力，不动库、不动实体。
