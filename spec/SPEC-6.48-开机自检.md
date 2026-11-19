---
tags: [aing-v2, spec, 冷启动, 部署, 自检, 运维, engineering:6, capability:5, delivery:7, operations]
description: SPEC-6.48 开机自检——部署后一条命令回答「这台机器上 aing-v2 活没活」；纯读、分三档结论、退出码可进脚本
date: 2026-11-19
status: 已落地（test-6.48-boot-check 7/7）
owner: hana
upstream: [spec/SPEC-6.47-冷启动初始化.md, docs/COVERAGE-旧院功能面覆盖判定-2026-11-18.md, spec/SPEC-6.12-落盘安全.md]
---

# SPEC-6.48 · 开机自检

> **一句话**：旧院有 `boot-sequence` / `start-all`，v2 没有。新机器上跑完 `init-kb` 之后，没人能一条命令回答「目录齐不齐、库开不开得了、表在不在、能不能写」。本件补这一环，而且**纯读**——体检不许治病。

## 一、口径

### 1.1 体检项

| id | 查什么 | 判级 |
|---|---|---|
| `root` | root 存在且是目录 | 坏 → `fail` |
| `dirs` | `raw/` `data/` `archive/` 在，`raw/inbox/` 在 | 缺 → `warn`（可后补） |
| `db` | 库文件存在 | 缺 → `fail` |
| `schema` | 必需表齐（entities / links / config / kespi_scores / meko_cycles） | 缺 → `fail` |
| `writable` | `data/` 可写（`accessSync(W_OK)`，不落文件） | 不可写 → `fail` |
| `content` | 实体 / 边条数 | 只报，`ok`（空库合法） |
| `raw-pending` | `raw/` 下待编译 `.md` 数 | 只报，`ok` |

### 1.2 三档结论

`broken`（有 fail）> `degraded`（有 warn）> `ok`。

`ok` 字段 = `verdict !== 'broken'`（degraded 仍算「活着，但有话要说」）。

### 1.3 纯读

- 不写库、不建目录、不改文件。
- 不改 `last_access`、不动 mtime（`store.init` 本身在无变化时不落盘，见 SPEC-1.12 口径）。
- 可写性用 `fs.accessSync` 判，**不靠写探针文件**。

### 1.4 接口

```
bootCheck({ root, dbPath, store }) → { ok, verdict, checks:[{id, level, detail}] }
```

`store` 由调用方注入（C5）；本件只读 `listTables()` 与 `_getDb()` 计数。

### 1.5 CLI

`node tools/boot-check.js --root <目录> [--db <库路径>] [--json]`

- 退出码：`ok` 0 / `degraded` 1 / `broken` 4 / 参数缺 2。可进部署脚本当闸。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 健康工作区 → `verdict:'ok'`，root/dirs/db/schema/writable 全 `ok` |
| AC-2 | 缺 `raw/` → `dirs` 记 `warn`，`verdict:'degraded'`，`ok:true` |
| AC-3 | 库文件不存在 → `db` 记 `fail`，`verdict:'broken'`，`ok:false` |
| AC-4 | 纯读：跑前后库 mtime/size 不变、目录清单不变 |
| AC-5 | 缺表（注入假 store）→ `schema` 记 `fail` 且列出缺表名 |
| AC-6 | CLI：健康 exit 0 且 `--json` 可解析；坏 root exit 4 |
| AC-7 | 七项体检 id 齐（root/dirs/db/schema/writable/content/raw-pending） |

## 三、边界

- 不修不补：发现缺目录只报，不代建（建目录归 6.47 的 `init-kb`）。
- 不跑代谢、不评分、不索引。
- 不查语义后端在线状态（那是运行期选择，不是开机条件）。
