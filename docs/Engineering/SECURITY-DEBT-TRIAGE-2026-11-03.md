# 安全债归因账 — Mimosa 封印扫描对账（2026-11-03）

> **背景前提（必读）**：本次对账基于 Mimosa 深度扫描 `scan-2026-11-02T20-11-22.510Z-c663621dc3f4`
> （seal 目录 `<mimosa-seal-root>\project-4a471922fb533573ed98ace2\`）。
> 该扫描 **runStatus=inconclusive**（调用图部分不完整，跨文件可达性判定可能不完整，verdictEffect=none）。
> 因此：下文所有「误报」「可接受」「派生」归类均属**初筛**，不是终审；重扫（尤其调用图补全后）须重新对账本文件。
>
> 告警总数 **102 条 = 78 high + 24 medium**（findings.json 实测口径；此前会话曾口传「80 高危」系转述误差，以本文件为准）。

## 一、真源位（已修，2026-11-03 senior-engineer 轮）

| # | 真源位 | 告警 | 定性 | 修复 | 验证 |
|---|---|---|---|---|---|
| 1 | `src/run-metabolism.js:218` | 命令注入 (high) | 真风险：`execSync(\`node "${scriptPath}" ${args}\`)` shell 拼接模式本体（输入为文件内 STEPS 常量，可利用性低，但模式必须清） | `execFileSync('node',[scriptPath,...args])` 参数数组 | 语法 PASS + 完整 11 步代谢真机全量 success（`logs/metabolism/metabolism-2026-11-02T20-32-07-079Z.log`） |
| 2 | `src/run-metabolism.js:361` | 命令注入 (high) | 真风险：同上（sync-opt 治理出口） | `spawnSync('node',[路径])` + 非零退出抛错 | 同上（全量代谢含治理出口） |
| 3 | `src/auto-ingest.js:482` | 命令注入 (high) | 真风险：`execSync(\`node "${scriptPath}"\`)`，scriptPath 受 `KB_ROOT` 环境变量影响 | `spawnSync('node',[scriptPath])` + error/status 抛错 | 桩脚本三路实测：成功链「完成」/ 退出码 3 抛错断链 / 缺脚本降级跳过 |
| 4 | `verify-deploy.js:177` | 命令注入 (high，findings 记 :75/:332/:333，行号漂移，现场唯一 execSync) | 真风险（模式本体；命令为常量 `git ls-files`，可利用性为零） | `spawnSync('git',['ls-files'])` + status 检查 | `VD_ONLY=C8` 单门实跑全绿（230 文件扫描） |
| 5 | `src/search-and-ingest.js:54` | 命令注入 (high) | **真风险（初判清单外漏网）**：外部输入 `query` 拼进 shell 命令 | `execFileSync('node',['src/query.js','--',query,...])` 参数数组 + `--` 防选项注入 | 语法 PASS；`node script.js --` 实测保留 `--`，query.js `parseArgs` 跳过 `--` 取到原字面 query；连字符 query 实机跑通。**端到端注入面不可实跑（见 §六 存量死码）** |
| 6 | `src/search-and-ingest.js:112` | 命令注入 (high) | **真风险（同上）**：外部输入 `url` 拼进 `curl … | head` shell 管道 | `execFileSync('curl',['-s','--max-time','30','--',url])` + JS 侧 `.slice(0,10000)` 等价截断 + maxBuffer 16MB | 同上（同一死码约束） |
| 7 | `verify-deploy.js:15-17` | — | execSync import 随 #4 清除 | 删未用 import | grep 全仓 execSync 调用=0（仅注释/日志文本） |

## 二、预先登记：日志措辞复现项（重扫会原样再报，先入账免再对账）

- `src/run-metabolism.js:244` / `:276`「命令注入 (high)」——现场是 `logDecisionLineage` 的 `causalChain` **日志文本字面串** `…→ execSync(${step.script}) → …`，不是调用。判定：**日志措辞，非调用，不改**。若嫌重扫噪声，后续可把日志措辞改为「子进程执行」字样（纯文案，行为零变化）。

## 三、verify-deploy.js 26 条逐条入账（21 high + 5 medium）

**SSRF 组 ×8（findings.json 实测 8 条：1251/1260/1262/1265/1267/1269/1271/1275；若按报告页口径 9 条以 findings 为准）**
- 判定：**可接受**。证据：`verify-deploy.js:29`（初版账记 :30-31，漂移订正）`httpReq` 的 `host` 为硬编码字面量 `'127.0.0.1'`，`port` 来自本地假院探针构造，无任何外部输入可改动目标主机。SSRF 三要素（外部可控目标）不成立。

**cpIf path-traversal 组 ×3（1316/1317/1318）**
- 判定：**可接受**。证据：`:1316` `cpIf=(f,to)=>{const a=path.join(PKG_DIR,f),b=path.join(probe,to);…}`，`f`/`to` 均为紧邻调用的字面量（`'knowledge.db'`、`'data/consciousness/state.json'` 等），`probe` 为 `PKG_DIR/.temp/gate-c16-probe` 本地构造。无外部输入。

**walk path-traversal 组 ×2（1630/1635）**
- 判定：**可接受**。证据：`:1630` `walk(d)` 起点为文件内常量目录，`path.join(d, ent.name)` 的 `ent.name` 来自 `fs.readdirSync`（真实目录项，非用户输入），且有 `node_modules|.git|.temp…` 排除表。遍历自家文档目录，穿越不存在。

**scan path-traversal 组 ×3（413/414/415）**
- 判定：**可接受**。证据：`:410-416` `scan` 读的是门禁自己维护的扫描清单文件（受控仓库内相对路径），行内容进正则匹配不进文件路径再拼接。scanner 把「readFileSync 变量路径」计为入口，无可控输入。

**命令注入 ×3（75 / 332 / 333，行号漂移）**
- `:75` 现场 `config=require(configPath)`，`configPath=path.join(PKG_DIR,'src','growth.config.js')` 常量。判定：**误报**（require 本地常量路径被计为代码执行入口）。
- `:332`/`:333`（HEAD 行号）现场是 C10d 配置同构检查的 `require(path.resolve(exPath))` / `require(path.resolve(rtPath))`，路径由门禁常量拼装，非外部输入；参数化 SQL（`INSERT INTO entities …VALUES (?,?,?,?,?,?,?)` / `UPDATE entities SET …WHERE id=?`）实际在现行 `:316`/`:319`（第二轮复核勘误：初版账本把两半证据错配到同一行号）。判定：**误报**（require 常量路径与参数化 SQL 执行均被计为命令注入）。

**不可信解释器输入 ×1（907）**
- 判定：**可接受**。证据：`spawnSync('node',['-e',<常量脚本>,dbCopy])`——`-e` 脚本是字面量常量，`dbCopy` 为本地 `.temp` 探针目录构造路径、经 `argv` 传入脚本内 `process.argv[1]`，无 shell、无外部输入。「把输入交给解释器」的输入实为本地受控路径。

**路径穿越 ×1（19）**
- 判定：**误报**。证据：`:19` 现场 `const PKG_DIR = path.resolve(__dirname)`——纯常量解析，无动态片段。

**疑似跨文件污点 ×5（312 / 315 / 354 / 469 / 692，medium）**
- `:312`/`:315`：`os.tmpdir()+pid` 构造临时库路径，进程内常量。判定：**可接受（静态近似）**。
- `:354`（现场 :356 附近，行号漂移）`flatCfg 是 mongo-sort-injection 入口`：现场是配置同构比对用的**递归展平纯函数**（`flatCfg(o,p=[])`，输入是 require 进来的本地配置对象，输出进 JSON.stringify 比较，不进任何数据库/查询）。mongo-sort-injection 的靶面（用户输入进 sort 参数）在本仓不存在 mongo。判定：**误报（靶面不存在）**。
- `:469`/`:692`：门禁探针内联构造的测试常量（自报摘要、手段词清单）。判定：**可接受（静态近似）**。

## 四、其余告警分组归因（verify-deploy 之外，76 条）

### 4.1 弱加密 sha1 组 ×5
| 现场代码 | 判定 |
|---|---|
| `src/auto-ingest.js:420` `createHash('sha1').update(sessionId+'\0'+bodyText).digest('hex')` | **可接受保留**：`.digest('hex')` 全长 40 hex 去重键，**非安全用途**——用于会话批次去重指纹，最坏后果是哈希碰撞导致重复批次被跳过（可用性非保密性/完整性安全属性），且输入含 sessionId 隔离。保留理由：非安全用途 + 升级会作废既有去重账本（`data/ingest-duplicates.jsonl` 旧指纹全部失配）换不来安全增益 |
| `src/consciousness-event.js:24` `stableHash` `.slice(0,16)` | **可接受保留**：16 位短指纹，意识事件去重键（A1 指纹），非安全用途 |
| `src/distill.js:69` `sha16` `.slice(0,16)` | **可接受保留**：蒸馏批次短指纹，非安全用途 |
| `src/growth-docs.js:31` `id(value)` `.slice(0,12)` | **可接受保留**：文档 ID 生成（混入时间戳+随机数），非安全用途 |
| `src/growth-loop.js:44` `hash` `.slice(0,12)` | **可接受保留**：生长循环状态短指纹，非安全用途 |

### 4.2 命令注入（白名单/常量）组
| 现场代码 | 判定 |
|---|---|
| `src/gap-detector.js:200` `execSync(\`node ${s.action}.js\`)` | **可接受**：上一行 `['auto-link','pollinate','index-vectors'].includes(s.action)` 白名单前置，注入面不存在。（与真源位同模式但已有白名单；如统一风格可改参数数组，属后续美化非安全债） |
| `src/growth-director.js:525` `execSync(\`node ${cmd}.js\`)` | **可接受**：`cmd` 来自 `_getCommandSequence`（`:281` SCRIPT_MAP 常量映射），内部步名白名单 |
| `src/metabolism-panel.js:31` `execSync(\`git ${args}\`)` | **可接受**：`git(args)` 调用点传文件内常量参数数组；git 失败静默降级 |
| `src/init-knowledge-base.js:249`（initGit 入口）→ 现场 `:190/:214/:215` `execSync('git init' / 'git add -A' / 'git commit -m "chore: …"')` | **可接受**：命令全为常量字符串；`baseDir` 是调用方显式传入的新建库目录 |
| `src/scheduler.js:104` 命令选项注入 | **误报**：现场 `spawn(process.execPath,[path.join(...)])` 本就是参数数组 |
| `src/start-all.js:45` 命令选项注入 | **误报**：现场 `spawn('taskkill',['/pid',String(p.pid),…])`，pid 为本进程持有的数字 |
| `src/knowledge-store.js:248` 命令注入 | **误报**：现场 `exec(sql,params)` 是 sql.js 参数化查询入口，非 shell |
| `tools/self-test.js:29/66` 命令注入 | **误报**：文件内无任何 exec/spawn **调用**（`:3` 有未用的 `execSync` 导入；`:22`/`:44` 为 sql.js 的 `db.exec` 参数化），现场为 require + 内存直调 |
| `tools/verify-sibling-roots.js:36/127/129/143` | `:36` `--root` 解析 `path.resolve` 后仅用于 `existsSync` 比对与读比对，CLI 本地运维工具、调用方为 verify-deploy 门禁本体；`:127/129` 是哈希比对语句文本；`:143` 现场 `require(aP)` 本地配置。判定：**可接受（本地门禁工具，无远程输入面）** |
| `scripts/fix-all-tickets.js:280`、`src/config-hotreload.js:36` 命令注入 | **误报**：现场均为 `require(configPath)` 配置热载模式，路径为本地构造 |
| `src/agent-dashboard.js:166`（all 入口） | **误报**：现场 `store.all('SELECT * FROM kespi_history WHERE entity_id = ? …',[entityId])` 参数化 SQL |

### 4.3 路径穿越组（写盘/读档，输入源为本地构造或已净化）
| 现场代码 | 判定 |
|---|---|
| `src/auto-ingest.js:444`（已入 §一关联） | **可接受**：`rendered.fileName` 生成前 sessionId 经 `[^a-zA-Z0-9\-_\u4e00-\u9fff]→'-'` 净化（`.` `/` `\` 全被替换，`..` 不可构造）+ 80 字符截断 |
| `src/search-and-ingest.js:142` | **可接受**：`generateSlug` `[^\\w\\-]→''` 白名单剥除 + `source` 为内部常量 + 时间戳数字 |
| `src/distill.js:121`、`src/compress.js:166`、`src/prune.js:137`、`src/sync-links-to-fs.js:52`、`src/sync-opt.js:108`、`src/unseed-demo.js:60`、`src/fix-kespi.js:36`、`src/fix-tags.js:148`、`src/kespi-check.js:31`、`src/kespi-check-fixed.js:38`、`src/consciousness-layer.js:229`、`src/feedback-loop.js:105/349`、`src/import-from-wiki.js:58/131`、`src/agnes-aing-adapter.js:292`、`src/init-knowledge-base.js:171/242/245/249(路径面)`、`tools/verify-sibling-roots.js:36` | **可接受（初筛）**：路径均为 `KB_ROOT/__dirname` 基座 + 本地库实体 id（入库时已过净化）或代码内常量拼合；文件名非远程可控。**前提声明**：runStatus=inconclusive，个别文件（agnes-aing-adapter、hermes 系列）未逐行审，重扫对账时优先复核 |
| `src/memo.js:845/905`（openMemoContext/readPanel 入口） | **可接受（初筛，不触碰）**：现场为 memo CLI 内部以 KB_ROOT 常量基座读面板/上下文；该文件有未收口工作树改动，本单禁触，留工作树收口时一并看 |
| `training/adapter.py:214` | **可接受（初筛）**：训练适配器脚本，路径来自任务包内构造；`training/runs/` 本单禁触 |
| `verify-deploy.js:19` | 已入 §三 |

### 4.4 疑似跨文件污点组（medium ×16，静态近似）
`src/api-server.js:194/451/483`、`src/batch-ingest.js:108/141/183`、`src/feedback-loop.js:264`、`src/hermes-aing-adapter.js:135/229`、`src/kespi-enhance.js:219`、`src/metacognition-layer.js:550`、`src/memo.js:374`、`src/query.js:119`、`src/self-growth.js:73/94`、`src/tri-path-orchestrator.js:261/275`、`src/agent-dashboard.js:166`、`src/distill.js:222`
- 判定：**初筛低置信，暂不动**。Mimosa 自标 `verdictEffect=none` 的近似告警；在调用图不完整前提下逐条人工追脏成本高于收益。登记在案，**重扫（调用图补全）后对账**，优先级按重扫置信度重排。

### 4.5 硬编码凭据 ×1
- `scripts/dashboard.sh:15`：现场 `export AING_API_KEY="$API_KEY"` 是**从环境变量导出**，非硬编码值。判定：**误报**。

## 五、待复核（本单不改，交 Leader 决策）

> 2026-11-03 收口更新：下表两项经 Leader 拍板均已修复，见行内「已修」标注。

| 现场 | 问题 | 判定与处置 |
|---|---|---|
| `src/distill.js:222` | `store.all("SELECT id, status FROM entities WHERE id = " + JSON.stringify(onlyId))` | SQL 字符串拼接（非参数化）。`JSON.stringify` 对字符串给出双引号字面量，SQLite 下 `\"` 转义语义与 SQL 不完全对齐，理论上有逃逸面；`onlyId` 来自 CLI 参数（本地输入，可利用性低）。**已修（2026-11-03）**：改 `store.all("…WHERE id = ?", [onlyId])` 参数化；D5 分支两路冒烟通过（id-not-found / id-exists-but-not-pending） |
| `src/search-and-ingest.js:347` | `module.exports={ searchAndIngest,… }` 引用从未定义的标识符 | **存量死码**：HEAD 上 `searchAndIngest` 0 处定义（abe50c1 出生即坏），且 `main()` 无 `require.main` 守卫——require/CLI 双双在到达业务逻辑前抛 `ReferenceError` 崩溃。**已修（2026-11-03，Leader 拍板复活）**：导出改实存函数 `{ searchWeb, readWebpage, ingestToAing, main }` + `require.main` 守卫；require 冒烟（导出面完整）与 CLI 用法路径冒烟通过。**端到端搜索流仍未实跑**：`CONFIG.rawDir` 硬编码 `../raw` 不吃 `KB_ROOT`，e2e 会写真实知识源目录，留待有隔离方案时补跑 |

## 六、证据更正记录（对抗审查 R3 项）

第一轮报告「注入 payload 负向测试 PASS」表述**不实，更正如下**：
- 实测的是：① **机制层**——独立 `execFileSync` 参数数组代码片段对 shell 元字符 payload 的字面传参（验证参数数组本身不产生 shell 解释，非仓库文件）；② **单元级**——`node script.js --` argv 保留行为 + query.js `parseArgs` 对 `--` 的跳过 + 连字符 query 实机跑通 `src/query.js`。
- 测不了的部分明说：`src/search-and-ingest.js` 的 `:54/:112` 所在函数**端到端不可测**——该文件在 HEAD 即存量死码（§五 :347），require 与 CLI 均在到达搜索逻辑前崩溃（实测复现，HEAD 版同崩）。修复的正确性由语法检查 + 同构机制/单元级证据支撑，运行流验证缺席，待 :347 决策后补跑。
- 2026-11-03 追记：:347 已复活（§五），require/CLI 不再崩，但**端到端搜索→入库流仍未实跑**——`CONFIG.rawDir` 硬编码不吃 `KB_ROOT` 隔离，e2e 会写真实 `raw/`，补跑前需先给 rawDir 加隔离口。

## 七、对账口径

- 本文件对应改动：`src/run-metabolism.js`、`src/auto-ingest.js`、`verify-deploy.js`、`src/search-and-ingest.js`（各处 diff 见对应轮次变更清单）。
- findings 覆盖区 `execSync` 调用现存：`src/gap-detector.js:200`、`src/growth-director.js:525`、`src/metabolism-panel.js:31`、`src/init-knowledge-base.js:190/214/215`（均白名单/常量，§4.2 已入账）。
- 已知未覆盖区另列（第二轮复核补收，均不入 findings.json，预判常量/低风险；这正是开头 runStatus=inconclusive 漏报前提的实证）：`src/compile.js:461/462`（`git add -A` + `git commit --no-verify` 常量命令，即 auto-ingest.js:476-478 注释所述 2026-09-14 事故同款模式）、`src/memo.js:234`（`git status --porcelain=v1 -b` 常量，memo.js 本单禁触未动）、`tests/unit/compile-consistency.test.js:41/64`（`node "${…compile.js}" --base-dir "${tmpDir}"` 模板拼接，tmpDir 为本地构造，低风险）。
- 重扫触发条件：调用图补全、或上述待复核项决策落地、或新增外部输入面时。
