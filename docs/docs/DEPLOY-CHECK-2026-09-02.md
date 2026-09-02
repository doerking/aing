# 部署验证清单与常见问题处理（2026-09-02）

> 本包包含双脑同步修复。部署完成后请按第二节顺序验证；遇到问题查第三节对症处理。

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

## 四、使用约定

- `wiki/links/index.md` 为自动生成文件，每轮代谢会重新生成，无需手动编辑。
- 运行产生的 knowledge.db 变更与 logs 属于本机运行数据，正常存在。
- src/ 为发布代码，如需修改建议以 issue / patch 形式反馈：github.com/doerking/aing
