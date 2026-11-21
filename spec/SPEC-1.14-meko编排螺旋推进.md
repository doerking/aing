---
tags: [aing-v2, spec, 核心代谢, meko, 编排, 螺旋, DNA双铰链, M1, spec:9, must-read:9, meko:9, 双铰链:8]
description: M1.14 meko 编排 spec——组件契约注册，按 raw→场域→wiki 螺旋多轮推进替代直线 11 步；每轮结算落 meko_cycles 且有界
date: 2026-11-16
status: draft（待 owner review）
owner: ring / Hana
upstream: [SPEC-0.6, SPEC-0.3, SPEC-1.1, SPEC-1.2, SPEC-1.13]
---

# SPEC-1.14 · meko 编排（螺旋推进，替代直线 11 步）

> 旧院 `run-metabolism.js` 用 `execSync` 串 11 个独立进程：直线、无事务、任一步爆断链。
> v2 改为**单进程内螺旋编排**：步骤注册契约 → 编排器按链/带排序 → 多轮推进（后一轮见到前一轮改动）→ 每轮结算落 `meko_cycles` → 全程有界。

---

## 一、目标

钉死编排器嘅注册契约、轮序、边界，令「螺旋」可测——唔系单趟顺序执行就叫双铰链。

## 二、组件契约（沿用 SPEC-0.6 §3.2）

```js
registerStep({
  id: 'compile',          // 必填，唯一
  strand: 'raw'|'wiki'|'cross',  // 必填，链归属
  band: 'entry'|'field'|'background'|'cross', // 必填
  reads: ['entities'],    // 必填，数组
  writes: ['entities'],   // 必填，数组
  budgetTick: 1,          // 必填，正整数
  reversible: true,       // 必填，boolean
  onCycle: async (ctx) => ({ ok, actions?, evidence? })  // 必填
})
```
- 缺字段 → `registerStep` 抛错（fail-fast）。
- 同 id 重复注册 → 抛错。
- 组件**唔准自己 require knowledge-store**（门禁 C5 静态查）；store 由 ctx 注入。

## 三、螺旋轮序（核心，可测）

单轮（round）内固定三拍，按链交替：

```
第 1 拍 raw 链步骤 → 第 2 拍 cross/场域步骤 → 第 3 拍 wiki 链步骤
```

- 多轮默认 **2 轮**（`opts.rounds`），后一轮重跑全部步骤，**见到前一轮写入嘅状态**——呢个就系「螺旋 ≠ 直线」嘅可断言定义。
- 同轮内按注册顺序稳定执行；跨轮重入次数计入结果。
- `ctx` 每步都带：`{ store, round, strand, bus, cycleId }`；`bus` 系轮内共享对象（供步骤间交换，唔准直连）。

## 四、结算与边界

- 每轮结束写一行 `meko_cycles`：`cycle_type = '<cycleType>:round<N>'`，`helix_strand='both'`，`kespi_snapshot` 非空，`executed_at` 落真实时间，`status='executed'`。
- 整轮超时（`deadline = scheduled_at + T_bound`，T_bound 来自 SPEC-0.3）→ 当前轮标 `failed`，中止余下步骤，返 `{ ok:false, failedRound }`，唔无限跑。
- 步骤抛错 → 记 `{ id, error }` 入 `results`，标当轮 failed；唔静默吞。
- 返回结构：
```js
{ ok, cycleId, rounds, results: [{ round, id, ok, actions?, error? }], deadline, elapsedMs }
```

### 4.1 deadline 传播到步内（修订 H，2026-11-20）

> **触发原因（实障）**：外部执行器（宿主 hook）给整轮挂 `timeout=900s` 并 SIGKILL。此前 deadline 只在**步骤之间**判，单步内部（KESPI 扫全库、向量重建）跑多久无人看：引擎以为自己还有时间，外部已把它杀掉。后果是「每小时只写回一小段、下轮从头重来」——旧院 63 天累积 78 万行残稿就是这个形状。

- **ctx 必带 `deadlineAt`**（epoch ms，等于本节 `endsAt`）。步可以在任意时刻拿它判断自己还有多少预算。
- **进下一步前先查**：剩余预算 ≤ 0 就不启动新步，当轮直接标 failed（`reason='deadline:before:<stepId>'`）。
- **步内按块自检**：长步（KESPI / 向量 / 编译等逐实体或逐档循环）每 N 条检查一次，超预算就主动收口，返回：
  ```js
  { ok: false, reason: 'step-deadline', done: <已完成条数>, total: <总条数> }
  ```
  已处理部分仍要落盘（不丢已做的工作），但**不得**声称本轮完成。
- **编排器把「步主动收口」与「步抛错」分开记**：前者 `results[i].reason='step-deadline'` + `partial`，后者 `results[i].error`；两者都令当轮 `failed`，均**不静默吞**。
- 判据：外部 timeout 无论设多短，引擎都必须在 deadline 前**自己**收口返回，而不是被杀在半途。

