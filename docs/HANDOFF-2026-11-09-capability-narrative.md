---
tags: [aing, handoff, capability-narrative, distill, c10g, must-read]
description: 2026-11-09 能力叙事六段入库硬接线交接单——本仓消费侧落地 4 commit（ad47ae2..b64375e 已推）+ G 侧 4 件交付物 + 远端 [CHECK] 清单 + 未处理账（仪表台 2 项 degraded）
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'e7424e54-0be2-4015-a91c-d56a7a426f57'
  PropagateID: 'e7424e54-0be2-4015-a91c-d56a7a426f57'
  ReservedCode1: 'b96cb875-1b94-406c-92cd-66e57ccb3225'
  ReservedCode2: 'b96cb875-1b94-406c-92cd-66e57ccb3225'
---

# HANDOFF 2026-11-09 能力叙事入库硬接线（收工交接单）

> 读给：下一个进场 agent / 用户本人。
> 本轮收口 4 commit（`9aeb003` / `76880b3` / `b64375e`，含 EvoX 全清 `ad47ae2`）全部已推 `origin/main`（fa65d1b..b64375e），推后领先 0。
> 本仓面（消费侧）已收口；G 盘桥侧 4 件是「交付物」，远端 [CHECK] 未销账前系试用态。

## 背景（一句）

**入库单元不是「一次对话」，是「一次能力显现」**——场景（触发）/ 思维（能力内核 ★★★）/ 手段（工具）/ 编排（子代理）/ 产出（交付）/ 校准（反馈）。
dsh 桥侧（G 盘 4 件）把会话组织成六段能力叙事喂 auto-ingest；本仓发布包系**消费侧**，要把呢个叙事完整蒸馏入 knowledge.db，唔好静默丢料。

## 本仓改动面（4 commit，全部已推）

| commit | 内容 | 文件 |
|---|---|---|
| `ad47ae2` | EvoX 底盘残留全清（库内零 evox，删死映射） | `assets/skills/aing-operator/SKILL.md`(+en)、`src/sync-links-to-fs.js`、`src/fix-kespi.js`、`src/fix-tags.js` |
| `9aeb003` | 能力叙事六段区间捕获落消费端 + C10g 行为断言 + 坑 23 | `src/distill.js`、`verify-deploy.js`、`AGENTS.md` |
| `76880b3` | 起端锚双语化（坑 5）+ 英文 locale 变体断言 | `src/distill.js`、`verify-deploy.js`、`AGENTS.md` |
| `b64375e` | 文档面追平（README 排障行 + module-handbook 导出契约例外注 + greenlist 新增 capability-narrative-ingest，green 30→31） | `README.md`、`docs/module-handbook.md`、`docs/greenlist.json`、`docs/GREEN-LIST.md` |

## 功能口径（下一场必知）

1. **层置铁律（坑 23）**：能力叙事节名契约**权威在消费端（distill）**，生产者（G 侧 `capability-narrative.js`）段名 / 标题层级（h2/h3）/ locale 演进**唔使回流改发布包**。G 侧 0.4.1（h3 标题）同发布包兼容——消费侧 h1~h6 层级鲁棒，h2/h3 都接得住。
2. **双语锚（坑 5）**：起端标记 = `能力单元|Capability Unit`（`/i`，加 locale 只改 distill 一行）；止端锚（`提取实体/标签/蒸馏摘要`）系消费端自有节名**恒中文，唔双语化**（双语化会扩大误捕面）。
3. **两套独立捕获路径**：普通角色会话档走 `RAW_SECTIONS` 节白名单（C10g 双向校验）；dsh 能力叙事档走 `extractCapabilityRaw` 区间捕获（C10g 独立行为断言 + 双负向证）。
4. **greenlist 31 项**（`capability-narrative-ingest` 已登记，视图 green 31 / locked 3）。

## 门禁证据（收工状态）

- `verify-deploy.js` **33 项 ALL GREEN @b64375e**（C10g 带「能力叙事六段全捕获（双语锚 中/英 + 负向证 0 行）」、C19/C20 同步）。
- 探针（`.temp/`，gitignore 唔跟包走）：
  - `probe-capability-narrative.js`：六段内容行全捕获 PASS + 负向证 0 行 + 结构节零污染
  - `test-distill-full.js`：全链 `distillContent` 兑付 `rawCount=8 / points=5`（唔系 no raw messages）
  - `revert-g-side.js`（**未跑**，已废）：G 侧 revert 脚本，按拍板「G 唔使理」而作废——G 侧 0.4.1 保留，消费侧层级鲁棒已覆盖
