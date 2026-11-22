---
tags: [aing-v2, kd, kespi, 量档, 口径, 双向, 拍板, spec:8, handoff:8]
description: kd 双向催化口径四方案量化（2026-11-22）——B′ 条件豁免零误伤，但其语义等于取消 kd-cited/slot 单，与 D18 已裁定冲突，落地须 owner 拍板
date: 2026-11-22
status: active
owner: hana
upstream: [STATUS.md, docs/Engineering/GREENZONE-REPROBE-2026-11-22.md, docs/Engineering/KESPI-CALIBRATE-2026-11-21.md]
---

# kd 双向催化口径 · 四方案量化（KD-BIDIR-REPROBE）

## 〇、结论先行

1. **四方案量化完毕，落地须 owner 拍板**——因为语义正确的 B′ 等于取消一类工单，与 D18 已裁定口径直接冲突，唔该自作主张落地。
2. **方案 B（无差别豁免）有真副作用**：会误压 **28 张真催化型实体**，`agent-skills-registry`（出向强边 15）`kd` 1 → 0.5、`overall` 0.87 → 0.77。已否。
3. **B′（条件豁免）零误伤**，且是唯一语义自洽的方案——但代价见第四节。
4. **kd 维大面积同分唔系口径 bug**：真库 322 实体中 `kd=0` 有 272 张（84.5%）。这是库拓扑事实（多数实体既唔催化又唔被引用），B′ 后仍 264 张。唔该硬调。

## 一、缘起

`docs/Engineering/GREENZONE-REPROBE-2026-11-22.md` 复量发现：greenZone 闸开时会剔 4 张 `kd` 单，其根因系「被引用型实体背 `kd=0` 的债」。本文回答：**该唔该从口径上解呢笔债。**

现状实现（`src/kespi.js`）：`kd = clamp01(出向强边 / 3)`——**单向**。
现状开票（`src/self-optimize.js`）：`kd < 0.30` 才候选；`raw-` 缺键走 `rebond`；否则要求**入向强边 ≥2** 才出 `kd-cited/slot`（P3 提案）。

## 二、四方案定义

| 方案 | 公式 | 语义 |
|---|---|---|
| 现状单向 | `min(1, 出向强边/3)` | 催化率 = 你催动了几多 |
| A 双向 | `min(1, (出+入)/3)` | 双向连接度 |
| B 豁免 | 入向强边 ≥2 → `0.5`，否则同现状 | 被引用型唔背债 |
| **B′ 条件豁免** | 出向强边 >0 → 同现状；否则入向强边 ≥2 → `0.5`；否则 `0` | 只豁免「零催化且被引用」|
| C 取大 | `min(1, max(出,入)/3)` | 任一方向即算 |

## 三、真库量（322 实体，副本）

| 方案 | `kd=0` 张数 | `kd<0.30` | `overall≥0.60` | 误压真催化型 |
|---|---|---|---|---|
| 现状单向 | 272 | 272 | 106 | — |
| A 双向 | 260 | 260 | **114** | 0（但语义混淆）|
| B 豁免 | 264 | 264 | 106 | **28 张** |
| **B′ 条件豁免** | 264 | 264 | **108** | **0** |
| C 取大 | 260 | 260 | **114** | 0（但语义怪）|

4 张目标实体（`out=0`、`in` 3–11）喺各方案下的读数：

| 实体（前缀）| 现状 | A | B′ | C |
|---|---|---|---|---|
| `dispatch-…-drone-campaign-sources` | kd 0 / ov **0.6533** | kd 1 / ov 0.8533 | kd 0.5 / ov 0.7533 | kd 1 / ov 0.8533 |
| `dispatch-…-src-landscape-sources` | kd 0 / ov **0.6367** | kd 1 / ov 0.8367 | kd 0.5 / ov 0.7367 | kd 1 / ov 0.8367 |
| `skill-registry-ai-llm-security` | kd 0 / ov **0.67** | kd 1 / ov 0.87 | kd 0.5 / ov 0.77 | kd 1 / ov 0.87 |
| `skill-registry-supply-chain-security` | kd 0 / ov **0.67** | kd 1 / ov 0.87 | kd 0.5 / ov 0.77 | kd 1 / ov 0.87 |