### 4.2 轮状态机与续跑（修订 I，2026-11-20）

> **触发原因（同 4.1 的实障）**：此前只在**轮末**写 `meko_cycles`，中途被杀就一行也没有——事后分不清「没跑过」与「跑到一半被杀」；也答不出「该不该续跑」。

`meko_cycles` 新增四列（幂等迁移，老库开库自补）：

| 列 | 语义 |
|---|---|
| `deadline_at` | 本轮 `scheduled_at + T_bound`（ISO） |
| `lease_token` | 本轮租约令牌（单调递增，见 4.3） |
| `last_step` | 已完成的最后一步 `step.id`；未开始时为 null |
| `attempt` | 该轮尝试次数（续跑 +1） |

状态机：`running` →（完成）`executed` /（步失败）`failed` /（超期未收口）`up_for_retry`。

- **轮首写 `running`**（带 `deadline_at` / `lease_token`），**逐步更新 `last_step`**，轮末改写成 `executed`/`failed`（与 AC-4「每轮一行」不矛盾：始终是同一行）。
- **开轮先回收**：`deadline_at < now` 且仍为 `running` 的轮 → 标 `up_for_retry`，并作为续跑候选返回。
- **续跑**：`opts.resume` 未显式关时，若存在续跑候选，新一轮第 1 轮跳过 `last_step` 及之前的步（已完成的步不重跑）；`attempt` +1。
- 判据：任意时刻 SIGKILL，重启后能从 `meko_cycles` 回答三问——有没有写坏（事务层保证）、跑到哪（`last_step`）、要不要续（`up_for_retry` + `attempt`）。

### 4.3 写者围栏（修订 I，2026-11-20）

- 库内维护单调递增 `writer_epoch`（存 `config` 表，键 `writer_epoch`）。
- 写者在开轮时领写一个 epoch 作 `lease_token`；每次落盘校验：库内已记录的 epoch **大于** 本次令牌 → 拒写（`stale-writer`），防「租约已过期的旧写者」覆盖新写者。
- 依据：租约必会过期，而被暂停的旧持有者仍可能写入——只有单调令牌能拦住（Martin Kleppmann《How to do distributed locking》）。

### 4.4 动作账幂等键（修订 J，2026-11-20）

- `field_actions.id` 改为**确定性键**：`fa-<cycleId>-<action>-<sha1(cycleId|action|target)[0:12]>`，写入用 `INSERT OR IGNORE`。
- 语义：同轮同动作同目标只能留一行——重跑（断点续跑、外部重拉）不重复记账，也不翻倍写入。
- 无 `cycleId` 时退回时间键（无法幂等，但不与新键碰撞），供旧调用面兼容。
- 判据：同一 `(cycleId, action, target)` 连写两次 → 表里只有 1 行；换 `cycleId` → 2 行。

### 4.5 需求真值表（修订 O，2026-11-20）

> **动机**：五项改造各自声称在防某个风险，但其中几个风险**从未在本机观测到**。机制的价值取决于它挡的是不是真需求，先把真值钉死，否则后面每个夹具都是在为假需求造机器。

| 机制 | 它防什么 | 证据 | 真值 |
|---|---|---|---|
| O5 deadline 传播 | pi_hook 900s SIGKILL 留下半截轮 | **实证**：`data/metabolism.lock` 时间戳 + 每小时只写 200–500 行的曲线 + `kespi-check.js:282` 自认注释 | 真需求 |
| O6 增量评分 | 全量评 4,867 实体 → 每轮跑不完 | **实证**：同 E3，跑不完才写不满 | 真需求 |
| O3 幂等键 | 无条件 INSERT 写出 782,953 行、32 秒 3 条相同记录 | **实证**：直读库 | 真需求 |
| O2 轮状态机 | 「没跑过」与「跑到一半被杀」事后分不清 | **实证**：旧写法只在轮末写行，中途被杀一行也没有 | 真需求 |
| O4 围栏令牌 / 租约 | **两个写者同时写同一个库** | **零观测**：无 daemon、Windows 计划任务零 aing 项、进程表零 aing node；单一触发者是 pi_hook 串行心跳 | **假需求（现阶段）** |

**本表的判据**：风险无观测 → 机制仍可存在（防未来），但它的优先级与报告口径必须降级；一旦真观测到并发写者，把本行从「假需求」改判并补夹具断言。

### 4.6 并发夹具与实测（修订 O）

`tools/concurrency-probe.js` 不是门禁，是**测量工具**：存在的意义是量出「围栏到底有没有用」，而不是为了证明我们正确。写者带**屏障**——都开完库才同时开写，并自报重叠区间；重叠 ≤ 0 则本轮作废（不制造重叠的夹具只是在测串行）。

**实测（2026-11-20，重叠 30–70ms）**：

