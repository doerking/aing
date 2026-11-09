---
tags: [aing, 死码处置, 孤悬, W9, 归档登记, origin-trust, engineering-docs:8]
description: W9 两处死码处置记录——boot-sequence 修 .default 接线（有真互补面，取「修并接线」）+ interchange-router 归档登记（0 调用 + 构造即抛，取「归档不删」学 db-time 死孪生先例）
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'e7424e54-0be2-4015-a91c-d56a7a426f57'
  PropagateID: 'e7424e54-0be2-4015-a91c-d56a7a426f57'
  ReservedCode1: 'b96cb875-1b94-406c-92cd-66e57ccb3225'
  ReservedCode2: 'b96cb875-1b94-406c-92cd-66e57ccb3225'
---

# 死码处置记录 W9 — 2026-11-03

> 工单 W9（P2，小）两处死码，按「不悬置、不硬造、最小改动」处置。证据一律 file:line，矛盾原样呈现。

## ① boot-sequence.js — 修 `.default` 并接线（取二选一之 a）

- **病灶**（现场取证）：三处 `new modules.X.default(...)` 全断流——
  - `:63` `new modules.store.default(...)`，但 `knowledge-store.js` `module.exports = KnowledgeStore`（class 本体，无 `.default`）
  - `:101` `new modules.growthDirector.default(...)`，但 `growth-director.js` `module.exports = { GrowthDirector, ACTIONS, URGENCY_LEVELS }`（命名导出，无 `.default`）
  - `:121` `new modules.metacognition.default({stateDir})`，但 `metacognition-layer.js` `module.exports = MetacognitionLayer`（class 本体，且 `constructor()` 无参）
  - 结果：三块知识/生长/元认知**真跑必落 risks**（not-a-constructor），0 外部 require（boot-sequence 是纯孤悬）
- **处置**（取 a「修并接线」，因有真互补面——boot 的「第一印象」识态聚合与 memo 仪表盘互补，且改动最小仅 3 行）：
  - `store` 去 `.default` → `new modules.store(dbPath)`（knowledge-store class 本体）
  - `growthDirector` 去 `.default` → `new modules.growthDirector(dbPath)`（perceive/decide/consecutiveStagnant/Healthy API 均在位 :81/:115/:72/:73）
  - `metacognition` 去 `.default` + 去多余 `{stateDir}` 参数 → `new modules.metacognition()`（MetacognitionLayer constructor 无参 :103，selfState 读固定 selfStateFile）
- **验收证据**（2026-11-03 真跑 `node src/boot-sequence.js`）：
  - 修后 `loadModules()` 返回的三成员全为可构造 class（`typeof === 'function'`）；旧 `.default` 全 `undefined`（坐实断流根因）
  - 端到端真跑出识态：**知识库 KESPI 0.84 / 96 实体**、**意识 integrating / 200 活跃事件**、**生长 targeted_pollinate / critical**、**元认知置信 0.67**——三块不再落 risks
- **不接线消费方**（红线：最小改动）：boot-sequence 仍 0 外部 require，留作宿主侧「对话开场自检」按需调用（同 AGENTS「在库组件」登记口径，不塞进默认 11 步代谢链）

## ② interchange-router.js — 归档登记（取二选一之 b，学 db-time 死孪生先例）

- **病灶**（现场取证）：
  - `:21-26` `loadPolicy` 默认读 `config/interchange-routing.json`，该档**不存在**（实测 `Test-Path = False`）→ 不传 `policy` 构造即抛 `invalid interchange policy`
  - `:238` `module.exports = { InterchangeRouter, loadPolicy, LANES }`，全仓 0 外部 require（0 消费方）
  - 但**组件本身健康**：传最小 `policy`（含 `defaultLane`/`relations`/`safety`）后探针跑通——`scanned=1 / accepted=1 / paths=1`（2026-11-03 实测，`.temp/w9-router.txt`）
  - 真库 links 表只有 1 种 relation `related`（4224 条），无 supports/contradicts 等多样关系
- **处置**（取 b「归档登记」，**不删、不硬造消费方路径**——接消费方=为消一条死码凭空开新链路，违背最小改动 + 工单红线 5）：
  - 文件**保留在库**（`src/interchange-router.js` 不删，学 db-time「归档≠删」先例）
  - 登记为**在库孤悬**：只读路由器（safety 全 false：allowAutoPromote/allowHighRiskExecution/candidateMayRouteToActive 恒 false :144-146），能力面是「跨 lane 关系安全路由 + 冲突检测 + 路径生成」，但 0 消费方、默认策略档缺失
  - 不补默认策略档、不接 query.js 消费方（避免为孤悬组件开新路径；复活时再按需补）
- **复活条件**（明确登记，非悬置）：
  - 接入查询侧安全路由（`query.js` 调 `InterchangeRouter.route` 做关系安全过滤，补 `config/interchange-routing.json` 最小版：`defaultLane=structure` + `relations.related={lane:structure,minConfidence:0.5}` + safety 全 false）
  - 或代谢链需跨 lane 证据路由 / 多 relation（supports/contradicts）建链时
  - 复活须走「改码 + verify-deploy ALL GREEN + 负向自证」全流程（同 AGENTS 组件全绿纪律）
- **与主线的关系**：interchange-router 是并行只读能力面，非默认管线；不碰 C0-C20 门禁计数、不碰 11 步代谢步数（那些真值不动）

## 收口

- 两档均**不悬置**：boot-sequence 修通留档（证据真跑），interchange-router 归档登记留档（复活条件明确）
- 本档本身是「处置记录」（诚实纪律 5），不是「宣称已上线能力」——interchange-router 仍标「在库孤悬、未接默认接线」
- 部署后 `verify-deploy.js` 须保持 ALL GREEN（boot-sequence 修 `.default` 是源码面改动，走同一验收面）
