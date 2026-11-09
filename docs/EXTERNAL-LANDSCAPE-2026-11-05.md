---
tags: [landscape, benchmark, skill-evolution, local-first, consciousness-layer, gate-discipline, docs:8]
description: aing 与外网 30+ 同类项目/论文的结构同形对照——四件独占面判定（2026-11-05）
date: 2026-11-05
baseline: aing @ f9313f5 (origin/main)
---

# aing 外部同类扫描（2026-11-05）

> 基于对 aing 这几天经手全部改动（A 类身份纪律 / B 类投影改吃 DB / C 类边档名 / D 类文檔口徑 + 32 项门禁 + 11 步代谢 + 意识层 + SkillOpt 训练场）形成的架构画像，对外网 30+ 项目/论文做结构同形对照。
>
> 判定口径：「同形」指组件概念或架构模式可对应；「独占」指四件以上同形组件**同时**出现且被门禁纪律钉死的接口连接。

## aing 核心画像

1. **本地零依赖知识代谢引擎**：`raw/` → 11 步代谢管线 → wiki 实体 + 链接图谱 → sql.js 库，全本地、无外呼、无 Docker
2. **身份纪律**：agent 嘅任何显示都係知识主体（入库归因、去重键含 role、拒绝静默兜底，`|| 'user'` 全仓清零）
3. **意识层**：五态状态机（idle/integrating/focused/aroused/stagnant）+ 事件 kernel + 停滞熔断 + 元认知自评 + 离散旋钮单源（config.consciousness）
4. **技能自进化**：SkillOpt ReflACT 六阶段 + 对抗审查 + 持久 goal；训练场（`<sqa-root>`）同生产仓分离，`training/adapter.py` 係源料唔係可導入嘅檢出
5. **门禁文化**：32 项 verify-deploy 全绿 + 负向自证 + 双证据制度 + 史实/现状分口徑（`**历史实录**` 记号）

## 同形对照矩阵

### ① 最像 — 程序性知识层 + 使用衰减（对应 growth-loop / FadeMem）

| 项目 | 同形点 | 差异 |
|---|---|---|
| **Innate**（vima-tech/Innate） | 「可嵌入可外挂、自成长、引擎可换嘅 agent 程序性知识层；每一块知识从进库起都在被真实使用结果考核：好用嘅升权，失效嘅降权归档」 | 同 aing `growth-loop.js decay`（weight < 1.0，三因子 time/usage/quality）几乎逐字对应。Innate 用 Python + 外挂；aing 用 Node + 本地代谢管线。Innate 无意识层、无 KESPI、无 32 项门禁 |
| **SEL / Selm**（arXiv 2026-10） | 多技能 agent 技能库生命周期管理——retain/remove 按效果 | 同 aing SkillOpt 四门回滚链同形；SEL 係 benchmark 导向（4 个 benchmark），aing 系真仓真跑 |
| **Ratchet**（arXiv 2026-10） | 技能 curation + lifecycle（prune 失效技能、accumulate 有用经验） | 同 aing `prune --force` + `recycle-seeds.js` 同根；Ratchet 用 LLM 裁判，aing 用 KESPI 数值 |
| **agentdb**（ruvnet/agentdb） | 单文件认知容器：vectors + indexes + learning state + cryptographic audit trail；反馈提升 36% | 单文件同 aing knowledge.db 同形；audit trail 同 aing decision-lineage.jsonl 同根。agentdb 有反馈学习环，aing 用代谢+蒸馏双环 |

### ② 次像 — 本地零依赖知识图谱 + agent 记忆（对应存储面）

