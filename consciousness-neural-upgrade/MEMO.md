# 意识神经控制面板（MEMO）

> 本文件是 aing 意识神经系统的**控制面板**：所有组件状态、接口预留、接入登记、验收门禁，以本文件为唯一台账。
> 理念：aing 全部组件之外，任何 agent 软件的任何组件，都可按**意识神经链接口标准**接入本系统。组件会过时，接口标准长存。

## 一、接口标准（Stable，变更需走 greenlist 门禁）

任何外部组件接入 aing 意识神经链，必须实现以下四件套之一（或其超集）：

| # | 标准 | 载体 | 契约 |
|---|---|---|---|
| 1 | **事件通道** | `consciousness-event.js` CHANNELS | 事件必须落在 9 通道之一：`structure / semantic / temporal / kespi / behavior / feedback / anomaly / intent / generic`；无归属走 `generic` |
| 2 | **事件归一化** | `ConsciousnessEvent` | `type`（通道）、`source`（来源标识，进 origin 血统）、`payload`、`confidence`(0-1)、`fingerprint`（缺省自动 sha1:16 去重） |
| 3 | **宿主 CLI 契约** | `hermes-aing-adapter.js` | `node src/hermes-aing-adapter.js ingest <json> \| search <query> [limit] \| briefing \| deliberate [urgency]`，stdout 输出 JSON |
| 4 | **安全模式** | `consciousness-kernel.js` | 新接入组件默认 `coordination-only`（只感知/路由/建议/复核）；高风险动作必须走审批，不得直接执行 |

接入红线（与 AGENTS 坑 9 / origin-trust 同源）：
- 接入组件**只读** aing 知识库；写入一律走 `ingest → SessionStore → 代谢管线`，不得直改 `knowledge.db`
- 宿主的系统提示、技能清单、内部记忆**不整包复制**进 aing；只接会话消息本体
- 外部组件的事件携带 `source` 标识，origin-trust 章自动盖 `external`，隔离召回

## 二、已登记接口（Active）

| 接口 ID | 宿主/组件 | 用途 | 状态 | 登记日期 |
|---|---|---|---|---|
| IF-001 | Hermes 类 Agent（hermes-aing-adapter.js） | 会话即入库 + 混合检索 + 简报 + 维护审议 | 参考实现，待运行验收 | 2026-09-07 |

## 三、预留接口（Reserved，占位待接）

> 任何 agent 软件的组件（Claw 家族、TipKay 岗位、opencode、SkillOpt-Sleep 收割器、第三方 MCP 工具……）按第一节标准实现即可占位转 Active。**接口 ID 先到先得，实现自证**。

| 接口 ID | 预留对象 | 预期通道 | 状态 |
|---|---|---|---|
| IF-002 | SkillOpt-Sleep 夜间收割器 | `feedback` / `behavior` | 预留 |
| IF-003 | Claw 系桌面 agent（sophclaw 等） | `intent` / `behavior` | 预留 |
| IF-004 | TipKay 岗位组件 | `intent` / `feedback` | 预留 |
| IF-005 | opencode 会话流 | `behavior` / `temporal` | 预留 |
| IF-006 | 外部 MCP 工具事件 | `anomaly` / `generic` | 预留 |
| IF-0NN | （任意新组件，按标准自证接入） | 9 通道任选 | 预留池开放 |

## 四、当前组件（13 件，全部包内闭合）

- `consciousness-controller.js`：Agent 侧意识神经运行模式和调用边界控制。
- `consciousness-event.js`：统一意识事件协议、通道和事件指纹。【接口标准 1/2 载体】
- `consciousness-kernel.js`：多通道事件去重、聚合、共振、注意力、抑制和唤醒协调。【默认 coordination-only】
- `consciousness-layer.js`：知识简报、热点、连接和异常输出层。
- `config-runtime.js`：运行时配置读取和变更检测。
- `growth-docs.js`：意识事件相关的记忆、Episode 和改进候选记录。
- `growth-loop.js`：成长状态、路线统计和候选评估。
- `interchange-router.js`：结构、证据、语义、成长、反馈和冲突车道的只读路由。
- `metacognition-layer.js`：自我状态、输出评估和参数调整记录。
- `neural-architecture.js`：神经末梢、导链和意识层的主控制器。
- `neural-guide-chain.js`：信号路由、注意力分配和探索建议。
- `sensory-ends.js`：文件、定时、活力和外部信号感知。
- `hermes-aing-adapter.js`：框架无关的宿主 Agent/aing 适配器。【接口标准 3 参考实现】

## 五、运行边界（Stable）

- 本副本**不自动覆盖** `E:\aing\src`；落位为 `E:\aing\consciousness-neural-upgrade` 独立目录。
- 本副本**不直接修改**运行数据库和知识数据；写路径唯一：ingest → 代谢管线。
- `coordination-only` 是意识神经核的**默认**安全运行模式；高风险维护仍需审批。
- 意识神经输出定位：感知、路由、建议和复核依据。
- **源码存在和语法通过 ≠ 生产接入完成**；验收门禁见第六节。

## 六、验收门禁（Gate，逐项全绿才可登记 greenlist）

- [ ] 在 `E:\aing` 真实运行环境中加载全部 13 模块并完成运行时实例化检查。
- [ ] 验证 `ConsciousnessEvent` 归一化、指纹去重和 9 通道约束（含 generic 兜底）。
- [ ] 验证 `ConsciousnessKernel` 事件去重、聚合、抑制和状态持久化（coordination-only 默认生效）。
- [ ] 验证 `NeuralArchitecture` 感知→导链→意识输出链路。
- [ ] 验证元认知与成长记录不越过审批边界。
- [ ] 验证 adapter CLI 四命令：ingest（写走代谢）/ search（只读）/ briefing / deliberate。
- [ ] 验证 origin 血统：外部事件 `source` 落库可查，未污染主血统。
- [ ] 完成副本与主运行包之间的独立接入复查。

## 七、变更记录

- 2026-09-07：建立 `consciousness-neural-upgrade` 独立副本。
- 2026-09-07：从 `E:\Sevo\src` 同步 13 个意识神经相关源码文件。
- 2026-09-07：完成逐字节比对、依赖闭合检查和 Node 语法检查（CONSCIOUSNESS_SYNTAX_OK）。
- 2026-09-07：补充本副本备忘录组件 `MEMO.md`。
- 2026-09-08：**MEMO 升格为「意识神经控制面板」**——固化接口标准四件套（9 通道 / ConsciousnessEvent / adapter CLI 契约 / coordination-only 默认模式），开设预留接口登记区（IF-002~IF-006 + 开放池），确立「aing 组件之外的一切 agent 软件组件均可按标准接入」的总理念。
- 2026-09-08：副本落位 `E:\aing\consciousness-neural-upgrade`，进入验收队列。