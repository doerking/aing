---
tags: [handoff, security, c10i, architecture, evidence]
description: 2026-11-07 收队交接：ARCHITECTURE.md 偏差重写 + api-server 洞①②收口 + C10i 门禁化 + 证据留底——逐 commit 清账、行为基线、未决事项、踩坑教训、入场验证法
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'e7424e54-0be2-4015-a91c-d56a7a426f57'
  PropagateID: 'e7424e54-0be2-4015-a91c-d56a7a426f57'
  ReservedCode1: 'b96cb875-1b94-406c-92cd-66e57ccb3225'
  ReservedCode2: 'b96cb875-1b94-406c-92cd-66e57ccb3225'
---

# HANDOFF 2026-11-07 — 架构文档重写 × 安全闸收口（收队交接）

> 范围：`2437f19` 起四笔 commit 的全部工作。本文是**交接面**（下任 agent 第一读物）；行为口径真源在
> [ARCHITECTURE.md](./Engineering/ARCHITECTURE.md) §13 与 [AGENTS.md](../AGENTS.md) C10i 行；全链证据在
> [SEC-GATES-2026-11-06.md](./Engineering/SEC-GATES-2026-11-06.md)。

## 0. 基线一句（入场先核）

- 本地 = 远端 `origin/main` = **`eda6ed5`**（2026-11-07 收队时 fetch 双向 rev-list = 0）
- 门禁 **33 项（C0–C20）ALL GREEN**（含新增 C10i）；`node tools/gate-counts.js --json` 零漂移
- 本单改的行为面：api-server entity 写面身份/标签闸 + auto-ingest 标签列 + 全部相关文档（§2 逐条列，**不许退**）

## 1. 逐 commit 清账（四笔，均已推 origin/main）

| commit | 范围 | 验收 |
|---|---|---|
| `2437f19` | 洞①②代码修复（`src/api-server.js` + `src/auto-ingest.js`）+ ARCHITECTURE.md 偏差重写 + §13 安全面 | 隔离院行为证 8/8；C0–C20（32 项时点）ALL GREEN |
| `5478386` | 关联文档跟改：README 端点注记 / AGENTS 入库契约段 / module-handbook / en-ARCHITECTURE 全篇同步（消旧快照分叉）/ greenlist 加 `api-entity-security`（green 29→30） | 32 项 ALL GREEN；gate-counts 零漂移 |
| `cbb44a8` | C10i 门禁化：verify-deploy.js 新增 C10i（纯函数 + 静态 + 隔离院 HTTP 真跑三层）；32→33 数字四处同步；文档指路由 .temp 改指 C10i | 负向自证（注入 active 回潮必红→还原复绿）；33 项 ALL GREEN |
| `eda6ed5` | 证据留底：`docs/Engineering/SEC-GATES-2026-11-06.md`（全链 + 未覆盖面如实留底） | C20 扫 113 档全绿 |

**谱系纪律**：每笔推前 `rev-list --count origin/main..HEAD` 实核为 1，净推无夹带（纪律 10 实录）。

## 2. 行为基线（点好，入场先确认没退）

[tag:security-gate:9] [tag:c10i:9]

| 面 | 现行为 | 真源 |
|---|---|---|
| `POST /api/entity` | 一律 `pending-distillation`/`confidence:0`，客户端自报 status/confidence 忽略 | `src/api-server.js` entity POST 段 |
| `PATCH /api/entity/<id>` | `status=active` → **403**；confidence 不对外写（可从 active 降 pending/archived/voided） | 同上 PATCH 段 |
| active 唯一写位 | `src/distill.js` 兑付（distill.js:263） | C10g③ + C10i 同源 |
| entity 写面 tags | `sanitizeTags`：去控制字符 / 每标签 ≤100 字 / 每实体 ≤20 个 | `src/api-server.js` `sanitizeTags()` |
| ingest 面 tags | 客户端自报 `distillation.tags` **不进** `frontmatter.tags` 列；降级「## Agent 提议（未核验）」段引用行留痕 | `src/auto-ingest.js` renderConversationDoc |
| 门禁 | **C10i**（33 项之一）：隔离假院真起 api-server 逐路由打 + auto-ingest 纯函数断言 + sanitizeTags 静态面 | `verify-deploy.js` C10i 段 |

**验证法**（部分跑，不写验收登记——`VD_ONLY` 部分跑铁律）：

```
set VD_ONLY=C10i  # cmd（PowerShell: $env:VD_ONLY="C10i"）
node verify-deploy.js
```