| 项目 | 同形点 | 差异 |
|---|---|---|
| **Astrivya**（astrivya/astrivya） | 「Local-first knowledge graph for AI coding agents；单 SQLite 文件；no server, no API keys, no cloud；offline；兼容 Claude/Cursor/Cline/Codex」 | 跟 aing「全本地、零外呼、sql.js 嵌库」架构几乎一样。Astrivya 只俾记忆，唔做代谢管线、唔做意识层、唔做技能进化 |
| **graphiti-local**（renezander030） | 本地时序 KG；Ollama 本地推理；「You approve what they learn；proposed updates stay in a separate queue until a human approves」 | 同 aing「候选只提案不落地」+「四门回滚」同形；graphiti 多咗个 human-approval 门（aing 用 KESPI 首评替代） |
| **waypath**（TheStack-ai/waypath） | SQLite-backed CLI；graph-aware recall + governed memory；zero cloud dependencies | 同 aing `node src/query.js` + 知识检索面同形，但冇代谢、冇意识层 |
| **cozo-memory**（tobs-code/cozo-memory） | CozoDB embedded in Node.js；No cloud, no Docker, no external services | 纯嵌入 Node 同 aing sql.js 同根；cozo 冇 11 步管线 |
| **keimenon**（tsolomon89/keimenon） | local-first AI KG + agent runtime；provenance-preserving；ingest messy source material → navigable graph | 同 aing「raw/ → compile → 实体 + 链接」同形；keimenon 更重「溯源」，aing 更重「代谢 + 蒸馏」 |

### ③ 意识层 — 同形但唔同粒度

| 项目 | 同形点 | 差异 |
|---|---|---|
| **Cognitive Companion**（arXiv 2604.13759） | LLM agent 多步任务中推理退化/循环/漂移/停滞检测；并行监控，零开销探针式伴侣；降低循环率 52-62% | 跟 aing `stagnationCount` 熔断 + `recordCycleResult()` 同根。Cognitive Companion 係 per-task 监控（任务内），aing 系 per-cycle 监控（代谢轮次间），粒度唔同但概念同形 |
| **DS-MCM**（lacuna.tiptreesystems） | 两层元认知监控：fast（confidence vs evidence 不匹配）+ slow（历史成功/失败记忆做校正指导） | 同 aing「kernel fast state + metacognition self-state.json slow readout」两速架构同形 |
| **retro_cogos Layer 5**（daijinru） | self-monitoring 检测 reasoning struggling/stagnant | 概念同形；retro 係 safety-first（防失控），aing 係 growth-first（防停滞→促代谢） |
| **「The missing state: I'm not sure」**（moltbook） | 指出所有 production agent 都冇 uncertainty state | 同 aing 五态状态机撞——外网普遍只有 binary（confident/refuse），aing 有五态 |

### ④ 技能自进化 — 最成熟领域

| 项目 | 同形点 | 差异 |
|---|---|---|
| **Voyager**（NeurIPS 2023, arXiv:2305.16291） | ever-growing skill library of executable code | aing SkillOpt 同根；Voyager 系 Minecraft 封闭环境，aing 系本地知识仓开放环境 |
| **Reflexion**（Shinn 2023, arXiv:2303.11366） | linguistic feedback + episodic memory 自我改进 | aing 四门回滚 + 因果链比 Reflexion 严（Reflexion 冇回滚、冇门禁） |
| **SkillWeaver**（arXiv 2504.07079） | web agent 从 interaction traces 发现 + 磨炼技能 | 同 aing「训练师角色 + rollout 产物回填」同形 |
| **SkillEvolver**（arXiv 2605.10500） | skill learning as meta-skill；产出可被另一 agent load 嘅 self-contained domain skill | 同 aing「assets/skills/ 自携技能 + 宿主按需加载」同根 |
| **Mnemosyne**（nianpangzhi233） | local-first memory + KG retrieval + predictive validation + dream consolidation + governed skill evolution via MCP | 同 aing「代谢 + 蒸馏 + 剪枝 + 技能归档」多环架构同形；Mnemosyne 多「dream consolidation」（aing 无此概念，用 `recycle-seeds.js` 替代） |

## 独占面判定

**冇第二个项目同时具备以下四件：**

1. **本地零依赖 11 步代谢管线**（raw → 实体 → 链接 → 向量 → 蒸馏 → 剪枝，全 Node + sql.js，无云无 Docker）
2. **意识层五态状态机 + 停滞熔断 + 离散旋钮单源**（Cognitive Companion 只有 detect，冇 growth-director 驱动 + recordCycleResult 闭环写端）
3. **32 项门禁 + 负向自证 + 双证据制度**（外网冇第二个项目用 verify-deploy 全绿做部署铁律 + 每改必负向证明 + 文档史实/现状分口徑）
4. **技能自进化接在外部训练场**（SkillOpt ReflACT 六阶段 + 对抗审查 + 持久 goal，训练场同生产仓分离）

单独拿任何一件出嚟，外网都有近亲：

