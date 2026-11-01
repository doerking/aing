# Patch-12：对抗审查角色（Adversarial Reviewer）并入蜂群共识收敛

> 定位：把 DeepSeek Harness 生态 `dsh-orchestrate` 的「对抗式审查 + 收敛」机制，改造进 aing 神经进化蜂群（`assets/skills/neural-evolution-swarm`）的**共识收敛阶段**。
> 吸收来源：dsh-orchestrate（deepseek-ai 生态插件，机制层：委派 → 对抗式审查 → 多样化探索 → 收敛，"一个提示词、一个智能体团队"）。
> **本档为设计稿，不落地代码、不动 C0–C20 门禁计数、不动 11 步代谢**；源码实现待所有者拍板后走纪律 9 分支流程。

---

## 一、为什么加在"共识收敛"，不在"理论评审"

- aing 蜂群（`SKILL.md` / `workflow.md`）**已在设计阶段有对抗门禁**——Gate2 由 `neuro-theorist` 做理论评审、"对抗性拦截"。
- 真正缺的对抗面在**收敛阶段**：第 4 步 `skill-trainer`（Gate4a）与 `plasticity-analyst`（Gate4b）并行体检之后，Leader「汇总四方输出、矛盾原样呈现」（第 5 步）——**没有角色专门负责"反驳共识"**。四个角色在收敛时容易群体思维（往同一方向飘），而 aing 意识层是"只出共识、要人批"的设计（`/api/consciousness/deliberate` → `controller.deliberate → adapter.deliberateMaintenance`），共识质量全靠角色本身。
- 结论：**新增第 5 角色 `adversarial-reviewer`，只挂在"共识收敛"节点，专职反驳**，不碰设计/实现/训练三阶段的既有 Gate。

## 二、机制（dsh 侧代码级证据 + aing 侧落点）

### 2.1 dsh-orchestrate 实际怎么做的（源码取证，本地 `.temp/dsh-src/dsh-orchestrate/` clone，非本包）

> 证据源：本地 clone `dsh-orchestrate@0.3.1`（MIT，第三方插件，建在官方 `ctx.subagents` 之上，只加"决策层 + 编排模式层 + 收敛层"；落在 gitignore 面 `.temp/dsh-src/`，**非 aing 交付面**）。精读后确认：

- **两个对抗 persona**（`.temp/dsh-src/dsh-orchestrate/src/persona.ts` + README 角色表）：
  - `reviewer`：结构化输出 `{ verdict, risks[], assumptions_challenged[], edge_cases[], suggestions[] }`
  - **`devil`：`{ challenge, counterpoints[], what_if[] }`**——dsh **已具名"对抗/刁难"角色**，不是我原稿臆想新增。
- **`orchestrate_review` 的机制**（`.temp/dsh-src/dsh-orchestrate/src/review.ts` `createReviewTool`）：
  - 对 target **并行 spawn N 个只读子 Agent**（`role:'reviewer'`/`orchestrateMode:'adversarial'`；`reviewers` 1-5 默认 2、`aspects` 每个方面一个审查者、并发 cap 4、`maxDepth=1` 防递归、子 Agent 自动隐藏 `orchestrate_*`）。
  - 工具**只做机械汇总，不替父 Agent 决断**（review.ts 头注明示"父 Agent 收到报告后逐条评估并决定采纳哪些"）；`outputText`/`structured` 原样返回，父 Agent 逐条采纳或反驳。
  - 每个审查者任务书要**自包含**（"需自包含，审查者不依赖额外上下文"）——触发率 100% 靠任务书自包含（Spike C，deepseek-v4-flash）。
- **`orchestrate_converge` 是纯机械汇总，不是 pass/fail 判定**（`.temp/dsh-src/dsh-orchestrate/src/converge.ts` `convergeDelegation`）：
  - 语义 = 等后台 run 全部子会话 `result` 结算（`Promise.allSettled`）→ 拼 `okCount/failedCount/summary`；**没有任何"通过/否决"判据**，`status` 只有 `settled/stopped`。
  - 即 dsh 的"收敛"= **收集后台任务结果**，不等于"共识收敛判定"。

