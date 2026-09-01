# Two-Brain Bodies: Tolaria + LLM Wiki Setup Guide / 两脑实体软件实装建议

> The release is the **plain-Markdown edition** — nothing in this guide is required to run aing.
> 本指南面向"有条件、想给两脑装实体"的用户。装外壳不变内脏：aing 的代谢引擎零改动。

**English TL;DR**: Point Tolaria (note shell) at the knowledge-base directory to give the Growth Brain a human-readable body and your daily notes an input channel. Run Karpathy's LLM Wiki (compilation-paradigm software) as an *outourced compile shop* for the hot set, with its output flowing back into `raw/` — never writing `wiki/` directly. Unplug either at any time; the metabolism keeps running.

---

## 1. 架构定位 / Architectural Position

aing 的两脑是**器官**，Tolaria 和 LLM Wiki 是挂在器官上的**身体**：

```
                 你（居民）
                   │ 住在        │ 问
                   ▼             ▼
          ┌─────────────┐  ┌──────────────┐
          │   Tolaria   │  │   LLM Wiki   │   ← 实体软件（可选外壳）
          │  笔记外壳    │  │  编译范式软件  │
          └──────┬──────┘  └──────┬───────┘
       写入 raw/ │                │ ▲ 回流 raw/（唯一的合法接口）
                 ▼                │ │
   ┌─────────────────────────────────────────┐
   │              aing · 代谢引擎（不变）        │
   │  秩序脑 compile → 生长脑 代谢 → KESPI →   │
   │  意识神经 → 元认知                         │
   └─────────────────────────────────────────┘
```

| 器官 | 实体 | 补上什么 | aing 侧的对接层 |
|---|---|---|---|
| 生长脑 Growth Brain | Tolaria（笔记外壳） | 人读视图、双向链接浏览、每日笔记 | `raw/`（输入面）+ `wiki/`（阅读面） |
| 秩序脑 Order Brain | LLM Wiki（编译范式软件） | 热集编译、"人问它答"的查询面 | `raw/`（回流接口） |

---

## 2. Tolaria 实装（生长脑的身体）/ Wiring Tolaria

**步骤 / Steps:**

1. 把**整个知识库根目录**作为 Tolaria 的 vault 打开（不是只开 `raw/`）——这样 `wiki/entities/`、`mustard-seeds/`、`pruned/` 都能逛到，剪枝的"芥子→待定→复活/淘汰"三步状态肉眼可见。
2. 保持 aing 的目录约定不变：你写的东西进 `raw/`，aing 编译的产物在 `wiki/`，**谁写哪层不要混**。
3. 代谢不用盯着：Windows 任务计划 / cron 定时跑 `node src/run-metabolism.js --smart`（aing 没有内建文件 watcher，见 [TOLARIA-INTEGRATION](./TOLARIA-INTEGRATION.md) 的 "What Does NOT Exist"）。

**它改变了什么 / What it changes:**

- 输入面：你在 Tolaria 里的日记、剪藏、随手记落盘即是 `raw/` 新料，感知末梢下一轮代谢就消化。人从"喂库的管理员"变成"长在生态里的神经元"。
- 阅读面：发芽建议的链接、授粉的跨域连线、KESPI 三色灯，从 DB 里的行变成可点可逛的链接图。

**边界须知 / Boundary:**

- Tolaria 界面里的"谁看过谁"不写回文件，KESPI 的 utility 维度数不到它。想让你的注意力参与代谢，就把它落成文件——最简单的方式是在 Tolaria 里**手动建一根链接**（`wiki/links/` 或笔记内 `[[双向链接]]`）。

---

## 3. LLM Wiki 实装（秩序脑的身体）/ Wiring LLM Wiki

**定位 / Positioning:** LLM Wiki 是编译范式软件（摄入→编译→查询，天花板约 200 sources / 50K tokens）。aing 不重复造它的轮子，而是形成流水线分工：

