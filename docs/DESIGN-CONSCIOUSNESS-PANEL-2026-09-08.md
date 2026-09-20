# DESIGN-CONSCIOUSNESS-PANEL-2026-09-08.md — 意识层三件套设计

> 定位裁决（驾驭者，2026-09-08）：aing 的备忘录**不是给用户看的仪表盘，是给 agent 用的意识层数据**。
> 用户不关心 agent 面对什么状况，只不断提需求；agent 的线路必然只增不减。
> 备忘录的价值 = 把 agent 的管理成本从 O(记忆) 降到 O(登记)。
>
> 分层公理：**事实层 = 会话即刻入库（不管好不好懂，先存真）；意识层 = 备忘录（对事实层的实时聚合陈述）**。
> 意识层允许暂不理解语义，但绝不允许与事实层矛盾。

---

## 一、事实层（已有，本轮核实）

会话入库链已具备时间线三要素：

| 要素 | 实况 | 位置 |
|---|---|---|
| 何时 | ISO 时间戳文件名 `session-<id>-<timestamp>.md` | auto-ingest.js:190 |
| 何地/何人 | frontmatter source/session（**租户前缀已于 2026-09-14 砍除**：仅给会话键加前缀、共库共表不构成隔离，门禁 C10f 防复活；见文末现状标注）| auto-ingest.js:186 |
| 全文 | 原始消息全量拼接（非只存最新一条）+ 蒸馏摘要 | auto-ingest.js:153 |

**关键词还原时间线的最小查询**（本轮确认已可用，无需新开发）：

按文件名前缀 = 某会话/某用户 → 拉出该线全部 raw 时间线
按 type=Conversation + 关键词 → "这话何时说过、什么场合说" = 命中实体的 created/updated + source_file

agent 不会表达也没关系：把时间线摆出来，事实自己说话。

**本轮不改动事实层**。唯一演进方向（记录不做）：蒸馏摘要当前依赖宿主传入，未传时为"待生成"——未来可由代谢链补蒸馏，但那是增强不是缺欠。

---

## 二、意识层三件套（本轮设计核心）

### 卡 1：承诺边界卡（已有资产，加固即可）

= `docs/greenlist.json` + GREEN-LIST.md。

- agent 对用户的一切能力承诺从这里出：green 可承诺，locked 一律"在库未接线"
- 加固项（已上线）：schema 断言杜绝 undefined 渲染；C8 盘符守门
- 使用纪律（新增进 AGENTS）：agent 面对用户新需求时第一步查卡——"要的服务在 green 还是 locked"，从源头防超售

### 卡 2：线路登记簿（新设计 = C9 契约门的真身）

= `data/component-registry.json`（意识层的新真源）。**加组件 = 加登记，一次登记换全链路自动守门。**

```json
{
  "_meta": { "version": 1, "rule": "组件契约登记。C9 门：登记的 pipeline 组件数必须等于 STEPS 数组长度且 id 一致；greenlist 引用必须存在。" },
  "components": [
    {
      "id": "metabolism",
      "role": "pipeline-step",
      "pipeline": "full-chain",
      "contracts": ["takes-lock", "greenlist-declared", "mirror-to-opt"],
      "declarations": ["docs/greenlist.json#metabolism-pipeline"],
      "registered": "2026-09-03"
    },
    {
      "id": "sync-opt",
      "role": "pipeline-step",
      "pipeline": "full-chain-tail",
      "contracts": ["marker-gated", "non-critical", "mirror-to-opt"],
      "declarations": ["docs/greenlist.json#metabolism-pipeline(11步)"],
      "registered": "2026-09-08"
    },
    {
      "id": "auto-ingest-subchain",
      "role": "sidechain",
      "contracts": ["PENDING-T2-must-take-lock"],
      "registered": "2026-09-08",
      "note": "登记即暴露：此条存在本身就是 T2 陷阱的挂牌"
    }
  ]
}
```

**C9 门校验的契约（机器可验）**：
1. `pipeline-step` 类组件 ⇔ `run-metabolism.js` STEPS 数组：双向数量与 id 一致（防"加步忘登记"与"登记鬼步"）
2. 登记 `greenlist-declared` 契约 ⇔ greenlist.json 存在对应引用
3. `mirror-to-opt` ⇔ marker 存在时 sync-opt 在链上
4. 违反任一 → verify-deploy 红，exit 1

> 这一卡直接消灭本轮 T1/T2/T6 类陷阱的繁殖土壤：**用户加组件的速度可以无限，agent 的登记成本恒为一次。**

### 卡 3：注意力队列（新设计 = 面板的 agent 形态）