### 2.2 我的 aing 语境修正（原稿偏差 + 扩展，必须标清）

- **原稿错**：把"收敛"当 dsh 的共识判定来抄。实际 dsh 的 `converge` 是任务收集器；真正的对抗审查在 `review`（并行使者挑刺 + 父 Agent 决断）。
- **原稿的自动 gate 是 aing 语境扩展**：dsh 的 review **不自动拦截**（出报告 + 父 Agent 逐条决断）。我原稿写的"无 critical 反驳才放行"是 **aing"只出共识要人批"设计下的自加扩展**（让共识质量机器可判），**不是 dsh 原样**。下面合同保留这条扩展，但标注为扩展。
- aing 侧现有链路（取证行号）：
  - `src/memo.js:488-497` `deriveSwarmDispatch` 的 `roles[]` 由 health.reasons code 映射到四角色，`mode` 由 `inRuntimeSurface` 决定（`swarm-skill` / `inline-degraded`）。
  - `assets/skills/neural-evolution-swarm/SKILL.md` frontmatter `roles:` 四角色（neuro-theorist / senior-engineer / skill-trainer / plasticity-analyst）。
  - `src/api-server.js:345` `POST /api/consciousness/deliberate` → `consciousnessController.deliberate`（共识面）。

### 2.3 新增角色合同（设计面，吸收 dsh 的 devil + aing 的自动 gate 扩展）

| 项 | 内容 |
|---|---|
| 角色 id | `adversarial-reviewer`（第 5 角色，kind: `ai_agent`）；**对齐 dsh 的 `devil` persona 语义**（challenge / counterpoints / what_if），但**不引入 dsh 的 spawn provider**（aing 无 subagent 运行时，用 inline-persona 降级模式，bind.md 已有） |
| 触发节点 | 共识收敛（第 5 步"集成与终报"之前）——即四方输出已齐、Leader 汇总前 |
| 唯一职责 | **只反驳、不修复**：指出当前四方共识里的**假前提 / 群体思维 / 未证伪就通过的断言**，输出「反驳清单」（对齐 dsh `devil` 的 `{challenge, counterpoints[], what_if[]}`，aing 侧改名 `rebuttals[]` 贴 aing 术语） |
| 输出 schema | `rebuttals[]`，每条 `{target: <共识点>, why: <为何是假前提/空转>, evidence: <代码或门禁取证>, severity: critical\|major\|minor}` |
| 收敛判据（**aing 扩展，非 dsh 原样**） | **对抗角色无 `critical`/`major` 反驳** → 才允许"出共识要人批"；有 → 共识回炉（最多 1 轮，防死循环，超限按既有 bind.md 降级）。**dsh 本身不设此自动 gate（review 只出报告由父 Agent 决断），此条是 aing 语境加强的机器可判版** |
| 失败处理 | 反驳清单为空且无证据支撑 = 假通过，按纪律 4 不得当"共识稳定"上报；须附至少一条 `evidence` 或显式标 `no-object`（对齐 dsh"任务书自包含才可触发"） |

## 三、落点与改动面（待实现时）

> **运行时边界（dsh 源码精读结论）**：dsh 的对抗审查跑在官方 `ctx.subagents` spawn provider 上（`runDelegation` 并发生成子会话）。**aing 无 subagent 运行时**，不引入 spawn provider——按 `bind.md` 既有的 **inline-persona 降级模式**落地（对抗审查者作为「被派发的 inline 角色」由 leader 在同一运行时里按 devil 的 `{challenge/counterpoints/what_if}` 合同填，而非真 spawn）。这是与 dsh 的**唯一执行面差异**，机制语义（多视角挑刺 + 机械汇总 + 父级决断）保持一致。

