---
tags: [aing, deploy, discipline, must-read]
description: aing 部署必读：一键部署流程、验收清单 C0-C9、M4 组件链引导、已知坑 9 条、汇报格式
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '1ce87fe1-5cb8-4db4-b493-4ed766d9573a'
  PropagateID: '1ce87fe1-5cb8-4db4-b493-4ed766d9573a'
  ReservedCode1: 'effff46e-4682-4325-a191-1424ba39f1fa'
  ReservedCode2: 'effff46e-4682-4325-a191-1424ba39f1fa'
---

# AGENTS.md — aing Deployment Flow (Agent Must-Read) / aing 部署必读流程（Agent 必读）

> Any AI Agent MUST read this file before deploying, verifying, or troubleshooting in this directory.
> 任何 AI Agent 在本目录执行部署/验收/排障前，**必须先读完本文**。
>
> 🆕 第一次接触 aing？先走 [docs/AGENT-ONBOARDING.md](./docs/AGENT-ONBOARDING.md) 五步引导（30 秒纪律 → 院子地图 → 部署 → 日常 → 汇报格式），再回来读本文件全文。
>
> **部署铁律 / Deploy Iron Rule**：agent 必须严格按 aing 组件部署步骤执行——不能另行自改、不能跳步、不能在部署过程中修改源码或打临时补丁。部署中发现缺陷，在源码仓库分支上修复并附变更说明，经确认合入后重新部署。允许的运行时配置面仅限 `growth.config.js` 与环境变量。/ **Agent MUST follow aing deployment steps exactly — no self-modification, no step-skipping, no hot-fixes during deploy. Defects found during deployment are fixed on the source side. The only supported runtime config surface is `growth.config.js` and environment variables.**
>
> Core discipline: **No ALL GREEN report from `verify-deploy.js` = deployment NOT complete. Never announce success to the user without it.**
> 核心纪律：**没有 `verify-deploy.js` 的 ALL GREEN 报告 = 部署未完成，禁止向用户宣布部署成功。**

## One-Click Deploy Flow / 一键部署流程（按序执行，不可跳步）

```bash
# 1) Install all dependencies in one command (sql.js / @xenova/transformers required; sharp optional)
#    一条命令装齐核心依赖（sql.js + transformers 必需；sharp 可选，非核心管道所需）
npm install

# 2) All-green acceptance (machine-judged; exit 0 = ALL GREEN)
#    全绿验收（机器判定，退出码 0 = ALL GREEN）
node verify-deploy.js        # or / 或: npm run verify
```

Expected last line / 预期输出末行：`🟢 ALL GREEN —— 部署验收通过（deploy verified）`

## Acceptance Checklist / 验收项清单（verify-deploy.js 自动执行）

| # | Check / 检查项 | Fix on failure / 失败修复 |
|---|---|---|
| C0 | `src/growth.config.js` present / 配置文件在位 | `cp growth.config.example.js src/growth.config.js` |
| C1 | Node.js >= 18 | Upgrade Node / 换新 Node |
| C2 | sql.js / @xenova/transformers resolvable / 核心依赖可解析 | `npm install` at package root / 包根 `npm install` |
| C2b | sharp (optional, non-critical) / 可选依赖 | `npm install` if needed; absence does not block deployment / 缺失不阻塞部署 |
| C3 | raw/ contains knowledge docs / raw/ 有知识文档 | Put at least one .md / 放入至少一篇 .md |
| C4 | DB entities + vector index / 数据库实体与向量索引 | `node src/run-metabolism.js`, then / 再 `node src/index-vectors.js --semantic --reindex` |
| C5 | Local semantic model bundled in models/ (~22MB) / 本地语义模型 | `powershell -File setup-vectors.ps1` |
| C6 | Semantic search actually hits / 语义检索真实命中 | `node src/index-vectors.js --semantic --reindex` |
| C7a | KESPI lifecycle consistency wiki↔db / 生命周期一致 | Full metabolism then re-verify / 全量代谢后复验 |
| C7b | Patch-layer fingerprints (v1 defs) / 补丁层指纹 | Replay all cockpit layers v1→v3 (Pitfall 7) / 整层重放 |
| C8 | No drive-letter literals in tracked js/json/md/ps1 (raw/ exempt) / 盘符字面量扫描 | Replace with semantic placeholders (`<repo-root>` etc.) / 改语义占位符 |
| C9a | Component registry ↔ STEPS bidirectional consistency / 组件登记簿与代谢步骤双向一致 | Sync `data/component-registry.json` with `STEPS` in `run-metabolism.js` |
| C9b | Greenlist-declared references exist / 绿名单引用存在 | Check `data/component-registry.json` declarations against `docs/greenlist.json` |
| C9c | Consciousness panel schema complete / 意识层面板 schema 完整 | Run `node src/metabolism-panel.js` to regenerate `data/panel.json` |

