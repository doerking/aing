---
tags: ["aing", "部署", "运维", "SOP", "验收", "手册"]
---

# DEPLOY-PLAYBOOK — aing 部署实操手册（Ops Doc, Chinese-primary）

> 从开箱到 ALL GREEN 的完整操作剧本。规则真源在 `AGENTS.md`（纪律）与 `docs/GREEN-LIST.md`（能力边界），本手册只写"手怎么动"。收编自 B组 部署实操建议（2026-09-03）。

## 阶段 0：开箱检查（约 1 分钟）

1. 目录完整性：根目录应有 `package.json`、`verify-deploy.js`、`schema.sql`、`setup-vectors.ps1`、`src/`（43 个 js）、`docs/`、`raw/`（≥1 篇 .md，验收要求 8 篇基线）。
2. 环境预检：Node ≥ 18（`node -v`）；Windows PowerShell 5.1 用户确认 .ps1 文件带 BOM（本包自带，勿重存）。
3. 中国大陆网络确认能达 hf-mirror.com（模型下载走镜像，直连 huggingface.co 必超时）。
4. **配置初始化（克隆后必做）**：仓库不含 `src/growth.config.js`（.gitignore 排除真实配置）。缺它则验收直接失败：

   ```bash
   cp growth.config.example.js src/growth.config.js      # Linux/macOS
   copy growth.config.example.js src\growth.config.js    # Windows
   ```

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
3. **部署与源码保持一致**：部署时不改代码、不打临时补丁。部署中发现的缺陷在源码仓库分支上修复、合入后重新部署——直接改已部署实例，差异会在下次部署时丢失，并让验收基准失效。运行时配置面仅限 `growth.config.js` 与环境变量。
4. 阈值只改 `src/growth.config.js`（环境变量覆盖也只在这一个文件里实现）。

## 常见故障速查

| 症状 | 根因 | 处置 |
|---|---|---|
| transformers import 崩 | sharp 缺原生二进制 | 重装 sharp（不带 --ignore-scripts） |
| 模型下载超时 | 直连 huggingface.co | 用 setup-vectors.ps1（默认 hf-mirror） |
| .ps1 乱码 | UTF-8 无 BOM | 用包内原版脚本，勿重存 |
| C6 语义不命中 | 换模式后未重建索引 | `--semantic --reindex` |
| 查询无结果 | 库空或未代谢 | `run-metabolism.js --smart` 后重试 |

## 声明（绿灯解锁制）

本手册只描述已验证能力。未验证能力（元认知接线、热重载、回炉第 11 步）；多租户已于 2026-09-14 砍除，不再是待验证项不在本手册范围内，能力边界以 `docs/GREEN-LIST.md` 为唯一真源。

## 外部接口登记（C20 ⑦⑧ 的"按设计缺席"面）

> `verify-deploy.js` 的 C20 会把文档里指到「按设计不在包内」的路径当作**登记的外部接口**放行（计数、不判红），
> 条件是每条登记都在本正本档有对应 `### 接口: <id>` 节，且同时含「怎么接」与「缺席语义」两项。
> 登记表真源在 `verify-deploy.js` 的 `INTERFACES`（`verify-deploy.js` C20 段）；加/减接口须同一笔改动同步本正本节。

### 接口: deploy-config
- **怎么接**：克隆包后执行部署第 0 步 `cp growth.config.example.js src/growth.config.js`（Windows 用 `copy`）；`src/growth.config.js` 被 `.gitignore` 第 19 行排除，真实配置只在本院存在，不随 git 走。
- **缺席语义**：`src/growth.config.js` 缺席是**正常未部署态**（pre-deploy）——按 C0 修复列补一行模板复制即可，不算缺陷、不算死链。

### 接口: m4-proof
- **怎么接**：M4 验证产物 `simulation/proof-*.json` 由机内 `.temp/` 工具生成，只落运行院，不随包发布；要看证据在生成它的院里读，别在本包找。
- **缺席语义**：`simulation/proof-*.json` 缺席是**正常历史读数态**（historical-readout）——是"某次验证留下的产物"，不是"应存在而缺失"，判绿。

### 接口: skillopt
- **怎么接**：外部 SkillOpt 检出的离线/在线 rollout 产物（`simulation/skillopt-evidence.json` / `skillopt-online-evidence.json` / `last-run.json`）由 SkillOpt 检出回填（2026-09-15 实测时点在 `<dd-root>\321\SkillOpt`；现状 2026-11-04 起 aing env 已由本包 `training/adapter.py` 落到 `<sqa-root>\SkillOpt\skillopt\envs\aing\`，以 M4 表 SkillOpt 行为准）；消费真源是包内已跟踪的 `simulation/skillopt-task-package.json`，外部根由环境变量 `AING_SKILLOPT_ROOT` 指认。
- **缺席语义**：三条证据档缺席是**可选外部态**（optional-external）——**接不接 SkillOpt 都不影响 C20 门禁结果**；opt-in 探针 `VD_SKILLOPT_PROBE=1` 才开，开了也只报"已回填 N/3"，任何失败/外部根不存在只报"未核"、**永不判红**。
