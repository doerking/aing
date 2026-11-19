---
tags: [aing-v2, agent, 改写, 操作手册, must-read:9, agent:8]
description: aing-v2 agent 操作手册——按改写后状况写，agent 出场接线/日常操作/派单/验收，无第三方名称、无路径泄露
date: 2026-11-13
status: draft（改写版）
---

# aing-v2 · Agent 操作手册

> 本手册按改写后状况撰写：**不含第三方名称、不泄露真实路径**。所有命令执行位置为本仓根（`<repo-root>`）。

## 〇、命令可用性（2026-11-16 实况，唔好盲跑）

进度真源：`STATUS.md`。以下命令表按当前实现标注，未实现嘅跑咗会 `MODULE_NOT_FOUND`——**唔系你环境问题**。

| 命令 | 状态 | 说明 |
|---|---|---|
| `npm test` / `node test/run-all.js` | ✅ 可用 | 161 档 / 1060 条断言 |
| `npm run test:guard` | ✅ 可用 | test 计数只加唔减（R4）|
| `node verify-deploy.js` | ✅ 可用 | C0–C21 共 33 项门禁 |
| `node src/memo.js` | ⬜ CLI 未接 | 读端模块已实现（3.11），命令行入口待接 |
| `node src/neural.js` | ✅ 可用 | 控制面四动作 event/inhibit/status/verify（3.2）|
| `node src/cli.js memo` | ✅ 可用 | CLI 开库入口（SPEC-3.14）：memo / predict / ingest / access / self-optimize / orchestrate / reindex |
| `node tools/link-sample.js --db <副本>` | ✅ 可用 | 链接质量取样单（SPEC-2.19）：edges / twohop |
| `node tools/judge-score.js --in <已填单>` | ✅ 可用 | 只认人手判定的计分（未判拒收，分母 0 说样本不足）|
| `node tools/semantic-bench.js` | ✅ 可用（需 devDep + 模型）| 语义后端旁路评测（SPEC-5.4）：本地 ONNX 在冻结集上出 P@10 / R@10 / 顶1，只量不接；首跑联网取模型（约 118MB），`AING_HF_HOST` 可换镜像 |
| `node tools/backend-ab.js --db <副本>` | ✅ 可用 | 后端对照自测（SPEC-5.6）：字面 vs 语义各前 3 张卡并排出单，判定列手填后用 `tools/judge-score.js` 计语义胜率 |
| `node tools/migrate-run.js` | ✅ 可用 | 旧库迁移（冷备份 + 零丢失复核 + 首跑）|
| `node src/query.js` | ⬜ M1 后（1.8/1.14）| 检索面 |
| `node src/auto-ingest.js` | ⬜ CLI 未接 | 入库模块已实现（3.5），命令行入口待接 |
| `node src/meko-orchestrator.js` | ⬜ M1 关键路径尾（1.14）| 编排 |

**过渡期纪律**：v2 未有仪表台之前，出场接线（读 memo / 喂 event）**照旧用旧库** `G:\DPD\aing`，两库唔互写。

## 一、出场接线（每次开场必做）

1. **读意识层仪表台**（读端纯读，不扰表）：
   ```bash
   node src/memo.js --summary
   ```
   看三块：用户待办 / 健康判定（ok / degraded / broken）/ 派单建议。健康异常按指标指向先动，唔猜。

2. **健康指标异常动作**：

   | 指标 | 异常动作 |
   |---|---|
   | 意识层 stagnant | `node src/run-metabolism.js`（meko 编排螺旋推进） |
   | 蒸馏债 > 0 | `node src/distill.js` |
   | 语义检索 offline | `node src/index-vectors.js --semantic --reindex` |
   | health broken | 先修链路再谈维护 |

## 二、喂意识层事件（取端常驻双回路）

关键节点（验证红绿 / 拍板落地 / 发现缺陷 / 收队）必喂事件返机体：

```bash
node src/neural.js event '{"channel":"anomaly","target":"<单号>","source":"<agent名>","strength":<1-9>,"note":"<事实+证据>"}'
```

- **合法 channel 九个**：structure / semantic / temporal / kespi / behavior / feedback / anomaly / intent / generic
- **source 必带 agent 名**——唔带归 unknown 冇链
- 无真跑证据唔入账（拒伪造）

> Windows PowerShell 引号坑：事件 JSON 落文件 + runner 读文件喂 `run()`，避开 argv 双引号被剥。

## 三、双层蜂群（谁维护 / 谁派工）

- **内蜂群**（自维护）：5 固定角色，**随包自洽部署**（`<skill-assets>/` 下，不依赖任何外部运行时）。健康驱动派单 + agent 手动。触发源=新架构读数面（KESPI/verify/meko_cycles）。详见 [SPEC-0.5](./spec/SPEC-0.5-内外蜂群接线与部署重设.md)。
- **外蜂群**（对外派工）：载体在宿主运行时面。aing-v2 只做链路保障（轨迹留痕/心跳/归因考核）。
- **两套不桥接**。

按标签取技能：`node src/query.js "<标签>"`（advisory-only，判断后自挂，唔自动执行）。

## 四、日常操作

| 动作 | 命令 |
|---|---|
| 一轮代谢（meko 编排） | `node src/meko-orchestrator.js` |
| 检索（三轴判定 + 命中写回） | `node src/query.js "<问题>"` |
| 会话入库 | `node src/auto-ingest.js <session-id> "<文本>"` |
| KESPI 八维自检 | `node src/kespi-check.js` |
| 逻辑退役（非物理删） | `node src/prune.js`（默认 dry-run） |

> **向量后端**：缺省 `onnx-e5-small`（语义，SPEC-5.9）；字面 `hash-64w2` / 旧口径 `hash-64` 保留做对照与回退。用 `AING_VECTOR_BACKEND=<后端名>` 或 `opts.backend` 切换，换后 `vectorStep` 全量重建；检索按 `model`+`dim` 过滤，不同后端永不互比。语义后端未注册时缺省回退字面并带 `fallback` 标记（不静默）。
> **换不换由使用者的语料定**：评测排名只证明「在评测集上谁强」。口径见 README「六·补 检索口径」，记录见 `docs/Engineering/EMBEDDING-BENCH-2026-11-16.md`；发布默认值不按测试集排名改。

## 五、验收铁律

- **无 ALL GREEN 不宣布完成**：`node tools/verify-deploy.js` 全绿才算部署完成。
- **每任务 failing test 先行**：test 定义 done。
- **failing test 必须是 assertion failure**（正确的红），唔係 setup error。
- **test count guard**：test 只加不减。
- **假院真跑**：隔离验证，唔污染真库。
- **迁移前冷备份**。

## 六、改写宪法（全仓遵守）

1. 不出现第三方名称（用中性描述 / 自研名）
2. 不泄露真实路径（用语义占位符 `<repo-root>` 等）
3. 内蜂群按新架构自洽部署（脱离外部载体）
4. readme / agent / 技术文档全按改写后状况写

---

> 本手册随引擎改写同步更新；任何第三方名称或路径泄露均属违宪，发现即清。