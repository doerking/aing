---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'e0868bc4-799f-4361-bc07-c4c86e242ba0'
  PropagateID: 'e0868bc4-799f-4361-bc07-c4c86e242ba0'
  ReservedCode1: 'f8bb2609-3e7a-4c4a-9e50-d093b926c878'
  ReservedCode2: 'f8bb2609-3e7a-4c4a-9e50-d093b926c878'
---
# aing 绿灯清单 / Green List（自动生成，勿手改）

> 真源：`docs/greenlist.json`（结构化）。本文件是生成视图；改动先改 JSON，再运行 `node tools/gen-greenlist.js`。
> Agents 渲染面板请直接读 JSON；未列出的能力一律不得对外承诺。

## 绿灯能力（29 项，截至 2026-09-14）

- ✅ **完整代谢（11 步，含 distill）+ --resume/--step/--smart**
  - 证据：影子回归 11 步全过 7.6s（2026-09-13 M4 验证）（2026-09-03）
- ✅ **查询 CLI 语义+关键词混合检索 + KESPI 附分**
  - 证据：命中 3 条 KESPI 0.93 显示正确（2026-09-03）
- ✅ **384 维本地语义检索（Xenova/all-MiniLM-L6-v2，离线），64 维哈希自动回退；机制可用但中文短语文料检索质量受英文模型限制**
  - 证据：verify-deploy C5/C6 绿（模型就位 + top1 命中）；OPT 存库实体向量抽样 dimension=384 / model=Xenova/all-MiniLM-L6-v2 ✓ 读写同空间。限定条件（2026-09-14 OPT 三臂实测）：8 实体语料上语义 top1 38% / top3 38% / top5 75%，top3 恰等于 8 实体随机底 37.5%——英文模型对中文问句近 OOV，小语料上结果塌向 3 个枢纽实体；对整句 SQL LIKE（0%）完胜，对人工提词 LIKE（8/8）不占优（2026-09-14）
- ✅ **导链路优先级分级生效（high/medium/low）**
  - 证据：attention 0.900→high；真实 0.590→medium（2026-09-03）
- ✅ **三路真实评分裁决（无 mock）**
  - 证据：run 788ms 交叉校验 2/3 落盘（2026-09-03）
- ✅ **编译门禁真实 KESPI 评分；未入库 PENDING 不误杀**
  - 证据：10 档 9 接受 1 正确 PENDING（2026-09-03）
- ✅ **常驻调度 + raw/ 轮询触发（mtime 快照）**
  - 证据：--once 全链 3.28s 退出 0 ×2（2026-09-03）
- ✅ **HTTP API（3789）/health 公开，其余 Bearer 认证（单用户产品，无多租户）；/api/ingest 字段面 sessionId/content/role/source/distillation（role 白名单 user|assistant|analysis|research + 别名 agent/bot→assistant，未知 400；metadata 停收；纯过程内容 422）**
  - 证据：本会话实测：无键 /health 200、受保护端点 401、带键 200；X-Tenant-ID 会话前缀 2026-09-14 已砍除，砍除后 /api/ingest 复验 200 且会话键即 sessionId。同日 OPT 部署场真机：role 传 agent 归一为 assistant、role 传非法值 400 并回带 allowedRoles、纯采集痕迹 422、metadata.id 未被采信（2026-09-14）
- ✅ **入库去重按「会话 + 批次指纹」，重复只丢挂起批并留痕 data/ingest-duplicates.jsonl**
  - 证据：影子实测：同文本发往两个会话各自落档（旧实现只哈希正文，第二个会话被静默吞掉）；同会话重发同批 → 丢弃挂起 5 条并写重复留痕（2026-09-14）
- ✅ **KESPI 生命周期 pending→computed + 关键步骤熔断（P0-P2）**
  - 证据：三包演练：翻转 8/8、无蒸馏优雅降级、退出码 1 熔断（2026-09-07）
- ✅ **verify-deploy C7 运行时产品断言（一致性+指纹）**
  - 证据：负向测试：注入腐坏→红，清除→绿（2026-09-07）
- ✅ **意识层三件套（组件登记簿 + 注意力队列 panel + C9 契约门）**
  - 证据：代谢尾步生成 panel 实测 0.87；负向测试：鬼步登记→C9a 红、panel 缺失→C9c 红，恢复→绿（2026-09-13）
