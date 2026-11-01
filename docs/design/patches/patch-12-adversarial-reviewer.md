# Patch-12：对抗审查角色（Adversarial Reviewer）并入蜂群共识收敛

> 定位：把 DeepSeek Harness 生态 `dsh-orchestrate` 的「对抗式审查 + 收敛」机制，改造进 aing 神经进化蜂群（`assets/skills/neural-evolution-swarm`）的**共识收敛阶段**。
> 吸收来源：dsh-orchestrate（deepseek-ai 生态插件，机制层：委派 → 对抗式审查 → 多样化探索 → 收敛，"一个提示词、一个智能体团队"）。
> **本档为设计稿，不落地代码、不动 C0–C20 门禁计数、不动 11 步代谢**；源码实现待所有者拍板后走纪律 9 分支流程。

---

## 一、为什么加在"共识收敛"，不在"理论评审"

- aing 蜂群（`SKILL.md` / `workflow.md`）**已在设计阶段有对抗门禁**——Gate2 由 `neuro-theorist` 做理论评审、"对抗性拦截"。
- 真正缺的对抗面在**收敛阶段**：第 4 步 `skill-trainer`（Gate4a）与 `plasticity-analyst`（Gate4b）并行体检之后，Leader「汇总四方输出、矛盾原样呈现」（第 5 步）——**没有角色专门负责"反驳共识"**。四个角色在收敛时容易群体思维（往同一方向飘），而 aing 意识层是"只出共识、要人批"的设计（`/api/consciousness/deliberate` → `controller.deliberate → adapter.deliberateMaintenance`），共识质量全靠角色本身。
- 结论：**新增第 5 角色 `adversarial-reviewer`，只挂在"共识收敛"节点，专职反驳**，不碰设计/实现/训练三阶段的既有 Gate。

## 二、机制（踩在真实代码面上）

现有链路（取证行号）：
- `src/memo.js:488-497` `deriveSwarmDispatch` 的 `roles[]` 由 health.reasons code 映射到四角色，`mode` 由 `inRuntimeSurface` 决定（`swarm-skill` / `inline-degraded`）。
- `assets/skills/neural-evolution-swarm/SKILL.md` frontmatter `roles:` 四角色（neuro-theorist / senior-engineer / skill-trainer / plasticity-analyst）。
- `src/api-server.js:345` `POST /api/consciousness/deliberate` → `consciousnessController.deliberate`（共识面）。

新增角色合同（设计面）：

| 项 | 内容 |
|---|---|
| 角色 id | `adversarial-reviewer`（第 5 角色，kind: `ai_agent`） |
| 触发节点 | 共识收敛（第 5 步"集成与终报"之前）——即四方输出已齐、Leader 汇总前 |
| 唯一职责 | **只反驳、不修复**：指出当前四方共识里的**假前提 / 群体思维 / 未证伪就通过的断言**，输出「反驳清单」 |
| 输出 schema | `rebuttals[]`，每条 `{target: <共识点>, why: <为何是假前提/空转>, evidence: <代码或门禁取证>, severity: critical\|major\|minor}` |
| 收敛判据（新） | **对抗角色无 `critical`/`major` 反驳** → 才允许"出共识要人批"；有 → 共识回炉（最多 1 轮，防死循环，超限按既有 bind.md 降级） |
| 失败处理 | 反驳清单为空且无证据支撑 = 假通过，按纪律 4 不得当"共识稳定"上报；须附至少一条 `evidence` 或显式标 `no-object` |

## 三、落点与改动面（待实现时）

1. `assets/skills/neural-evolution-swarm/SKILL.md`：frontmatter `roles:` 加第 5 行 + Roles 表加一行；`workflow.md` 第 5 步前插入「对抗审查」节点 + 收敛判据；新增 `roles/adversarial-reviewer.md`（含 `## Inline Persona for Teammate` 段，对齐现有四角色档格式）。
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

## 六、证据级别声明（双证据制度 · 纪律 2）

- 对 dsh-orchestrate 的了解当前到 **README / 机制描述层**（"对抗式审查 + 收敛"），**未 clone 精读其 `packages/` 源码**。按纪律 2，真实现前必须补一次对 dsh-orchestrate 对抗审查具体触发/收敛判据的精读，不能照本摘要抄——摘要易把"对方没做到的"当成"对方做到了"引入（同坑 18 假前提病）。
- aing 侧代码取证（真实行号）：`src/memo.js:444/488/497`、`src/api-server.js:345`、`assets/skills/neural-evolution-swarm/{SKILL.md,workflow.md}`。
