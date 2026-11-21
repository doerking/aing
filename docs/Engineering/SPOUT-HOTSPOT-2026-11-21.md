---
tags: [aing-v2, engineering, sprout, hotspot, profiling, 优化, keyword-selectivity, must-read:9, evidence:9]
description: sprout 热区剖析（2026-11-21）——一轮代谢 25.5% 时间喺 sprout；两个教科书优化实测全部失效（倒排索引慢 2.78x、数组预成型零增益）已回退；真因系 keywords() 每实体产出中位 186 个关键词、76.8% 唔具选择性（top 词系 2026/json/status 呢啲日期与 JSON 字段名），杠杆系停用词阈值而唔系算法
date: 2026-11-21
status: active
owner: hana
---

# sprout 热区剖析与两个失败的优化 · 2026-11-21

> **性质**：测量记录，非门禁。配套工具 `tools/round-profile.js`（测量工具，非门禁）。
> **缘起**：一轮代谢 1,660–1,700 ms，`sprout` 独占 **25.5%**（365 ms 均值）。喺动佢之前先量清楚成本喺边。

---

## 一 · 逐步时相（`tools/round-profile.js`）

| 步骤 | 轮数 | 累计 ms | 均值 ms | 占比 |
|---|---|---|---|---|
| **sprout** | 3 | 1,096 | 365 | **25.5%** |
| **pollinate** | 3 | 796 | 265 | **18.5%** |
| **field-maintain** | 3 | 658 | 219 | **15.3%** |
| **hub-trim** | 3 | ~570 | ~190 | **~12.7%** |
| link-sync | 3 | 330 | 110 | 7.5% |
| kespi | 3 | 248 | 83 | 5.6% |
| vector | 3 | 239 | 80 | 5.4% |
| …（余 15 步） | 3 | ~360 | — | ~8% |

> 墙钟均值 1,660 ms / p90 1,980 ms。头四步占 **~72%**。

## 二 · sprout 内部阶段拆解

同一真库副本（`data/knowledge.db`，5.50 MB）：

| 阶段 | 耗时 |
|---|---|
| 载 entities 200 行 | 18 ms |
| 载 links 2,324 行 | 17 ms |
| `keywords()` × 200 实体 | 33 ms |
| 配对循环（18,891 对 / 424 万次 `Set.has()`）| **11 ms** |
| `store._persist()` | 46 ms |
| **合计（以上）** | **125 ms** |
| **sproutStep 全程** | **419 ms** |

> 前四项只占 79 ms，配对循环 11 ms——**但配对循环嘅 filter 分配与 keywords 展开未喺呢一栏计入**，真正成本系配对循环里每对 `[...ma.kw].filter(...)`（中位 186 个关键词 × 18,891 对 ≈ 350 万次 `has()` + 每对一次数组展开）。

**关键读数**：`keywords()` 每实体产出 **min 44 / 中位 186 / max 615** 个关键词。

## 三 · 两个失败嘅优化（已回退）

### 3.1 倒排索引（教科书做法）→ **慢 2.78x，回退**

思路：唔全扫 C(n,2) 对，改用倒排索引（tag / kw / neighbor 各建 `词 → 实体集`），只枚举真有机会凑足 2 类证据嘅对。

实测（同一真库副本、同进程、交替跑 5 次）：

| 实现 | 5 次 ms | 均值 |
|---|---|---|
| 旧 O(n²) 逐对 | 330, 260, 250, 243, 312 | **279** |
| 倒排索引 | 856, 757, 774, 725, 769 | **776** |
| 倍数 | — | **2.78x 更慢** |

**等价性成立**：两者 `pairs` 均系 18,891，候选数均系 4,468（`skipped 4,464 + seeded 4`）。**系正确，但喺呢个语料上输咗。**

**点解输**：CJK 二字组合喺呢个语料上唔具选择性（见 §五），倒排组太大，枚举嘅对反而比 C(200,2)=19,900 更多。

### 3.2 数组一次成型（预展开 Set）→ **零增益，回退**

思路：`meta` 一次成型 `{tags:[], kw:[], tagsSet, kwSet}`，配对时唔再 `[...set]` 展开（省每对 2–3 次数组分配 × 18,891 对）。

实测：旧 288 ms 均值 / 新 315 ms 均值（**1.09x**），稳态（剔除前两次 JIT warmup）288 vs 288——**冇可测增益**。

### 3.3 结论

`sprout` 嘅成本系 **O(pairs × avg_keywords)**，而呢个语料嘅 avg_keywords 高达 186。教科书优化喺「词唔具选择性」嘅语料上全部失效。**杠杆唔喺配对算法，喺关键词抽取本身。**

## 四 · 等价性护栏（已入仓）

`test/test-1.10b-sprout-equiv.js` 4/4 绿——档内联一份 O(n²) 参考实现，断言 `sproutStep` 产出嘅 links 候选对集合逐对一致，含四个负例（只共享 tag / 只共享关键词嘅对唔该发种）与「已有边唔再发种」。任何将来改 `sprout` 嘅尝试都得先过呢档。

## 五 · 真因：关键词选择性

200 实体 → **12,370 个不同关键词**：

