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

## 二、要吸收的机制（dsh goal 子系统 → aing 语义）

| dsh 概念 | aing 改造落点（设计面） |
|---|---|
| persistent goal（持久目标） | 新增 goal 实体 `entities(type='Goal', status='active')`，可挂 N 条 Todo（`todo.goal_id` 外键），目标本身可跨轮存在 |
| multi-round（多轮推进） | Goal 带 `rounds[]`（每轮一条，含 `objective / attempt / outcome / blocked_on`），每轮代谢或人工销办推进时追加 |
| convergence（收敛判定） | Goal 带 `converged` 派生值：由 `rounds` 最近 3 轮的 `outcome` 判定（连续 N 轮 `advance` → converged；连续 `blocked` → stuck → 触发派单升级），**阈值进 `growth.config.js`（纪律 5 单源）** |
| objective 不变量 | 目标的核心 objective 在多轮间不改写（改写即换 Goal），保证"同一个目标"可追溯 |

## 三、落点与改动面（待实现时）

1. **schema**（走 `knowledge-store` 迁移，C10c 写路径 + C10e 零悬空引用）：
   - `entities` 加 `type='Goal'`（复用现有 type 枚举机制，不新开表）；
   - `todos` 子表加 `goal_id`（可空，向后兼容——旧 Todo 仍是一等叶子）；
   - Goal 的 `rounds` 存 `entities.content` 的 JSON（避免新开 JSON 表，贴文件态优先）。
2. **CLI 面**（`src/memo.js`，与现有 `todo` 子命令并列）：
   - `memo goal add "<目标>" [--round 1 "<推进>"]`：建 Goal + 首轮；
   - `memo goal round <id> "<推进>" [--outcome advance|blocked|done]`：追加轮次；
   - `memo goal list [--all]`：列 Goal + 派生 `converged/stuck` 状态；
   - `memo goal done <id>`：整目标销办（cascade 其下 Todo）。
3. **收敛判定**：`deriveConvergence(goal)` 纯函数（只读 `rounds` 末 3 轮 + config 阈值），写进 `memo --peek` 的 `goals[]`；`stuck` 的 Goal 进 `swarmDispatch` 的 `roles[].why`（异常驱动派单，C12 同源）。
4. **门禁**：新增一档负向自证（照 C12/C16 套路）——`goal round` 注入 `blocked` 序列必推导出 `stuck` 并触发派单（真跑，非 grep）；`converged` 派生值对同一输入两轮读不变（纯读，C16 同源的"只读不扰表"）。

## 四、边界（不越界）

- **不新增门禁编号**（C0–C20 计数不动，C19 单源不漂）；负向自证挂本 patch 自身验收。
- 不动 11 步代谢（STEPS 不变；Goal/rounds 是 `entities` 面，不是代谢步）。
- 阈值（收敛 N 轮、stuck 判据）**只进 `growth.config.js`**，组件内不硬编码（纪律 5）——config example 与运行配置同构（C10d）。
- 旧 Todo 语义**完全向后兼容**：不挂 `goal_id` 的 Todo 照旧是一等叶子，`collectTodos` 不变。

## 五、验收标准（实现后须过）

- [ ] `entities(type='Goal')` + `todos.goal_id` 迁移可回滚，C10e 零悬空引用
- [ ] `memo goal add/round/list/done` 四个子命令端到端真跑，缺参非零退出不伪造
- [ ] `converged/stuck` 派生值纯读：同一输入两轮读不变（C16 同源探针）
- [ ] `stuck` Goal 触发 `swarmDispatch` 升级（C12 异常驱动同源）
- [ ] 阈值在 `growth.config.js`（`convergence` 段），C10d 模板同构
- [ ] 负向自证：blocked 序列 → stuck → 派单（真跑）
- [ ] `node verify-deploy.js` 复跑 C0–C20 全绿（本 patch 不改 C 计数）

## 六、证据级别声明（双证据制度 · 纪律 2）

- 对 dsh goal 子系统的了解当前到 **README / 机制描述层**（"persistent, multi-round objective"），**未 clone 精读其源码**。真实现前须补一次 dsh goal 的收敛判据/多轮语义精读，不照摘要抄（同 patch-12 第六节、坑 18 假前提病）。
- aing 侧代码取证（真实行号）：`src/memo.js:272/300/320/335/444/488`、`src/metabolism-panel.js` queues 规则、`growth.config.js` 阈值单源、C12/C16 既有门禁面。