## M4 Component Chain / M4 组件链引导（部署后检查）

> 部署全绿后，以下组件链应可端到端跑通。每条链附验证命令和预期结果，排障时逐条检查。
> M4 数据报告：[docs/M4-DATA-COLLECTION-2026-09-13.md](./docs/M4-DATA-COLLECTION-2026-09-13.md)（A-H 逐项 + 6 项架构证明，含核验意见）

| 组件链 | 验证命令 | 预期结果 | 故障排查 |
|--------|----------|----------|----------|
| 代谢管线 (11 步) | `node src/run-metabolism.js` | 11 步全成功, KESPI 稳定 | 失败步看 stderr; 非关键步 `--force` 跳过 |
| KESPI 敏感性 | 注入空实体 → `node src/kespi-check.js` | 腐坏实体 < 0.50 红灯 | 确认无探针残留; 八维独立可测 |
| 意识层闭环 | 设 kernel stagnationCount=3 → `node src/growth-director.js --dry-run` | decide=full_metabolism | 确认 `data/consciousness/state.json` 被正确读取 |
| 决策因果链 | 查看 `logs/metabolism-decision-lineage.jsonl` | ≥12 条（11 步 + 1 汇总）| 每条含 action/evidence/reason/alternatives/causalChain |
| 自我建模 | `node -e "require('./src/metacognition-layer').selfCheck()"` | confidence≈87% measured=true | 确认 knowledge.db 可加载; metabolism_log 表存在 |
| 自我报告 | `npm run server` → `GET /api/consciousness/briefing` | selfAssessment 六属性全 ✓ | 确认 KB_ROOT 变量; skillopt-evidence.json 存在 |
| 轨迹表 | `node src/trajectory-store.js --count` | ≥124 条真实轨迹 | `--init` 建表; 从代谢日志/tri-path/SkillOpt 导入 |
| SkillOpt adapter | `PYTHONPATH=. python -c "from skillopt.envs.aing.adapter import AingEnvAdapter"` | 导入成功 | 确认 `skillopt/envs/aing/__init__.py` 存在 |
| 检索 A/B | 语义检索 vs SQL LIKE 对比 | 语义命中率 > 关键词 2 倍 | 确认 models/ 存在, 384 维向量已索引 |
| FadeMem 衰减 | `node src/growth-loop.js decay` | weight < 1.0, 三因子可见 | 确认 growth-loop.json 有 patterns 数据 |
| 四门回滚 | propose → evaluate → promote → rollback | rolledBack=true | 确认 proposal 状态为 tested 且 overall >= 0.7 |

## Known Pitfalls / 已知坑（脚本已内置修复，手工操作时注意）

1. **NEVER install sharp with `--ignore-scripts`** — the native binary goes missing and importing transformers crashes outright. If transformers' nested old sharp lacks the binary, delete it and Node falls back to the top-level newer sharp.
   **绝不用 `--ignore-scripts` 装 sharp**——会缺原生二进制，import transformers 直接崩；transformers 嵌套的旧版 sharp 缺库时删除之，自动回退顶层新版。
2. **Model downloads MUST go through hf-mirror.com** — direct huggingface.co times out on CN networks (the script defaults to the mirror + curl.exe with redirects).
   **模型下载必须走 hf-mirror.com**——国内直连 huggingface.co 必超时（脚本已默认镜像 + curl.exe 跟重定向）。
3. **PowerShell 5.1 mis-parses UTF-8 .ps1 files without BOM** — all .ps1 in this package carry a BOM; do not re-save them without it.
   **PowerShell 5.1 读 UTF-8 无 BOM 的 .ps1 会乱码**——本包内脚本已带 BOM，别用无 BOM 编码重存。
