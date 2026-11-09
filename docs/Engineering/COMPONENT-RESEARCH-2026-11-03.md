---
tags: [engineering-docs:8]
---

# aing 全组件研究报告（2026-11-03 夜间自主研究）

> 研究方式：4 路 Explore 并行（知识管线 / 意识层 / 生长进化 / 接口运维），全部只读，结论带 file:line 证据。
> 触发：所有者点单「清完安全债后自己研究所有 aing 组件」。同夜完成：安全债收口（见 SECURITY-DEBT-TRIAGE-2026-11-03.md）+ 本报告。
> 副产物：selfModeling △→✓（跑 `node src/metacognition-layer.js self-check` 真测库刷新 self-state.json，measured=true），健康度仅剩 selfImprovement △（缺外部 SkillOpt 证据，诚实状态）。

## 一、体系总览

**进程拓扑**：`start-all`（父）→ `scheduler`（定时 30min + raw/ mtime 轮询 15s → spawn run-metabolism）+ `api-server`（:3789，AING_API_KEY 缺省则 127.0.0.1 本机信任）。agent-dashboard（另一 :3789 撞端口）是并行可选宿主面，按需另起。探针端口段 4199-4214 仅门禁假院用。

**数据流转（文字图）**：

```
raw/*.md ──compile──▶ wiki/entities+links（文件脑）
wiki/entities ──import──▶ SQLite entities+entity_metadata（DB 脑）
DB(pending)+raw 原文 ──distill──▶ wiki 蒸馏摘要节 + DB status=active
DB ──auto-link──▶ DB links ──link-sync──▶ wiki/links/*.md（双脑对齐）
DB ──vector──▶ entity_embeddings（384 语义，缺模型回退 64 哈希）
wiki ──sprout/pollinate──▶ 建议档（--apply 才落盘，链上默认半断）
wiki ──compress──▶ mustard-seeds/index.json（未产过芥子，目录空）
DB+wiki ──kespi──▶ kespi_history + metadata + wiki 状态块（八维加权）
wiki+DB ──prune──▶ pruned/archive/ + DB 六表清理（默认 dry）
链尾：sync-opt 治理出口 → metabolism-panel 面板 → metabolism-log 落库
```

**意识闭环（GWT 落地）**：事件入口（代谢尾/api/neural/文件感知）→ ConsciousnessEvent 归一（17 字段）→ kernel 三重抑制（456 源屏蔽/目标抑制/指纹去重）→ integrate 五因子注意力（0.35i+0.2c+0.25r+0.1u+0.1unc）→ 高价值反应三路广播（元认知审查/growth-docs 记忆/memo 仪表）→ KESPI 环境反馈回流（热点/活力因子/健康判定）→ stagnant 熔断（≥3 空转转 stagnant + 写 MetaKnowledge）→ growth-director → full_metabolism 解闩。

**生长决策链**：growth-director perceive 七信号 → decide 加权紧急度 → 9 动作优先级链（emergency_fix → full_metabolism → targeted_pollinate → compile → boost_growth → pollinate → scheduled → maintain → observe）。注意：director 与 gap-detector **松耦合**（director 自己 SQL 数缺口，gap-detector 五维拓扑口径只进面板）——两套「缺口」读数不同源不同义。

## 二、组件状态分级总表

**活（主干，有门禁钉住）**：knowledge-store、run-metabolism（11 步编排+锁+因果链）、compile、import-from-wiki、distill、auto-link、sync-links-to-fs、index-vectors、vector-search、semantic-vector、query、auto-ingest、ingest-scrub、kespi-check、sprout、pollinate、compress、prune、growth-director、feedback-loop、gap-detector、metabolism-panel、consciousness-kernel/event/layer/controller（活方法）、metacognition-layer、neural-guide-chain、guide-chain-swarm、neural.js、hermes-aing-adapter、api-server、scheduler、start-all、memo.js、memo-call 之外全部 memo 面、config-runtime、bootstrap、setup-db、db-time、trigger-log、metabolism-lock/log、tri-path-orchestrator（CLI）、seed-demo/unseed-demo（配对工具线）、tools/ 全部 6+负向自证。

**半死（在库未接管线 / 带坏死 bug）**：
| 组件 | 症候 | 证据 |
|---|---|---|
| memo-call.js | 三个 `.default` 取值全错（store/growthDirector/metacognition 均不导出 .default）→ new undefined 必抛被吞 → 四块读数恒 0+假风险 | memo-call.js:61/97/115 |
| memo-trigger.js | 上游 memo-call 坏死 → 触发只吐假风险；且不被任何模块 require | memo-trigger.js:18 |
| self-growth.js | 0 require 点；error-handler 唯一消费者 → error_log 全库 0 行 | grep 实证 |
| kespi-enhance.js | 消费方仅 self-growth/fix-kespi（低频应急） | fix-kespi.js:19 |
| sensory-ends.js | 唯一 require 方 neural-architecture 本身孤岛；且 _getFiles 只扫顶层，raw/inbox/ 子目录进不了快照（断线审计同形漏网） | sensory-ends.js:143-149 |
| neural-architecture.js | 「文件感知→意识」唯一自动通道，但全仓 0 require、不在任何主链——感知自动化实际缺位 | grep 实证 |
| trajectory-store.js | 头注声称 4 条自动写入链的方法根本不存在，轨迹只能手工 CLI 导 → M4 selfImprovement 的轨迹前提实际未供数 | trajectory-store.js 头注 |
| recycle-seeds.js | 回炉线唯一驱动位是 memo 建议行（人工），当前芥子目录空 → 物质循环断在半路 | memo.js:746 |
| show-kespi / generate-analysis-report / batch-ingest / config-hotreload | 各自 0 require / 只读重叠 / 一次性 / 仅测试引用 | 各组报告 |
| agnes-aing-adapter | 5 个 agnes_* 外部包全未安装 → 降级 null；入库面可用但只是本地记录器 | agnes-aing-adapter.js:70-88 |
| search-and-ingest --web 面 | 依赖 query.js 不存在的 `--mode web` → 恒落 fallbackSearch **伪造模拟结果入库**（污染风险，最刺眼） | search-and-ingest.js:55,73-96 |