> **aing 管谁值得编译（KESPI / 芥子 / 剪枝），LLM Wiki 管编译和被问（热集 → 查询面）。**

**数据流契约（最重要的一条）/ The one contract that matters:**

```text
aing（权威写者）
  │ 导出热集（活着的实体）→ llm-wiki-workspace/
  │
  │   LLM Wiki：摄入 → 编译 → 产出编译件
  │
  ▼ 回流：编译件作为【新的 raw 源】写入 raw/llm-wiki/
aing 再次编译 → 入库 → 打 KESPI 分
```

LLM Wiki 的产出**只能回流 `raw/`，永远不许直写 `wiki/`**。`wiki/` 只有一个权威写者（aing 的 compile.js）。让两个编译器写同一层，双脑契约就破了——这条守不住，三个软件是抢地盘；守得住，是共生。

**步骤 / Steps:**

1. 给 LLM Wiki 一个独立工作区（如知识库外的 `llm-wiki-workspace/`），别和 aing 目录混住。
2. 导出热集：从 `wiki/entities/` 取当前"活着"的实体（KESPI 绿灯、未被剪枝）复制到工作区。热集控制在 LLM Wiki 的天花板内（~200 sources / 50K tokens）。
3. LLM Wiki 编译产出 → 放入 `raw/llm-wiki/`，文件带 frontmatter 标注来源，例：
   ```yaml
   ---
   source: llm-wiki-export
   origin: wiki/entities/xxx.md
   exported: 2026-08-28
   ---
   ```
   这样 auto-ingest / compile 能溯源，KESPI 的 provability 维度有据可查。
4. 查询面：人对 LLM Wiki 提问（它擅长被问）；涉及"这篇知识还活着吗 / 为什么被剪"这类问题，答案在 aing 侧（KESPI 历史、芥子库）。

---

## 4. 两者皆装后的运行节律 / The Daily Rhythm

```text
（白天）你在 Tolaria 里写、逛、连线
（定时）node src/run-metabolism.js --smart     ← 代谢：消化新料 + 自检
（定时）导出热集 → LLM Wiki 编译 → 回流 raw/    ← 秩序脑外包车间
（随时）你向 LLM Wiki 提问；看 Tolaria 里的链接图
（被动）aing 出简报（意识层）；KESPI 红灯 → 等你仲裁
```

人的位置变了：从背三条命令的操作者，变成住 Tolaria、问 LLM Wiki、看简报的居民。但消化系统始终是 aing 自己的。

---

## 5. 可回退性 / Reverse-ability

| 动作 | 后果 |
|---|---|
| 卸掉 Tolaria | 丢阅读面和每日笔记入口，代谢照跑（MD 就是一切） |
| 卸掉 LLM Wiki | 丢热集编译和会话查询面，`raw/llm-wiki/` 里已有的回流件仍是正常知识资产 |
| 清空 `raw/llm-wiki/` | 回到纯 MD 原教旨状态，无残留（Git 历史仍可追溯） |

**验收清单 / Acceptance checklist:**

- [ ] Tolaria 打开的是知识库根目录，能看到 `wiki/`、`mustard-seeds/`、`pruned/`
- [ ] 在 Tolaria 写一篇 → 跑一次 `--smart` → `wiki/entities/` 出现对应实体
- [ ] LLM Wiki 工作区与 aing 目录分离；其产出只出现在 `raw/llm-wiki/`
- [ ] `wiki/` 目录里没有任何一个文件是 LLM Wiki 写的（Git blame 抽查）
- [ ] 卸载任一软件后 `run-metabolism.js --smart` 退出码为 0

---

*Related: [Shell-Agnostic Integration](./TOLARIA-INTEGRATION.md) · [Architecture](./ARCHITECTURE.md) · [KESPI Threshold Guide](../User-Guide/02-KESPI-Threshold-Guide.md)*
