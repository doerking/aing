---
tags: [aing-v2, spec, 上游归一, fingerprint, 回填, 镜像, spec:9, engineering:8]
description: SPEC-6.63 上游归一——约定-id 入口（distill/import/compile）写 fingerprint + 开库幂等回填指纹缺口；查重复用系语义问题另立 spec
date: 2026-11-22
status: 已落地
owner: hana
upstream: [spec/SPEC-6.62-开单口径fingerprint归并.md, src/identity.js, src/knowledge-store.js, docs/Engineering/TICKET-SLOT-OWNERSHIP-2026-11-22.md]
---

# SPEC-6.63 · 上游归一：约定-id 入口写 fingerprint + 指纹缺口回填

> 上级：SPEC-6.62（开单口径按 fingerprint 归并）
> 上游：无（本件系 fingerprint 链路上游）
> 状态：✅ 已落地（commit 见 STATUS 8.23）
> 日期：2026-11-22
> 立旗：hana

## 一、缘起

SPEC-6.62 落地时量出：真库 322 实体 = 118 真内容 × 2–3 抄（`bare` / `wiki-` / `raw-`），
且 `wiki-insight-1383c174` 嘅 `fingerprint` 为 NULL（全库唯一回填缺口）。

再往下挖，搵到两个事实：

1. **三个约定-id 入口全部漏写 `fingerprint` 列**：
   - `distill.js`（蒸馏产物 `wiki-X`）
   - `import.js`（镜像骨架 `wiki-X`）
   - `compile.js`（编译产物 `bare-X`，如 `todo-*` / `dispatch-*`）
   三者嘅 `INSERT INTO entities (...)` 列清单**都冇 `fingerprint`** → 新行 `fingerprint = NULL`。
   `knowledge-store.js#insertEntity` 有写 fp，但呢三入口用**直接 SQL INSERT**，唔经它。

2. **三抄系分层镜像设计，唔系纯 bug**：`raw-X`（原文不可变）/ `wiki-X`（蒸馏或镜像产物）/
   `bare-X`（主实体工作副本）三者内容相同，系「同文镜像」而非「重复污染」。
   因此「查重复用」（同 content 已有 → 唔落新行）**唔该夹落本件**——咁会改变主实体层
   嘅存在语义。呢个另立 spec。

## 二、线 2（本件落地）：写 fp + 回填缺口

| 改面 | 文件 | 内容 |
|---|---|---|
| 产物写 fp | `src/distill.js` | `INSERT` 列清单加 `fingerprint`，写 `identity.js#fingerprint(content)` |
| 镜像写 fp | `src/import.js` | 同上 |
| 编译写 fp | `src/compile.js` | 同上 |
| 真库一次性修复 | `data/knowledge.db` | 补齐 `fingerprint IS NULL OR = ''` 行（逐行同 ALTER 块口径）；**唔在开库路径**——每次开库写盘会破坏 `db-stale` 检测（纯读子进程改 mtime） |

`fingerprint` 函数系 `identity.js#fingerprint`（去空白差异后 sha1），**单一来源**，唔另起。

## 三、线 1（另立 spec）：查重复用

- 语义问题：`bare` 系主实体（用户读写），`raw`/`wiki` 系镜像。同 content 嘅 bare 与 raw 唔系
  「重复」而系「分层」。
- 若要「唔再三抄」，正确姿势系：bare 层插入时**引用**已有镜像（建边而非复制内容），
  或 bare 层与镜像层共享 id——都涉及身份模型改动。
- **本件唔改**：净系让三入口写 fp（使开单归并口径可依），唔做查重复用。

## 四、AC（test/test-6.63-upstream-dedup.js，4 条）

- AC-1：`distillStep` 产物 `fingerprint` = `fingerprint(content)`
- AC-2：一次性修复指纹缺口（NULL 与空串都补齐，migrate 口径）
- AC-3：`compile` 产物 `fingerprint` = `fingerprint(content)`
- AC-4：`importStep` 镜像 `fingerprint` = `fingerprint(content)`

## 五、边界

- `wiki-insight-1383c174` 嘅 fp 缺口由一次性修复覆盖（真库修 1 行，`fingerprint IS NULL OR = ''` 清零）。
- 其他入口（`session-ingest` / `meko-field` / `recycle` / `api-gate` / `capability-narrative` / `red-drill`）
  嘅直接 SQL INSERT 同样漏写 fp——本件只修三个「三抄」入口，其余留档（量过：唔产生三抄，
  各自内容唯一；若日后发现同 fp 再扩展）。
- 线 1（查重复用）另立 spec，唔在本件。
- **经验教训**：开库路径**唔该写盘**（每次 `init` 逐行 UPDATE 会触发 `migrated` → 尾部 persist →
  纯读子进程改 mtime → 破坏 `db-stale` 检测）。数据修复一律走一次性 migrate，唔塞开库。