= `data/panel.json`（+ 人读视图 `wiki/panel.md`）。**它是意识层对事实层的实时陈述，agent 冷启动第一读物。**

结构（全部聚合既有产出，零新计算引擎）：

```json
{
  "_meta": { "generatedBy": "metabolism step 12", "freshnessRule": "随代谢链刷新；过期 = 代谢链未跑" },
  "health":    { "kespi_avg": 0.84, "gates": "C0-C8 ALL GREEN @<hash>", "subchain_debts": 0 },
  "lines":     { "tracked_branch": "master@0d1628f", "remote_main": "8494623", "unpushed": 6,
                 "opt_mirror": "0d1628f", "drift": 0 },
  "queues":    { "agent_todos": [ "推送 6 提交", "发布 Release ×3" ],
                 "user_todos":  [],
                 "stale":       [ "绿名单 updated 2026-09-07（>1 天）" ] },
  "gaps":      { "orphan": 0, "thin": 0, "stale": 0, "unindexed": 0, "empty": 0 },
  "chains":    { "top_guide_chains": ["...sprout 今日导链 top3..."] },
  "timeline":  { "conversations_today": 0, "latest_session": null }
}
```

- **agent_todos 怎么来**：agent 把自己的待办写进 aing（type=Todo 实体，走 auto-ingest 现成管道）——"待推 6 提交""待发 Release ×3"这类事项从此被代谢链管着过期（KG 维天然质检待办腐烂）
- 面板 schema 进 C 门（panel.json 缺块 = 红），防意识层自身退化
- 注意力规则：agent 冷启动只读 panel.json；红项处置后才看绿项；用户问到具体业务再下钻 raw 时间线（事实层）

---

## 三、实体类型扩展（事实层新增三个一等公民）

现状核实：全仓对 Todo/Skill/Output **零特化**（grep 实证）；type 是自由字符串、compile/import/kespi 全链对 type 无感——因此**新增 type 零 schema 迁移**，只需约定 + 面板呈现。

| type | 来源 | 意识层呈现 | aing 独有加持 |
|---|---|---|---|
| `Todo` | agent 写入（面板/CLI）或会话蒸馏提取 | queues.agent_todos / user_todos | KG 维自动检测待办腐烂，过期降分黄灯 |
| `Skill` | 现有知识文档打 `type=Skill` 约定 | 技能分类计数（面板一行："技能库 N 条，分类 M 类"） | 技能文档三个月没更新 → 代谢链自动可见 |
| `Output` | 宿主登记产出（source_file 指针） | 产出区状态 | 产出 ↔ 支撑知识靠 wiki 链接自动可溯 |

**用户视角验收话术**（转成对用户说的语气，备忘录直接提供数字）：
"你的技能分类现在有 N 条，分 M 类；自媒体发布实体库存 X 篇，其中 Y 篇超两周未更新"——这类句子不再需要 agent 现场跑统计，**意识层卡片直接给**。

---

## 四、实施顺序（与既有批次合并）

| 批次 | 内容 | 成本 |
|---|---|---|
| 一（保本，不变） | T1 sync-opt 挂出口 / T2 子链锁 / T4 KB_ROOT fail-fast | ~35 行 |
| 1.5（对话主战场，不变） | answer-pack（searchCandidates 单轨 + snippet/kespi/neighbors + CLI --json） | ~40 行 |
| 二（本设计核心） | 卡 3 注意力队列（panel.json + 代谢尾步）+ 卡 2 登记簿 + C9 门 | ~120 行 |
| 三 | Todo/Skill/Output 实体化 + 面板呈现 | ~70 行 |
| 声明即可 | T5 config-runtime 诚实注释 | 3 行 |

依赖关系：二依赖一（队列里的 drift/subchain_debts 字段来自 T1/T2）；三依赖二（Todo 没有队列就没有呈现位）。

## 五、不做清单（纪律延续）

- 备忘录不做 UI/交互/日历/提醒——aing 是状态供应者，面板呈现归宿主
- 事实层不做"理解"——时间线还原靠关键词+时间戳，语义增强留给未来蒸馏
- B5 红线不动：意识层只陈述事实层，绝不反向改写（面板只读 raw/DB，永不写回业务数据）
- 元认知（locked）不因本设计提前接线——panel 是确定性聚合，不是 metacognition 的代餐

---

> **现状标注（2026-09-14）**：本文为设计决策史，按仓库纪律不改写正文。文中提到的 tenant/租户前缀组件已于当日**已砍除**（仅给会话键加前缀、共库共表不构成隔离），门禁 C10f 防复活。引用本设计时请以 docs/greenlist.json 现状为准。
