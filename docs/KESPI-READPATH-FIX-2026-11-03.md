---
tags: [kespi, readpath, defect-fix, kq, consistency, integrity, trend, decision-history, write-a-read-b, audit, must-read]
description: KESPI 读路径五处断线（A 读方正则脱节 / B getEntities 列撞 / C prune 死检查 / D growth-director 趋势读错真源 / E guide-chain-swarm 决策历史读错真源）+ 4 面写 A 读 B 审计（F getStats 双口径 / G panel subchain_debts 写死 / H kernel hasHistory 死旗标 / I system_log 孤写面）的修复记录与前后证据，含负向自证
---

# KESPI 读路径修复记录（2026-11-03）

> 本文档记录 aing 知识库「KESPI 分数写入 vs 读取」五处断线的定位、修复与前后实测。
> 任何后续改动 `src/kespi-check.js` / `src/compile.js`（写方）或 `src/prune.js` /
> `src/consciousness-layer.js` / `src/neural-guide-chain.js` / `src/knowledge-store.js`（A/B/C 读方）、
> `src/growth-director.js`（趋势 D）、`src/guide-chain-swarm.js`（决策历史 E）、
> `src/feedback-loop.js` / `src/setup-db.js`（system_log 写方与表定义）
> 前先读本文档，避免格式再次脱节。

## 一、病根：写方用 JSON，读方用 YAML 正则