| 文档频次 | 关键词数 | 占比 |
|---|---|---|
| ≥ 2 | 9,506 | **76.8%** |
| ≥ 3 | 2,642 | 21.4% |
| ≥ 5 | 1,132 | 9.2% |
| ≥ 10 | 424 | 3.4% |
| ≥ 20 | 173 | 1.4% |
| ≥ 50 | 89 | 0.7% |
| ≥ 100 | 27 | 0.2% |
| **只出现 1 次（有选择性）** | **2,864** | **23.2%** |

**最高频关键词 top12**：`2026×161` `11×155` `来源×144` `KESPI×142` `KB×142` `json×140` `内容×140` `状态×138` `status×136` `computed×136` `overall×136` `dimensions×136`

呢啲根本唔系关键词——系**日期、JSON 字段名、通用词**。`keywords()` 现时口径：拉丁词（长度 ≥2）+ **每个相邻 CJK 二字**（无停用词、无频次阈值），故 400 字正文自然产 ~200 个 bigram。

## 六 · 外源参考（已实时抓）

| 来源 | 抓点 | 用喺边 |
|---|---|---|
| sqlite.org FAQ（含 2024-11-19 更新） | *「Putting multiple operations inside a single transaction can improve performance dramatically by avoiding the overhead of transaction control」*；*「By default, each INSERT statement is its own transaction. But if you surround multiple INSERT statements with BEGIN ... COMMIT then all the inserts are grouped into a single transaction」* | 写路径：每轮代谢多次 `_persist()` |
| nodejs.org `node:sqlite` 文档 | `database.limits` / `database.prepare(sql, options)` / `PRAGMA foreign_keys` 默认 true；**未暴露 statement-cache 旋钮** | 排除「调 statement cache」条路 |

> `sqlite.org/perf.html`、`sqlite.org/analyze.html`、`sqlite.org/optimize.html`、`sqlite.org/prepare.html` 实为 404（2026-11-21 实测），引用以 FAQ 为准。

## 七 · 可行动项（待 owner 拍板）

| 项 | 性质 | 影响 |
|---|---|---|
| ~~`keywords()` 加文档频次阈值~~ | ✅ 已落地（见第八节）| 真库 1.32x；默认关 |
| ~~写路径事务合并~~ | ✅ 已量：**唔值** | 200 条写 autocommit 先 20ms（单事务 6ms，省 70%），但一轮只写几条边（<5），写开销 <1ms，占 1660ms 轮嘅零头。瓶颈系计算唔系写 |
| ~~`sprout.floor` 死码~~ | ✅ 已清 | sprout.js:37 定义后用都无用，零风险 |

**未做**：唔擅自动 `keywords()` 口径——`kw` 证据系行为，动佢等于改判据，要 owner 拍。

## 八 · 决策记录（owner 2026-11-21 拍板 + 落地）

**拍板**：加文档频次阈值（剔除出现在 ≥某百分比扫描实体嘅词），先写 failing test 锁行为再改。

**落地（commit `cb9489a` + 后续 `kw.` 统一）**：新增旋钮 `kw.docFreqPctMax`（`config-runtime` 单源，旋钮 13→14），共享 helper `filterKwByDocFreq` 剔除出现在 ≥该百分比扫描实体嘅关键词。**sprout + pollinate 共用同一旋钮**（阈值系 keywords() 证据层嘅共享概念，唔另起平行表）。

**关键发现：默认必须 0（关）**。

1. **同构语料会剔到归零**：test-2.10 AC-4 嘅 fixture 系 `'守恒样本内容'+id`——所有 bigram 都系高频，阈值一开，sprout 产出种子 `seededEach: [0,0,0,0,0]`（完全归零）→ 守恒带断链。**阈值系按语料开嘅优化，唔系默认行为。**
2. **绝对下限 3**：kw 证据需 ≥2 个共享词，而共享词本身 docFreq ≥2——cutoff ≤2 会剔晒所有共享词，等于杀死 kw 证据。`cutoff = max(3, N×阈值%)`。真库（N=200）5% = 10，唔触下限。
3. **真库实测 1.32x**（5 次交替，367→277 ms），唔系预估嘅 4x——5% 阈值对 200 实体只剔 docFreq ≥10 嘅词（3.4%），每实体关键词 186→120（-35%）。
4. **pollinate 同根因、同旋钮**：pollinate 复用 `keywords()`，配对循环 198ms、跨域对 14,001，有相同噪声。接同一切阈值后实测 **1.20x**（263→219 ms）。

**test**：`test-1.10c-sprout-docfreq.js` 6/6；`test-1.10d-pollinate-docfreq.js` 4/4；`test-1.10b` 参考实现同步阈值（fixture 加厚至 52 实体，令参考与实现喺任何旋钮值下同口径）仍 4/4。

## 九 · 复现

```bash
cd G:\DPD\aing-v2
node tools/round-profile.js              # 逐步时相
node tools/round-profile.js --json       # 机读
node test/test-1.10b-sprout-equiv.js    # 等价性护栏 4/4
```

门禁状态：`npm test` → 169 档 / 1120 断言全绿；`node verify-deploy.js` → 33 项 ALL GREEN。