- 本仓追踪面（src/docs/assets/...）桥侧引用全部走语义占位符 `<bridge-root>`（C8 盘符门禁钉；含本交接单自身——本单初稿曾直写 G 盘路径被 C8 当场转红，已改口，教训同坑 19）；旧 buggy 模式（`markerRe` / 未用常量 / 字符类误写）全追踪面**零残留**。

## G 侧 4 件交付物（未动，远端拿用）

| 文件 | 角色 | 状态 |
|---|---|---|
| `<bridge-root>/dsh-aing-bridge/aing-bridge.js` | claude-code mod v0.4.1：session.end 触发，六段组织 + 校准合并 | 权威 |
| `<bridge-root>/dsh-aing-bridge/aing-calibration.js` | cordis 插件：`ctx.on` 捕校准写 `feed.jsonl` | 权威 |
| `<bridge-root>/.mimosa/feed-ingest.js` | SessionStore 入库 runner（从文件读绕 argv） | 已自测 flushed:true |
| `<bridge-root>/dsh-aing-bridge/capability-narrative.js` | 六段渲染纯逻辑（0.4.1 h3 标题） | 权威 |

**挂法**：bridge 经 claude-code-mods 桥接挂；calibration 经 cordis.yml 挂——两者挂法唔同，profile 都要配。（`<bridge-root>` = 宿主桥侧目录，即用户本机 G 盘桥件根；本仓追踪面只写相对路径唔写盘符，C8 钉）

## 远端 [CHECK] 清单（未销账前 = 试用态）

**bridge（mod 侧）**：register 签名（hooks + $ 两参）· `$.session.messages()` 结构（`[{role, content:[block]}]`）· 工具 block type（`tool_use` 备选 `toolCall`）· 工具结果 role（`tool`）/ block（`tool_result`）· ReasoningBlock 字段（`.thinking` 备选 `.text`/`.reasoning`）· `tool_use.id` ↔ `approval.callId` 对齐 · `$.store`/`$.fs.write`/`$.process.run` 形状（get/set、write(path,content)、run(argv,{cwd})）· `subagentToolNames` 实际名（agent/task/dispatch/spawn）· **工具结果配对现走顺序（`find(x => x.result === null)`），远端 [CHECK] 时若 tool result block 带 `tool_use_id` 字段，三行内升级返 callId 精确配对**（并行 tool_use 乱序回会配错）。

**calibration（cordis 侧）**：`apply(ctx)` 签名 · `ctx.on('feedback/record' | 'approval/decided' | 'goal/change')` payload 字段（summary + target.callId）· cordis.yml 挂载 · `require('node:fs')` 喺 cordis 进程内可用。

**验收口径**：远端跑一轮真实会话后，aing `raw/inbox` 或 `knowledge.db` 出现六段组织嘅会话（思维段完整 + 审批校准精确挂到工具），即硬接线成功。

## 留档未动面

- G 盘 4 件 + 设计稿 `<bridge-root>/dsh-aing-硬接线-设计草稿.md`（桥侧，盘符不入门面）原样保留，未改一行。
- 本仓 `.temp/` 探针（probe-capability-narrative / test-distill-full / fix-distill-capability / refine-capability-region / revert-g-side）全 gitignore，唔跟包走。
- 上一份交接单 `docs/HANDOFF-2026-11-09-p12-p13-closeout.md` 行 12 ZCode 系历史指令实录，按纪律 7/8 豁免保留。

## 未处理账（用户未拍板）

| 账 | 来源 | 处置 |
|---|---|---|
| 仪表台 2 项 degraded | memo --peek | ① `panel.gaps` 孤儿 2 + 未入索引 2 ② 检索 MRR goal `goal-20261101T17234-…` round-limit blocked——用户今日未拍板处理（清缺口 / resume goal / 照常用） |
| 远端 [CHECK] 未销账 | G 侧交付 | 未校准前能力叙事硬接线系试用态，唔好当已上线能力引用 |

## 下一步

1. 拿 G 盘 4 件 + 设计稿上远端 dsh，挂 mod + cordis 插件，跑一轮真实会话验收六段入库。
2. 远端 [CHECK] 逐条销账（上表），未销账前当试用态。
3. 回头拍板「未处理账」：`panel.gaps` 孤儿 2 / 未入索引 2 清唔清，检索 MRR goal 点收（resume / complete / clear）。
4. 收工前照例 `node verify-deploy.js` 复跑，保持 33 项 ALL GREEN。
