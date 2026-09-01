# AGENTS.md — aing Deployment Flow (Agent Must-Read) / aing 部署必读流程（Agent 必读）

> Any AI Agent MUST read this file before deploying, verifying, or troubleshooting in this directory.
> 任何 AI Agent 在本目录执行部署/验收/排障前，**必须先读完本文**。
>
> Core discipline: **No ALL GREEN report from `verify-deploy.js` = deployment NOT complete. Never announce success to the user without it.**
> 核心纪律：**没有 `verify-deploy.js` 的 ALL GREEN 报告 = 部署未完成，禁止向用户宣布部署成功。**

## One-Click Deploy Flow / 一键部署流程（按序执行，不可跳步）

```bash
# 1) Install all dependencies in one command (sql.js / @xenova/transformers / sharp)
#    一条命令装齐三件依赖
npm install

# 2) All-green acceptance (machine-judged; exit 0 = ALL GREEN)
#    全绿验收（机器判定，退出码 0 = ALL GREEN）
node verify-deploy.js        # or / 或: npm run verify
```

Expected last line / 预期输出末行：`🟢 ALL GREEN —— 部署验收通过（deploy verified）`

## Acceptance Checklist / 验收项清单（verify-deploy.js 自动执行）

| # | Check / 检查项 | Fix on failure / 失败修复 |
|---|---|---|
| C1 | Node.js >= 18 | Upgrade Node / 换新 Node |
| C2 | sql.js / @xenova/transformers / sharp resolvable / 三件可解析 | `npm install` at package root / 包根 `npm install` |
| C3 | raw/ contains knowledge docs / raw/ 有知识文档 | Put at least one .md / 放入至少一篇 .md |
| C4 | DB entities + vector index / 数据库实体与向量索引 | `node src/run-metabolism.js`, then / 再 `node src/index-vectors.js --semantic --reindex` |
| C5 | Local semantic model bundled in models/ (~22MB) / 本地语义模型 | `powershell -File setup-vectors.ps1` |
| C6 | Semantic search actually hits / 语义检索真实命中 | `node src/index-vectors.js --semantic --reindex` |

## Known Pitfalls / 已知坑（脚本已内置修复，手工操作时注意）

1. **NEVER install sharp with `--ignore-scripts`** — the native binary goes missing and importing transformers crashes outright. If transformers' nested old sharp lacks the binary, delete it and Node falls back to the top-level newer sharp.
   **绝不用 `--ignore-scripts` 装 sharp**——会缺原生二进制，import transformers 直接崩；transformers 嵌套的旧版 sharp 缺库时删除之，自动回退顶层新版。
2. **Model downloads MUST go through hf-mirror.com** — direct huggingface.co times out on CN networks (the script defaults to the mirror + curl.exe with redirects).
   **模型下载必须走 hf-mirror.com**——国内直连 huggingface.co 必超时（脚本已默认镜像 + curl.exe 跟重定向）。
3. **PowerShell 5.1 mis-parses UTF-8 .ps1 files without BOM** — all .ps1 in this package carry a BOM; do not re-save them without it.
   **PowerShell 5.1 读 UTF-8 无 BOM 的 .ps1 会乱码**——本包内脚本已带 BOM，别用无 BOM 编码重存。
4. **Repeated `npm install <pkg>` without a package.json prunes earlier packages** — this package ships a package.json; always use a single `npm install`.
   **没有 package.json 时多次 npm install 会互相剪枝**——本包已带 package.json，统一 `npm install` 一条命令，勿拆多次 `npm install <pkg>`。

## Daily Operation / 日常运行（部署完成后）

```bash
node src/run-metabolism.js --smart        # Metabolism main loop (smart mode) / 代谢主循环（智能模式）
node src/index-vectors.js --semantic --reindex   # Semantic reindex after content changes / 内容变更后语义重建
npm run verify                            # Re-verify anytime; must stay ALL GREEN / 随时复验，必须保持全绿
```

## Reporting Format / 汇报格式（对用户）

After deployment, paste the **complete** verify-deploy.js report (all six ✅ lines plus the ALL GREEN line) to the user. Never just say "it's installed". If any item is ❌, fix per the table and re-run until all green.
部署完成后，粘贴 verify-deploy.js 的完整报告（含六项 ✅ 与 ALL GREEN 行），不得只说"装好了"。任何一项 ❌，先按修复列处理并重跑，直至全绿。