1. `assets/skills/neural-evolution-swarm/SKILL.md`：frontmatter `roles:` 加第 5 行 + Roles 表加一行；`workflow.md` 第 5 步前插入「对抗审查」节点 + 收敛判据；新增 `roles/adversarial-reviewer.md`（含 `## Inline Persona for Teammate` 段，对齐现有四角色档格式；persona 合同对齐 dsh `devil`）。
2. `src/memo.js` `swarmRolesReady`（:444 一带）：三布尔（`swarmInstalled` / `inRuntimeSurface` / `bundledInPackage`）**口径不变**，但 `roles[]` 的"可派"判定要在收敛节点上补 `adversarial-reviewer` 在场校验——**只有 `inRuntimeSurface` 为真才许写 `mode: swarm-skill`（沿用 C18 防虚报纪律）**。
3. 新增一档**负向自证**（照 C14/C18 套路）：在 `.temp` 假院把「共识含一条假前提」注入，断言对抗角色必出 `critical` 反驳、且收敛被挡下（防假闭环，纪律 8/坑 15：接线类断言必须真跑，不止 grep）。

## 四、边界（不越界）

- 不新建门禁编号（C0–C20 计数不动，C19 单源不漂）；新增的负向自证挂在现有组件链/纪律面，作为 patch 自身验收，不注册成 C 编号。
- 不动 11 步代谢（`run-metabolism.js` STEPS 不变）。
- 不动 B5 自修改回路（仍 locked）。
- 模型层不吸收（dsh 不自带模型，aing 亦不带；本 patch 只吸收**编排机制**）。

## 五、验收标准（实现后须过）

- [ ] `SKILL.md` frontmatter roles = 5，Roles 表 5 行，`adversarial-reviewer.md` 含 Inline Persona 段
- [ ] `workflow.md` 共识收敛前有对抗节点，Mermaid 图同步
- [ ] 收敛判据：无 critical/major 反驳才放行；有则回炉 ≤1 轮
- [ ] `node src/memo.js --dispatch` 三布尔口径不变，`inRuntimeSurface` 门控仍钉死
- [ ] 负向自证：假前提注入必触发 critical 反驳并挡共识（真跑，非 grep）
- [ ] `node verify-deploy.js` 复跑 C0–C20 全绿（本 patch 不改 C 计数）

## 六、证据级别声明（双证据制度 · 纪律 2）——已升级至代码级

- **dsh 侧已 clone + 精读**：`dsh-orchestrate@0.3.1` 落在 `.temp/dsh-src/dsh-orchestrate/`（gitignore 面、不进包），精读 `src/review.ts` / `src/converge.ts` / `src/persona.ts` / `README.md`。确认：**存在具名 `devil` persona**（`{challenge, counterpoints[], what_if[]}`）与 `reviewer`（`{verdict, risks[], assumptions_challenged[], edge_cases[], suggestions[]}`）；`orchestrate_review` 并行 spawn 1-5 个只读审查者、**工具只机械汇总、由父 Agent 逐条决断、不设自动拦截**；`orchestrate_converge` 是后台任务结果收集器（`Promise.allSettled` → ok/failed/summary），**非 pass/fail 共识判定**。
- **本 patch 相对 dsh 的三处扩展（均已在 §2.2/§3 标清，非 dsh 原样）**：
  1. **自动收敛 gate**（无 critical/major 反驳才放行）——dsh 的 review 只出报告由父 Agent 决断，此为 aing"只出共识要人批"设计下的机器可判加强；
  2. **inline-persona 降级落地**——dsh 跑在 spawn provider 上，aing 无 subagent 运行时，按 `bind.md` 既有 inline-persona 模式实现；
  3. **severity 分级（critical/major/minor）**——aing 侧发明，dsh 无此分级。
- **残留不确定项**：dsh"触发率 100%（Spike C）"数据来自其宿主 dev 环境、不随 npm 包发布（README 明示）→ **不可作 aing 侧验收依据**，aing 落地后须按 §3 负向自证单独证明。
- **aing 侧代码取证（真实行号）**：`src/memo.js:444/488/497`、`src/api-server.js:345`、`assets/skills/neural-evolution-swarm/{SKILL.md,workflow.md,roles/*.md,bind.md}`。