| 场景 | 结果 | 谁在真正挡 |
|---|---|---|
| sql.js 2 写者 | 输家 0 成功（`db-locked` / `db-stale`）；赢家 8/8 | **`db-stale` + `.lock`**，不是围栏 |
| sql.js 3 写者 | 1 赢家 12/12，另两个 0 成功 | 同上；**输家被系统性饿死** |
| nodesqlite 2 写者（加 `busy_timeout` 后） | 8/8 + 8/8 全部落库 | `busy_timeout` 自愈 |
| nodesqlite 3 写者 | 12/12 + 12/12 + 12/12；**第 36 轮里围栏真触发了一次**（`stale-writer: writer_epoch=13 > 令牌 10`） | 围栏 |

**四件事被实测证实/推翻**：

1. **丢失更新：两个引擎都没有**。但不是靠围栏——sql.js 靠 `db-stale`（后写者被拒，不覆写），nodesqlite 靠 WAL + busy 排队。
2. **围栏（O4）从「假需求」改判为「已观测到触发」**：36 轮里拦下一次过期写者。仍是廉价防御，不是负载件；它只在文件库有意义，sql.js 下比的是各自内存副本，拦不住。
3. **`busy_timeout` 是必修项**：默认 0 → 另一写者在场就直接抛 `database is locked`，本来能自愈的短争用被当成硬失败。已修为 5000ms + AC-b4 钉住。
4. **新发现的真实缺陷：写者饿死**。sql.js 下输家 **0 轮成功**——不丢数据，但静默做零工作。对 pi_hook 的每小时间歇场景，这一轮就白跑。处置：现状可接受（抛错可被轮状态机记为 `failed` + `last_step`，hook 看得见），**不加重试**——重试会引入退避/轮询的新面，而并发写者本就未被观测到。

## 五、Acceptance Criteria

| # | 判据 | 检验 |
|---|---|---|
| AC-1 | 契约校验 | 缺字段/重复 id 注册 → 抛错 |
| AC-2 | 螺旋可证 | raw 步骤与 wiki 步骤各注册 1 个、2 轮 → 各跑 2 次；每轮 raw 先于 wiki |
| AC-3 | 状态穿透 | 第 2 轮 raw 步骤能读到第 1 轮 wiki 步骤写嘅 bus/库状态 |
| AC-4 | 结算留痕 | 2 轮 → meko_cycles 新增 2 行，kespi_snapshot 非空，status=executed |
| AC-5 | 有界 | 造超时步骤 → 当轮 failed、后续步骤唔执行、总耗时 ≤ T_bound + 容差 |
| AC-6 | 错误可见 | 抛错步骤入 results.error，ok=false，唔吞 |
| AC-7 | deadline 传播 | 步收到的 ctx 带 `deadlineAt`（数字，≈ now + budgetMs）；剩余预算已耗尽时**不启动**新步，当轮 failed |
| AC-8 | 步内自检可止 | 步返回 `{ok:false, reason:'step-deadline', done, total}` → 当轮 failed，`results.reason` 落 `step-deadline`，后续步不执行，且已处理部分有落盘 |
| AC-9 | 轮首落账 | 开轮即写 `running` 行（含 `deadline_at` / `lease_token`），步完成时 `last_step` 跟上；步抛错时该行变 `failed` 但**行仍在**，`last_step` 指到最后完成的步 |
| AC-10 | 超期回收 | 手工造一条 `deadline_at` 已过的 `running` 行 → 下一次开轮把它改成 `up_for_retry`，并作为续跑候选返回 |
| AC-11 | 续跑不重跑 | 续跑候选的 `last_step` 之前的步本轮不再执行；`attempt` +1；已完成步不重复写库 |
| AC-12 | 围栏拒写 | 库内 `writer_epoch=5` 时，拿旧令牌 3 落盘 → 抛 `stale-writer`；拿 6 → 放行且写回 6 |
| AC-13 | 动作账幂等 | 同 `(cycleId, action, target)` 连记两次 → 1 行；换 `cycleId` → 2 行 |
| AC-14 | 续跑候选可辨（修订 L，2026-11-20） | 多条超期 `running` → 取 `deadline_at` **最新**者；候选的 `last_step` 未注册（改名/下线）→ **不跳**，`results` 落 `resumeIgnored`（不静默空转后报 `ok:true`） |
| AC-15 | 领写原子（修订 M，2026-11-20） | 同请求值连领两次 → 令牌**不同且递增**。「读一下再 +1」不是原子的，两个写者会拿到同一个令牌，围栏就失去意义 |

## 六、非目标

- 唔做分布式/多进程；唔引入队列。
- 唔替代场域动作本体（2.12/2.13）。
- 唔做 cron（scheduler 属 M3 之后）。

## 七、依赖

- 上游：SPEC-0.6（契约/三带）、SPEC-0.3（T_bound）
- 实现：`src/meko-orchestrator.js`
- 被依赖：1.15（场域骨架注册为 cross 步骤）、3.11-3.13
