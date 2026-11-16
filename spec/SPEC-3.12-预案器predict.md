---
tags: [aing-v2, spec, 预案器, predict, 预判, 证据, M3, spec:9, predict:9]
description: M3.12 预案器 spec——消息 + 库检索 + 双链候选 → ≤3 张预案卡；每卡带可追原文的 basis，无据则 cold-start 诚实；三档置信带，唔出抽象分数
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.7 §三, SPEC-1.8, SPEC-1.9, SPEC-3.13]
---

# SPEC-3.12 · 预案器（predict）

> 预判唔系预言机：它系「库检索 + 用户上下文」的合成品，输出固定形态 = 预案卡。
> 每张卡必须能点回原文；冇证据就照直写「无以往依据」——**冷启动要诚实**（G6）。

---

## 一、目标

给定一条用户消息，产出 ≤3 张有据预案卡；无据时出 1 张 cold-start 卡；全程只读。

## 二、行为（spec 即契约）

### 2.1 输入面
- 消息文本 `message`
- 库检索：向量检索 top-N（默认 8），只取 `type='Conversation'` 的命中
- 候选边：命中实体关联的 `sprout-candidate` / `pollinate-candidate`（作为第二类证据）

### 2.2 证据（basis）
- 每项 `{kind:'conversation'|'sprout', id, at, quote}`
- `quote` 必须取自原文（回复或事由分析的首 80 字），**唔准编**
- 非冷启动的卡：`basis.length ≥ 1`

### 2.3 卡片字段（固定）
```js
{ id, hypothesis, basis, suggested, risk, confidenceBand }
```
- `confidenceBand ∈ {high, mid, low}`：basis 独立类 ≥2 → high；1 类且 ≥2 条 → mid；其余 low
- 一次最多 3 卡

### 2.4 冷启动（G6）
- 无任何命中 → 恰好 1 卡：
  - `hypothesis: '无以往依据：此话题库内无会话可依'`
  - `basis: []`、`confidenceBand: 'low'`
  - 返回 `coldStart: true`

### 2.5 确定性
- 同输入两次 → 同 id/同 hypothesis 序列（唔用随机数）

### 2.6 铁律
- 只读：唔写任何表；唔碰 `last_access`；无物理 DELETE

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 有据出卡 | 三条相关会话 → 1–3 卡，每卡 basis 非空且 id 指向 `conv-*` |
| AC-2 | 证据可追原文 | 每个 basis.quote 是原文子串 |
| AC-3 | 冷启动诚实 | 空库 → `coldStart=true`、恰 1 卡、hypothesis 含「无以往依据」、basis 空 |
| AC-4 | 三档置信 | confidenceBand ∈ 三值；basis 两类时 high |
| AC-5 | 确定性 + 只读 | 同输入两次输出一致；跑前后各表行数不变 |
| AC-6 | 上限 3 卡 | 造大量命中 → 卡数 ≤ 3 |

## 四、Non-Goals

- 不做大模型生成（模板 + 证据拼装，判据可测）
- 不做命中/落空回喂（3.13 的 feedback）
- 不做 memo 渲染（3.11）

## 五、契约

- `predict(store, {message, k=8}) -> {plans, coldStart}`
- `PLAN_MAX = 3`、`BANDS = ['high','mid','low']`

## 六、依赖

- 上游：SPEC-0.7 §三、SPEC-1.8（检索）、SPEC-3.13（会话实体）
- 消费者：3.11 memo

---

## 修订 A（2026-11-17）：predict 接 CLI

- 新增 `src/cli.js` 命令：`node src/cli.js predict --message "<用户消息>" [--json] [--db <path>]`。
- `cmdPredict(dbPath, { message })`：空词直接拒绝（不猜），否则开库后调 `predict(store, { message })`。
- 人读输出 `humanPredict`：每张卡一行结论 `[置信带] hypothesis`，下附 `依据`（kind + id + 引文 30 字）/ `建议` / `风险`；冷启动显式写「无（冷启动，不造依据）」。
- 缺 `--message` → 退出码 2 + 用法，不崩、不静默。
- 纯读：跑完实体字段与库文件 mtime 均不变（见 SPEC-6.12 修订 B：init 不再无条件落盘）。
- 测试：`test/test-3.12b-predict-cli.js` 6/6（入口、人读输出、JSON、缺参拒绝、只读、铁律）。

---

## 修订 B（2026-11-17）：预案可读性（真库形状适配）

真库读数：139 条会话正文是 markdown，不是 JSON。旧实现在这类正文上退化成「会话-<ISO 时间戳>」做话题、引文取到 `## 蒸馏摘要` 这类结构标题、双链双胞胎（`raw-conv-x` / `conv-x`）各出一张卡。判据不变，只修读法。

- 正文解析：JSON 解析失败即整篇当 `reply`（markdown 路径），不再当空。
- 话题取法优先级：真 `topic` > 摘要段首条 > 非时间戳的 `name` > 正文首句 > 压缩后的时间（`YYYY-MM-DD HH:MM`）> `未命名话题`。
- 摘要段：`## 蒸馏摘要` / `摘要` / `结论` / `核心要点` 标题后的第一条非空行。
- 首句取法跳过：时间戳行、结构词行（`来源`/`内容`/`会话`…）、`原始资料：` / `来源：` 等出处置信行、含 `session-<id>` 的 id 行；剥掉 `【…】` / `①` 一类提炼标签。
- 截断在词边界收口（空格/标点/连字符），并退到未闭合括号之前（不出「ego-browser（chassis」这类半截）。
- 双链去重：同正文签名（去空白前 60 字）只留一条。
- 结论行：话题与首句同源时不再重复一遍。
- 测试：`test/test-3.12c-predict-readability.js` 6/6（引文非空、时间名回退、双链去重、真 topic 优先、只读、铁律）。
