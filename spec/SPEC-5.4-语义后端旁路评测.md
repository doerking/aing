---
tags: [aing-v2, spec, 向量后端, 语义评测, 旁路评测, 冻结集, M5, spec:9, vector:8, benchmark:8]
description: M5.4 语义后端旁路评测 spec——用本地 ONNX 小模型在冻结集上离线量 P@10/R@10/顶1，只作选型证据；不进 src 管线、不改发布默认、不联网跑生产
date: 2026-11-17
status: 实装
owner: hana
upstream: [SPEC-5.1, SPEC-5.3, docs/Engineering/EMBEDDING-BENCH-2026-11-16.md]
---

# SPEC-5.4 · 语义后端旁路评测（本地 ONNX）

> 状态：实装（2026-11-17）
> 上游：SPEC-5.1（后端可插拔）、SPEC-5.3（排序修正）、`docs/Engineering/EMBEDDING-BENCH-2026-11-16.md` §二 / §五
> 定位：**只回答「换语义后端值不值」，不动管线、不动发布默认。**

---

## 一、为什么旁路

现有两个内置后端（`hash-64` / `hash-64w2`）都是字面级：同一冻结集上 `exact` 题顶 1 命中 87.1%，`paraphrase` 只有 38.3%。要判断语义后端能把这一列抬多高，必须先量；但 `src/vector.js` 的 `embed` 契约是**同步**的，而神经网络推理是异步的——直接把语义模型塞进 `vector.js` 就得把 `vectorOf` / `vectorStep` / 检索全链改成 async，测试面大且与「发布包自洽」冲突。

所以本件规定：**语义后端只以旁路方式评测**——自己编码语料与题目、自己算余弦排序、复用与 `tools/bench-retrieval.js` 完全相同的指标函数出表。量出来的数只作选型证据，管线一行不改。

## 二、约束（硬）

| # | 约束 |
|---|---|
| R1 | **不进 `src/` 的依赖面**：`onnxruntime-node` / `transformers.js` 只作 `devDependencies`，`require` 只出现在 `tools/` 内，且延迟到实际使用时才加载 |
| R2 | 不改 `src/vector.js` 的 `embed` 同步契约，不改 `vectorOf` / `vectorStep` / `retrieval.search` |
| R3 | 不改冻结集：`data/eval/FROZEN.json` 的 sha1 与字节数一字不动，旁路评测只读 |
| R4 | 不改发布默认后端：`MODEL` 仍是 `hash-64w2`，换不换另行裁定 |
| R5 | 同一模型同一参数复跑，结果逐字一致（排序确定性：分数降序、同分按 id 升序） |
| R6 | 无网络也能跑：模型已缓存到本地后，评测不依赖外网 |

## 三、组成

- `src/semantic-rank.js`（纯函数，无外部依赖）：`cosine` / `rankBy` / `evaluate`。
  - `embedBatch` 由调用方注入（测试注入假嵌入器，生产注入 ONNX 适配器），因此本文件可单测、不进网络。
  - 前缀：E5 系列要求 `query: ` / `passage: `，由 `queryPrefix` / `docPrefix` 显式给出，**每个文本恰好加一次**。
- `tools/onnx-embed.js`：transformers.js 适配器，`createOnnxEmbedder({ model, host })` → `async embedBatch(texts) → Float32Array[]`；模型名、镜像主机可由参数或环境变量给出。
- `tools/semantic-bench.js`：CLI，读同一套 `data/eval/*.jsonl` 与 `FROZEN.json`，出与 `bench-retrieval.js` 同格式的表（P@10 / R@10 / 负例命中率，按 lang / kind 分层），另加顶 1 一行；`--json` 出结构化结果。

## 四、指标口径

- **完全复用** `tools/bench-retrieval.js` 的 `metricsFor` / `aggregate`，不另写一套：P@10、R@10、负例命中率三项与字面后端逐字可比。
- 顶 1：`k=1` 时同一函数返回的 `p10`（单正例题即命中与否）。
- 结论看 **paraphrase 列**：`exact` 已经 87.1%，语义后端的价值全在「换个说法」这一列。

## 五、验收（`test/test-5.4-semantic-bench.js`）

| AC | 断言 |
|---|---|
| AC-1 | `cosine` 对零向量返回 0，不自造 NaN；同向量为 1 |
| AC-2 | `rankBy` 分数降序，同分按 id 升序（确定性） |
| AC-3 | `queryPrefix` / `docPrefix` 每个文本恰好加一次，不重复不遗漏 |
| AC-4 | `evaluate` 的指标与 `bench-retrieval.metricsFor` 对同一 ranked 列表逐字一致 |
| AC-5 | 同输入跑两次，结果 JSON 逐字一致 |
| AC-6 | 空语料 / 空题集不抛异常，计数为 0；`k` 缺省为 10 |

## 六、Non-Goals

- 不改任何生产路径（`src/vector.js` 同步契约、`src/retrieval.js`、`memo` / `predict` 的读数）。
- 不把模型文件放进仓：模型走本地缓存目录，仓里只留名字与参数。
- 不做跨模型排名竞赛：本件只量「要不要换」，量完由 owner 拍板。
- 不做区间估计与统计检验：样本就是样本，参照 SPEC-2.19 的口径。

## 七、已知边界

- 量化模型（`model_quantized.onnx`）与全精度模型的分数会有小幅差异；记录表必须写明用的是哪一种。
- E5 系列无前缀时分数系统性偏低，前缀不是可选优化而是口径的一部分——记录表必须写明前缀。
- 首跑要联网取模型（约 118MB，量化版），之后离线可复跑。