4. **Repeated `npm install <pkg>` without a package.json prunes earlier packages** — this package ships a package.json; always use a single `npm install`.
   **没有 package.json 时多次 npm install 会互相剪枝**——本包已带 package.json，统一 `npm install` 一条命令，勿拆多次 `npm install <pkg>`。

5. **双语输出是预期，不是乱码** — 人读日志为 `中文 / English` 对照；机器令牌（`kespi_status` 等）恒为英文。不要「修复」双语行，也不要给令牌加翻译。/ **Bilingual logs are expected, not mojibake** — human-facing lines are `Chinese / English`; machine tokens stay English. Never "fix" bilingual lines or translate tokens.
6. **`kespi_status` 生命周期与关键步骤熔断** — `kespi_status` 由 compile 置 `pending`、kespi-check 首评翻转，`pending` 非故障；compile/import/vector/kespi 为关键步骤，失败即中止、退出码 1，`--force` 仅继续非关键步骤。/ **`kespi_status` lifecycle & critical-step breaker** — compile sets `pending`, kespi-check flips it on first evaluation; `pending` is not an error. Critical steps (compile/import/vector/kespi) abort with exit code 1 on failure; `--force` continues non-critical only.

7. **补丁必须整层重放（定义层先于调用层）** — 09-07 事故：v3 座舱带调用行、v1 座舱带函数定义，只重放 v3 导致 `markEntityKespiComputed`/`hasDistillation` 引用悬空；又被 `try/catch` 吞成静默腐坏，面板照样 ALL GREEN。重放任何补丁座舱前，必须枚举**全部**座舱层的 patch 清单并按 v1→v3 顺序执行；提取正则零匹配视为异常，不许当空集。/ **Replay patch layers completely, definitions before call-sites** — replaying only v3 left v1 definitions missing; call-sites survived `node --check` and the try/catch turned ReferenceError into silent divergence with green panels. Enumerate ALL cockpit layers (v1 first) before any replay; zero regex matches is an anomaly, not an empty set.
8. **同源性≠安全性，绿灯必须配产品断言** — 「<repo-root> 与上游逐字节一致」只证明输入血缘，对补丁层完整性零证明力；C1-C6 全是环境/结构检查，DB 与 wiki 静默分叉时照样全绿。任何 ALL GREEN 汇报必须包含 C7 运行时产品断言（生命周期一致性 + 补丁层指纹）；改造门禁后必须做负向测试（注入腐坏样本，确认门禁会红）。/ **Same-origin ≠ safe; green requires product assertions** — byte-identity with upstream proves lineage only. C1-C6 are env/structure checks that stayed green through silent divergence. Every ALL GREEN must include C7 runtime assertions; every gate change must pass a negative test (inject corruption, gate must turn red).

9. **OPT 基准角色（同源旁证，不替代部署源）**：<opt-copy> 已 git 固化，与主包 9 个核心文件逐字节同源，并自带 `tools/verify-baseline.ps1`（同源核验 + C0-C7 门禁，退出码机器判定）。引用 OPT 作为基准前必须跑该脚本且通过；任何一侧变更后须双侧复跑。注意该脚本只比 9 个文件（59 个 src 模块的 15%），对本轮实际发生的 4 文件代差漏检率为 100% → 引用院际真值另跑 `npm run verify:siblings`（全量 src/tools/根文件 + 库结构核验，CR 行尾归一化，退出码机器判定）。部署发起仍以主包为准（有版本历史），OPT 是训练副本 + 同源基准。/ **OPT baseline role** — <opt-copy> is git-committed, byte-identical with master on 9 core files, self-verifying via `tools/verify-baseline.ps1` (same-origin check + C0-C7 gate, machine-judged exit code). Always run it before citing OPT as baseline; re-run on both sides after any change. Deployments still originate from master (versioned); OPT is the training copy + same-origin baseline.

## Current Iteration Failure Guide / 当前迭代故障引导（P0–P2 + 双语）

