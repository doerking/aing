---
tags: [aing, deploy, discipline, must-read]
description: aing 部署必读：一键部署流程（含最后一米 L1-L3）、验收清单 C0-C20（32 项）、M4 组件链引导（数据报告 A–K）、已知坑 20 条、院际对齐与沙盒复原、汇报格式
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'e7424e54-0be2-4015-a91c-d56a7a426f57'
  PropagateID: 'e7424e54-0be2-4015-a91c-d56a7a426f57'
  ReservedCode1: 'b96cb875-1b94-406c-92cd-66e57ccb3225'
  ReservedCode2: 'b96cb875-1b94-406c-92cd-66e57ccb3225'
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
VD_ONLY="C16,C18" node verify-deploy.js   # 部分跑：只跑列出的门禁（负向自证提速用）；部分跑**不写** data/last-verify.json，也不印「部署验收通过」

# 3) LAST MILE / 最后一米：全绿 ≠ 可用 —— 必须当场把会话入库加载、把备忘录联通
node src/memo.js --summary                              # 读备忘录（不需要先起 server）/ read the memo, no server needed
node src/auto-ingest.js <session-id> "<json|文本>"       # 会话入库通道（无守护进程时按条投）/ ingest this session
```

Expected last line / 预期输出末行：`🟢 ALL GREEN —— 部署验收通过（deploy verified）`

## Last Mile / 最后一米（全绿之后立刻做，不得延后）

> 教训（2026-09-14）：门禁能证明「包是好的」，证明不了「这一院现在正在接会话、agent 手里有仪表台」。
> 历史上的实际状态是：全绿之后没人接入库、没人读备忘录，能力面绿着而链路静着。
> 因此「显示全绿给用户」这一步**必须同时附下面两行回执**，缺一即视为部署未完成。

| 步 | 动作 | 命令 | 必须看到的证据 |
|---|---|---|---|
| L1 | 备忘录联通 | `node src/memo.js --summary`（或 `npm run memo`；HTTP 面 `GET /api/consciousness/briefing` 同口径） | 意识层 state、六条组件链接、`自我报告` 六属性、`下一步` 列表；`componentLinks.vectorSearch=semantic-384` |
| L2 | 会话入库加载 | `node src/auto-ingest.js <session-id> "<json\|文本>"`（常驻面：`npm run server` 后 `POST /api/ingest`；满 5 条或 30 秒成批） | 该 session 的档落 `raw/inbox/`；`data/ingest-buffer.jsonl` 收工前抽干为 0；正文只含贴出来的详情（采集行被剥除，见坑 11） |
| L3 | 复跑到全绿 | `node src/metabolism-panel.js` → `node verify-deploy.js` | 仍是 `ALL GREEN`（读备忘录自 2026-09-14 起已纯净化、不再推 kernel 计数（C16 钉），但**开库仍可能触发迁移**→ 面板仍需重生成，否则 C10b 红） |

**汇报格式追加 / Reporting addendum**：ALL GREEN 面板之后必须紧跟两行——`备忘录已读：<state>/<vectorSearch 通道>/蒸馏债 N` 与 `入库已接：<通道 CLI 或 HTTP>、session=<id>、WAL 余 0`。没做 L1/L2 不得宣布部署完成。

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
| C10a | Greenlist view ↔ truth source sync / 绿名单视图与真源一致 | `node tools/gen-greenlist.js` 重生成视图（frontmatter 透传保留） |
| C10b | Panel readings ↔ DB **同口径** + freshness / 面板读数与库一致且新鲜（`entity_count` 的口径是**活跃规模** `status='active'`，不是全库行数） | `node src/metabolism-panel.js` 重生成 `data/panel.json`；若不相等，先看印出的「活跃 N / 全库 M / 链接 K」——归档/剪枝/销办留痕都会让两者不等，**属预期**，绝不能改库去凑面板 |
| C10c | distill write path usable / 蒸馏写路径可用 | 检查 `entities` 列并跑临时库真写；缺列走 `knowledge-store` 迁移 |
| C10d | Config template isomorphism / 配置模板与运行配置同构（比**键与值**，规范化到叶子路径点名漂移；键顺序/注释/换行**不算**漂移——2026-09-15 aing 实测旧法把"段落位置不同"误判成「嵌套差异」，提示没人能照着修好） | 同步 `growth.config.example.js` 与 `src/growth.config.js` 的段与键 |
| C10e | Zero dangling DB references / 库内零悬空引用 | 清孤儿子表行；确认 `foreign_keys` 每次落盘后仍为 ON |
| C10f | Cut component cannot revive (multi-tenant) / 已砍组件防复活 | 删除 tenant 相关代码与声称文案，历史决策文档按纪律豁免 |
| C10g | Session ingest contract end-to-end / 会话入库端到端契约 | 同步 `PRODUCED_SECTIONS` ↔ `distill.RAW_SECTIONS`；恢复 WAL 与落盘 |
| C10h | Detail-only ingest (collection trace stripped) / 只入贴出来的详情 | 恢复 `src/ingest-scrub.js` 与 `addMessage` 入口接线；`config.ingest.scrubTrace` 不得置 0 |
| C11 | Last-mile wiring: memo reachable without a server + session ingest actually lands / 最后一米（备忘录联通 + 会话入库加载） | `node src/memo.js` 必须离线跑出纯 JSON 且组件链接六条齐全；入库 CLI 在隔离 KB_ROOT 真跑必须成档（`flushed=true`、`traceRemoved≥1`、WAL 排空）且缺参非零退出不得伪造消息；两条命令必须同时出现在 AGENTS.md 与 README（否则下一场没人做） |
| C12 | Memo三块：用户待办可写可读 / 健康不许写死 / 派单由异常驱动 | 空库探针必须判 `broken` 并派 senior-engineer（证明健康不是写死的 ok）；待办写→读→分用户/agent→due→销办→`--all` 留痕必须全通且走同一张 `entities(type=Todo)` 表；`--peek`/`--dispatch` 必须给出 roles[].why/gate/how；AGENTS 与 README 必须登记 `memo.js todo add` |
| C13 | 代谢与初始化都不替用户提交（git 写权归人） | `run-metabolism.js` 必须在任何步骤前默认注入 `AING_NO_AUTOCOMMIT=1`，`init-knowledge-base.js --git` 的首次 commit 必须走 `AING_AUTOCOMMIT=1` opt-in 且**不得覆写院子已有的 `.gitignore`**（opt-in：确需自动提交要显式开）。隔离假院真跑双向证明：带守卫跑 compile 步提交数不变且步骤日志见「Git commit 跳过」；假院内删守卫必须立刻多出「chore: compile knowledge base」；init --git 未 opt-in 不动提交且哨兵行存活、opt-in 后出现「chore: initial knowledge base setup」（见坑 12） |
| C14 | 意识层闭环写端：停滞计数由代谢自己爬（W3） | `run-metabolism.js` 尾部必须调 `kernel.recordCycleResult()`（它是 `stagnationCount` 的唯一写者，历史上零调用点 → 三个读者永远空等），且 kernel 必须有**解闩**分支（有效产出后离开 `stagnant`）。隔离假院连跑 3 趟空代谢：计数必须自己出现 1→2→3、自动转 `stagnant`、`raw/` 自动落 MetaKnowledge、`growth-director --dry-run` 选「完整代谢」；再喂一篇真文档跑一趟必须归 0 且解闩。**禁止手改 `state.json` 演示**（旧 M4 行就是这么写的，那是假闭环） |
| C15 | 意识层控制面真接（写端 CLI + HTTP 四路由，且注释与实现不得脱节） | `src/neural.js` 必须在位且**只做转发**（不出现自写的数值阈值 / 事件默认强度）；`api-server.js` 头部注释列出的每条 `/api/consciousness/*` 路由都必须有对应实现，且实现的每条路由也必须都在注释里（**陈账即红**）。隔离假院真跑：CLI 侧 `inhibit <t>` 后 `event` 打同一目标必须返回 `suppressed=target-inhibited`；`status` 前后 `state.json` 字节一致（纯读）；`verify`/`record` 必须给 `logs/agent-decision-lineage.jsonl` 增行。HTTP 侧真起 `api-server`（`AING_API_PORT` 探空闲端口）打四条新路由并读回 `/api/consciousness/lineage` 证明确实入账。AGENTS 与 README 必须登记 `src/neural.js` |
| C16 | 读端纯读（memo 不投事件、不写存档，也没阉掉写端） | 读一次仪表台不得改被读的表：`generateBriefing` 的 `ingestSignals` 默认关（`ingest(signals)` 必须在三元/开关后面）、`_saveBriefing` 必须 `if (save)`、组件链接的「元认知」必须吃只读档 `data/metacognition/self-state.json`而不是 ingest 的返回值（否则纯读一回就集体假报 degraded）。隔离假院**跑两轮** `memo --peek`（坑 13 手法：埋哨兵 + 比 mtime）：`state.json` 字节与 mtime 必须未动、`logs/consciousness/` 不得出现 briefing 档；而 `--feed` 显式开启后必须真的写表（证明是「默认不写」而不是「不能写」） |
| C17 | 意识层离散旋钮单源（改 config 必须真改变行为） | 熔断轮数不得再在代码里写死：`src/` 内不得出现 `stagnationCount >= 3`，kernel 必须从 `consciousnessTuning()`（config-runtime 叶子模块）取旋钮，`growth-director.js` 与 `memo.js` 必须走同一入口，`growth.config.example.js` 与 `src/growth.config.js` 必须都有 `consciousness` 段。**行为证明**：假院把轮数改成 2 → 第 1 趟不熔、第 2 趟必熔，且 `neural.js status` 的 `breakerCycles` 与 `growth-director --dry-run` 同步按 2 判；`inhibitDefaultHours: 5` 必须让不传 `--hours` 的 `inhibit` 缺省就到 5 小时；改回 3 → 第 3 趟才熔、读者立即报 3 |
| C18 | 技能资产随包（`assets/skills/`）+ 派单不虚报：包内有 ≠ 本运行时装了 | 包内必须真带 `neural-evolution-swarm` 四角色说明书（`roles/*.md` 四份 + SKILL/workflow）与 `aing-operator`（中英两份 SKILL）；`memo` 的派单读数必须把三种「有」分开报（`swarmInstalled` 机器上有 / `inRuntimeSurface` 本运行时加载 / `bundledInPackage` 包内自带），且**只有 `inRuntimeSurface` 为真才许写 `mode: swarm-skill`**（过去拿 `installed` 判 → 宿主装过就虚报能派）；资产面扫描必须用包根 `path.resolve(__dirname, '..')`，用 `process.cwd()` 即红（换目录跑结果就变卦）。院际比对工具 `tools/verify-sibling-roots.js` 的比对面必须含 `walk('assets'`，并必须有 `node_modules` 目录黑名单（递归扩面后不设黑名单会造出 88 条假「对方独有」）。**行为证明**：① 真跑 `memo --dispatch` 断言两个布尔存在、`bundledInPackage` 为真、`inRuntimeSurface=false ⇒ mode≠swarm-skill`、`inRuntimeSurface=true ⇒ mode=swarm-skill`、搜索目录必须带 `[runtime|host|bundled]` 标签；② 在 `.temp/gate-c18-yard` 造一对迷你院（pkg/sib），把 `assets/skills/probe-skill/SKILL.md` 写成内容不同，台账的「真实漂移」行必须出现该路径 |
| C19 | 门禁计数单源：文档抄的「N 项（C0–CMAX）」必须等于验收器真值 | `node tools/gate-counts.js`（`--json` 机器读 / `--print` 只印标准文案）从 `verify-deploy.js` 数出真实项数与编号集合，核对 AGENTS frontmatter、README 部署段、`docs/greenlist.json` 三处抄写 + AGENTS 清单表行集合（**缺行=那道门没人知道，陈行=账没销**）。加/删门禁后先跑它再抄。C19 还会在副本里故意把 README 抄成 9 项并要求工具判红（防橡皮章工具） |
| C20 | 文档命令可执行性：写在文档里的命令必须真跑得通，或明确交代不在本包跑 | 门禁自己扫 `AGENTS.md`/`README.md`/`docs/**`/`training`/`simulation`/`demo` 里所有 `src/… tools/… docs/…` 形式的路径引用（**逐条核在位**；确需提不存在的档必须在**同行**标反例/历史/外部/院属等记号）、所有 `npm run X` 的名字必须真在 `package.json` scripts 里、所有 `python`/`PYTHONPATH` 命令必须自带执行位置（`cd …` 或 `<x-root>` 占位符，禁止裸 `PYTHONPATH=.`）。**行为证明**：一份只读命令清单（`memo --summary/--peek/--actions/todo list`、`neural status`、`gate-counts`、`verify-sibling-roots --print-face`）逐条真跑且退出码 0，并且清单里每条命令都必须能在文档里回指到（防清单变空头账）。边界：`docs/releases/**` 历史发布说明与 `assets/skills/**`（本包自撰技能资产（宿主根内无同名，实测 2026-09-15），其命令指外部工具链）不套本规则 **追加（2026-09-15 README 换图）**：同一页不许自相矛盾——README 内嵌 mindmap 的一级分支必须覆盖谱系表每一层（缺层即红点名层名）、图段若不再是 mindmap 立即红（防检查静默失效）、已退役的 `docs/lineage.svg` 既不得被引用也不得留悬档（引用与留档各一条红）。负向自证四式全过（删一支/塞回引用/放回旧文件/改 flowchart），见 `.temp/c20-negative3.js`。 **追加（2026-09-15 实测病）**：带 YAML frontmatter 的档（`AGENTS.md`/`README.md`/`docs/**` 中含 `tags:`/`description:`/`AIGC:` 者）**第一行必须是 `---`**——本轮 `AGENTS.md` 第 1 行曾被一条游离表格行压住，tags/描述全失效而既有门禁一声不响，且已随 `8cb01b1` 上线；负向自证：顶一行进文件头即红并点名档名，还原后复绿。 |

## M4 Component Chain / M4 组件链引导（部署后检查）

> 部署全绿后，以下组件链应可端到端跑通。每条链附验证命令和预期结果，排障时逐条检查。
> M4 数据报告：[docs/M4-DATA-COLLECTION-2026-09-13.md](./docs/M4-DATA-COLLECTION-2026-09-13.md)（A–K：A–H 基础链 + I 6 项架构证明 + J OPT 部署沙盒换血复跑十一链 + K 存盘/复原 L1/再对齐收工段，含核验意见）
> 手怎么动：[docs/DEPLOY-PLAYBOOK.md](./docs/DEPLOY-PLAYBOOK.md)；第一次接触本包：[docs/AGENT-ONBOARDING.md](./docs/AGENT-ONBOARDING.md)

| 组件链 | 验证命令 | 预期结果 | 故障排查 |
|--------|----------|----------|----------|
| 代谢管线 (11 步) | `node src/run-metabolism.js` | 11 步全成功, KESPI 稳定 | 失败步看 stderr; 非关键步 `--force` 跳过 |
| KESPI 敏感性 | 注入空实体 → `node src/kespi-check.js` | 腐坏实体 < 0.50 红灯 | 确认无探针残留; 八维独立可测 |
| 意识层闭环（W3 已接真写端） | 在隔离假院里连跑 3 趟空代谢（`raw/` 无文档）→ `node src/growth-director.js --dry-run` | 计数由 `kernel.recordCycleResult()` 自己爬到 3、自动转 `stagnant` 并往 `raw/` 写 MetaKnowledge；决策框印「🔄 完整代谢」+ 原因「意识层连续 3 次空产出」（人读文案为中文，不是键名）；再跑一趟有产出的代谢即归 0 并解闩回 `idle` | **禁止再用手改 `data/consciousness/state.json` 演示**（那是假闭环）；写端在 `run-metabolism.js` 尾部 P0 之后，由门禁 C14 每轮真跑证明；解闩分支在 `consciousness-kernel.js` 的 `recordCycleResult` |
| 意识层控制面（W2 写端） | `node src/neural.js status` → `node src/neural.js inhibit <目标> --hours 1` → `node src/neural.js event '{"channel":"anomaly","target":"<同一个目标>"}'` | inhibit 返回 `isInhibited=true`；随后 event 必须 `accepted=0` 且 `suppressed[0].inhibitReason=target-inhibited`；`verify`/`record` 后 `logs/agent-decision-lineage.jsonl` 增行 | 阈值与默认值不在 CLI 里（纪律 5）；撤销只有“到期”一条路（kernel 无 un-inhibit API）；HTTP 同四条路由由门禁 C15 真跑复证 |
| 决策因果链 | 查看 `logs/metabolism-decision-lineage.jsonl` | ≥12 条（11 步 + 1 汇总）| 每条含 action/evidence/reason/alternatives/causalChain |
| 自我建模 | `node src/metacognition-layer.js self-check` | 自信度按院读数（OPT 84% / Tip ≈87%）、错误率 0%、状态正常 | 该模块 `module.exports = MetacognitionLayer` 是**类**，`require(...).selfCheck()` 必报 not a function（旧命令 2026-09-14 OPT 实测作废）；要看 measured 标记走 briefing |
| 自我报告 | `node src/memo.js`（无需起服务；HTTP 同口径 `GET /api/consciousness/briefing`） | selfAssessment 六属性全 ✓ | 确认 KB_ROOT 变量; skillopt-evidence.json 存在 |
| 轨迹表 | `node src/trajectory-store.js --import-metabolism && node src/trajectory-store.js --count` | ≥ 本轮代谢步数（因果链每步一条；OPT 2026-09-14 首跑 12 条）。124 是 Tip 历史累计，**不是发布包首跑可得** | 旧实现找 `logs/metabolism-last-run.json`（run-metabolism 从不写此文件）→ 已改吃 `metabolism-decision-lineage.jsonl`；`--import-growth-loop` 少解构 `{ GrowthLoop }` 亦已修 |
| SkillOpt adapter | **在 SkillOpt 检出根目录跑，不在本包内跑**：`cd <dd-root>\321\SkillOpt && PYTHONPATH=. python -c "from skillopt.envs.aing.adapter import AingEnvAdapter"` | 导入成功 | 适配器属**外部 SkillOpt 检出**，本包只有 `training/adapter.py`（两者不同物）。2026-09-15 本机实测：`<dd-root>\321\SkillOpt` 内 `IMPORT_OK`；在 Tip 包内与 `<sqa-root>\SkillOpt` 里同命令均 `ModuleNotFoundError`（同名检出有两份，一份有 `envs/aing` 一份没有 → 别按目录名猜） |
| 检索 A/B | 自然语言问句 vs SQL LIKE（无现成命令，按口径实测） | **分口径**：整句原样提问时 LIKE 命中 0%、语义 top3 38%（此时语义完胜）；人工提词后 LIKE 8 题中 8、语义 top3 37.5%＝8 实体随机底（此时语义不占优）。「语义 > 关键词 2 倍」只在整句口径成立，禁止当无条件既成事实引用 | `models/` 是 **Xenova/all-MiniLM-L6-v2 英文模型**，中文查询近 OOV、小语料上塌到 3 个枢纽实体；要涨必须先换多语模型或扩语料（2026-09-14 OPT 三臂实测） |
| FadeMem 衰减 | 先 `node src/growth-loop.js episode '{"taskType":"metabolism","route":["compile"],"success":true,"durationMs":165}'`（若干条）→ `node src/growth-loop.js decay` | weight < 1.0 且 `factors` 三因子齐（OPT 实测 weight≈0.35，time/usage/quality=1/0.5/1） | 全新沙盒无 `data/growth-loop.json` → patterns 空、decay 返回 `[]` 属正常，先喂 episode 再判 |
| 四门回滚 | propose → evaluate `<id>` → promote `<id> true` → rollback `<geneId>` | rolledBack=true 且状态还原 tested（gene 从 `state.genes` 摘除） | rollback 收的是 **geneId**（`state.genes[].geneId`），不是 improvement id；OPT 实测 Gate-1/3/4 负向都能红 |

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

9. **OPT 基准角色（同源旁证，不替代部署源）**：<opt-copy> 已 git 固化，与主包 9 个核心文件逐字节同源。`tools/verify-baseline.ps1` **只存在于 OPT 侧**（Tip/aing 包内无此文件，在 Tip 里调用必失败——2026-09-14 实测断链），引用 OPT 作基准时须在 <opt-copy> 内跑它且通过；任何一侧变更后双侧复跑。但该脚本只比 9 个文件，**对本轮实际发生的代差漏检率 100%** → 院际真值改跑 `npm run verify:siblings`（`tools/verify-sibling-roots.js`，只读、不改文件不改库、退出码机器判定）。**它的比对面也有边界**：比对面自 2026-09-15 已升级为**整包面**：从包根递归，排除依赖/运行态目录（`node_modules`/`.git`/`.temp`/`models`/`dist`/`build`/`__pycache__` 与 `logs`/`raw`/`wiki`/`data`）与 5 个运行态/垃圾文件，实测量 **169 个比对文件**（2026-09-15 旧 SVG 退役，170→169；**院属档另计**——各院本地实测可**高于**此数，有档只长在某一院里（如 aing 的开关复验记录、OPT 的基准脚本），小于此数才是漏带）（含 `docs/**`、`assets/**`、`references/`、`training/`、`simulation/`、`demo/`、包根全部文件与 `.ps1`/`.svg`/`.sql`/无扩展名档）；`data/component-registry.json` 是包内容，被显式请回面内。扩面当轮即抓出两院都缺 `references/` 两档、OPT 另缺 11 个 `simulation/` 证据档——**这类缺口在旧 143/68 文件面上永远看不见**。"对方独有 0"不等于对方没有独有文件。部署发起仍以主包为准（有版本历史），OPT 是训练副本 + 同源基准。/ **OPT baseline role** — <opt-copy> is git-committed and byte-identical with master on 9 core files; `tools/verify-baseline.ps1` exists ONLY on the OPT side (calling it from Tip fails — verified dead link 2026-09-14), so run it inside <opt-copy> before citing OPT as baseline. That script covers 9 files only and missed 100% of this round's divergence → cross-yard truth is `npm run verify:siblings`, since 2026-09-15 the face is the WHOLE package: recursive walk from the repo root minus dependency/runtime dirs (node_modules, .git, .temp, models, dist, build, __pycache__, logs, raw, wiki, data) and 5 runtime/junk files, measured 169 compared files (170→169 after the old SVG retired 2026-09-15; **yard-owned docs excluded from this baseline** — a given yard may legitimately measure MORE locally; measuring LESS means files went missing) (docs, assets, references, training, simulation, demo, all root files, .ps1/.svg/.sql and extension-less names included; data/component-registry.json explicitly kept in) it still omits .ps1, demo/, simulation/, .gitignore, so enumerate git ls-files by hand for file-set gaps; enumerate `git ls-files` by hand for file-set gaps. Deployments still originate from the master package (versioned); OPT is the training copy + same-origin baseline.

**10. 生产者与消费者的白名单可以各改各的 —— 接口断裂只有真跑一次才现形（2026-09-14 实测）。**
`auto-ingest` 写角色节（用户提问 / Agent 回复 / Agent 分析 / 收集资料），而 `distill` 只认「原始消息」：
提交 87ca04a 换入库模板时把「原始消息」写丢了，此后**真实会话档一律蒸馏 FAIL**（no raw messages），
而蒸馏债被挂住的旧档掩盖，跑了很多天无人察觉。同一批还揪出三条同源问题：
① 客户端自报 `distillation` 直接把档抬成 active + 高置信（纪律 4 的侧门，等于 Agent 自己给自己发毕业证）；
② `/api/ingest` 只回 accepted，而消息仅在内存（进程一死就丢，实测 2 条无声消失）；
③ 入库产物挪进 `raw/inbox/` 后 `compile` 按路径重铸实体 id（平白多 `inbox-` 前缀 → 巡检刷假「未编译」告警），
而「无条件尊重档内声明 id」又会把 19 篇没有 id 的人工档并成一个 `undefined` 实体（`String(undefined)` 是真值）。
**对策**：入库契约由 verify-deploy C10g 双向钉死（生产端节集 ⊆ 消费端白名单 + 临时库端到端真跑 + 身份/落盘/id 归属断言）；
身份与置信一律服务端定，客户端自报内容只进「Agent 提议（未核验）」节等兑付；`accepted` 之前必须先落 WAL（`data/ingest-buffer.jsonl`，启动时重放）。

**11. 入库只存「贴出来的详情」，不存「贴出来之前干了什么」（2026-09-14 口径）。**
`role: research` 是消息分类，不是采集流程：本包服务端**永不搜索、永不抓取、永不核验来源**（实测：`source` 填不可达 IP，107ms 返回，档里只多一行字面标注；库里 0 条 URL 链接）。
但用户贴过来的正文里常混着采集步骤（`$ curl …` / `< HTTP/1.1 200 OK` / `< content-type:` / 单行 JSON 报文 / `Status: 200 Elapsed`）。不处理的实测后果：
这些行被 `distill` 当「原话要点」写进蒸馏摘要（8 行里 5 行是过程行），从里面提出 `https`、`example` 当**标签**（纪律 7 标签是加载单位），
还能被关键词检索当资料召回。故 `src/ingest-scrub.js` 在 `addMessage` 入口按**行首锚定**剥除：只删「这一行本身就是过程」的形状，
自然语言里提到 curl/URL 的正文保留；剥除**不留原文、不写旁路、不进 WAL**，只在档内记 `traceScrubbed` 计数；纯过程内容整条 `422` 拒收。
采集元数据 `metadata`（搜索词 / rank / 耗时 / 请求对象）同日起**停止接收**——收了不落档等于给自己留侧门。
**门禁教训**：C10h 的静态正则曾被行尾注释骗过（拼接漏换行使 `traceRemoved` 掉进注释里、字段实际消失、计数恒 0，源码文本却仍「匹配」）。
**接线类断言必须真跑一次函数体**，不能只 grep 源码文本。/ **Ingest stores only the pasted detail, never the pre-paste collection steps**; wiring assertions must execute the real function body — a static regex can be satisfied by a trailing comment.

**12. 代谢第 1 步会替你在院子里 `git commit`（已由 C13 默认关掉，2026-09-14 实测）。**
`src/compile.js` 的 `gitCommit()` 在编译出文件后直接 `git add -A` + `git commit -m "chore: compile knowledge base" --no-verify`，作者取该院 **local git config**（OPT 里是 `aing-sync`，Tip/aing 里是 `aing`），非 git 院静默跳过。实证：OPT 换血跑 `node src/run-metabolism.js` 时它一笔提了 38 个文件（`1a3382b`）——而**当时 24 项验收全绿**，因为旧门只查入库链（`auto-ingest.js:472`）与自测链（`self-test.js:7`）有没有设开关，没人查这个「文档指使人去跑」的入口。
**现状**：`run-metabolism.js` 顶部默认注入 `AING_NO_AUTOCOMMIT=1`（子进程继承），确需自动提交必须显式 `AING_AUTOCOMMIT=1` opt-in；`seed-demo` / `sync-opt` / `auto-ingest` 本来就传 `NO_AUTOCOMMIT=1`，同向不受影响。**注意三个边界**：① ~~`src/init-knowledge-base.js:190/203` 还有一把同形链~~ **已同日关掉**：`initGit()` 现在只在 `AING_AUTOCOMMIT=1` 时提交，且只在院子原本没有 `.gitignore` 时才创建（原先它会无条件把 Tip 那份 44 行的 ignore——含 `knowledge.db` 与 `.temp/`——压成 4 行桩，紧接着 `git add -A` 就会把库和一次性探针一起提进历史），C13 第④式已把这两点都做了双向真跑；② 它**不含 push**（逐行核过），但若那院配了 remote 且后续有人 push，机器提交会跟着出去；③ 跑完代谢后如果发现“工作树很干净”，先查 `git log -1 --format=%an` 是不是 `aing-sync`，别把机器提交当成自己存过盘。/ **Metabolism step 1 used to commit on your behalf; C13 now disables it by default (opt-in via `AING_AUTOCOMMIT=1`). Same-shaped chain remains in `init-knowledge-base.js`; no push is performed by it, and a clean worktree after metabolism may mean a machine commit — check the author.**

13. **断言「只读」不能只比前后字节（2026-09-14 实测，C15 差点自已成为假门）。** 负向测试注入了一行 `kernel.saveState()`，门禁却仍绿：因为写入是**幂等**的——第一次 `status` 已把那个值写进去了，后面再比字节自然相等。真做只读断言必须同时：① **埋哨兵**（先把某字段改成只有写者才会覆盖掉的标记值）；② **比 mtime**（哪怕原内容重存也能抓到）；两项任一不过即红。与坑 11 同源：**接线类断言必须真跑，而且至少要跑两轮**——一轮只证明“第一次会变”，证明不了“第二次还会不会变”。/ **Read-only assertions must not just diff bytes** — an idempotent rewrite is invisible on the second comparison; plant a sentinel value AND compare mtime, and probe at least twice.

14. **读端偷吃写端的副产物 = 读数不可复核（2026-09-14，C16 钉住）。** `memo` 的组件链接「元认知」过去读的是 `generateBriefing()` 里那次 `ingest()` 的返回值——等价于「只有刚写过表，才算元认知在线」；一旦把读端纯净化，它就集体假报 `degraded`（叫狼的反向版本）。同类形状：任何「我刚才跑了写操作，所以状态是 X」的读数都必须改吃只读档（`data/metacognition/self-state.json` 等）。同时要注意：读表写表不止「多几条计数」——`kernel.processReactions` 在高唤醒时会真写 growth 记忆 / episode / improvement 提案并改 `channelWeights`、`attentionRevision`，所以**读端默认必须关写端**（要喂信号走 `memo --feed` 或 `node src/neural.js event|assess`）。/ **Never let the read path consume a write path's byproduct** — it makes readings unreproducible and flips into false alarms the moment you make the reader pure.

15. **静态断言会被注释骗过去——门禁必须留行为层（2026-09-14，C18 负向②实测）。** 把院际工具里的资产递归调用删掉、只留一行同名注释，裸子串断言仍然判绿：因为它只看字面，不看那行是不是注释。这一式最后是靠**行为层**转红的（在 `.temp/gate-c18-yard` 造一对迷你院，把 `assets/…/SKILL.md` 写成内容不同，再要求台账「真实漂移」行必须出现该路径）。同类形状：任何「文件里存在某串」的门禁都能被一行注释满足 → 收紧办法是锚定行首与结构（如 `^[ 	]*walk(`）并保留一个真跑行为的断言。/ A substring assertion is satisfied by a comment; keep a behavioral check that actually executes the path.



**16. 文档教的验证命令可以指向"根本不在本包里的路径"——命令必须自带执行位置（2026-09-15 实测两例）。**
第一例：`docs/module-handbook.md` 曾写「本地 LSP 服务，见 `tools/lsp-server.js`」，而该文件在 Tip/OPT/aing 三院 `git ls-files` 里**全不存在**（端口 4317 上若有服务是别的工具的）——照它排障会永远排不出来。
第二例：M4 组件链的 `SkillOpt adapter` 行写 `PYTHONPATH=. python -c "from skillopt.envs.aing.adapter import AingEnvAdapter"`，看着像在院子里跑的样子；实测**在 Tip 包内必失败**（本包只有 `training/adapter.py`，是另一套东西），而本机存在**两份**同名 SkillOpt 检出：`<dd-root>\321\SkillOpt` 里 `IMPORT_OK`，`<sqa-root>\SkillOpt` 里 `ModuleNotFoundError: No module named skillopt.envs.aing`。
**对策**：任何"验证命令"必须自带 **cwd / 检出位置 / 前置条件**，并写清它验证的是本包还是外部依赖；同名依赖有多份检出时**禁止按目录名推断**，必须逐份实测。同一形状的第 3 类风险由门禁 C19 管（文档抄的数字），本条管的这类"路径/命令的可执行性"目前**没有门禁**——要加门就得先把全仓 `python -c` / `node` 命令逐条真跑一遍再钉，属未决事项。
/ **Verification commands in docs must state WHERE they run** — `tools/lsp-server.js` exists in no yard, and the SkillOpt import only works inside the checkout that actually has `skillopt/envs/aing/` (two same-named checkouts on this box, one without it). Every documented command must carry its cwd/prerequisites, and never infer a dependency location from a directory name.
17. **别把"文档里的命令"当只读跑，白名单必须用显式数组而不是正则。** 本轮写全仓命令清点脚本时用 `/^(node (src\/memo\.js (--summary\|--peek\|--todos\|)…)/` 之类的"只读正则"放行——那个分支末尾的 **空选择 `()`** 等于放行任意 `node src/memo.js …`，于是把 AGENTS/README 里的**示例命令行**（含 `<用户挂着的事>` 这种占位符）真跑成 4 条 `todo add` 写进了 knowledge.db，C10b 立刻红（面板 32 ≠ 库内 36）。修法：①按"留痕不删"把 4 条改 `status=voided` 并在正文写明来路；②C20 的门禁清单改成**显式数组 + 防呆**（`WRONG_WORDS` 一命中就红，验收器绝不自持写命令）。教训：**"看起来只读"的正则不是证据，枚举出来的命令数组才是**；同一坑第 15 次是我自己踩的。
## 当前迭代故障引导（P0–P2 + 双语） / Current-iteration failure guide

**18. 自己上几轮写过的叙述，不是本轮的证据 —— 假前提差点进包（2026-09-15 实测）。**
本轮准备给 `assets/skills/**` 写一份「宿主技能逐字副本，许可待宿主确认」的 NOTICE，依据是几轮前我自己写进交接文档的定性。
落笔前照例复核：**宿主三个技能根**（`.sclaw/agent/skills` 35 项、`scnet-client/resources/agent-skills` 7 项、`.sclaw/agent/plugins` 8 项）**里根本没有 `neural-evolution-swarm` / `aing-operator` 同名目录**，
而这两个目录通篇是 aing 专属内容（GWT 映射、GREEN-LIST、growth.config、KESPI）——它们是**本包自撰的技能资产**，不是副本；`dependencies.yaml` 里的 `source: local` 讲的是「依赖在本地解析」，也不是原创性声明。
顺带实测：swarm 声明依赖的 `consciousness-neural-methodology` / `senior-developer` / `neural-consciousness-architect` 在本机宿主根里同样**一个都没有** ⇒ 与 C18 量到的 `inRuntimeSurface=false` 对得上。
**对策**：凡"准备写进包的来历 / 许可 / 归属"类断言，必须当场用目录清单或 `grep` 重取证据，旧文档里的同类句子要一并改口（本轮改了 `AGENTS.md` C20 行与 `verify-deploy.js` 边界注释两处）。
**结论：NOTICE 不写了**——为一个假前提建一份文件，等于把假账装订成正式凭证。假前提被证伪时，正确动作是删掉计划，不是给文件找个说法。

**19. 抄进来的数字必须写清"是谁的数"——异构环境里的单值相等检查一定会假红（2026-09-15 自伤 19/20）。**
我给 C20 加"面数不许抄漂移"时写成「AGENTS 的数字必须等于本院 `--print-face` 行数」：在 Tip 绿，在 aing **当场红**——aing 实测 **174**、Tip **169**，因为 aing 带着 `GROWTH-FEEDBACK-SWITCHES.md` 等**院属档**（`tools/verify-baseline.ps1` **只在 OPT 侧**，Tip/aing 无此档）。
讽刺的是坑 9 自己就写着「"对方独有 0" 不等于对方没有独有文件」，我却拿一个院属混合值当全仓基线用。
**正确口径**：169 是**主包**（发起部署的那个包）的面；各院本地面只许 **≥ 基线**——小于＝有档不在本院（真漂移），大于＝院属档（合法，但文档必须声明「院属档另计」，且门禁把差值一并印进读数）。
**泛化**：任何跨院/跨环境共享的标量，要么标清来源与口径（谁的数、何时量、含不含院属），要么把断言改成方向性的（≥ / ⊆）。**别把"我这台机器刚测出来的值"写成绝对真理**——那正是本会话坑 18 的同一条病，只是这次犯在门禁代码里而不是文档里。

| 症状 / Symptom | 处置 / Fix |
|---|---|
| 代谢中止、退出码 1、`❌ 失败 / Failed: <关键步骤>` | 读该步 stderr → 修复 → 重跑；确需跳过用 `node src/run-metabolism.js --force`（仅非关键步骤续行） |
| KESPI 显示 `pending` | 跑 `node src/kespi-check.js` 或全量代谢翻转；非故障，禁止改库补分（纪律第 4 条） |
| 日志双语「中文 / English」 | 预期行为；按 Pitfall 5 处理，禁止改写 |
| `/api/ingest` 后无蒸馏摘要 | 确认 body 是否带可选 `distillation`；缺省落「待生成 / pending」占位，非错误 |
| 排障后汇报 | 先修复复跑至 ALL GREEN，再按 Reporting Format 汇报并附完整面板 |
| C8 盘符扫描红灯 | simulation/ 下 JSON 含绝对盘符路径 → 改为 `<repo-root>` 语义占位符，重跑 `verify-deploy.js` |
| C9a 组件登记簿不一致 | 加步必须同步 `data/component-registry.json`，distill 步已登记（11 步 ↔ 11 登记） |
| `POST /api/ingest` 返回 `422 rejected: collection-trace-only` | 正文全是贴出来之前的采集步骤（命令行/请求行/响应头/报文） | 按「只入贴出来的详情」口径属预期；把要留的详情正文单独贴一条即可，别改服务端剥除规则 |
| 蒸馏摘要 / `entities.tags` 里出现 `https`、域名、`curl` 等字样 | 剥除没生效或标签过滤被绕过 | 查 C10h 是否红；确认 `config.ingest.scrubTrace` 未置 0、`src/ingest-scrub.js` 在位 |
| distill 步骤失败 `no raw messages` | selftest-probe 残留实体导致 distill 拒绝空消息；清理 `DELETE FROM entities WHERE id LIKE '%selftest%'` 后重跑 |
| 意识层 `stagnant` 但代谢不触发 | 先看本轮代谢尾部有没有「🧠 意识层本轮记账」行（写端在 `run-metabolism.js` 尾部，C14 钉住）；再确认 `data/consciousness/state.json` 的 `stagnationCount >= 3`；跑 `node src/growth-director.js --execute` 触发 full_metabolism。**不要手改 state.json 做演示** |
| briefing selfAssessment 显示 `✗` 或 `△` | 自我建模: 跑 `node src/metacognition-layer.js self-check` 刷新真实指标（该类 `module.exports` 是**类**，`require(...).selfCheck()` 必报 not a function）; 自我解释: 跑一轮代谢生成 decision-lineage.jsonl; 自我提升: 跑 `node simulation/training-sim.js` 生成证据 |
| SkillOpt adapter 导入失败 | 先确认 cwd：**必须在含 `skillopt/` 包目录的检出根**跑（本机只有 `<dd-root>\321\SkillOpt` 实测有 `skillopt/envs/aing/`）；`PYTHONPATH=.` 指向 SkillOpt 根目录；aing adapter 在 `skillopt/envs/aing/`，**不是** `aing/training/adapter.py`（本包那份是另一套东西） |
| 检索结果全是同一类型实体 | 语义向量未加载 → 确认 `models/` 目录存在；跑 `node src/index-vectors.js --semantic --reindex` |
| KESPI 全库均分突降 | 检查是否有探针/测试实体未清理 → `SELECT id FROM entities WHERE id LIKE '%probe%' OR id LIKE '%selftest%'` → 删除后重跑 `kespi-check.js` |


**20. 双引号里的反引号会被 shell 当命令替换执行——文档内容会被静默吃掉（2026-09-15 第 6 次踩中，本轮实证）。**
写 `node -e "…"` 且字符串里含反引号（Markdown 行内代码最常见的写法）时，bash 先做命令替换：
反引号之间的文字被当成**命令去执行**，执行失败只在 stderr 留一行 `No such file or directory`，
而写进文件的那段文字**已经变成空白**。本轮因此把备稿里的仓库名整段吞掉，措辞变成"留在  #34 的正文里"，
若我只看"追加成功、原行保留 67/67"就收工，这条静默损坏就会跟着提交进三院。
**对策（三条硬规矩）**：① 凡含反引号、`$()`、引号嵌套或中文标点的文档改动，一律先用文件写入能力落成 `.temp/*.js` 脚本再 `node` 跑，不用 `node -e` 内联；
② 写后必做**定向回读**：不能只比"原行是否还在"（旧内容当然还在），必须断言**本轮新增的关键句存在**且**受损模式不存在**（如 `留在\s+#`、连续两个空格、空代码对 `` `` ）；
③ 回读命令本身的退出码也要看——管道 `| tail` 会把上游退出码换成 tail 的（本轮"退出码 127"即是管道假象，非脚本失败）。
/ **Backticks inside double-quoted `node -e` are eaten by shell command substitution** — the text between them is *executed* and silently replaced by nothing; write such edits to a script file, and read back the newly added sentences (not just the old ones) plus an explicit anti-corruption pattern.
## Daily Operation / 日常运行（部署完成后）

```bash
node src/run-metabolism.js --smart        # Metabolism main loop (smart mode) / 代谢主循环（智能模式；默认不替用户提交，见坑 12）
node src/run-metabolism.js --step=compile  # 单步重放（必须等号形；空格形会被当成整链跑）/ single step (equals form!) 
node src/index-vectors.js --semantic --reindex   # Semantic reindex after content changes / 内容变更后语义重建
npm run scheduler                         # Resident scheduler (optional) / 常驻调度器（可选）
npm run server                            # HTTP API (optional) / HTTP API 服务（可选）
node src/memo.js --summary                  # 备忘录/仪表台 CLI（不起服务即可读）/ memo dashboard
node src/memo.js --peek                     # 只读快拍：健康 + 用户待办 + 派单（纯 JSON）/ machine-readable glance
node src/memo.js todo add "<用户挂着的事>" [--due YYYY-MM-DD] [--agent]   # 待办进备忘录 / record a pending item
node src/memo.js todo done <id|关键词>          # 销办（留痕）/ close a todo with audit trail
node src/memo.js --actions                  # 只要下一步命令 / just the derived next actions
node src/neural.js status                    # 意识层只读快拍（含在效抑制清单）/ read-only kernel status
node src/neural.js inhibit <目标> --hours 1    # 抑制误报源（到期自动失效；无撤销 API）/ inhibit a target
node src/neural.js verify '{"checks":[{"name":"复验全绿","passed":true}]}'   # 补记校验与结果到 decision lineage（record 同理）
node src/auto-ingest.js <sid> "<json|文本>"  # 会话入库（无常驻时的按条通道）/ per-message ingest without a daemon
node src/query.js "关键词"                 # Query CLI / 查询 CLI
npm run verify                            # Re-verify anytime; must stay ALL GREEN / 随时复验，必须保持全绿
npm run verify:siblings                     # 院际代差台账（只读）：Tip ↔ OPT/aing 全量同源 + 库结构
```

## Cross-Yard Align & Sandbox Restore / 院际对齐与沙盒复原（可复制流程，2026-09-14 实测登记）

> 分工：<tip-root> 是源码真源与修复落点，<opt-copy> 是部署沙盒（换血验证），验证完复原。**`src/sync-opt.js` 只会把 OPT 硬重置到 aing master**（且 `data/opt-root.json` 标记 `enabled:false`）→ 它不能把 Tip 的改动带进 OPT，Tip→OPT 必须走下面的手工换血。

| 步 | 动作 | 要点（漏做会有什么后果） |
|---|---|---|
| 1 备份 | 覆盖前把 OPT 原件 + `git diff` 存到 `<backup-root>\OPT-<date>\` | 另存 `README.md.pre`、`growth.config.js.pre`、`tracked-dirt.patch`；OPT 的 README 换血前自带 AIGC 水印轮换，别拿 HEAD 版抹掉所有者原有脏态 |
| 2 换血 | 按 Tip `git ls-files` **∪ 未跟踪的新源码文件**（`git ls-files --others --exclude-standard`）逐文件复制（排除 `data/`、`node_modules`、`models`、`knowledge.db`、`package-lock.json`、`.temp/`） | **只取 `git ls-files` 会把还没存盘的新源码整批漏掉**——2026-09-14 第四轮 `src/neural.js` 就是这么漏的，OPT 的门禁 C15 当场红「缺 src/neural.js」（代码面相同不等于能力面相同）。`src/growth.config.js` 被忽略规则挡住、git 对齐管不到 → 必须另由 `growth.config.example.js` 重生，否则 C10d 模板不同构直接红（但「只换血不部署」时必须 `--no-config`，否则破坏纯未部署态） **白名单要跟着包面扩**：本步的目录面目前是 `src/ tools/ docs/ assets/` + 包根文件（W5 起 assets 属能力面，门禁 C18 会在别院查它在位）。历史上两次同形漏带：第四轮只取 `git ls-files` 漏了未存盘的 `src/neural.js`，第五轮白名单没放 `assets/` 漏了 20 件技能资产——每扩一个顶层目录，换血脚本、`verify-sibling-roots` 的 walk、门禁断言三处必须同时改，且要靠门禁而不是靠记得。**同一轮补带必须把备份目录换成 `roundNb`**（否则第二跑会把首轮已备份的原厂件覆盖成 Tip 内容）。 |
| 3 验证 | `node src/metabolism-panel.js` → `node verify-deploy.js` → `node tools/self-test.js` | 面板不先重生成 → C10b 新鲜度红；自测探针会写库 → 必须让它自回收 |
| 4 抽干 | 收工前抽干入库 WAL：`data/ingest-buffer.jsonl` 压实为 0、`raw/inbox/` 归零、测试实体回收 | Windows 下 `kill('SIGTERM')` 是强制终止，退出钩子不跑；残留 WAL 会被下一个开库的进程（例如自测）重放并编译成实体 → 第二天平白多出一堆假实体 |
| 5 复原 | 跟踪面 `git checkout --` 还原；未跟踪面**遇目录先展开成文件清单**再比对删除 | `git status --porcelain` 把未跟踪目录折叠成一行（如 `?? references/`），按单文件匹配会漏删（2026-09-14 实测漏 2 篇，事后核对才发现）；删除前先跑演练模式打印「命中/保留」两份清单 |
| 6 台账 | 双侧 `npm run verify:siblings` + `git status --porcelain` 计数 | 复原后应只剩该院换血前自带的脏；对齐后台账应报「全量同源 0 代差」 |

一次性脚本若写在 `.temp/`（被 gitignore）**不跟包走**，下次进场就没了——本表就是那次操作的登记面。/ *One-off scripts under gitignored `.temp/` do not ship with the package — this table is the durable register.*

## Memo as Operations Dashboard / 备忘录即运维仪表台

### 出场一眼可见的三块（2026-09-14 接线，C12 钉住）

用户把 agent 拉起来，agent **只需一条命令**就要知道：还欠用户什么、aing 健康吗、要不要派团队。三块出口：

| 块 | 出口 | 数据来源 | agent 怎么用 |
|---|---|---|---|
| ① 用户待办 | `memo.todos.user`（`--summary` 的【用户待办】） | `entities(type='Todo', status='active')` 且 tags 含 `user`——**与 `metabolism-panel.js` 的 `queues.user_todos` 同一张表同一规则**，不另立待办源 | 进场先读这一块的条数与到期（`due:YYYY-MM-DD` 标签）；会话里出现“用户挂着的事”，**当场** `todo add`，不等提醒 |
| ② 健康判定 | `memo.health.verdict` = ok / degraded / broken + `reasons[]`（每条带 code/say/evidence） | 只用离散读数：实体数、向量通道、元认知状态、kernel state、蒸馏债、`panel.gaps`、`selfAssessment`、告警。**不新增阀值**（纪律 5） | broken 先修链路再谈维护；degraded 按 reasons 逐项清；理由不可追溯就算装饰 |
| ③ 派单建议 | `memo.swarmDispatch`（`--dispatch`；`--peek` 里给完整 roles） | 由 health.reasons 的 code 映射到下面「半拉起角色与触发条件」四个角色 | `needed=true` 时按 `roles[].how`（交什么材料）与 `gate`（过什么门槛）执行；`mode=inline-degraded` 表示本运行时未装团队技能，只能 inline 扮演，**禁止假称能派** |

```bash
node src/memo.js --summary                 # 三块一次看全（人读）
node src/memo.js --peek                    # 只读快拍（纯 JSON：health + todos + dispatch，给 agent 消费）
node src/memo.js --dispatch                # 只要派单
node src/memo.js todo add "用户要周五前看到训练报告" --due 2026-09-18 --tag 训练
node src/memo.js todo add "待复跑 A/B 检索三臂" --agent
node src/memo.js todo list [--all]         # --all 含已销（status=done 留痕，不删行）
node src/memo.js todo done <id|关键词>      # 销办只改 status，保留审计链
node src/memo.js --db <副本.db> …          # 隔离库（门禁/实验探针用，不脏真库）
```

> 备忘录不是给用户看的文档——它是 aing 给 agent 的**驾驶仪表台**。agent 出场第一步永远是读备忘录，拿到三样东西后才开始工作。
> 读取面（2026-09-14 起两条等价路径，同一组装函数 `src/memo.js` 的 `buildMemo()`）：**CLI `node src/memo.js`／`npm run memo`（首选，无需常驻服务）** 或 HTTP `GET /api/consciousness/briefing`。
> ⚠ 已知副作用（实测）：每读一次备忘录，意识层 `suppressedEventCount` +8 且会重写 `logs/consciousness/briefing-<date>.md` → 读表即扰表；判断异常时以 `state`/`alerts`/`componentLinks` 为准，别把 suppressed 计数增量当业务事件。真修在源码侧（`generateBriefing` 不该往 kernel 投事件），待所有者点单。
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
> | componentLinks.metacognition.status | online | degraded → `node src/metacognition-layer.js self-check` 刷新 |
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
6. **组件全绿必须提示用户**：每次验收/复验达到 ALL GREEN 后（以及用户询问能力/完成度时），agent 必须主动向用户提示当前「组件全绿」状态——以 `docs/greenlist.json`（结构化真源）为底，其生成视图 `docs/GREEN-LIST.md` 为渲染面：绿灯能力项数 + 证据日期 + 按需接入项清单，不得只说「通过/装好」而省略能力面。历史教训：完成度曾长期靠 B组自评（80%→93%→98% 漂移），全绿状态必须由 agent 主动、按清单、带证据地呈现给用户，而非等待追问。 / **All-green must be surfaced to the user**: after every ALL GREEN acceptance (and whenever the user asks about capabilities/completion), the agent must proactively present the current all-green panel — rendered from `docs/GREEN-LIST.md` as the single source of truth (green items + evidence dates + explicitly unlocked items). Never just say "done". Historical lesson: completion used to drift with self-grades (80%→93%→98%); green status must be presented proactively, per the list, with evidence.
7. **Tolaria 标签格式，标签加载随取随用**：本包内所有文档（以及一切 aing 技能文档/skill）必须带标签——YAML frontmatter `tags: [...]` 数组 + 正文关键处行内 `[tag:xxx]` 或 `[tag:xxx:N]` 标记（compile.js 双路解析合并入库，entities.tags 列存储，这是 Tolaria 血脉的既有机制）。**9 段数值**：`N` 为 1-9 的关联强度（1 最弱 → 9 最强），不带 `:N` 的 `[tag:xxx]` 默认中位值 5；存储格式为 `"name:N"`（如 `"metabolism:8"`）。核心理念：**标签是加载单位**——agent 与检索按标签取用文档，随取随用，不做全文倾倒；标签数值用于自动建链加权与 KESPI 资产化评分。现状声明（绿灯解锁制）：标签的存储/解析/数值化链路已全绿；按标签检索的 HTTP 端点 `/api/tags/<tag>` 已接线并影子验证（兼容裸标签与 9 段 `name:N`，支持强度下限过滤），见能力项 tag-loading-api（2026-09-14）；但「按标签取用文档」仍是纪律层约定，运行期不会自动裁剪上下文。**9 段容量推演**：见 [TAG-CAPACITY-ANALYSIS.md](./docs/Engineering/TAG-CAPACITY-ANALYSIS.md)——50 类目健康、100 类目可用、150 退化、200+ 走样；50 类目为 Tolaria + LLM.WIKI 数据库软件进入时机。 / **Tolaria tag format; load by tag, on demand**: every document in this package (and every aing skill doc) must carry tags — a YAML frontmatter `tags: [...]` array plus inline `[tag:xxx]` or `[tag:xxx:N]` markers at key body points (compile.js parses both and merges into entities.tags — the existing Tolaria-lineage mechanism). **9-segment numeric**: `N` is a 1-9 relevance strength (1 weakest → 9 strongest); `[tag:xxx]` without `:N` defaults to mid-value 5; stored as `"name:N"` (e.g. `"metabolism:8"`). Core idea: **tags are the unit of loading** — agents and retrieval consume documents by tag, on demand, never as a full dump; tag values weight auto-linking and KESPI asset-readiness scoring. Status note (green-light rule): tag storage/parsing/numeric chain is fully green; the tag-query HTTP endpoint `/api/tags/<tag>` is wired and shadow-verified (bare tags and 9-segment `name:N`, with a strength floor) — capability tag-loading-api (2026-09-14); loading documents by tag remains a discipline convention, the runtime does not auto-trim context. **9-segment capacity analysis**: see [TAG-CAPACITY-ANALYSIS.md](./docs/Engineering/TAG-CAPACITY-ANALYSIS.md) — healthy up to 50 categories, usable to 100, degrading at 150, breaking at 200+; 50 categories is the recommended point to install Tolaria + LLM.WIKI database software.
8. **组件透明化：首次接触必出纯文字组件说明**：agent 首次向用户介绍 aing、或用户表达"想实现/启用什么功能"的意图时，必须先用**纯文字逐行**向用户展示基本组件清单——每个组件一行：名称 + 它能给用户做什么 + 当前状态（已上线 / 在库未接线 / 设计中）。用户据此按需选择落实哪些功能；agent 不得默认替用户决定启用范围，也不得只讲已上线部分而隐去未接线部分。状态唯一来源：`docs/greenlist.json`（视图 `docs/GREEN-LIST.md` 由 `node tools/gen-greenlist.js` 生成，门禁 C10a 校验一致）。纯文字模板见 `docs/AGENT-ONBOARDING.md` Step 6。 / **Component transparency: plain-text component briefing on first contact**: when first introducing aing to a user, or when the user expresses intent to implement/enable features, the agent must first present the basic component list in **plain text, one line each** — name + what it does for the user + current status (live / in-library-unwired / in-design). The user decides what to implement, on demand; the agent must not default the scope for them, nor show only live parts while hiding unwired ones. Status source of truth: `docs/GREEN-LIST.md`. Plain-text template: `docs/AGENT-ONBOARDING.md` Step 6.
9. **部署与源码保持一致（零偏移）**：部署产物必须与仓库源码一致——部署过程中不修改代码、不打临时补丁、不手工调整仓库文件。部署中发现的缺陷，修复发生在源码侧：在源码仓库的分支上修复并附变更说明，经确认合入后重新部署。直接在已部署实例上"顺手改好"的差异不会进入下一次部署，只会造成环境漂移，让后续的验收与排查失去基准。允许的运行时配置面仅限 `growth.config.js` 与环境变量。 / **Deploy exactly what the source says (zero drift)**: deployed artifacts must match the repository source — no code edits, hot-fixes, or hand-tweaks during deployment. Defects found during deployment are fixed on the source side: patch on a branch of the source repository with a change note, get it merged, then redeploy. Fixes applied directly to a deployed instance will not survive the next deployment; they only create environment drift and invalidate future acceptance and troubleshooting baselines. The only supported runtime configuration surface is `growth.config.js` and environment variables.

## Reporting Format / 汇报格式（对用户）

After deployment, paste the **complete** verify-deploy.js report (all six ✅ lines plus the ALL GREEN line) to the user. Never just say "it's installed". If any item is ❌, fix per the table and re-run until all green.
部署完成后，粘贴 verify-deploy.js 的完整报告（含六项 ✅ 与 ALL GREEN 行），不得只说"装好了"。任何一项 ❌，先按修复列处理并重跑，直至全绿。

**全绿之后还必须做一步 / One more step after ALL GREEN（强制）**：向用户渲染当前「组件全绿」面板——绿灯能力清单（来自 `docs/GREEN-LIST.md`，含证据日期）+ 按需接入项。模板：

```
🟢 组件全绿 N 项能力（真源 docs/greenlist.json / 视图 docs/GREEN-LIST.md，截至 <日期>）：
  ✅ <能力 1> — <一句话证据>
  ✅ <能力 2> — <一句话证据>
  ...
⬜ 按需接入（未接管线/未解锁，不承诺）：<项 1> / <项 2>
```

```
🟢 All-green panel: N capabilities (evidence in docs/GREEN-LIST.md, as of <date>):
  ✅ <capability> — <one-line evidence>
⬜ On-demand integration (not wired / not unlocked; no promises): <item> / <item>
```

缺失此面板 = 汇报不完整 / A report without this panel is incomplete.
