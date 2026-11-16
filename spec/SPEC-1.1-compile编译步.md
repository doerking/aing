---
tags: [aing-v2, spec, 核心代谢, compile, 双铰链, M1, spec:9, compile:8]
description: M1.1 compile 编译步 spec——raw 链解旋-复制入 entities 表，尊重声明 id，幂等 upsert，永不碰 last_access/invalid_at
date: 2026-11-13
status: 定稿（含 2026-11-17 修订 A：type 路径推断）
owner: ring
upstream: [ARCHITECTURE-全架构重写图纸-DNA双铰链-从零实现-2026-11-13.md §1.2/§三/§六第1期, SPEC-0.1, SPEC-0.4 AC-6]
---

# SPEC-1.1 · compile 编译步（raw 链解旋-复制入 entities 表）

> 第 1 期核心代谢循环的 compile 步。图纸 §〇：双铰链 raw/*.md ⇄ meko 弱键 ⇄ wiki/entities——
> compile 承担 raw 链的**解旋+复制**（读 raw .md → 实体入 entities 表）；wiki 链在新架构以 entities 表为真源（图纸 §三：新库 aing-v2/knowledge.db），不再生成 wiki/*.md 文件。
> P0 换锚铁律（图纸 line85）：`last_access` 检索命中写、compile 永不碰——本 spec 将其锁为可测 AC（回归 SPEC-0.4 AC-6 后半）。

---

## 一、目标

把 rawDir 下全部 .md 编译进 entities 表：声明 id 锚定、幂等 upsert、内容变更才刷 updated_at，全程不碰 last_access / invalid_at / created_at。

## 二、行为（spec 即契约）

### 2.1 解旋（扫 raw 链）
- 递归扫 `rawDir` 下全部 `.md`（跳过隐藏目录与隐藏文件）。
- frontmatter 解析：`^---\n…\n---\n` 定界；平铺 `key: value` + 行内数组 `[a, b]`，引号剥离；无 frontmatter → 整档为 body、metadata 空。

### 2.2 复制（实体入表）
- **id 锚定**：frontmatter 声明 `id` 原样用（尊重声明 id——旧线教训：按路径推导平白加前缀会与声明面脱钩）；无声明 → 相对 rawDir 路径推导（`/`→`-`、去 `.md`），稳定可重算。
- 新 id → INSERT：`type/content/tags/status/confidence` 取 frontmatter（tags 存 JSON 数组字符串；status 缺省 `active`），`created_at/updated_at` = now，`invalid_at` NULL，`tolaria_strength` 走列默认 5，`last_access` NULL。
- 已存在 → 比内容列（name/type/content/tags/status/confidence）；有变 → UPDATE 内容列 + `updated_at`=now；无变 → no-op（不刷 updated_at）。

### 2.3 再螺旋（换锚铁律）
- compile **永不写** `last_access` / `invalid_at` / `created_at` / `tolaria_strength`。
- 退役实体（invalid_at 非空）不因 raw 仍在而复活——复活是显式 revive 动作，不属编译。

### 2.4 幂等
- 同 rawDir 连跑 2 趟：第二趟 created=0、表行数不变、无抛错。

## 三、Acceptance Criteria（可客观检验）

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | frontmatter 解析 | 有 frontmatter 取 metadata+body；无 frontmatter metadata 空、整档为 body |
| AC-2 | id 锚定 | 声明 id 原样入表；无声明按相对路径推导；两文件同声明 id 只入一行 |
| AC-3 | 新实体入库列齐 | type/content/tags(JSON 数组)/status/confidence 按 frontmatter，created_at/updated_at 非空，invalid_at NULL，tolaria_strength=5，last_access NULL |
| AC-4 | 幂等 + 变更感知 | 同 raw 连跑 2 趟：第二趟 created=0、行数不变；内容未变实体 updated_at 不刷新；内容变实体 updated_at 刷新 |
| AC-5 | compile 永不碰 last_access | 预置实体 last_access=T，compile（含内容更新路径）跑后仍===T（SPEC-0.4 AC-6 后半回归） |
| AC-6 | 不复活退役实体 | 预置实体 invalid_at 非空，compile 跑后 invalid_at 不变 |

## 四、Non-Goals

- 不做 wikilinks 提边（link 步职责，SPEC-1.2）。
- 不做行内 `[tag:xxx:N]` 防化闸 / taxonomy 白名单（门禁适配后续期；M1 只采 frontmatter tags）。
- 不做 9 段 `:N` 标签强度归一（tolaria_strength 维持列默认，强度轴后续步管）。
- 不写 wiki/*.md 文件（entities 表即 wiki 链真源；旧 wiki 文件走第 4 期迁移）。
- 不做向量/kespi/compress/意识层调度。
- frontmatter 解析只支持平铺 key: value + 行内数组；嵌套/多行 YAML 不属本步（按需再立依赖）。

## 五、依赖

- 上游：SPEC-0.1（entities 表 DDL）、SPEC-0.4（AC-6 last_access 铁律）、图纸 §1.2/§三/§六第 1 期
- 实现：M1 任务 1.1（src/compile.js），复用 knowledge-store 单例（_getDb）

---

> 第 1 期按垂直切片推进，每步独立 spec + failing test + ALL GREEN。

---

## 修订 A（2026-11-17）：type 路径推断

- 动机：frontmatter 不写 `type` 时，实体类型为 NULL；下游分层留存把 NULL 一律归知识层（永不按时间退），短料（会话/待办）因此堆满热库。
- 契约：
  1. frontmatter `type` 非空 → **原样优先**，路径不覆盖。
  2. 否则按相对路径的目录段（小写）匹配：`conversations|conversation|chats|sessions → Conversation`；`todos|todo|tasks → Todo`；`papers|paper → Paper`；`concepts|concept → Concept`；`meta|meta-knowledge|metaknowledge → MetaKnowledge`；`insights|insight → Insight`；`originals|origin|inbox → RawDocument`。
  3. 都不匹配 → `null`（未知，下游按知识层保底；**不从正文猜**——误判成短料会被到期删）。
- 导出：`inferType(relPath, metadata)`、`TYPE_BY_DIR`。
- 幂等不变：推断结果参与行比对，复跑无变则 skipped，不刷 `updated_at`。
- 测试：`test/test-1.1b-type-infer.js` 6/6（显式优先、会话/待办、知识层三类、未知不猜、幂等、铁律）。