| 症状 / Symptom | 处置 / Fix |
|---|---|
| 代谢中止、退出码 1、`❌ 失败 / Failed: <关键步骤>` | 读该步 stderr → 修复 → 重跑；确需跳过用 `node src/run-metabolism.js --force`（仅非关键步骤续行） |
| KESPI 显示 `pending` | 跑 `node src/kespi-check.js` 或全量代谢翻转；非故障，禁止改库补分（纪律第 4 条） |
| 日志双语「中文 / English」 | 预期行为；按 Pitfall 5 处理，禁止改写 |
| `/api/ingest` 后无蒸馏摘要 | 确认 body 是否带可选 `distillation`；缺省落「待生成 / pending」占位，非错误 |
| 排障后汇报 | 先修复复跑至 ALL GREEN，再按 Reporting Format 汇报并附完整面板 |
| C8 盘符扫描红灯 | simulation/ 下 JSON 含绝对盘符路径 → 改为 `<repo-root>` 语义占位符，重跑 `verify-deploy.js` |
| C9a 组件登记簿不一致 | 加步必须同步 `data/component-registry.json`，distill 步已登记（11 步 ↔ 11 登记） |
| distill 步骤失败 `no raw messages` | selftest-probe 残留实体导致 distill 拒绝空消息；清理 `DELETE FROM entities WHERE id LIKE '%selftest%'` 后重跑 |
| 意识层 `stagnant` 但代谢不触发 | 确认 `data/consciousness/state.json` 的 `stagnationCount >= 3`；跑 `node src/growth-director.js --execute` 触发 full_metabolism |
| briefing selfAssessment 显示 `✗` 或 `△` | 自我建模: 跑 `node -e "require('./src/metacognition-layer').selfCheck()"` 刷新真实指标; 自我解释: 跑一轮代谢生成 decision-lineage.jsonl; 自我提升: 跑 `node simulation/training-sim.js` 生成证据 |
| SkillOpt adapter 导入失败 | 确认 `PYTHONPATH=.` 指向 SkillOpt 根目录; aing adapter 在 `skillopt/envs/aing/`，不是 `aing/training/adapter.py` |
| 检索结果全是同一类型实体 | 语义向量未加载 → 确认 `models/` 目录存在；跑 `node src/index-vectors.js --semantic --reindex` |
| KESPI 全库均分突降 | 检查是否有探针/测试实体未清理 → `SELECT id FROM entities WHERE id LIKE '%probe%' OR id LIKE '%selftest%'` → 删除后重跑 `kespi-check.js` |

## Daily Operation / 日常运行（部署完成后）

```bash
node src/run-metabolism.js --smart        # Metabolism main loop (smart mode) / 代谢主循环（智能模式）
node src/index-vectors.js --semantic --reindex   # Semantic reindex after content changes / 内容变更后语义重建
npm run scheduler                         # Resident scheduler (optional) / 常驻调度器（可选）
npm run server                            # HTTP API (optional) / HTTP API 服务（可选）
node src/query.js "关键词"                 # Query CLI / 查询 CLI
npm run verify                            # Re-verify anytime; must stay ALL GREEN / 随时复验，必须保持全绿
```

## Memo as Operations Dashboard / 备忘录即运维仪表台