**A/C 提幅 +0.18～0.20 overall**，B′ 提 +0.10——A/C 系把「被引用」当「催化」，系语义混淆；B′ 只给中性分，语义干净。

## 四、B′ 的真代价（关键）

B′ 豁免条件 `出向强边 = 0 且 入向强边 ≥ 2`，**与 `kd-cited/slot` 开票条件完全重合**：

> 现状：呢批实体 `kd=0` → `<0.30` → 入向强边 ≥2 → 开 `kd-cited/slot` 单
> B′：呢批实体 `kd=0.5` → 唔再 `<0.30` → **唔开单**

所以 B′ **唔系解除误伤，系取消一类工单**。它直接推翻 D18 已裁定口径「被引用唔催化 → slot（P3 提案）」。
真库该批只有 8 个实体（D18 诊断：272 个 `kd<0.30` 里 264 个 `inStrong<2` 唔开单，余 8 个走 slot）——**B′ 会让呢 8 个全部唔再开单**。

### B 的副作用（已否）

无差别豁免只看入向边，会误压真催化型实体：

| 实体 | 出向强边 | 入向强边 | `kd` 现状 | B 会压到 |
|---|---|---|---|---|
| `agent-skills-registry` | 15 | 2 | 1 | 0.5 |
| `skill-registry-deep-research` | 11 | 4 | 1 | 0.5 |
| `skill-registry-hourglass` | 12 | 3 | 1 | 0.5 |

共 **28 张**——`agent-skills-registry` 呢种真催化型实体被压，`overall` 0.87→0.77，**假差**。

## 五、三个选项（待拍板）

| 选项 | 做法 | 后果 | 建议 |
|---|---|---|---|
| **① 维持现状** | 唔改口径；greenZone 闸照默认关 | 4 张 `kd-cited` 单继续开；闸开咗会剔 | 最低风险，但「被引用唔该开单」呢句仍系争议 |
| **② B′ 条件豁免**（opt-in 旋钮，默认关）| 新增 `kespi.kdCitedExempt`，开则豁免 | 8 个 slot 候选唔再开单；推翻 D18 | 语义最干净，但要 owner 明确推翻 D18 |
| **③ 闸口径分离** | `kd` 单向照旧，但 `kd-cited` 单改由 `strand`/`type` 白名单决定 | 唔动评分，只改开票范围 | 最保守，评分可比性零破坏 |

## 六、教训（可复用）

- **「解除误伤」要先验口径重合**：B′ 的豁免条件与开票条件完全重合，说明佢唔系修 bug 而系改立场。改立场要交回拍板，唔该当修 bug 落地。
- **无差别豁免必查反向受害者**：B 只看入向边，就压到 28 张真催化型实体。任何「条件豁免」都要双向验。
- **量库数字走正解 API**：`step()`/`getAsObject()`；`.get()` 会读错（410 vs 322）。

## 七、关键引用

- 上游量档：`docs/Engineering/GREENZONE-REPROBE-2026-11-22.md`
- 开票口径：`src/self-optimize.js` `DIM_RULES.kd = { below: 0.30, kind: 'kd-low', action: 'rebond', requireInStrong: 2 }`
- 评分口径：`src/kespi.js`（`kd = clamp01(outStrong/3)`）
- 阈值单源：`src/config-runtime.js` `DEFAULTS.kespi`（新增旋钮须同时入 `KESPI_PATHS` / `COMPONENT_KNOBS`）
- 真库量档：`docs/Engineering/KESPI-CALIBRATE-2026-11-21.md`
