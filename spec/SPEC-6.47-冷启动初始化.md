---
tags: [aing-v2, spec, 冷启动, 部署, 初始化, engineering:6, capability:5, delivery:7, operations]
description: SPEC-6.47 冷启动初始化——一键建 raw/inbox、data、archive 与空库；幂等、绝不覆盖既有文件、root 不存在即拒
date: 2026-11-19
status: 已落地（test-6.47-init-workspace 7/7）
owner: hana
upstream: [docs/COVERAGE-旧院功能面覆盖判定-2026-11-18.md, spec/SPEC-6.12-落盘安全.md]
---

# SPEC-6.47 · 冷启动初始化

> **一句话**：旧院有 `init-knowledge-base` / `bootstrap`，v2 没有——新机器上部署，`compile` 找不到 `raw/` 就静默扫 0 档，没有任何工具告诉你「少建了目录」。本件补这一环：一个幂等、只增不删的建库工具。

## 一、口径

### 1.1 建什么

| 路径（相对 root） | 用途 | 谁需要 |
|---|---|---|
| `raw/` | 原稿目录，`compile` 的输入 | `src/compile.js` |
| `raw/inbox/` | 待整理入口（人工投放区） | 运维习惯，空目录 |
| `data/` | 库与运行态 | `knowledge-store` / `derive` 词典 |
| `archive/` | 归档月包 | `tools/archive.js` |

库文件默认 `data/knowledge.db`；`dbPath` 可覆盖，其父目录一并建。

### 1.2 铁律

- **只增不删**：已存在的目录/文件一律不动，报告归入 `existing`。
- **不碰既有库**：库已存在就只打开，不重建、不清表。
- **root 必须已存在**：不给 root 编造路径（防 `G:/` 这种误建）；root 不存在 → `root-missing`，root 是文件 → `root-not-dir`。
- **CLI 无缺省 root**：必须显式 `--root <目录>`；裸跑 exit 2。这样永远不可能一键初始化真实仓库。
- **幂等**：同目录跑第二次，`created` 为空，库表数不变。

### 1.3 接口

```
initWorkspace({ root, dbPath, store }) → { ok, root, dirs:{raw, inbox, data, archive},
                                           created:[], existing:[], db:{ path, tables } }
```

- `store` 由调用方注入（arch-lint C5：组件不直连 knowledge-store）；开库动作在 CLI 层做，本件只量 `store.listTables()`。
- `dbPath` 缺省 `root/data/knowledge.db`。
- `created` / `existing` 条目形如 `'raw/'`、`'data/knowledge.db'`。

### 1.4 CLI

`node tools/init-kb.js --root <目录> [--db <库路径>] [--json]`

- 默认人类可读；`--json` 输出报告本体。
- 成功 exit 0；参数缺失 exit 2；`root-missing` / `root-not-dir` exit 4。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 空目录初跑：四目录齐、库建表（≥20 表），`created` 含四项 |
| AC-2 | 幂等：二跑 `created` 空、`existing` 齐、表数不变 |
| AC-3 | 既有文件不动：预放 `raw/note.md`，跑后内容逐字不变 |
| AC-4 | root 不存在 → 抛 `root-missing`，事后 root 仍不存在 |
| AC-5 | root 是文件 → 抛 `root-not-dir` |
| AC-6 | `dbPath` 覆盖到不存在的子目录 → 父目录一并建、库在位 |
| AC-7 | CLI：`--root` 输出 JSON 可解析且 exit 0；无 `--root` exit 2 |

## 三、边界

- 不播种演示语料（留给 seed-demo 单子）。
- 不做开机自检（留给 boot-check 单子）。
- 不写 config 默认值：旋钮默认由 `config-runtime.DEFAULTS` 现算，落库反而成第二源。