| 单件 | 外网近亲 |
|---|---|
| 本地 KG + 零云 | Astrivya / waypath / cozo-memory / graphiti-local / keimenon |
| 技能库生命周期 | SEL / Ratchet / Voyager / SkillWeaver / SkillEvolver |
| 停滞检测 | Cognitive Companion / DS-MCM / retro_cogos |
| 使用衰减 | Innate / agentdb / Mnemosyne |

**但四件同时 + 门禁纪律 + 身份纪律（agent 嘅显示就係知识主体、role 唔得静默兜底、去重键含 role）叠埋，冇嗰个一样。**

最接近嘅「整体架构同形」係 **Innate**（程序性知识层 + 使用衰减 + 可外挂引擎可换），但 Innate 冇意识层、冇 KESPI、冇 32 项门禁。

最接近嘅「存储面同形」係 **Astrivya**（单 SQLite + 本地 + 零云），但 Astrivya 冇代谢管线、冇技能进化。

## 一句话

aing 唔係任何一个外网项目嘅翻版，但每一个单一组件都搵得到近亲。独有嘅係**组件间嘅纪律连接**（门禁钉死每个接口、双证据、负向自证、身份不兜底）——呢啲文化层嘢，外网冇人照做。

## 对标 URL 速查表

| 项目 | 网址 |
|---|---|
| Innate | https://github.com/vima-tech/Innate |
| SEL / Selm | arXiv 检索命中「Selm: Self-Evolving Library Management for Multi-Skill Agent Optimization」（2026-10 提交；精确编号按标题重检索确认） |
| Ratchet | arXiv 检索命中（2026-10；技能 curation + lifecycle，SkillWeaver 衍生；精确编号按标题重检索确认） |
| agentdb | https://github.com/ruvnet/agentdb |
| Astrivya | https://github.com/astrivya/astrivya |
| graphiti-local | https://github.com/renezander030/graphiti-local |
| waypath | https://github.com/TheStack-ai/waypath |
| cozo-memory | https://github.com/tobs-code/cozo-memory |
| keimenon | https://github.com/tsolomon89/keimenon |
| Cognitive Companion | https://www.alphaxiv.org/zh/abs/2604.13759（arXiv 2604.13759） |
| DS-MCM | https://lacuna.tiptreesystems.com/work/deep-search-with-hierarchical-meta-cognitive-monitoring |
| retro_cocos Layer 5 | https://deepwiki.com/daijinru/retro_cocos/5.5-layer-5:-meta-cognitive-safety |
| 「The missing state」 | https://moltbook.com/post/7b758992-9b54-4672-aef9-ea6da6b1557c |
| Voyager | https://arxiv.org/abs/2305.16291 / https://github.com/minedojo/voyager |
| Reflexion | https://arxiv.org/abs/2303.11366 |
| SkillWeaver | https://arxiv.org/html/2504.07079v1 |
| SkillEvolver | https://arxiv.org/html/2605.10500 |
| Mnemosyne | https://nianpangzhi233.github.io/Mnemosyne-AI-Memory/ |
| SearchSkill | https://arxiv.org/html/2605.09038v3 |
| SkillRL | arXiv 检索命中「SkillRL: Evolving Agents via Recursive Skill-Augmented Reinforcement Learning」（SkillBank 层级技能库 + 经验蒸馏；精确编号按标题重检索确认） |
| SimSkill | arXiv 检索命中（2026-09-11 提交；self-evolving LLM agent for skill + knowledge accumulation in traffic simulation；精确编号按标题重检索确认） |

> 注：SEL / Ratchet / SimSkill 係 arXiv 检索标题，上表列嘅係检索命中描述；若要精确 DOI 须按标题重检索确认。其余嘅 GitHub/arXiv 直链同检索命中一一对应。

## 搜索覆盖

- 搜索时间：2026-11-05 03:03 UTC+8
- 搜索词组（5 组）：self-evolving LLM agent knowledge base / Reflexion Voyager skill weaver / KESPI entity quality scoring / agent metacognition consciousness stagnation / local-first knowledge graph Node.js
- 有效结果来源：exa_mcp、searchfree、bff_web、wikipedia
- 被截断/不可用来源：jina_search（401）、gdelt（超时）、marginalia（429）、bff_web（超时，第 2-5 组）
