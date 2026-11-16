---
tags: [aing-v2, spec, memo, 外派, 派单卡, 挂载, M3, spec:9, dispatch:8, memo:8]
description: M3.15 外派派单卡 spec——外派面在 memo 挂载、随载交付相关设定；卡七段（命题判据/路径/厚度/底版/编队波次/粒子与门/回报 schema），缺项标"不得派出"；三布尔如实、批间闸、只读快照读数不编数；memo 纯读、卡不代派
date: 2026-11-17
status: 定稿
owner: hana
upstream: [SPEC-2.18 §〇 边界六条, SPEC-2.18 §二, SPEC-3.11 memo 用户面, SPEC-6.6]
---

# SPEC-3.15 · memo 外派派单卡（挂载 + 随载设定）

> **外派面在 memo 挂载，附相关设定**（owner 2026-11-17，D12）。
> 卡是派单口的产物：一张可直接贴进宿主派单入口的文本，不是派出动作。
> memo 仍纯读；包内仍不装 spawn 执行器。

---

## 一、目标

1. 让用户在 memo 上看见本批外派要什么、怎么算对、厚多少、派几粒、过什么门、交什么格式。
2. 相关设定**随卡交付**，不散落别处：派单底版、厚度、路径、三类粒子、四道门、回报 schema。
3. 诚实：缺项就标「不得派出」，读数没有就写「未接」，不编数、不声称「已派」。

---

## 二、行为（spec 即契约）

### 2.1 卡七段（顺序写死，标题固定）

1. `## 一、命题与判据`——这单要什么 + 怎么算对（判据先于执行）。
2. `## 二、路径`——单点查证 / 交叉验证 / 多源对比 / 广扫，四选一并写明理由。
3. `## 三、厚度`——`required` 与「不达标照交、不自动加码」。
4. `## 四、底版与框架`——底版三项（语言/行为/流程）+ 框架四项（背景/命题/轨迹口径/输出 schema）。
5. `## 五、编队与波次`——单元数、波次（1 前出、2 展开）、正面不重叠分工。
6. `## 六、粒子与门`——三类粒子（普通/掩护位/抽查，每批至少 1 粒掩护位）+ 四道门判据（轨迹口径 ≤12 / 来源分级与交叉 / 攻果四件 / 基线门）。
7. `## 七、回报 schema`——五项 + Verdict，附七条违规情形。

卡头三行声明：**本卡不代派**（派出归宿主运行时）、**模式**（三布尔 + `mode`）、**批号与批间闸**。

### 2.2 拒发判据（命中即 `ok=false`，卡头标「不得派出」）

| code | 触发 |
|---|---|
| `statement-missing` | 命题或判据为空 |
| `baseline-missing` | 底版三项缺一 |
| `framework-missing` | 框架四项缺一（复用 2.18 `checkFramework`） |
| `thickness-missing` | 厚度 `required` 非正（复用 2.18 `checkThickness`） |
| `lanes-cover-missing` | 无掩护位粒子（复用 2.18 `checkLanes`） |
| `batch-locked` | 换批且未声明 `continued` |

- 缺项时仍出卡，但卡头红标理由清单；**不静默出卡**、不替用户补默认值。

### 2.3 模式如实（复用 2.18 `dispatchMode`）

- `inRuntimeSurface=false` ⇒ `mode=inline-degraded`，卡注「派发人内联扮演，仍过门」。
- 三布尔分开列，任何一个都不得合并成一句「已支持外派」。

### 2.4 批间闸

- 卡带批号；`batch.previous` 与本批不同且 `continued !== true` ⇒ `batch-locked`，卡标「批间待用户确认」。
- 卡不产生任何自动续派。

### 2.5 读数：只认快照，不编数

- 调用方注入 `snapshot`（宿主侧只读快照）；本件不读文件、不写文件。
- 三态：`undefined` ⇒ 「读数：未接」；缺必需字段 ⇒ 「快照不完整：缺 …」；齐全 ⇒ 在跑单元 / 厚度进度 / 收口·拒收 / 更新时间。
- 禁止用 0、默认值或估算值充数。

### 2.6 判据同源

- 厚度、波次、门结论**只从 `dispatch-swarm.js` 取**，不在卡里重算第二套。
- `result.waves` 必等于 `planWave({units})` 的返回值；`result.problems` 的 code 必须来自 2.2 表。

### 2.7 memo 挂载

- `buildMemo(store, { swarmCard })`：传卡 ⇒ `memo.swarm = {attached:true, summary, card}`；未传 ⇒ `{attached:false, line:'外派：本批未接入（宿主侧派单口）'}`。
- memo 纯读不变（C16）：不新增任何写语句、不投事件、不新增表。

### 2.8 CLI

- `node src/cli.js dispatch-card --file <ticket.json> [--snapshot <path>]`：读入工单与可选快照，输出卡（`--json` 出结构化结果）。
- `node src/cli.js memo --swarm-card <ticket.json>`：把卡挂进 memo 输出。
- 文件读取只在 CLI 层做；`dispatch-card.js` 本体不接触文件系统。

---

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 卡七段齐且有序 | 七个固定标题在卡中按序出现 |
| AC-2 | 缺项不静默 | 缺厚度/底版/框架/掩护位 → `ok=false`、`problems` 命中对应 code、卡含「不得派出」 |
| AC-3 | 模式如实 | `inRuntimeSurface=false` ⇒ `inline-degraded`；`=true` ⇒ `swarm-skill` |
| AC-4 | 不代派 | 卡含「本卡不代派」；源码零 spawn/零文件系统/零写语句 |
| AC-5 | memo 挂载 | 传卡出卡、未传出「未接入」行；库指纹前后一致 |
| AC-6 | 批间闸 | 换批未继续 → `batch-locked` + 「批间待用户确认」；继续 → 放行 |
| AC-7 | 读数十实 | 未接 / 不完整 / 齐全三态文案正确，不编数 |
| AC-8 | 判据同源 | 卡内厚度、波次、门结论与 `dispatch-swarm` 返回值逐项一致 |

---

## 四、Non-Goals

- 不做派出、不做 spawn、不接宿主派单入口（2.18 边界 4）。
- 不做卡片持久化与历史存档（卡是即时产物，不落库）。
- 不写快照（快照由宿主侧写，本件只读注入值）。
- 不做界面渲染（只出文本卡；界面归宿主）。

---

## 五、契约

- `buildDispatchCard(input, { snapshot } = {})` → `{ ok, card, problems:[{code,detail}], mode, flags, thickness, waves, batch }`
- `input = { ticket, statement, criteria, path, baseline, framework, thickness:{required}, lanes, units, batch:{id,previous,continued}, flags:{swarmInstalled,inRuntimeSurface,bundledInPackage} }`
- `snapshot = { batch, units:[{id,ticket,thickness}], closed, refused, updatedAt }`
- 复用：`checkFramework / checkThickness / checkLanes / dispatchMode / planWave / baselineGate / TRACE_MAX / PARTICLE_CLASSES`

---

## 六、依赖

- 上游：SPEC-2.18（判据与边界）、SPEC-3.11（memo 纯读）、SPEC-6.6（外场读数）、D12（memo/meko 对齐）。
- 消费者：CLI `dispatch-card` / `memo --swarm-card`；宿主侧派单入口（不在包内）。