- ✅ **蒸馏写路径可用（distill_meta 迁移 + 债务兑付），指机械蒸馏对 raw 顶层语料**
  - 证据：临时库真写回读一致 + C10c；真实会话档的端到端兑付见 session-ingest-contract（2026-09-14 之前该路径对会话档是断的）（2026-09-14）
- ✅ **库内引用完整性（foreign_keys 每次落盘重断言 + ON DELETE CASCADE 生效）**
  - 证据：影子实测：删父级联各表 -1、悬空写被 FOREIGN KEY 拦、11 步代谢零失败、self-test 跑后零探针残留（2026-09-14）
- ✅ **按标签加载检索 /api/tags/<tag>（裸标签与 9 段 name:N 兼容 + 强度下限过滤）**
  - 证据：影子起服务实测：混格式命中 5/0 对比、:6/:9 下限生效、大小写不敏感；旧实现整串全等致 9 段格式静默零命中（2026-09-14）
- ✅ **一致性与写路径门禁 C10a–C10h（视图/面板读数/蒸馏写路径/配置模板/引用完整性/防复活/入库契约+role 契约/只入详情）**
  - 证据：verify-deploy 32 项全绿（C0–C20）；C10a–C10h 逐项负向注入各自转红、复原转绿（纪律 8）。C10g 第⑥段（role 归一/未知拒收/提议只落未核验段/门口 400/自报不抬 confidence）2026-09-14 五处注入 5/5 转红；C10h 夹具含 10 类痕迹形状 + 6 条中文反例，且把 AING_SCRUB_ASCII_MIN 调到不可达即转红（证明行内特征层非空转）（2026-09-14）
