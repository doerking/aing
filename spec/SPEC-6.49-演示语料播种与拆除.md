---
tags: [aing-v2, spec, 冷启动, 部署, 演示, 播种, 运维, engineering:6, capability:5, delivery:7, operations]
description: SPEC-6.49 演示语料播种与拆除——seed-demo 落三份可编译原稿并入实体，unseed-demo 按标记精确拆除；改过的档不拆
date: 2026-11-19
status: 已落地（test-6.49-seed-demo 8/8）
owner: hana
upstream: [spec/SPEC-6.47-冷启动初始化.md, spec/SPEC-6.48-开机自检.md, spec/SPEC-6.12-落盘安全.md, tools/archive.js]
---

# SPEC-6.49 · 演示语料播种与拆除

> **一句话**：新部署要给人看，库里得有几条能点开的东西；演示完要能干净拆掉，不留半截。旧院有 `seed-demo` / `unseed-demo`，v2 两件都没有。

## 一、口径

### 1.1 播什么

三份原稿（`raw/demo/` 下），覆盖三种常见形态，各带 `demo` 标签：

| id | 形态 |
|---|---|
| `demo-concept` | 概念定义（短正文） |
| `demo-session` | 会话摘录（带六段叙事骨架） |
| `demo-link-src` / `demo-link-dst` | 两条实体 + 一条边（`link-src` 播过边的事实）|

四份（两实体一组两档 + 两条单档），总数固定 `DEMO_FILES`。

播种 = 写原稿 + 跑 `compile` 入库 + 写标记档 `data/demo-seed.json`（记 id 与内容摘要素）。

### 1.2 拆什么

`unseedDemo` 只拆标记档里记的 id：

- 逐条比对当前 content 摘要与标记档记录：**不一致 = 用户改过 → 跳过不拆**，报告 `modified`。
- 一致的才按「墓碑 + 关联表清理 + 实体删除」顺序拆（与 `tools/archive.js` 同一套级联）。
- 拆完删原稿目录 `raw/demo/` 与标记档；幂等（再跑一次：无标记档 → `no-marker`，ok）。

### 1.3 铁律

- **只拆标记档里记的**：不按标签扫、不按前缀猜——标签是可手改的，标记档是本次播种的账。
- **改过就不拆**：宁可留一条，不误删用户内容。
- **不碰真库**：CLI 必须 `--root`，库取 `<root>/data/knowledge.db`；无缺省。
- **不写 config**、不动 `last_access` 以外的运行态。

### 1.4 接口

```
seedDemo(store, {root})   → {ok, files:[], ids:[], created, updated, marker}
unseedDemo(store, {root}) → {ok, deleted:[], skipped:[{id,why}], removedFiles, reason?}
```

### 1.5 CLI

`node tools/seed-demo.js --root <目录> [--json]`
`node tools/unseed-demo.js --root <目录> [--json] [--dry]`

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 播种后：原稿在位、实体入库、标记档列出全部 id |
| AC-2 | 幂等播种：二跑不新增实体（created=0）、标记档不变 |
| AC-3 | 拆除后：实体、边、词向量、KESPI 分、轨迹项全清，原稿与标记档已删 |
| AC-4 | 改过的档不拆：手改 content 后 unseed → 该 id 记 `modified` 且实体仍在，其余照拆 |
| AC-5 | 拆两次：第二次 `reason:'no-marker'`，ok，不抛 |
| AC-6 | 只拆标记档内 id：播种前手工插一条带 `demo` 标签的实体，unseed 后它仍在 |
| AC-7 | CLI：seed 后 unseed 均 exit 0 且 `--json` 可解析；无 `--root` exit 2 |
| AC-8 | 拆除留墓碑：`tombstones` 有对应行，`archive_ref='demo-seed'` |

## 三、边界

- 不做「演示面板」「演示路由」。
- 不播种边以外的关系（无 relation 扩张）。
- 不自动跑代谢：播种只入库，分数由后续轮次自己算。
