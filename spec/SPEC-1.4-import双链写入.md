---
tags: [aing-v2, spec, 核心代谢, import, 双铰链, 双链写入, M1, spec:9, import:8]
description: M1.4 import 入库 spec——为 raw 链实体建 wiki 链镜像 + 氢键弱键，双链成对、幂等、不覆盖已存在镜像（保差分）、退役不镜像、永不碰 last_access
date: 2026-11-16
status: draft（Hana 定判据，待 owner 随时可驳）
owner: hana
upstream: [SPEC-0.1, SPEC-0.6 §五, SPEC-1.2, SPEC-1.15, INVENTORY A 行 import-from-wiki]
---

# SPEC-1.4 · import 入库（双链写入）

> 旧院 import-from-wiki 做的是「wiki/*.md → SQLite」。新架构 wiki 链以 entities 表为真源（SPEC-1.1），
> 所以 import 的职责改为**双链写入**：为 raw 链实体建立 wiki 链镜像，并用氢键弱键把两链连起来——
> 这是 DNA 里「复制」那一下：先让两条链都存在，之后的分歧才有东西可比。

---

## 一、目标

扫库里全部 raw 链实体，为每个建 wiki 链镜像（`wiki-<base>`）与一条氢键边（raw→wiki），全程幂等、可逆、不碰 last_access。

## 二、行为（spec 即契约）

### 2.1 链归属
- id 以 `wiki-` 开头 → wiki 链，本步跳过（镜像不生成镜像）
- id 以 `raw-` 开头 → raw 链，base = 去掉 `raw-` 前缀
- 无前缀 → 视为 raw 链（旧资料兼容），base = 原 id

### 2.2 镜像（复制那一下）
- 镜像 id = `wiki-` + base；不存在 → INSERT
- 字段复制：`name / type / content / tags / status / confidence / tolaria_strength` 照抄源实体
- `created_at / updated_at` = now；`last_access` NULL；`invalid_at` NULL
- **已存在镜像不覆盖内容**——差异是信号（双链互校的输入），覆盖等于把差分抹平
- 源实体已退役（`invalid_at` 非空）→ 不建镜像，计 `skippedRetired`

### 2.3 氢键（弱键，可断）
- 边 = `{source_id: rawId, target_id: wikiId, relation: 'hydrogen-bond'}`
- `confidence` 照抄源实体；`strength` 按 SPEC-1.2 映射（0.8+→8 / 0.6-0.79→7 / 0.4-0.59→5 / 0.3-0.39→3 / <0.3→1；confidence 为空 → 5）
- 已存在边（含已断边）→ 不重复插、不自动复活（复键是场域动作，归 2.12）

### 2.4 铁律
- 永不写 `last_access`（两侧都不写）
- 永不物理 DELETE
- 幂等：连跑两趟，第二趟 `mirrored=0`、`bonds=0`、实体行数与边数不变

## 三、Acceptance Criteria（可客观检验）

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 双链成对 | raw 实体跑后存在 `wiki-<base>`，name/type/content/tags/status/confidence/strength 逐列相等 |
| AC-2 | 氢键入列 | links 存在 rawId→wikiId、relation=hydrogen-bond、strength 按映射、invalid_at NULL |
| AC-3 | 幂等 | 第二趟 mirrored=0、bonds=0、entities/links 行数不变、无重复边 |
| AC-4 | 不覆盖已存在镜像 | 预置 content 不同的 wiki 实体，跑后内容不变（差分保留） |
| AC-5 | 退役不镜像 | 源 invalid_at 非空 → 不生成镜像，`skippedRetired` 计数 |
| AC-6 | 不碰 last_access | 两侧预置 last_access=T，跑后仍 ===T |
| AC-7 | 无物理删 | 源码无 `DELETE FROM`；跑后行数只增不减 |

## 四、Non-Goals

- 不做内容蒸馏/改写（1.5 distill）
- 不做差异复校/回填（2.12 reconcile）
- 不做 wiki→raw 反向镜像（方向固定 raw→wiki）
- 不做场的强度升降（2.12/2.13）
- 不动旧 aing 库（冻结只读）

## 五、契约

- 组件 id `import`，strand `raw`，band `background`（复制属沉积动作，唔抢入口带）
- reads `['entities']`，writes `['entities','links']`，budgetTick 1，reversible true
- 入口签名：`async importStep(store, opts) -> { scanned, mirrored, bonds, skipped, skippedRetired }`

## 六、依赖

- 上游：SPEC-0.1（表）、SPEC-0.6 §五（链归属前缀）、SPEC-1.2（strength 映射）
- 消费者：1.5 distill、1.14 编排

## 八、修订 B（2026-11-18，产物不建双链）

- 事故：真库一轮失败后留下 `strand='future'` 的产物（`raw-insight-*`），下一轮 import 先跑，给它建 `wiki-` 镜像并连 `raw→wiki` 边，撞「future→past 边禁止」（SPEC-7.1 §〇.1），整轮 deadlock——import 永远排最前，永远失败。
- 契约：`strand='future'` 的实体不是原料，**不建镜像、不连边**，计入 `stats.skippedProduct`；待其按代谢流程转变后再按常规处理。
- 测试：test-1.4-import AC-8。