> 备忘录（`GET /api/consciousness/briefing`）不是给用户看的文档——它是 aing 给 agent 的**驾驶仪表台**。agent 出场第一步永远是读备忘录，拿到三样东西后才开始工作：
>
> 1. **aing 当前状态**：意识层 state（idle/integrating/focused/aroused/stagnant）、通道健康度（structure/semantic/kespi/anomaly/feedback/temporal 六通道 EMA）、活跃事件数、停滞计数
> 2. **组件链接状态**：知识库在线？向量模型就绪（384 维语义 vs 64 维哈希）？代谢上次跑完？蒸馏债多少？元认知在线？
> 3. **待办与会话交接**：上次聊到哪（最近 3 条 Conversation）、有什么挂起的 Todo、意识层告警（consciousnessAlerts: 高唤醒/低置信/停滞/蒸馏债）
>
> **备忘录里的数据指标驱动运维决策**——agent 不需要"检查系统"，读备忘录就知道该做什么：
>
> | 备忘录指标 | 正常值 | 异常时 agent 该做什么 |
> |------------|--------|----------------------|
> | consciousness.state | idle / integrating | stagnant → 触发 full_metabolism |
> | consciousnessAlerts 含 distill-debt | debt=0 | debt>0 → 跑 `node src/distill.js` |
> | consciousnessAlerts 含 consciousness-stagnant | 无 | stagnationCount>=3 → `node src/growth-director.js --execute` |
> | componentLinks.vectorSearch.status | semantic-384（`semantic` 时对外即报 `semantic-384`，2026-09-14 修正恒 false 的判定） | offline/hash → `node src/index-vectors.js --semantic --reindex` |
> | componentLinks.metacognition.status | online | degraded → `node -e "require('./src/metacognition-layer').selfCheck()"` 刷新 |
> | distillDebt | 0 | >0 → 跑代谢或单独 distill |
> | kernelReactions 高注意力 | <5 | >=5 → 检查 alert targets, 优先处理 |
> | selfAssessment 六属性 | 全 ✓ | 有 ✗/△ → 按 M4 组件链引导逐项修复 |
>
> **这是 aing 的"按数据指标自动维护"**：不是 agent 猜该做什么，是 aing 通过备忘录告诉 agent 该做什么。agent 的工作从"排障"变成"读仪表台→执行建议"。

## Neural Evolution Swarm (Half-Lifted) / 神经进化团队（半拉起）

> aing 的神经进化团队（理论家/工程师/训练师/分析师）目前是**半拉起状态**——技能文件已装入 TeleAgent skills 目录，可以由 agent 按需调用做评审，但不是常驻自走的自动化服务。半拉起的正确用法是：**agent 读备忘录后发现指标异常 → 调用对应角色做诊断 → 根据诊断结论执行修复 → 修复后跑 verify-deploy 确认全绿**。
>
> *The neural evolution swarm (theorist/engineer/trainer/analyst) is half-lifted: skill files installed, callable on demand, but not a resident auto-running service. Usage: agent reads memo → detects anomaly → invokes the right role for diagnosis → executes fix → re-verifies ALL GREEN.*

### 半拉起角色与触发条件

| 角色 | 何时调用 | 调用方式 | 输出 |
|------|----------|----------|------|
| **理论家** | selfAssessment 有 ✗/△；六属性评分需要复审 | SQA 报告 + briefing selfAssessment → 理论家过堂 | 六属性打分表 + 缺口清单 |
| **工程师** | 代谢步骤失败；C8/C9 门禁红灯；组件链断裂 | 失败步 stderr + verify-deploy 输出 → 工程师审计 | P0-P3 修复清单 |
| **训练师** | SkillOpt rollout 需要跑；任务包需要扩充 | adapter + task-package → 训练师就绪度评估 | 训练环境就绪/缺口报告 |
| **分析师** | KESPI 均分突降；链接拓扑异常；孤岛率上升 | gap-detector + topology scan → 分析师体检 | 拓扑健康报告 + 工单 |

### 按数据指标自动维护流程

```
                    ┌─────────────────────────────────────┐
                    │   GET /api/consciousness/briefing    │
                    │   (agent 每次出场第一步)              │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │   备忘录数据指标检查                  │
                    │   (上表 8 项指标)                    │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
    ┌─────────▼──────┐  ┌─────────▼──────┐  ┌──────────▼──────┐
    │ 指标全正常      │  │ 有告警/异常     │  │ 有 ✗/△ 属性     │
    │ → 正常工作      │  │ → 执行修复       │  │ → 调用对应角色    │
    └────────────────┘  └────────┬───────┘  └──────────┬──────┘
                                 │                     │
                    ┌────────────▼─────────────────────▼────┐
                    │   修复后: verify-deploy.js ALL GREEN    │
                    │   再读备忘录确认指标恢复                  │
                    └───────────────────────────────────────┘
```

> **核心原则**：agent 不猜——aing 通过备忘录的数据指标告诉 agent 该做什么。agent 不修——除非指标指向明确的修复动作。修完后必须验证——`verify-deploy.js` ALL GREEN 才算修完。

## Agent Discipline / Agent 行为纪律（新增，必须遵守）

