---
tags: ["aing", "部署", "运维", "SOP", "验收", "手册"]
---

# DEPLOY-PLAYBOOK — aing 部署实操手册（Ops Doc, Chinese-primary）

> 从开箱到 ALL GREEN 的完整操作剧本。规则真源在 `AGENTS.md`（纪律）与 `docs/GREEN-LIST.md`（能力边界），本手册只写"手怎么动"。收编自 B组 部署实操建议（2026-09-03）。

## 阶段 0：开箱检查（约 1 分钟）

1. 目录完整性：根目录应有 `package.json`、`verify-deploy.js`、`schema.sql`、`setup-vectors.ps1`、`src/`（43 个 js）、`docs/`、`raw/`（≥1 篇 .md，验收要求 8 篇基线）。
2. 环境预检：Node ≥ 18（`node -v`）；Windows PowerShell 5.1 用户确认 .ps1 文件带 BOM（本包自带，勿重存）。
3. 中国大陆网络确认能达 hf-mirror.com（模型下载走镜像，直连 huggingface.co 必超时）。

## 阶段 1：依赖安装（一条命令，约 2-5 分钟）

```bash
npm install
```

- 绝不带 `--ignore-scripts`（sharp 原生二进制会缺失，transformers 直接崩）。
- 不拆多次 `npm install <pkg>`（无 package.json 的环境会互相剪枝；本包已带，统一一条）。
- 若 transformers 嵌套的旧版 sharp 缺库：删掉嵌套那份，自动回退顶层新版。

## 阶段 2：一键验收（约 1 分钟）

```bash
node verify-deploy.js        # 或 npm run verify
```

预期末行：`🟢 ALL GREEN —— 部署验收通过（deploy verified）`。任何 ❌ 按 `AGENTS.md` 验收表修复列处理后重跑，**不许跳过、不许绕过、不许只修一半**。

首次部署若 C4/C5/C6 不绿，按序补：

```bash
node src/run-metabolism.js --smart                 # 造库：raw → 实体
powershell -File setup-vectors.ps1                 # 拉 384 维语义模型（~22MB，走 hf-mirror）
node src/index-vectors.js --semantic --reindex     # 语义重建索引
node verify-deploy.js                              # 复验到全绿
```

## 阶段 3：日常运行（按需选装）

```bash
node src/run-metabolism.js --smart                # 手动代谢
npm run scheduler                                 # 常驻调度（30min 定时代谢 + raw/ 轮询）
npm run server                                    # HTTP API（3789；生产设 AING_API_KEY）
node src/query.js "关键词"                        # 查询（加权融合精排；低置信自动慢回忆）
```

## 阶段 4：变更纪律（改代码必读）

1. 永不在主包直接改源码——复制影子目录（robocopy），影子内改+验，定点同步改动文件回主包，再 `verify-deploy` 全绿。
2. 影子里的运行数据（库/日志/快照）永不搬回主包。
3. 阈值只改 `src/growth.config.js`（环境变量覆盖也只在这一个文件里实现）。

## 常见故障速查

| 症状 | 根因 | 处置 |
|---|---|---|
| transformers import 崩 | sharp 缺原生二进制 | 重装 sharp（不带 --ignore-scripts） |
| 模型下载超时 | 直连 huggingface.co | 用 setup-vectors.ps1（默认 hf-mirror） |
| .ps1 乱码 | UTF-8 无 BOM | 用包内原版脚本，勿重存 |
| C6 语义不命中 | 换模式后未重建索引 | `--semantic --reindex` |
| 查询无结果 | 库空或未代谢 | `run-metabolism.js --smart` 后重试 |

## 声明（绿灯解锁制）

本手册只描述已验证能力。未验证能力（元认知接线、热重载、租户写隔离、回炉第 11 步）不在本手册范围内，能力边界以 `docs/GREEN-LIST.md` 为唯一真源。
