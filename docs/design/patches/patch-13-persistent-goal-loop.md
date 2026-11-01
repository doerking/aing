# Patch-13：持久化 Goal 多轮追踪与收敛判定（Persistent Goal Loop）

> 定位：把 DeepSeek Harness 的「goal 子系统」（persistent, multi-round objective tracking）改造进 aing 备忘录 Todo 面，让「用户挂着的事」从一次性待办升级成**多轮目标 + 收敛判定**的一等对象。
> 吸收来源：dsh goal 子系统（deepseek-ai 生态，机制层：持续目标、多轮推进、收敛判定）。
> **本档为设计稿，不落地代码、不动 C0–C20 门禁计数、不动 11 步代谢**；源码实现待所有者拍板后走纪律 9 分支流程。

---

## 一、现状（踩真实代码面，取证行号）

- aing 的 Todo 面 = `entities(type='Todo', status='active')` 单一来源（`src/memo.js:272` `TODO_ACTIVE_WHERE`，与 `metabolism-panel.js` 的 `queues.user_todos` 同规则，C12 钉住）。
- 写入口：`src/memo.js:300` `addTodo`（`memo todo add`，`saveEntity` type='Todo'）；销办：`:320` `doneTodo`（改 status 留痕，不删行）；列历史：`:335` `listAllTodos`。
- 派单面：`:488` `deriveSwarmDispatch` 由 `health.reasons` code 映射角色；三布尔 `swarmInstalled/inRuntimeSurface/bundledInPackage`（`:444`）。
- **当前短板**：Todo 是**一次性叶子节点**——`active → done` 二态，没有「多轮推进轨迹」，也没有「这个目标收敛没/卡在哪/要不要升级」的判定。用户挂着的事一旦复杂（跨多轮、要分阶段），现在只能人工拆成多条 Todo，彼此无收敛语义。

## 二、要吸收的机制（dsh goal 真实语义 → aing 落点）

> 精读 `harness/packages/goal/{goal,goal-round-driver}/src`（`types.ts` / `domain.ts` / `index.ts`）后，dsh goal 真实形态是**持久化状态机 + 硬轮次上限 + CAS 乐观并发**，**不是**我原稿臆想的"最近 N 轮时序启发式"。逐项对齐：

| dsh goal 真实语义（源码取证） | aing 改造落点（设计面） |
|---|---|
| **4 相状态机** `phase ∈ {active, paused, blocked, complete}`（`types.ts GoalPhase`） | 新增 goal 实体 `entities(type='Goal')`，`content.phase` 取同 4 态；**弃用我原稿的 `converged/stuck` 派生值**，改用显式 `phase` |
| **7 操作** `create/edit/pause/resume/complete/block/clear`（`domain.ts GoalOperation`） | CLI 面按 7 操作建子命令（见 §3）；`block` 必带 `reason{code,message}` |
| **阻塞分类码** `blockedReason {code, message}`（`types.ts GoalBlockReason`；driver 实证 3 码：`round-limit`/`queue-failed`/`prompt-rejected`） | Goal 阻塞存 `blocked_code`（kebab-case 稳定码，可机器路由）+ 人读 message；**aing 侧新增码**（如 `manual-blocked`/`dep-waiting`）须登记单源 |
| **多轮推进** `roundsStarted`（durable 折叠值）+ `GoalMessageSource{goalId,revision,round}` 归属 | Goal 带 `rounds[]`（每轮 `{objective, attempt, outcome}`），`roundsStarted` = 末轮号；**每轮归属到 (goal, revision, round)**（CAS 同 dsh） |
| **硬轮次上限** `maxGoalRounds`（driver：`roundsStarted >= maxGoalRounds` → 自动 `block(code='round-limit')`） | Goal 带 `maxRounds`（缺省由 config 解）；到顶**自动转 `blocked(code='round-limit')`**，不硬停（保留可 resume） |
| **CAS 乐观并发** `GoalRef{id, revision}`，每次 durable 变更 revision+1（`GOAL_STALE_REVISION` 拒绝陈旧写） | aing 单进程库写，**暂不做并发 CAS**（贴库单写者）；`revision` 字段保留（向后兼容 + 未来多院对齐），并发防护靠既有 `metabolism-lock`（C12 同源持库单源判据） |
| **activation 进程本地、不持久化**（`armed/disarmed`，`types.ts` 明示 never persisted） | aing 无"常驻 agent loop"→ 不搬 activation；**多轮推进是人工 `memo goal round` 或代谢触发，非自动**（关键差异，见 §4） |

