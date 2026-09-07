---
tags: ["aing", "修复", "影子", "SOP", "定点同步", "Windows坑"]
---

# 修复组：影子纪律 SOP

任何对 aing 源代码的修改，走五步，一步不省：

1. **复制影子**：从主包复制一份影子目录到 `<sqa-root>/aing-shadow-<日期>-<主题>\`（robocopy 复制，不要手工挑文件——半套代码在影子里验证等于没验证）。
2. **影子内修改与验证**：所有编辑、单测、冒烟、回归都在影子里做。验证标准 = 对应模块的回归 + 影子内 verify-deploy。
3. **定点同步**：只把**改动的具体文件**同步回主包（ robocopy 单文件或复制覆盖指定文件），**绝不搬运影子里的运行数据**（knowledge.db、logs/、snapshots/、data/、__pycache__ 等）——运行数据是影子状态的尸检现场，混进主包会污染基线。
4. **主包复验**：同步后重跑主包 `verify-deploy.js`，全绿面板贴给用户。
5. **入账**：bug 台账（<sqa-root>）记事件，qa.js 归档结论，日记忆更新。

## 影子现场的 Windows 坑（手册铁律，违反必翻车）

- **禁用 fs.watch**：Windows 上不可靠（sensory-ends 教训），监控类功能一律 mtime 快照轮询。
- **文件名禁 `:`**：会话 ID 含 `::` 会导致 ENOENT，写入前用 `[a-zA-Z0-9\-_\u4e00-\u9fff]` 白名单净化。
- **PowerShell 长驻进程别接 Select-Object -First N 管道**：管道断裂会杀进程家族，长任务一律输出重定向到文件再读。
- **KnowledgeStore 是直接导出的类**：`const { KnowledgeStore } = require(...)` 得到 undefined，必须直接 `require('./knowledge-store')`。
- **getLatestKespi 的分数字段是 `overall_score`** 不是 `overall`。

## 修 bug 的双证据姿势

复现 bug 优先用真实数据路径；真实数据到不了阈值时，允许 monkey-patch 构造确定性输入（如 bug#11：`_getVitality=()=>0.9` 把 attention 顶到 0.900），但必须声明这是构造场景，修复后用真实数据复核一遍。