KESPI 状态 block 由**写方**落盘，格式固定为 ```json 围栏：

| 写方 | 位置 | 写入格式 |
|---|---|---|
| 代谢首评前占位 | `src/compile.js` `formatKespiPending()` | ```json `{ "status":"pending", "overall":null, "dimensions":{} }` |
| 首评后改写 | `src/kespi-check.js`（:35-36） | ```json `{ "status":"computed", "overall":0.87, "dimensions":{KQ..KB} }` |

即 block 里写嘅系 **`"overall": 0.87`（带引号 JSON）**。

但**读方**全部用 **`/overall:\s*([\d.]+)/`（YAML 无引号）** 正则去提分数。
两者格式不同源 → 正则永远 0 命中。

## 二、五处断线（A / B / C / D / E）

### A — 4 处读方正则与 JSON 写方脱节（全库实测 0 命中）

| # | 读方 | 行 | 用途 | 断线后果 |
|---|---|---|---|---|
| A1 | `src/prune.js` | :82 | 剪枝「KESPI 过低」判定 | 永远读唔到 `overall` → 质量剪枝形同虚设 |
| A2 | `src/consciousness-layer.js` | :321 | `_getVitality` 实体活力 | 永远落默认 0.5 → 意识层热力图/热度排名失真 |
| A3 | `src/neural-guide-chain.js` | :154 | 导链实体活力 | 永远落时间衰减分支 → 注意力分配失真 |

全库 89 份 `wiki/entities/*.md` 实测：**YAML 正则命中 0，JSON 正则命中 88**（余 1 份 pending `overall:null`）。

**修法**：读方正则改 `/\"?overall\"?\s*:\s*([\d.]+)/`，JSON / YAML 两种写法都接。

### B — `getEntities` 列名撞：`entity.consistency` 食到错误表

`src/knowledge-store.js` 嘅 `getEntities()`（:308）与 `getEntity()`（:297）都写 `SELECT e.*, m.*`，
而 `entities` 表与 `entity_metadata` 表**都有一个 `consistency` 列**：

- `entities.consistency`（saveEntity 写入，默认 0.5）— 真值
- `entity_metadata.consistency`（KESPI 增强评估用，未评估=0.0）

`m.*` 喺后 → object 结果里 `.consistency` 永远被 metadata 嗰个（多为 0.0）盖过。
`src/kespi-check.js:90` 嘅 `_calcKQ` 读 `entity.consistency`，于是食到 0.0 而唔系 0.5。

**实测坐实**：试批 10 张 `entities.confidence=0.8`、`entities.consistency=0.5`，
但 `getEntities` 返返去嘅 object `.consistency=0`，KQ = 0.8×0.6 + 0×0.4 = **0.48**（仍红），
而唔系应得嘅 0.8×0.6 + 0.5×0.4 = **0.68**（过线）。

**修法**：`getEntities` / `getEntity` 将 `m.consistency` alias 为 `meta_consistency`，
令 `.consistency` 回归 entities 表真值；metadata 嗰个值另经 `.meta_consistency` 读取（不丢字段）。

### C — `prune.js` freshness 死检查

`src/prune.js:81` 读 `entityContent.match(/freshness:\s*([\d.]+)/)`，
但 `dimensions` 只有 8 个 key（KQ/KG/KA/KM/KD/KC/KR/KB），**根本没有 `freshness` 字段**——
全库 0 命中，该判定从未生效过（死代码）。

**修法**：删除死检查（freshness 新鲜度实际由实体文件 `mtime` 嘅「不活跃天数」判定承担，已存在）。

### D — `growth-director.js` KESPI 趋势读错真源（断线 8）

`src/growth-director.js:334` `_calcKespiTrend`：

- **旧**：`SELECT kespi_avg FROM system_log WHERE type = 'kespi_check' ORDER BY created_at DESC LIMIT 1 OFFSET 1`
- **本仓实况**：`system_log` 全表 0 行（唯一写手 `feedback-loop.js:265` 写 `type='feedback'`；`type='kespi_check'` 从未被写过）
- **后果**：`previous` 永远 fallback 到 `current` → `decline` 恒 0 → KESPI 下降探不到（趋势线永远 stable）
- **修**：改读 `kespi_history`（每轮逐实体 INSERT、`created_at` 分轮），取倒数第二批次 `AVG(overall_score)` 作 `previous`

### E — `guide-chain-swarm.js` 决策历史读错真源（断线 9）

`src/guide-chain-swarm.js:256` `StrategyAgent._getDecisionHistory`：

- **旧**：`SELECT action, created_at FROM system_log WHERE type = 'decision' ORDER BY created_at DESC LIMIT 10`
- **本仓实况**：`type='decision'` 全仓 0 行（唯一写手 `feedback-loop` 只写 `type='feedback'`）
- **后果**：`history.length` 永远 0 → 「近期多次 observe 无动作 → boost_growth」辅助判断永不触发
- **修**：改读 `logs/metabolism-decision-lineage.jsonl`（每步决策谱系，append-only，本仓 172 行真实数据）最新 10 条；保留 `{action, created_at}` 字段同旧接口一致
- **诚实边界**：真源记录嘅 `action` 系代谢步骤动作（`execute` 157 / `summarize` 15，无 `observe`），故消费方 `a.action === 'observe'` 子判断如实返回 0——唔硬造

> D/E 同 A/B/C 同病根（读 A、真源喺 B），但**另系一族**：A/B/C 系「写 JSON、读 YAML 正则」格式脱节；D/E 系「写 system_log 用单一 key `'feedback'`、读方各读唔存在嘅 key」契约对唔上。修复一律朝「真源」改（`kespi_history` / lineage jsonl），唔改写入端（避免副作用）。

## 三、修复前后实测

### 修复前基线（2026-11-03，存 `.temp/kespi-before.txt`）

- KQ 维度：**88/89 红（0.00）**、1 条 session 实体 0.9 过线
- 全库 92 实体（active 89 / done 2 / pending 1），主体欠账系 76 条 `data-analysis-*` Concept（conf=0）
- 试批 10 张经典卡（K-Means / AdaBoost / SVM / 随机森林 / 决策树 / 线性回归 / 逻辑回归 / 朴素贝叶斯 / KNN / 机器学习数学基础）标 `confidence: 0.8`

<!-- FIX-VERIFY-ANCHOR: 修复后实测数字追加于此，勿删本锚点 -->

### 修复后实测（2026-11-03，存 `.temp/kespi-after3.txt`）

| 指标 | 修前（基线） | 修后 | 变化 |
|---|---|---|---|
| KQ 维度红（<0.5） | **88/89**（全 0.00） | **79/90** | 降 9 条过线 |
| KQ 过线数 | 1/89（1%） | **11/90（12%）** | +10（试批） |
| 试批 10 张 KQ | 0.00 | **0.68**（过线） | conf=0.8 + cons=0.5（修 B 后 entities.consistency 真值回归） |
| `_getVitality`（修 A） | 永远 0.5 默认 | **0.87**（真实 KESPI 分） | 读方正则 JSON 兼容生效 |
| `getEntities` 列撞（修 B） | `.consistency` 恒 0（被 metadata 盖） | `.consistency`=0.5 / `.meta_consistency`=0 **两列分离** | alias 生效 |
| KESPI 趋势 current/previous（修 D） | previous 恒 =current（system_log type=kespi_check 0 行 → fallback）→ decline 恒 0 | current=0.837 / previous=0.841 **真分离**，decline=0.0049 | 改读 `kespi_history` 倒数第二批次均值（`.temp/verify-trend-decision.js` 真跑断言） |
| 策略型 Agent 决策历史（修 E） | 永远 0 条（system_log type=decision 0 行） | **最新 10 条真数据**（lineage jsonl），`{action,created_at}` 字段不变 | 改读 `logs/metabolism-decision-lineage.jsonl`；诚实边界：真源无 `observe`，故 observe 子判断如实 0 |

- **行为层自证**：`.temp/verify-kespi-readpath.js` 10/10 ALL PASS（正则对真实 computed 档提返 0.87、旧 YAML 正则 0 命中坐实断线、pending 档落默认分支、`_getVitality` 真跑 >0.5、两列分离、KQ 手算 0.68）
- **全量代谢**：`node src/run-metabolism.js` → 「🟢 代谢成功：所有关键步骤均已完成」
- **验收**：`node verify-deploy.js` exit 0 → **ALL GREEN（C0-C20，32 项 @30d78ca）**
- **最后一米**：L1 备忘录联通（state=integrating / vectorSearch=semantic-384 / 六组件链接齐）；L2 本修复会话入库（session=`kespi-readpath-fix-20261103`，落 `raw/inbox/` 成档 `status=pending-distillation` / `confidence=0`，WAL 余 0）

> **仍红的 79 条**：系 76 条未 review 嘅 `data-analysis-*`（conf=0）+ 其余外部投喂，诚实基线——佢哋真系未经「人工确认→confidence」这一步。要转绿需逐条 review（同试批同法：raw frontmatter 加 confidence 重编译），唔系 bug。

## 四、负向自证（防止检查静默失效）

1. 读方正则改后必须仍能在 ```json 围栏里提返 `overall`（对一份真实 computed 档跑 `shouldPrune`/`_getVitality` 断言 > 0.5）
2. 对一份 `kespi_status: pending` 档（`overall:null`）断言读方仍落默认分支（唔会拿到 null 值误判）
3. `getEntities` 改后断言 `.consistency` 等于 entities 表值、`.meta_consistency` 等于 metadata 表值（两列分离）
4. 趋势（修 D）改后断言 `previous ≠ current`（`kespi_history` 有 ≥2 轮时两批次均值分离；`system_log type=kespi_check` 0 行坐实旧路径断线）
5. 决策历史（修 E）改后断言 `history.length > 0`（lineage jsonl 有数据）；对真源无 `observe` 断言 observe 子判断如实 0（唔硬造）

> 行为层验证脚本：`.temp/verify-kespi-readpath.js`（A/B/C，10/10）、`.temp/verify-trend-decision.js`（D/E，5/5）。

## 五、收工门槛

- `node --check` 改过 6 个 JS（prune / consciousness-layer / neural-guide-chain / knowledge-store / growth-director / guide-chain-swarm）全过
- 全量代谢（compile→import→vector→kespi）跑通
- KESPI 复测：KQ 红数由 88 降、试批 10 张 KQ 0.48→0.68 过线；趋势 current/previous 分离（修 D）、决策历史有真数据（修 E）
- `node src/metabolism-panel.js` 重生成 → `node verify-deploy.js` ALL GREEN（C0–C20）
- 最后一米 L1（memo --summary）+ L2（一条会话真入库 WAL 余 0）

> **提交谱系**：A/B/C 已随 `7f34a77` 提交；D/E（growth-director / guide-chain-swarm）为后续批次，须另开 commit。文档本段（含 D/E 修复逻辑 + 行为层脚本 `.temp/verify-trend-decision.js`）随 D/E commit 入。

## 六、4 面写 A 读 B 审计（metabolism-panel / api-server / consciousness-kernel / feedback-loop，2026-11-03）

> A-E 修完后照单补的 4 面「写 A 读 B」扫描。方法：每面先 grep 写口/读口，再对每个疑点**真跑探针**（DB 副本 `.temp/probe-knowledge.db`，绝不脏真库）后才定罪或销账。结论 4 条：F/G/H 修、I 登记不修。

### F（原拟 D2）— getStats().avgKespi 全表口径 vs 面板活跃口径（双仪表台）

| 项 | 值 |
|---|---|
| 断线 | `knowledge-store.js getStats()` 旧为 `AVG(kespi_score)` **全表**（含未评分 0 分行与归档残留行）；而 metabolism-panel / memo / growth-director 读的是**活跃口径**（`e.status='active'` 且 `score>0`） |
| 后果 | 一旦剪枝/销办留痕累积（C10b 预期「归档留痕会让两口径不等」），`/api/status` 与 `/api/context` 的 `avgKespi` 会被 0 分行拉低、与面板读数分叉——同形 A-D 的另一实例 |
| 修前实测 | 全表 0.837472… = 活跃 0.837472…（当前 0 行归档残留，暂未分叉，属「口径已分叉、留痕即红」的潜伏面） |
| 修 | `getStats()` 改活跃口径单源 SQL（与 metabolism-panel.js 同一口径） |
| 修后自证 | `.temp/probe-final.js`：`getStats().avgKespi` = 活跃口径值，**已对齐单源活跃口径** |

### G（原拟 D3）— 面板 subchain_debts 写死 0（假仪表台）

| 项 | 值 |
|---|---|
| 断线 | `metabolism-panel.js` `health.subchain_debts: 0` 硬编码；蒸馏债真源 = `entities WHERE status='pending-distillation'` 计数（memo.js distillDebt 同源 SQL） |
| 后果 | distill 未兑付时面板仍报 0，agent 读 panel 看不到债（memo 侧报警、panel 侧假痊愈——写 A 读 B 的仪表台变体） |
| 修 | 面板改读 `pending-distillation` 计数（与 memo 同一张表同一规则，纪律 2 双证据） |
| 负向自证 | `.temp/neg-d3.js`：DB 副本插 1 条 pending-distillation 探针 → 计数 0→1（证明接真源非写死）；探针在 `.temp/` 副本，真库零污染 |

### H（原拟 F1）— kernel processReactions hasHistory 死旗标

| 项 | 值 |
|---|---|
| 断线 | `consciousness-kernel.js` `processReactions` 读 `Boolean(context.hasHistory)`，但 `ingest` 传嘅 context 只有 `{accepted, suppressed, stagnationCount}`——全仓**零个调用方**传 `hasHistory`（grep 坐实）→ 恒 falsy，`growth-loop.routeMemory` 嘅 `retrieve` 支路（`hasHistory || …`）经意识层入口永不可达 |
| 后果 | 同 target 重复事件唔会走 retrieve（取回已有历史），记忆路由决策文档恒写「有历史：false」 |
| 修 | ingest 在 integrate **前**抓 `seenTargets`（kernel activeEvents 滚动缓冲 = 本 kernel 的历史），context 带 `hasHistoryTargets` Set；`processReactions` 改读 `context.hasHistoryTargets.has(reaction.target)`。真源唔新增（纪律 5：唔新设阈值，只换数据源） |
| 行为自证 | `.temp/probe-f1.js`（隔离 KB_ROOT）：修前两轮同 target `hasHistory` 全 false（死旗标坐实）；修后第一轮 false、第二轮 **true**（同 target 读到历史） |

### I（原拟 F2）— system_log 孤写面（登记「在库未接管线」，不修）

| 项 | 值 |
|---|---|
| 事实 | `system_log` 表全仓唯一写手 = `feedback-loop.js logFeedback`（type='feedback'）；探针实测**全库 0 行**（`logFeedback` 只在 `--auto-tune` CLI 分支被调，无人驱动），**零读手** |
| 处置 | 唔造假读手（纪律 2/4：唔虚构能力声明）。登记「在库未接管线」——feedback-loop 系 M4 手动快照对比工具，唔系默认代谢 11 步之一；将来接线须走「驱动方 + 读方 + 负向自证」全流程，唔改改就收。同 `kespi-check-fixed.js`（2026-11-02 决策）同一纪律先例 |
| 关联 | D/E 修后 `growth-director`/`guide-chain-swarm` 已唔读 system_log（改读 kespi_history / lineage jsonl），D/E 之前 system_log 另有两个「读唔存在 key」嘅断线（type='kespi_check' / 'decision'），一齊销账 |

### 4 面审计收工门槛（同 A-E 同一口径）

- 改过 3 个 JS（knowledge-store / metabolism-panel / consciousness-kernel）`node --check` 全过
- 行为层：H 探针修前 false→修后 true；G 探针插探针条 0→1；F 探针 getStats=活跃口径
- 全量代谢 11 步成功 + `node verify-deploy.js` **ALL GREEN（C0–C20，32 项）**
- 未做：给 feedback-loop 造假读手（I 明拒）；未动 C19 计数（32 项不变）、未动 11 步代谢步数

## 六-补、断线 J — prune 断链清理中文 ID 正则误删（破坏性，2026-11-03 第四轮）

> <zpd-yard> 院 agent 先报此 bug（362 链档误删 307），本仓独立复核坐实且**更严重**（链档 4035、含中文 ID 3254）。

| 项 | 值 |
|---|---|
| 断线 | `prune.js cleanupBrokenLinks()` 旧正则 `/source:\s*([\w.-]+)/`：JS `\w` 唔匹配中文字，中文实体 ID `data-analysis-100个Excel函数与公式应用` 被截成 `data-analysis-100` → `existsSync(entities/data-analysis-100.md)` 假阴性 → `unlinkSync` **误删有效链档** |
| 前科注脚 | 原注释「实体 ID 含连字符，`\w` 不够」——之前修过一次（加 `.-`），**漏咗中文** |
| 后果 | 触发面：`prune --force` 或代谢链 `pruneAutoForce`（`AING_PRUNE_AUTO_FORCE=1`）即爆。默认 dry-run 保护住，但一开闸就一次删走 **3255/4035 链档（80.9%）** |
| 本仓探针 | `.temp/probe-prune-links.js`（双正则对照，走真库 wiki 面只读）：旧 `\w` 误删 3255、新整行值正则误删 465 |
| 465 条二次复核 | `.temp/probe-prune-broken-class.js`：465 条**全部真断链**（实体档完全不存在，0 条连字符/下划线脱节）→ 删佢哋系正确行为，唔系又一层脱节 |
| 修 | `prune.js:228-229` 正则改行首锚定 + 整行值：`/^source:\s*(.+?)\s*$/m`、`/^target:\s*(.+?)\s*$/m`（frontmatter 单一 key，整行值吃中文） |
| 修后自证 | 旧 3255 误删 → 新 465（全真断链，0 误删）；prune dry-run 0 剪枝正常；全量代谢 11 步全绿 + verify-deploy **ALL GREEN（C0–C20，32 项）** |
| 行为层教训 | 本断线系「破坏性操作靠 regex 提取值」——同形坑 15（接线类断言必须真跑）：唔真跑 `cleanupBrokenLinks` 函数体，只 grep 正则永远看不见中文截断 |

## 七、院际对齐记录（<zpd-yard> 院，2026-11-03）

> D/E（断线 8/9）曾在 <zpd-yard> 院被另一 agent 平行自改（worktree 12 个 tracked 档 + 2 份自写 KESPI-DISCONNECT 文档，未 commit），与本仓 D/E 修复**字面不同源**——按纪律 9（部署与源码零偏移）与 C18（跨院字面差异须销账），本仓 `70bfbd1` 为真源，<zpd-yard> 须对齐。（院实际路径：E 盘 ZPD 子目录，C8 盘符脱敏以 `<zpd-yard>` 代；对齐操作在该院 cwd 内 `git reset --hard origin/main`。）

| 步 | 动作 | 结果 |
|---|---|---|
| 1 备份 | `<zpd-yard>-backup-20261103-r1\`（tracked-dirt.patch + 2 份自写 KESPI-DISCONNECT 文档 + growth.config.js.pre） | 该院未提交面全部留痕，可复原 |
| 2 对齐 | `git fetch` + `git reset --hard origin/main`（<zpd-yard> 有独立 git + 共享 remote doerking/aing） | <zpd-yard> HEAD → `70bfbd1`（origin/main）；`src/growth.config.js`/`knowledge.db` 被 gitignore，runtime 面存活 |
| 3 销账 | 本仓 `node tools/verify-sibling-roots.js --root ZPD=<zpd-yard>` | **真实漂移 0**（原 23）· 仅行尾 45（CRLF/LF 噪声）· 对方缺失 1（`cantonese-nlp-agent.md` 未跟踪档，不随 reset，预期）· 库结构一致 |

**结论**：D/E 跨院字面差异自此销账、两院同源（均以 `70bfbd1` 为准）；C18 院际比对**未豁免**——对齐后 `verify-sibling-roots` 真跑出 0 漂移即证明。45 项仅行尾差异系历史 CRLF/LF 噪声，非内容代差（建议包根加 `.gitattributes` 统一 eol 后重检出，属未决事项，不阻塞本次）。