1. **绿灯解锁制**：能力只有在影子/主包全绿验证后才可写入文档与汇报。README/handbook 里的每一项声明都要有可复现的验证记录背书；未验证的能力只能写「组件在库、未接管线/未验证」。
2. **双证据制度**：任何关于主包真值的判断（某功能是否实现/是否真实），必须「代码精读 + 影子实测」双证据齐全才能入账；单靠 grep 结果下结论曾两次误判（tri-path mock 误报为真实、growth-director 误报为带病）。
3. **禁止伪勾选**：Roadmap/checklist 的 `[x]` 必须真实；发现伪勾选立即改为 `[ ]` 并附现状说明（如 Phase 2.6）。
4. **禁止启发式代评分**：门禁/评估类组件的分数必须来自真实数据源（KESPI 用库内实体现算），不得自建打分函数模拟。
5. **阈值唯一来源**：所有阈值集中在 growth.config.js，组件内不硬编码；环境变量覆盖只能在该文件内实现。 / **Single source for thresholds**: all thresholds live in growth.config.js; no hard-coding inside components; env overrides are implemented only in that file.
6. **组件全绿必须提示用户**：每次验收/复验达到 ALL GREEN 后（以及用户询问能力/完成度时），agent 必须主动向用户提示当前「组件全绿」状态——以 `docs/greenlist.json`（结构化真源）为底，其生成视图 `docs/GREEN-LIST.md` 为渲染面：绿灯能力项数 + 证据日期 + 明确未解锁清单，不得只说「通过/装好」而省略能力面。历史教训：完成度曾长期靠 B组自评（80%→93%→98% 漂移），全绿状态必须由 agent 主动、按清单、带证据地呈现给用户，而非等待追问。 / **All-green must be surfaced to the user**: after every ALL GREEN acceptance (and whenever the user asks about capabilities/completion), the agent must proactively present the current all-green panel — rendered from `docs/greenlist.json` as the source of truth with `docs/GREEN-LIST.md` as its generated view (green items + evidence dates + explicitly unlocked items). Never just say "done". Historical lesson: completion used to drift with self-grades (80%→93%→98%); green status must be presented proactively, per the list, with evidence.
7. **Tolaria 标签格式，标签加载随取随用**：本包内所有文档（以及一切 aing 技能文档/skill）必须带标签——YAML frontmatter `tags: [...]` 数组 + 正文关键处行内 `[tag:xxx]` 或 `[tag:xxx:N]` 标记（compile.js 双路解析合并入库，entities.tags 列存储，这是 Tolaria 血脉的既有机制）。**9 段数值**：`N` 为 1-9 的关联强度（1 最弱 → 9 最强），不带 `:N` 的 `[tag:xxx]` 默认中位值 5；存储格式为 `"name:N"`（如 `"metabolism:8"`）。核心理念：**标签是加载单位**——agent 与检索按标签取用文档，随取随用，不做全文倾倒；标签数值用于自动建链加权与 KESPI 资产化评分。现状声明（绿灯解锁制）：标签的存储/解析/数值化链路已全绿；按标签检索的 HTTP 端点 `/api/tags/<tag>` 已接线并影子验证（兼容裸标签与 9 段 `name:N`，支持强度下限过滤），见能力项 tag-loading-api（2026-09-14）；但「按标签取用文档」仍是纪律层约定，运行期不会自动裁剪上下文。**9 段容量推演**：见 [TAG-CAPACITY-ANALYSIS.md](./docs/Engineering/TAG-CAPACITY-ANALYSIS.md)——50 类目健康、100 类目可用、150 退化、200+ 走样；50 类目为 Tolaria + LLM.WIKI 数据库软件进入时机。 / **Tolaria tag format; load by tag, on demand**: every document in this package (and every aing skill doc) must carry tags — a YAML frontmatter `tags: [...]` array plus inline `[tag:xxx]` or `[tag:xxx:N]` markers at key body points (compile.js parses both and merges into entities.tags — the existing Tolaria-lineage mechanism). **9-segment numeric**: `N` is a 1-9 relevance strength (1 weakest → 9 strongest); `[tag:xxx]` without `:N` defaults to mid-value 5; stored as `"name:N"` (e.g. `"metabolism:8"`). Core idea: **tags are the unit of loading** — agents and retrieval consume documents by tag, on demand, never as a full dump; tag values weight auto-linking and KESPI asset-readiness scoring. Status note (green-light rule): tag storage/parsing/numeric chain is fully green; the tag-query HTTP endpoint `/api/tags/<tag>` is wired and shadow-verified (bare tags and 9-segment `name:N`, with a strength floor) — capability tag-loading-api (2026-09-14); loading documents by tag remains a discipline convention, the runtime does not auto-trim context. **9-segment capacity analysis**: see [TAG-CAPACITY-ANALYSIS.md](./docs/Engineering/TAG-CAPACITY-ANALYSIS.md) — healthy up to 50 categories, usable to 100, degrading at 150, breaking at 200+; 50 categories is the recommended point to install Tolaria + LLM.WIKI database software.
8. **组件透明化：首次接触必出纯文字组件说明**：agent 首次向用户介绍 aing、或用户表达"想实现/启用什么功能"的意图时，必须先用**纯文字逐行**向用户展示基本组件清单——每个组件一行：名称 + 它能给用户做什么 + 当前状态（已上线 / 在库未接线 / 设计中）。用户据此按需选择落实哪些功能；agent 不得默认替用户决定启用范围，也不得只讲已上线部分而隐去未接线部分。状态唯一来源：`docs/greenlist.json`（视图 `docs/GREEN-LIST.md` 由 `node tools/gen-greenlist.js` 生成，门禁 C10a 校验一致）。纯文字模板见 `docs/AGENT-ONBOARDING.md` Step 6。 / **Component transparency: plain-text component briefing on first contact**: when first introducing aing to a user, or when the user expresses intent to implement/enable features, the agent must first present the basic component list in **plain text, one line each** — name + what it does for the user + current status (live / in-library-unwired / in-design). The user decides what to implement, on demand; the agent must not default the scope for them, nor show only live parts while hiding unwired ones. Status source of truth: `docs/GREEN-LIST.md`. Plain-text template: `docs/AGENT-ONBOARDING.md` Step 6.
9. **部署与源码保持一致（零偏移）**：部署产物必须与仓库源码一致——部署过程中不修改代码、不打临时补丁、不手工调整仓库文件。部署中发现的缺陷，修复发生在源码侧：在源码仓库的分支上修复并附变更说明，经确认合入后重新部署。直接在已部署实例上"顺手改好"的差异不会进入下一次部署，只会造成环境漂移，让后续的验收与排查失去基准。允许的运行时配置面仅限 `growth.config.js` 与环境变量。 / **Deploy exactly what the source says (zero drift)**: deployed artifacts must match the repository source — no code edits, hot-fixes, or hand-tweaks during deployment. Defects found during deployment are fixed on the source side: patch on a branch of the source repository with a change note, get it merged, then redeploy. Fixes applied directly to a deployed instance will not survive the next deployment; they only create environment drift and invalidate future acceptance and troubleshooting baselines. The only supported runtime configuration surface is `growth.config.js` and environment variables.

