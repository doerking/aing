---
tags: [kespi, readpath, defect-fix, kq, consistency, integrity, must-read]
description: KESPI 读路径三处断线（A 读方正则脱节 / B getEntities 列撞 / C prune 死检查）的修复记录与前后证据，含负向自证
---

# KESPI 读路径修复记录（2026-11-03）

> 本文档记录 aing 知识库「KESPI 分数写入 vs 读取」三处同源断线的定位、修复与前后实测。
> 任何后续改动 `src/kespi-check.js` / `src/compile.js`（写方）或 `src/prune.js` /
> `src/consciousness-layer.js` / `src/neural-guide-chain.js` / `src/knowledge-store.js`（读方）
> 前先读本文档，避免格式再次脱节。

## 一、病根：写方用 JSON，读方用 YAML 正则

KESPI 状态 block 由**写方**落盘，格式固定为 ```json 围栏：

| 写方 | 位置 | 写入格式 |
|---|---|---|
| 代谢首评前占位 | `src/compile.js` `formatKespiPending()` | ```json `{ "status":"pending", "overall":null, "dimensions":{} }` |
| 首评后改写 | `src/kespi-check.js`（:35-36） | ```json `{ "status":"computed", "overall":0.87, "dimensions":{KQ..KB} }` |

即 block 里写嘅系 **`"overall": 0.87`（带引号 JSON）**。

但**读方**全部用 **`/overall:\s*([\d.]+)/`（YAML 无引号）** 正则去提分数。
两者格式不同源 → 正则永远 0 命中。

## 二、三处断线（A / B / C）

### A — 4 处读方正则与 JSON 写方脱节（全库实测 0 命中）

| # | 读方 | 行 | 用途 | 断线后果 |
|---|---|---|---|---|
| A1 | `src/prune.js` | :82 | 剪枝「KESPI 过低」判定 | 永远读唔到 `overall` → 质量剪枝形同虚设 |
| A2 | `src/consciousness-layer.js` | :321 | `_getVitality` 实体活力 | 永远落默认 0.5 → 意识层热力图/热度排名失真 |
| A3 | `src/neural-guide-chain.js` | :154 | 导链实体活力 | 永远落时间衰减分支 → 注意力分配失真 |

全库 89 份 `wiki/entities/*.md` 实测：**YAML 正则命中 0，JSON 正则命中 88**（余 1 份 pending `overall:null`）。

**修法**：读方正则改 `/\"?overall\"?\s*:\s*([\d.]+)/`，JSON / YAML 两种写法都接。

### B — `getEntities` 列名撞：`entity.consistency` 食到错误表

`src/knowledge-store.js` 嘅 `getEntities()`（:308）与 `getEntity()`（:297）都写 `SELECT e.*, m.*`，
而 `entities` 表与 `entity_metadata` 表**都有一个 `consistency` 列**：

- `entities.consistency`（saveEntity 写入，默认 0.5）— 真值
- `entity_metadata.consistency`（KESPI 增强评估用，未评估=0.0）

`m.*` 喺后 → object 结果里 `.consistency` 永远被 metadata 嗰个（多为 0.0）盖过。
`src/kespi-check.js:90` 嘅 `_calcKQ` 读 `entity.consistency`，于是食到 0.0 而唔系 0.5。

**实测坐实**：试批 10 张 `entities.confidence=0.8`、`entities.consistency=0.5`，
但 `getEntities` 返返去嘅 object `.consistency=0`，KQ = 0.8×0.6 + 0×0.4 = **0.48**（仍红），
而唔系应得嘅 0.8×0.6 + 0.5×0.4 = **0.68**（过线）。

**修法**：`getEntities` / `getEntity` 将 `m.consistency` alias 为 `meta_consistency`，
令 `.consistency` 回归 entities 表真值；metadata 嗰个值另经 `.meta_consistency` 读取（不丢字段）。

### C — `prune.js` freshness 死检查

`src/prune.js:81` 读 `entityContent.match(/freshness:\s*([\d.]+)/)`，
但 `dimensions` 只有 8 个 key（KQ/KG/KA/KM/KD/KC/KR/KB），**根本没有 `freshness` 字段**——
全库 0 命中，该判定从未生效过（死代码）。

**修法**：删除死检查（freshness 新鲜度实际由实体文件 `mtime` 嘅「不活跃天数」判定承担，已存在）。

## 三、修复前后实测

### 修复前基线（2026-11-03，存 `.temp/kespi-before.txt`）

- KQ 维度：**88/89 红（0.00）**、1 条 session 实体 0.9 过线
- 全库 92 实体（active 89 / done 2 / pending 1），主体欠账系 76 条 `data-analysis-*` Concept（conf=0）
- 试批 10 张经典卡（K-Means / AdaBoost / SVM / 随机森林 / 决策树 / 线性回归 / 逻辑回归 / 朴素贝叶斯 / KNN / 机器学习数学基础）标 `confidence: 0.8`

<!-- FIX-VERIFY-ANCHOR: 修复后实测数字追加于此，勿删本锚点 -->

### 修复后实测（2026-11-03，存 `.temp/kespi-after3.txt`）

| 指标 | 修前（基线） | 修后 | 变化 |
|---|---|---|---|
| KQ 维度红（<0.5） | **88/89**（全 0.00） | **79/90** | 降 9 条过线 |
| KQ 过线数 | 1/89（1%） | **11/90（12%）** | +10（试批） |
| 试批 10 张 KQ | 0.00 | **0.68**（过线） | conf=0.8 + cons=0.5（修 B 后 entities.consistency 真值回归） |
| `_getVitality`（修 A） | 永远 0.5 默认 | **0.87**（真实 KESPI 分） | 读方正则 JSON 兼容生效 |
| `getEntities` 列撞（修 B） | `.consistency` 恒 0（被 metadata 盖） | `.consistency`=0.5 / `.meta_consistency`=0 **两列分离** | alias 生效 |

- **行为层自证**：`.temp/verify-kespi-readpath.js` 10/10 ALL PASS（正则对真实 computed 档提返 0.87、旧 YAML 正则 0 命中坐实断线、pending 档落默认分支、`_getVitality` 真跑 >0.5、两列分离、KQ 手算 0.68）
- **全量代谢**：`node src/run-metabolism.js` → 「🟢 代谢成功：所有关键步骤均已完成」
- **验收**：`node verify-deploy.js` exit 0 → **ALL GREEN（C0-C20，32 项 @30d78ca）**
- **最后一米**：L1 备忘录联通（state=integrating / vectorSearch=semantic-384 / 六组件链接齐）；L2 本修复会话入库（session=`kespi-readpath-fix-20261103`，落 `raw/inbox/` 成档 `status=pending-distillation` / `confidence=0`，WAL 余 0）

> **仍红的 79 条**：系 76 条未 review 嘅 `data-analysis-*`（conf=0）+ 其余外部投喂，诚实基线——佢哋真系未经「人工确认→confidence」这一步。要转绿需逐条 review（同试批同法：raw frontmatter 加 confidence 重编译），唔系 bug。

## 四、负向自证（防止检查静默失效）

1. 读方正则改后必须仍能在 ```json 围栏里提返 `overall`（对一份真实 computed 档跑 `shouldPrune`/`_getVitality` 断言 > 0.5）
2. 对一份 `kespi_status: pending` 档（`overall:null`）断言读方仍落默认分支（唔会拿到 null 值误判）
3. `getEntities` 改后断言 `.consistency` 等于 entities 表值、`.meta_consistency` 等于 metadata 表值（两列分离）

## 五、收工门槛

- `node --check` 改过 4 个 JS（prune / consciousness-layer / neural-guide-chain / knowledge-store）全过
- 全量代谢（compile→import→vector→kespi）跑通
- KESPI 复测：KQ 红数由 88 降、试批 10 张 KQ 0.48→0.68 过线
- `node src/metabolism-panel.js` 重生成 → `node verify-deploy.js` ALL GREEN
- 最后一米 L1（memo --summary）+ L2（一条会话真入库 WAL 余 0）