**死码（建议归档或按登记处置）**：
- `boot-sequence.js`：0 require + 三处 `.default` 断流（真跑知识/生长/元认知三块必落 risks 分支）
- `interchange-router.js`：0 调用 + 策略档 config/interchange-routing.json 不存在，构造即抛
- `ner-extractor.js`：整文件死码，且顶层 require transformers——接线前必须改懒加载
- `fix-tags.js`：一次性修补脚本，模板全是历史专名，无任何入口（fix-kespi 有活链，勿混）
- `kespi-check-fixed.js`：AGENTS.md:141 裁定**有意保留勿删**（KD/KB 反转+KQ 改推导的变体），但自带未迁 parseDbTime 的 8h 时区病
- KnowledgeStore 4 死方法：saveLink/saveKespiHistory/getAllLatestKespi/resolveError（:349/:392/:415/:460）
- VectorSearch.indexAllEntities（:219）、keywordSearch（:189，不可达：唯一调用点要求 !isReady 而 init 恒置 true）

## 三、跨组病根模式（复发性）

1. **写读格式不对齐**：KESPI 写 wiki JSON block、读方用 YAML 正则恒返 0.5（已修两处，sensory-ends 顶层扫描是同形漏网）；system_log type 三方错配；metabolism-log 的 kespi_before 按 run_id 查 prev 而每轮 runId 重新生成 → **before/after 恒等，训练反馈信号恒 0**（metabolism-log.js:51-54 + run-metabolism.js:518）。
2. **`.default` 取值惯性**：memo-call（三处坏死）、boot-sequence（三处断流）——同一错误写法在不同会话反复出现。
3. **假仪表位**：panel.health.subchain_debts 硬编码 0（metabolism-panel.js:132 附近）、chains.top_guide_chains 恒 []（:153）、agent-dashboard 状态字段像真对接。
4. **建议无落点**：feedback-loop.autoTune 只写日志没人执行；memo 建议行是 recycle-seeds 唯一驱动。
5. **一致性靠口头契约**：metabolism-lock 2h 陈旧回收 vs run-metabolism 30min（:33 注释自认靠对方）；distill 自带锁不与 metabolism.lock 互斥，且 **distill/prune 两 DB 写端未接 metabolismBusy**——代谢持库期手动跑会整库快照互吞（last-writer-wins）。
6. **性能暗雷**：auto-link O(N²) 全配对；semanticSearch O(N) 全表 Float32 读；query searchCandidates 全表载入两遍；knowledge-store 每 run() 全量 export 落盘（写放大 O(库大小)）。

## 四、风险与缺口（按优先级）

**P0（建议尽快）**：
1. search-and-ingest --web 伪造数据入库面——接 query.js 真模式或禁用 fallback 入库（伪 URL 进 raw/ 会污染代谢链）
2. distill/prune 接 metabolismBusy 守卫（与 auto-link 等 17 个写端对齐，消 last-writer-wins 缝）

**P1（结构性机会）**：
3. **selfImprovement △ 唯一残账**：需外部 SkillOpt 检出+python 跑真 rollout，或 training-sim.js 产推演证据（影子模式只留档不判分）；trajectory-store 自动供数是其前提件
4. channelWeights 回路「记账不生效」：元认知回写的权重无读者参与 kernel attention 计算（五因子硬编码 consciousness-kernel.js:50-57）——GWT 情境偏置环节未闭合
5. metabolism-log before/after 信号修复（prev 查询改跨 run 口径）——SkillOpt Gate 的反馈信号源现在恒零差
6. 感知自动化接线：neural-architecture（含 sensory-ends 顶层扫描盲区修复）进 scheduler 或 start-all
7. memo-call/memo-trigger 收敛：修 `.default` 或按 P1-1 先例登记收敛进 memo.js（文档 MEMO-GUIDE.md 同步）

**P2（卫生与性能）**：
8. 坟场处置：fix-tags、ner-extractor、interchange-router、boot-sequence（或修复接线）；KnowledgeStore/VectorSearch 死方法清理
9. agent-dashboard 端口撞 api-server 且无 key 时全网开放——默认端口错开
10. auto-link/semanticSearch/query 的 O(N²)/O(N) 面：库上千实体前做 ANN 或预过滤
11. setup-db --reset 与 sql-migrate --status 绕过原子写；import/saveEntity+metadata 无事务包裹（靠 CASCADE+重跑收敛）
12. agnes 适配器降级状态字段明示「未对接」，防假仪表

## 五、健康度记录

- 2026-11-03 研究开始时：🟡 degraded（selfModeling △ + selfImprovement △）
- self-check 真测库后：🟡 **5✓/1△**，仅剩 selfImprovement（缺 SkillOpt 证据——正确状态，禁虚报）
- 安全债：已收口（见 SECURITY-DEBT-TRIAGE），全量 verify C0-C20 ALL GREEN ×2
- commit：被 Mimosa git-gate 首次拦截（77H/24M 全为已归因误报/可保留；闸不认归因账）——3 笔待收在工作树，处置三选一已登记 agent 待办（勿让 agent 自行拨 MIMOSA_GIT_GATE_MODE 开关）
