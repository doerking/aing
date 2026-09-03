# 部署验证清单与常见问题处理（2026-09-02） / Deploy Checklist & Troubleshooting (Chinese-primary)

> 本包包含双脑同步修复。部署完成后请按第二节顺序验证；遇到问题查第三节对症处理。 / English readers: section 2 is the ordered verification; section 3 is symptom → fix. Commands and table keys are language-neutral.

## 一、本版变化

1. 新增 `src/sync-links-to-fs.js`：把 knowledge.db 里的链接表镜像落盘到 wiki/links/（双格式：`A__B.md` 边文件 + `index.md` 汇总索引）。修复的问题：此前 auto-link 只写数据库不写文件系统，而 neural-guide-chain / consciousness-layer 依赖 wiki/links/index.md 读取邻居关系，导致两层数据脱节、邻居关系恒为空。
2. `src/run-metabolism.js` 代谢管线在 link 步后新增 `link-sync` 步（现共 10 步），每轮代谢自动保持数据库与文件系统一致。

## 二、部署验证清单（依次执行，全部通过即部署成功）

```bash
# 1. 依赖与数据库就绪（若 node_modules 未随包拷贝才需要）
npm install

# 2. 部署自检
node verify-deploy.js

# 3. 完整代谢（预期 10/10 步成功，KESPI 分数正常输出）
node src/run-metabolism.js

# 4. 双脑一致性（预期：index.md 非空，边文件数 = 数据库链接数）
ls wiki/links/          # 应看到 index.md + 若干 A__B.md

# 5. 邻居解析实测（预期返回真实邻居数组，非空）
node -e "const c=require('./src/neural-guide-chain'); const g=new c({wikiDir:'wiki'}); console.log(g._getNeighbors('architecture-overview'))"
```

## 三、常见问题与处理方式

**1. `_getNeighbors` 返回 `[]`，或 wiki/links/index.md 不存在 / 为空**

原因：使用了旧版包，或数据库链接晚于文件落盘。
处理：`node src/sync-links-to-fs.js`（幂等，可重复执行）。若包内没有该脚本，说明是旧版包，请重新获取最新发布包。

**2. 代谢报 `Cannot find module 'sql.js'` 或 `@xenova/transformers`**

原因：依赖未安装。
处理：`npm install`；网络受限环境可使用镜像 `npm install --registry=https://registry.npmmirror.com`。

**3. 向量索引报模型找不到，或出现联网超时**

原因：语义模式依赖包内本地模型，`models/` 目录缺失，或尝试远程拉取模型。
处理：确认 `models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx`（约 22MB）存在；重跑 `npm run reindex:semantic`。aing 设计为零外呼，模型完全离线运行，无需也无法联网下载。

**4. 代谢某步失败 / 中途中断**

处理：`node src/run-metabolism.js --resume` 断点续传；或单步重跑 `node src/run-metabolism.js --step <step名>`（如 `--step link-sync`）。

**5. 数据库锁死或 knowledge.db 损坏**

原因：多为两个代谢进程并发。
处理：确认没有其他进程正在运行后重建——`node src/setup-db.js && node src/run-metabolism.js`。aing 的设计原则是 Markdown 为源、数据库为投影，wiki/ 目录完好即可随时重建。

**6. 会话自动入库崩溃：`ReferenceError: latestMsg is not defined`**

原因：旧版包 auto-ingest.js 的已知缺陷（2026-09-03 修复）。
处理：更新到最新发布包；或自行修复——把 src/auto-ingest.js 中 `created: latestMsg ? ...` 一行改为取 `session.messages` 数组最后一条的 `timestamp`。

**7. shared-spine 编译验证全部拒收（接受率 0%）**

原因：旧版包使用静态启发式评分（约 0.42~0.54，低于 0.65 门槛），与真实 KESPI 脱节。
处理：更新到最新发布包（评分已对接真实 KESPI）。临时绕过：shared-spine 不在代谢主链中，可忽略其验证结果，以 `node src/kespi-check.js` 的真实 KESPI 为准。

**8. Wiki 页内容明显短于 raw 原文**

原因：旧版包 compile.js 在 Wiki 页仅展示前 500 字且无标注。
处理：更新到最新发布包（已放宽至 2000 字并加显式截断标注；数据库中始终保存全文，检索不受影响）。

**9. 语义检索搜不到刚入库的新笔记（2026-09-03 已根治）**

历史原因：向量索引曾默认 64 维哈希，语义搜索用 384 维，维度不匹配导致新入库内容搜不到，需手动 `--semantic --reindex` 补索引。
现状：`index-vectors.js` 已改为**模型在即语义**——默认 384 维（模型内置本地，零外呼），模型缺失自动回退 64 维哈希，`--hash` 可强制哈希模式。新入库实体即建语义索引，入库即可被语义召回。
处理：若库中仍存有历史 64 维残留实体，执行一次 `node src/index-vectors.js --reindex` 全量升级。

**10. 常驻服务相关（scheduler / api-server，2026-09-03 新增）**

- 调度器不触发代谢：确认间隔 `AING_SCHEDULER_INTERVAL_MS`（默认 1800000ms）与 raw/ 轮询未关（`AING_WATCH_RAW=0` 会关闭）；raw/ 检测为 mtime 快照轮询（15s），不是实时 watch。
- API 端口冲突：默认 3789，`AING_API_PORT` 可调；设 `AING_API_KEY` 后监听 0.0.0.0 且除 /health 外均需 Bearer 认证，未设则仅监听 127.0.0.1（本机信任模式）。
- API 入库消息"消失"：消息先入内存批，10s 冲洗一次（满 5 条或 30s 间隔落盘），非实时；同内容重发会被 SHA-1 指纹账本去重跳过（账本在 `data/ingest-hashes.json`，误杀可删）。

## 四、使用约定

- `wiki/links/index.md` 为自动生成文件，每轮代谢会重新生成，无需手动编辑。
- 运行产生的 knowledge.db 变更与 logs 属于本机运行数据，正常存在。
- src/ 为发布代码，如需修改建议以 issue / patch 形式反馈：github.com/doerking/aing