- ✅ **会话入库端到端契约：角色节↔蒸馏白名单、role 白名单+别名归一（未知整条拒收，不改写说话人）、服务端定身份、WAL 不丢、运行态产物隔离在 raw/inbox/**
  - 证据：影子实测（2026-09-14 真 HTTP）：5 条混合角色会话 → raw/inbox 档 status=pending-distillation / confidence=0（自报只进提议节）→ compile/import 后实体 id == 文件名干、净增 1 → distill 兑付 ok=1 / 5 points / debt=0；accepted 后杀进程 → WAL 留存 2 条 → 重启重放并落盘。同日 OPT 部署场复跑补出并修掉一个契约漏洞：调用方按直觉传 role=agent 时旧渲染器把它静默归入「用户提问」（说话人被改写、蒸馏器再也分不出谁说的），现别名归一 + 未知 role 整条拒收 + 门口 400；OPT 强杀后 WAL 重放 4 条实测成功、刷盘档零痕迹、身份字段仍 pending-distillation/0（2026-09-14）
- ✅ **只入贴出来的详情：采集过程行（命令行/请求行/响应头/报文/工具调用回显）在入口剥除且不留存，纯过程内容 422 拒收，metadata 停收**
  - 证据：影子真 HTTP 实测（2026-09-14）：混贴 4 行详情 + 3 行过程 → 档内零过程字样、traceScrubbed=3、distill 兑付 tags=[Agent]；纯过程 → 422；source 填不可达 IP 107ms 返回且库里 0 条 URL 链接；C10h 八项负向注射各自转红。同日 OPT 真机补漏：带 "> " 前缀的请求行与 tool call: bash -c "curl … → 200 OK 12ms" 这类行内痕迹原先漏网（静态门禁全绿而活服务入库），现补行内特征层，并要求整行 ASCII 占比 ≥0.6 才触发，以免剥掉中文正文里对痕迹形状的引用；改后 OPT 复测：混合会话刷盘档仅存详情、纯痕迹 422（2026-09-14）
- ✅ **院际全量同源核验：tools/verify-sibling-roots.js（`npm run verify:siblings`）逐字节比对 src/tools/包根文件并核对各院库结构（表/列/行数），只读——不写任何文件、不改任何库，退出码机器判定**
  - 证据：2026-09-14 实测：Tip→OPT 换血后报「全量同源 真实漂移 0 · 仅行尾 0 · 缺失 0 · 独有 0」；OPT 复原 L1 后报「真实漂移 15 · 仅行尾 15 · 缺失 2」，与手算 `git ls-files` + sha256 一致；据此确认 `src/sync-opt.js` 只会硬重置到 aing master、不能承载 Tip→OPT 换血。**已知边界（同步登记于 AGENTS 坑 9）**：比对面不含 `docs/` 与 `assets/`（实测 aing 比 Tip 多 24 个跟踪文件、Tip 比 aing 多 7 个，台账上不可见），扩展名白名单不含 `.ps1`（OPT 独有 `tools/verify-baseline.ps1`（**只存在于 OPT 侧**，Tip/aing 包内无此文件，在 Tip 里调用必失败） 被报成「对方独有 0」），未跟踪面依赖 `git status --porcelain` 因而遇目录会折叠 → 文件清单级缺口须手算 `git ls-files`；**2026-09-15 复核发现该工具的比对面历来不含 `docs/`**，遂扩为 src+tools+assets+docs+包根 5 档（143 文件），扩面后当场抓出 OPT 文档面 6 处代差；同日再升级为**整包面（从包根递归，170 文件）**，又抓出两院都缺 `references/` 两档与 OPT 缺 11 个 `simulation/` 证据档，全部补带后两院复测真实漂移 0（2026-09-14）
- ✅ **最后一米联通：备忘录可离线读（npm run memo / node src/memo.js，HTTP 同口径复用 src/memo.js）+ 会话入库一次性通道真跑成档（缺参即非零退出，不伪造消息）**
  - 证据：门禁 C11 真跑（2026-09-14）：CLI stdout 纯 JSON、12 必备字段齐全、组件链接六条在位、读到 20 实体；隔离 KB_ROOT 投一条混入 3 行采集过程的正文 → flushed=true、traceRemoved=3、raw/inbox 成档且档内零过程字样、WAL 归零；缺参调用退出码 2 且探针根零残留。负向注入 5 式各自转红（删 memo 导出 / 去 scripts.memo / 撤 AGENTS 登记 / 恢复伪造 test 默认值 / 还原 static instances）。同源三文件：src/memo.js、src/api-server.js、src/auto-ingest.js（2026-09-14）
- ✅ **备忘录三块一眼可见：用户待办可写可读（同一张 Todo 表）+ 健康判定（ok/degraded/broken，每条理由带读数）+ 神经进化团队派单（谁、交什么、过什么 Gate、能不能真派）**
  - 证据：门禁 C12 行为证明（2026-09-14，全程隔离 --db 副本，真库零污染）：空库探针必须判 broken 且派 senior-engineer（证明健康不是写死的 ok）；待办 add→list→owner 分流（用户+1/agent+1）→due 落 tags→--peek 可见→done 销办→--all 查得 status=done 留痕；空内容拒绝写入；派单 roles 必带 why/gate/how，mode 在团队技能未装时降为 inline-degraded。负向注入：写死 verdict / 令 collectTodos 恒空 / 令 roles 恒空，C12 各自转红（2026-09-14）
- ✅ **两条链都不替用户写 git 历史：跑 `node src/run-metabolism.js` 与 `node src/init-knowledge-base.js <院> --git` 都不会在你的院子里自动 commit（默认关，确需自动提交必须显式 AING_AUTOCOMMIT=1 opt-in）；初始化脚本也不再覆写院子自带的 .gitignore**
  - 证据：门禁 C13 在 .temp 下的隔离假院里真跑双向证明（2026-09-14）：① 带守卫跑 compile 单步 → 假院提交数 1→1 且步骤日志出现「⏭️ Git commit 跳过（AING_NO_AUTOCOMMIT=1）」；② 只在假院副本里删守卫 → 立刻多出 1 笔、标题正是「chore: compile knowledge base」；③ init-knowledge-base --git 未 opt-in → 提交数不动且 .gitignore 里的哨兵行存活（证明没被覆写），显式 opt-in → 出现「chore: initial knowledge base setup」（证明 opt-in 分支是活的，不是恒不提交糊弄门禁）。两趟各投新 raw（compile 只在 compiledFiles>0 时才调 gitCommit，否则假阴性）。C13 自身负向 4 式（真源删守卫 / 守卫挪晚 / 抹掉 AGENTS 的 C13 行与令牌 / 复原）各自转红、复原回绿，真源码逐字节还原（2026-09-14）
- ✅ **意识层闭环真有写端：每轮代谢结束时把「本轮有没有产出」记回 kernel，停滞计数会自己累积到 3 并触发熔断（自动转 stagnant + 往 raw/ 写 MetaKnowledge），growth-director 据此自主选择「完整代谢」；有效产出后自动解闩**
  - 证据：门禁 C14 在隔离假院（复制 src/，raw/ 不放文档）里连跑 3 趟完整代谢：stagnationCount 自行 1→2→3、第 3 趟 state 转 stagnant、raw/ 自动出现 meta-breaker-*.md、growth-director --dry-run 决策框印「🔄 完整代谢 / 连续停滞」；随后喂一篇真文档再跑一趟 → 计数归 0 且状态解闩回 idle。全程没有手改 data/consciousness/state.json。负向：删掉 run-metabolism 的 recordCycleResult 调用 → C14 红；删掉 kernel 解闩分支 → C14 红（2026-09-14）
- ✅ **意识层写端真接：agent 可以不动源码就向 kernel 投递事件、抑制误报源、把校验与结果记进 decision lineage，并让蜂群协商维护（只出共识、要人批）；CLI 与 HTTP 两条通道同指一个 kernel**
  - 证据：门禁 C15 在隔离假院真跑两面：CLI 侧 `node src/neural.js inhibit <t> --hours 1` 后，同一目标的 `event` 必须返回 accepted=0 且 suppressed[0].inhibitReason=target-inhibited（证明 isInhibited 真参与 ingest 判定），`status` 跑一次 state.json 逐字节不变（真只读），`verify`/`record` 必须给 logs/agent-decision-lineage.jsonl 增行，--hours 0 非零退出；HTTP 侧真起 api-server（AING_API_PORT 探空闲端口）打 /inhibit、/event、/verify、/record、/deliberate 并用 GET /api/consciousness/lineage 回读三笔。另断言 api-server 头部注释路由清单与实现集合完全相等（陈账即红）。负向：删 src/neural.js 或去掉某子命令 / 注释里多挂一条路由 / 让 status 去 saveState → C15 各自转红（2026-09-14）
- ✅ **读仪表台不再扰动被读的表：`node src/memo.js`（含 HTTP 同一函数）默认不投意识事件、不写 briefing 存档；要看元认知状态改吃只读档 self-state.json，不再依赖"刚才有没有写过"；要喂信号必须显式 --feed 或走写端 CLI/路由**
  - 证据：门禁 C16 在隔离假院（复制 src/ + Tip 的 knowledge.db / 意识层 state.json / 元认知 self-state.json 副本）里**连跑两轮** memo：`data/consciousness/state.json` 哨兵值与 mtime 双双未动、`logs/consciousness/` 不出现 briefing 档、`componentLinks.metacognition` 仍为 online 且 source=read-only:self-state.json；随后 `--feed` 显式跑一次必须真的改写 state.json（证明是"默认不写"而非"不能写"）。真院实测同结论：Tip 上纯读一次，state.json 字节与 mtime 未变，而 --archive 会让 briefing 档 md5 改变。负向：把 ingest 改回无条件调用 / 去掉 if (save) / 让 metacognition 回吃 ingest 返回值 → C16 各自转红（2026-09-14）
- ✅ **意识层离散旋钮（熔断轮数 / 抑制缺省时长 / 去重窗口（秒）/ 保留事件上限）只有一个权威来源：growth.config.js 的 consciousness 段；kernel 熔断、growth-director 选路、memo 健康判定、neural CLI 四处分处读的必须是同一个数**
  - 证据：门禁 C17 行为证明：假院把 `stagnationBreakerCycles` 改成 2 → 空代谢第 1 趟不熔、**第 2 趟自动转 stagnant**，且 `node src/neural.js status` 回报 `breakerCycles=2`、`growth-director --dry-run` 同步选「完整代谢」；`inhibitDefaultHours: 5` 让不带 `--hours` 的 inhibit 缺省止到 5 小时后（实测误差 <3 分钟）；再改回 3 → 第 3 趟才熔、读者立刻报 3。静态另断言 src/ 内不再出现 `stagnationCount >= 3` 且 example 与运行配置都含 consciousness 段（C10d 同构校验）（2026-09-14）
- ✅ **`assets/skills/` 随包携带：aing-operator（中英双语 SKILL + 5 份 references）与 neural-evolution-swarm（SKILL/workflow/bind/dependencies + 四角色说明书）共 20 个文件；派单读数把「机器上有 / 本运行时装了 / 包内自带」分成三个独立布尔，只有本运行时装了才报 `swarm-skill`**
  - 证据：门禁 C18 静态断言 6 个资产路径在位（四角色 roles/*.md + 两套 SKILL.md，含 en 镜像）；行为①真跑 `node src/memo.js --dispatch` 断言 `inRuntimeSurface`/`bundledInPackage` 为布尔、`bundledInPackage=true`（包内确实带）、`inRuntimeSurface=false ⇒ mode≠swarm-skill`（当前实测：宿主 `.claude`/`.agents` 面装有团队，本运行时 `.sclaw/agent/skills` 无 → mode 如实报 `inline-degraded`），搜索到的每个目录都带 `[runtime|host|bundled]` 标签；行为②在 `.temp/gate-c18-yard` 造一对迷你院，把 `assets/skills/probe-skill/SKILL.md` 写成内容不同，`tools/verify-sibling-roots.js` 的「真实漂移」行必须出现该路径（证明比对面真扩到资产），且台账不得出现 node_modules。负向：把 mode 判定改回拿 `installed` 判 / 删掉资产黑名单 / 用 `process.cwd()` 扫资产 → 各自转红（2026-09-14）
- ✅ **门禁项数与编号范围不再靠手抄：`node tools/gate-counts.js` 直接从 `verify-deploy.js` 注册的 check 反算真值，AGENTS frontmatter / README 部署段 / `docs/greenlist.json` 三处抄写与 AGENTS 清单表行集合必须与它相等**
  - 证据：门禁 C19 双保险：① 门禁自己解析验收器得 count/编号集合，逐处比对三句抄写文本（不等即红并印出「抄的是什么 vs 实为多少」），同时要求 AGENTS 表行集合与验收器**同一集合**（缺行=那道门没登记，陈行=已删的门还挂着）；② 行为层把 5 个文件拷进 `.temp/gate-c19-probe` 真跑工具——完好副本必须退出码 0 且 `count/maxNum` 与门禁解析一致，然后把副本 README 故意改成「9 项部署门禁（C0–C0）」，工具必须转红且 problems 指向 README（证明它是检查器而不是橡皮章）。负向：改 README 数字 / 删 AGENTS 一条清单行 / 复原，各自按预期红与绿（2026-09-14）
- ✅ **文档里教人跑的命令必须真跑得通；指外部依赖的必须自带执行位置；引用不存在的东西必须同行标反例**
  - 证据：2026-09-15 全仓清点：AGENTS/README/docs/**/training/simulation/demo 抽出 282 条命令，静态核出「引用路径 0 条无标记缺失、npm run 0 条无名、外部依赖命令 100% 带 cd 或 <x-root>」；只读命令清单 7 条真跑全 exit 0（memo --summary/--peek/--actions/todo list、neural status、gate-counts、verify-sibling-roots --print-face）。起因是两例实测假命令：手册教找全仓不存在的 `tools/lsp-server.js`；`PYTHONPATH=. python -c "from skillopt.envs.aing.adapter …"` 在本包内必 ModuleNotFoundError（只在 `<dd-root>\321\SkillOpt` 检出内 IMPORT_OK）。门禁 C20 每轮复扫（2026-09-15）

## 按需接入（3 项 · 未接管线/未解锁，禁止当既成能力承诺）

- ⬜ 热重排（require 缓存清除） — 按需接入（未实现：require 缓存清除；出现"运行中改重排"的真实需求时再接）
- ⬜ 多租户 / 企业级租户隔离（已砍除，非待解锁项） — 2026-09-14 用户决定砍除：旧 X-Tenant-ID 仅给会话键加前缀、共库共表不构成隔离，却撑虚能力声明。本包定位单用户知识代谢引擎；门禁 C10f 扫到 tenant 残留即红，禁止死代码复活
- ⬜ B5 自修改回路 / 元认知配置写回 — 按需接入（须所有者逐次授权；B5 红线不变——禁直写 growth.config.js，阈值只由人在配置面改）

## 维护规则

1. 新绿灯项：影子验证全绿 → 同步主包 → 复验 → 改 JSON（附证据）→ 重生成本文件。
2. 发现失效：立即把该项移入 locked，并在 DEPLOY-CHECK 记录失效原因。
3. 本清单是用户可见能力列表的唯一真源；README/AGENTS 的能力声明与之冲突时，以 JSON 为准。
4. 本文件由脚本生成，禁止手改；门禁 C10a 会比较视图与 JSON，不一致即红。