**关键边界（与原稿最大偏差，必须标清）**：dsh goal 有 **`goal-round-driver`**——agent 空闲 + armed 时**自动**把下一轮 followup 进 inbox、`agent/idle`/`goal/changed` 事件驱动、pre-step 双向 fence（`roundsStarted+1` 才放行）。**aing 没有常驻 agent loop，不搬这个自动驱动器**；aing 的"下一轮"是**人工 `memo goal round` 或一次代谢周期触发**（贴文件态、可审计），语义等价但执行驱动不同。这是吸收时的**唯一执行面差异**。

## 三、落点与改动面（待实现时）

1. **schema**（走 `knowledge-store` 迁移，C10c 写路径 + C10e 零悬空引用）：
   - `entities` 加 `type='Goal'`（复用现有 type 枚举机制，不新开表）；Goal 行存 `objective / phase / maxRounds / blocked_code / revision / created_at / updated_at`（贴 `types.ts GoalSnapshot` 字段，`rounds` 数组存 `entities.content` JSON，避免新开 JSON 表）；
   - `todos` 子表加 `goal_id`（可空，向后兼容——旧 Todo 仍是一等叶子）；
   - **弃 `status` 用 `phase` 4 态**（`active/paused/blocked/complete`，对齐 dsh `GoalPhase`）；`blocked_code` 存稳定 kebab 码（`round-limit` / aing 侧登记的新码）。
2. **CLI 面**（`src/memo.js`，与现有 `todo` 子命令并列，7 操作对齐 dsh `GoalOperation`）：
   - `memo goal add "<目标>" [--max-rounds N] [--round 1 "<推进>"]`：建 Goal（`create`）+ 首轮；
   - `memo goal round <id> "<推进>" [--outcome advance|blocked|done] [--code <blocked_code>]`：追加轮次（`edit`）；`outcome=done` 自动 `phase=complete`；`--code` 缺省按 aing 单源码表；
   - `memo goal block <id> <code> "<message>"`：显式 `block`（必带 code+message，贴 dsh `GoalBlockReason`）；
   - `memo goal pause <id>` / `resume <id>`：`pause`/`resume`（`resume` 把 revision+1，贴 dsh 语义）；
   - `memo goal complete <id>`：显式 `complete`；
   - `memo goal list [--all] [--phase <p>]`：列 Goal + 各 `phase`/`roundsStarted`/`blocked_code`；
   - `memo goal clear <id>`：tombstone（`clear`，留痕不删行，同 `doneTodo`）。
3. **到顶自动 block**：`memo goal round` 推进后若 `roundsStarted >= maxRounds` 且 `outcome≠done`，**自动写 `phase=blocked(code='round-limit')`**（贴 driver `round-limit` 码；不硬停、可 `resume`）。阈值 `maxRounds` 缺省走 `growth.config.js`（纪律 5）。
4. **`stuck` 派单映射**（沿用原稿的异常驱动面，改口径）：`phase=blocked` 的 Goal 进 `swarmDispatch` 的 `roles[].why`（code 直接可机器路由，C12 同源）——**不再用 `converged` 时序启发式**。
5. **门禁**：新增一档负向自证（照 C12/C16 套路）——`memo goal round` 推进到 `maxRounds` 必自动 `blocked(round-limit)`（真跑，非 grep）；`phase`/`roundsStarted` 对同一输入两轮读不变（纯读，C16 同源"只读不扰表"）；`block` 缺 code/message 必被拒（贴 dsh `GOAL_INVALID_BLOCK_REASON`）。

