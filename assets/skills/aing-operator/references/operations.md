---
tags: ["aing", "运维", "部署", "验收", "代谢", "常驻服务", "冒烟"]
---

# 运维组：部署、验收与日常运行

## 一键部署（按序，不可跳步；详见 `E:\aing\AGENTS.md`）

```bash
# 在 E:\aing 包根
npm install              # 一条命令装齐 sql.js / @xenova/transformers / sharp
node verify-deploy.js    # 机器判定验收；退出码 0 = ALL GREEN（或 npm run verify）
```

验收项 C1-C6：Node ≥18、依赖三件套、raw/ 知识源、库与向量索引、本地语义模型、语义检索真实命中。任何一项 ❌，按 AGENTS.md 修复表处理后重跑，直至全绿，禁止绕过。

## 已知部署坑（细节见 AGENTS.md「已知坑」节）

sharp 绝不带 `--ignore-scripts` 安装；模型下载必须走 hf-mirror.com；.ps1 文件必须保留 BOM；统一一条 `npm install`，勿拆多次装单包。

## 日常运行

```bash
node src/run-metabolism.js --smart                # 代谢主循环（智能模式）
node src/index-vectors.js --semantic --reindex    # 内容变更后语义重建（默认模型在即语义，--hash 强制哈希回退）
npm run scheduler                                 # 常驻调度器（间隔代谢 + raw/ 轮询，默认 30min）
npm run server                                    # HTTP API（默认 3789；设 AING_API_KEY 则 0.0.0.0+Bearer）
node src/query.js "关键词" [--limit N] [--names]  # 查询 CLI（语义+模糊合并，附 KESPI 分）
npm run verify                                    # 随时复验，必须保持全绿
```

## 脚本地图

43 个 src 模块已全部归档进 `E:\aing\README.md` 分类脚本表（核心管线/决策层/意识神经/常驻服务/修复与维护五张表）。用某个脚本前先查表，不要猜参数。

## 冒烟纪律

只读型脚本（query、generate-analysis-report、metabolism-log）可直接冒烟；修改型工具（fix-kespi / fix-tags / kespi-enhance / init-knowledge-base / sql-migrate）在主包只做语法检查不实跑——实跑会改库基线，破坏 verify-deploy 的可复现性。要实跑，去影子目录。
