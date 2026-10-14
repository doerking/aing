# Tolaria 双重身份与集成指南

> 补现有 Wiki「Order Brain / 秩序脑」章节的模糊点。明确 Tolaria 的「意象层 + 实底层」，以及 aing 和 Tolaria 的集成方式。

## 1. 双重身份说明

| 层面 | 含义 | 关联设计 |
|------|------|----------|
| **意象层（万智牌）** | 源自 MtG 中被非瑞克西亚摧毁后重铸的 Tolaria 海岛，对应 aing「编译范式 → 代谢范式」的升级：旧海岛地基（Karpathy LLM Wiki 的三层架构）保留，新生态（双脑代谢）在废墟上生长 | 呼应 aing is not a fork... but an upgrade 的设计理念 |
| **实底层（开源项目）** | 指 [refactoringhq/tolaria](https://github.com/refactoringhq/tolaria)（2026 年中 14k+ ⭐），Tauri + React + TS 的本地优先 MD 知识库，原生支持 Git、Type 分类视图、双向链接 | 丐版友好：无需额外配置插件即可获得稳定的 MD 存储层 |

## 2. 与 aing 的集成边界

aing 不修改 Tolaria 源码，采用「独立进程 + 文件监听 + Git Hook」的松耦合集成：

```
[Tolaria Desktop App] ←→ [File System Watch (chokidar)] ←→ [aing Node Background Service]
        ↓                                   ↓
[MD文件读写/Git提交]                [触发双脑流程/更新SQLite图谱]
```

- **Tolaria 负责**：MD 文件的 CRUD、Git 版本管理、前端展示、用户输入入口
- **aing 负责**：图谱 Schema 维护、生长脑逻辑调度、KESPI 自检、代谢任务执行
- **共享存储**：Tolaria 的 MD 文件目录直接作为 aing 的 `data/docs` 目录，SQLite 数据库文件存放在 Tolaria 知识库的 `.aing` 隐藏目录下（不影响 Tolaria 原生使用）

## 3. AI Provider 双层抽象

现有 Wiki 将 AI Provider Abstraction 列在 Order Brain 下，特此说明：

| 抽象层 | 归属 | 用途 | 对应 Karpathy 范式 |
|--------|------|------|-------------------|
| **编译层 Provider** | Tolaria 原生 | 用于 Raw → Wiki 的基础编译，对应 Karpathy 的「LLM 当程序员」 | 摄入阶段的一次性编译 |
| **代谢层 Provider** | aing Growth Brain | 用于发芽 / 授粉 / 芥子再生等代谢决策，支持按任务复杂度动态路由（本地 Ollama / 云端 API） | 生长阶段的非线性决策 |

---

*版本：v1.0 | 日期：2026-07-16*
