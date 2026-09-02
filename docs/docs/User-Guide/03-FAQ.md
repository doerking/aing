# 常见问题 FAQ

> 10 个被问最多的问题。看完还有疑问，去仓库开 Issue。

## 1. 一定要装 Tolaria 吗？

不用。aing 不依赖任何笔记软件。纯文本编辑器 + Git + Node 就能跑完整代谢闭环。Tolaria / Obsidian / VS Code / vim 都只是可选的前端壳。

## 2. 装 Obsidian 行不行？

行。aing 不挑前端，把 Obsidian vault 指向 aing 的目录即可。但 aing 本身不依赖 Obsidian 的任何功能——它只读 Markdown 文件。

## 3. 它会删我文件吗？

不会。"剪断"只断图谱里的链接（把实体移到 `pruned/archive/`），原始 MD 文件永远保留，在 `raw/` 里、在 Git 历史里都能找回。剪断 ≠ 删除。

## 4. 要一直联网吗？

不用。aing 是纯本地 Node.js 脚本，不需要联网。只有你手动配置了云端 API 才会联网。

## 5. 需要 Docker / PostgreSQL / Redis 吗？

都不需要。图谱用 Markdown 文件存储（`wiki/entities/`、`wiki/links/`），部分数据用 sql.js（内存 SQLite）。备份就是复制 `knowledge.db` 文件。

## 6. 普通电脑跑得动吗？

跑得动。目标硬件就是普通家用/丐版电脑：2 GB 内存 + 机械硬盘可跑。向量检索用 64 维 char n-gram hash，非常轻量。

## 7. 阈值那几个数字（80/65/75）要调吗？

默认就行，先跑 3 个月再说。想了解含义看 [KESPI 阈值指南](./02-KESPI-Threshold-Guide.md)。调也是改 `scripts/growth.config.js` 三个字段，改完重新运行脚本即可（当前无热加载）。

## 8. 要我天天盯着吗？

99% 时间不用。只有 4 种情况需要你出手：KESPI 连 3 次红灯、跨领域发现根本矛盾、想改阈值、想改再生规则。其余全自动。

## 9. 多人/团队能用吗？

当前版本是单用户本地工具。没有 HTTP API 服务，没有多端同步。多人协作需要自己搭建 Git 工作流。

## 10. 跟 Karpathy 的 LLM Wiki 是什么关系？

不是分支，是范式升级。LLM Wiki = 知识编译（摄入→编译→查询，线性、静止）；aing = 在其三层（raw/wiki/schema）之上叠加代谢层（发芽/授粉/芥子/再生/过期），从"静态资产"变"活生态系统"。详情看 [架构文档](../Engineering/ARCHITECTURE.md)。

---

> 上一篇：[KESPI 阈值指南](./02-KESPI-Threshold-Guide.md) ｜ 下一篇：[知识库会自己感知、思考、汇报](./04-Consciousness-Neural.md)