## 四、边界（不越界）

- **不搬 `goal-round-driver` 自动驱动器**：dsh 靠 agent 空闲 + armed 自动把下一轮 followup 进 inbox（`goal-round-driver/index.ts`）。aing 无常驻 agent loop，**多轮推进是人工 `memo goal round` 或一次代谢周期触发**（贴文件态、可审计）——这是与 dsh 的**唯一执行面差异**（§2 已标清）。
- **暂不做并发 CAS**：dsh 用 `revision` 乐观并发（`GOAL_STALE_REVISION`）；aing 单进程库单写者，保留 `revision` 字段（向后兼容/未来多院对齐）但并发防护走既有 `metabolism-lock`。
- **不新增门禁编号**（C0–C20 计数不动，C19 单源不漂）；负向自证挂本 patch 自身验收。
- 不动 11 步代谢（STEPS 不变；Goal/rounds 是 `entities` 面，不是代谢步）。
- 阈值/缺省（`maxRounds`、blocked_code 单源表）**只进 `growth.config.js`**，组件内不硬编码（纪律 5）——config example 与运行配置同构（C10d）。
- 旧 Todo 语义**完全向后兼容**：不挂 `goal_id` 的 Todo 照旧是一等叶子，`collectTodos` 不变。

## 五、验收标准（实现后须过）

- [ ] `entities(type='Goal')` + `todos.goal_id` 迁移可回滚，C10e 零悬空引用
- [ ] `memo goal add/round/block/pause/resume/complete/list/clear` 端到端真跑，缺参非零退出不伪造
- [ ] `phase` 4 态 + `blocked_code` 稳定码；`resume` 使 revision+1（贴 dsh）
- [ ] 到顶自动 `blocked(code='round-limit')`（真跑），不硬停、可 resume
- [ ] `block` 缺 code/message 必被拒（贴 dsh `GOAL_INVALID_BLOCK_REASON`）
- [ ] `phase`/`roundsStarted` 纯读：同一输入两轮读不变（C16 同源探针）
- [ ] `phase=blocked` 的 Goal 触发 `swarmDispatch` 升级（C12 异常驱动同源，code 可机器路由）
- [ ] 阈值/缺省在 `growth.config.js`（`convergence` 段），C10d 模板同构
- [ ] `node verify-deploy.js` 复跑 C0–C20 全绿（本 patch 不改 C 计数）

## 六、证据级别声明（双证据制度 · 纪律 2）——已升级至代码级

- **dsh 侧已 clone + 精读**：`deepseek-harness` 落在 `.temp/dsh-src/harness/`（gitignore 面、不进包），精读 `packages/goal/goal/src/{types.ts,domain.ts}` + `packages/goal/goal-round-driver/src/index.ts`。确认：**dsh goal = 持久化 4 相状态机（active/paused/blocked/complete）+ 7 操作（create/edit/pause/resume/complete/block/clear）+ CAS `revision` 乐观并发 + `maxGoalRounds` 硬上限 + 阻塞带稳定 `code` 分类码**；`goal-round-driver` 是 agent 空闲自动驱动器（pre-step 双向 fence、`roundsStarted+1` 才放行）——**此自动驱动 aing 不搬**（无常驻 loop，见 §4）。`activation`（armed/disarmed）进程本地不持久化，aing 亦不搬。
- **本 patch 相对 dsh 的两处差异（已标清，非 dsh 原样）**：①执行驱动不同（dsh 自动 followup vs aing 人工/代谢触发）；②暂不做并发 CAS（单写者走 metabolism-lock，保留 revision 字段）。
- **aing 侧代码取证（真实行号）**：`src/memo.js:272/300/320/335/444/488`、`src/metabolism-panel.js` queues 规则、`src/metabolism-lock.js` 持库单源判据、`growth.config.js` 阈值单源、C12/C16 既有门禁面。