预期：`✅ C10i …` + 部分跑全绿提示（跳过 32 项、**未写验收登记**）。全量 `node verify-deploy.js` 才是部署验收。

## 3. 未决事项（按优先级，下任照序取）

| 级 | 事项 | 边界说明 |
|---|---|---|
| P0 | 收编 `.temp/sec-gates-behavior.js` + `.temp/c10i-negative.js` 入 `tools/negatives/`（随包走） | `.temp/` 被 gitignore 不跟包；**口徑已固化进 C10i，不收编不影响验收**；收编时同步 C20 面（`tools/negatives/` 在扫面内）与 C19 数字不动（不新增 C 编号） |
| P1 | `agent-dashboard.js` 平行宿主面板：同款身份/标签闸评估 | 不经 api-server、自有认证面（`--api-key`）；需单独核 entity 写面同款行为；别把「api-server 有闸」当成「全 HTTP 面有闸」 |
| P2 | 检索三臂重测 | `models/` 2026-10-15 换多语 384 维模型后，旧三臂数据（语义 vs LIKE vs hash）作废，需重跑复测确认检索质量；入口 `node tools/eval-retrieval.js [--set <qa.json>]`（只读） |
| P3 | `GET /api/query` 每请求重 init KnowledgeStore（全库入内存） | 性能/内存 DoS 面，非安全洞；可改 process 级单例 store；改后须 C20 核 `npm run` 面无变 |
| P4 | local-trust 威胁面注记 | 未设 `AING_API_KEY` = 本机信任模式（全写 API 对本地 process 开放）；是设计取态非 bug，部署指引可加一句明示 |

## 4. 本单踩坑记录（勿重踩）

1. **PowerShell `WriteAllLines` 落 BOM/CRLF 损伤**：改 `.js` 源文件一律用 Node 脚本（`fs.readFileSync` + 行定位 + `writeFileSync`），PowerShell 只用于 git/删档等短命令。本单 auto-ingest.js 曾被 `WriteAllLines` 落 BOM 致 `node --check` 报错，`git checkout` 还原 + Node 重改解决。
2. **cmd 中文引号必坏**：commit message 走 `git commit -F <文件>`（Node 写无 BOM 文件）；findstr 多 `/c:` 参数被 cmd 拆散——复杂扫描一律写 `.temp/*.js` 跑 Node。
3. **`node -e` 内联反引号被 shell 命令替换吃掉**（AGENTS 坑 20）：文档含 Markdown 反引号的改动先落 `.temp/*.js` 脚本再跑。
4. **edit 工具在 CRLF 大文件上 anchor 失配**：多次 `No match found` 时改用 Node 整行定位替换（`lines.findIndex` + `splice`），勿反复重试同一 anchor。
5. **SQL 快照假读**：隔离院起 api-server 后，脚本侧旧 `KnowledgeStore` 实例是启动时快照，新写入的实体要用**新实例**读盘（C10i ④④b 就是这样修的）。

## 5. 下任 agent 入场验证法（三指令）

```
git fetch origin main 2>nul & git rev-list --count origin/main..HEAD & git rev-list --count HEAD..origin/main
# 期望：0 / 0（本地=远端）；若非 0 先看远端新 commit 再动

node tools/gate-counts.js --json
# 期望：count=33、problems: []

node verify-deploy.js
# 期望：33 项 ALL GREEN + 验收登记刷新
```

最后一米（AGENTS 登记项）：`node src/memo.js --summary`（备忘录联通）+ `node src/auto-ingest.js <sid> "<json>"`（入库通道）在场即链路活着。

## 6. 文档地图（本单产出的查账入口）

| 档 | 角色 |
|---|---|
| [docs/Engineering/ARCHITECTURE.md](./Engineering/ARCHITECTURE.md) | 架构真源（79 modules / 11 步代谢 / 双模态向量 / §13 安全面） |
| [docs/Engineering/SEC-GATES-2026-11-06.md](./Engineering/SEC-GATES-2026-11-06.md) | 洞①②收口全链证据留底 |
| [docs/Engineering/en/ARCHITECTURE.md](./Engineering/en/ARCHITECTURE.md) | 中文版全篇同步镜像（**勿分叉**：改中版后 `copy` 同步，C8/C20 一路安全） |
| [docs/greenlist.json](../greenlist.json) 条目 `api-entity-security` | 绿名 30 项之一（证据含 8/8 真跑） |
| `verify-deploy.js` C10i 段 | 每轮全量验收自动重跑的安全面门禁 |

[tag:handoff:7] [tag:gate-count:5]