## Reporting Format / 汇报格式（对用户）

After deployment, paste the **complete** verify-deploy.js report (all six ✅ lines plus the ALL GREEN line) to the user. Never just say "it's installed". If any item is ❌, fix per the table and re-run until all green.
部署完成后，粘贴 verify-deploy.js 的完整报告（含六项 ✅ 与 ALL GREEN 行），不得只说"装好了"。任何一项 ❌，先按修复列处理并重跑，直至全绿。

**全绿之后还必须做一步 / One more step after ALL GREEN（强制）**：向用户渲染当前「组件全绿」面板——绿灯能力清单（来自 `docs/GREEN-LIST.md`，含证据日期）+ 明确未解锁项。模板：

```
🟢 组件全绿 N 项能力（真源 docs/greenlist.json / 视图 docs/GREEN-LIST.md，截至 <日期>）：
  ✅ <能力 1> — <一句话证据>
  ✅ <能力 2> — <一句话证据>
  ...
⬜ 明确未解锁（不承诺）：<项 1> / <项 2>
```

```
🟢 All-green panel: N capabilities (evidence in docs/GREEN-LIST.md, as of <date>):
  ✅ <capability> — <one-line evidence>
⬜ Explicitly not unlocked (no promises): <item> / <item>
```

缺失此面板 = 汇报不完整 / A report without this panel is incomplete.