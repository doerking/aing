---
tags: [aing-v2, spec, 核心代谢, kespi, 八维, M1, spec:8, kespi:8]
description: M1.12 kespi spec——八维评分全部从库内可测事实计算（质量/成长/活跃/完整/连接/一致/时效/平衡），KD 只认有效邻居，KC 走双链一致，落 kespi_scores 不反写实体
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-0.1 修订 C, SPEC-1.4, SPEC-1.7, SPEC-1.11]
---

# SPEC-1.12 · kespi（八维评分）

> 旧院 KESPI 有六套实现、阈值漂移（核读 S5）。v2 只留一套：**每一维都必须从库内事实算出来**，
> 算不出的维度不许发明。KD 改「有效邻居」，KC 改「双链一致」——两处都是旧院最名不副实的地方。

---

## 一、目标

为每个有效实体算 8 个 0–1 维度与 overall（均值），写 `kespi_scores`。

## 二、八维定义（全部可测）

| 维 | 含义 | 公式 |
|---|---|---|
| KQ 质量 | 内容厚度 | `min(1, len/200)*0.7 + 有标签*0.15 + confidence*0.15` |
| KG 成长 | 近期更新 | 30 天内 = 1；否则 `exp(-d/90)` |
| KA 活跃 | 检索活跃 | 7 天内 = 1；NULL = 0.2；否则 `exp(-d/30)` |
| KM 完整 | 字段齐备 | name/type/content/tags 齐 → 四分之一计 |
| KD 连接 | **有效**邻居 | `min(1, 有效邻居数 / 5)`（`invalid_at` 边不计）|
| KC 一致 | **双链**一致 | 镜像存在且内容逐字相同 = 1；有镜像不同 = 0.4；无镜像 = 0.3 |
| KR 时效 | 新鲜度 | `exp(-createdDays/365)` |
| KB 平衡 | 强度-连接匹配 | `1 - abs(strength/9 - min(1, 有效邻居/5))` |

- overall = 八维算术均值，保留 4 位
- 日粒度衰减（同日内重复计算结果一致，保证幂等可测）

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 八维落表 + overall=均值 | kespi_scores 列齐；overall ≈ mean(8) |
| AC-2 | 退役不评 | invalid_at 非空 → 无行 |
| AC-3 | KD 只认有效邻居 | 一条有效边 + 一条退役边 → KD=0.2；只有有效边 |
| AC-4 | KD 随连接上升 | 0 邻居 < 2 邻居 < 5 邻居 |
| AC-5 | KC 双链一致 | 一致=1；不一致=0.4；无镜像=0.3 |
| AC-6 | 幂等（同日） | 两趟 overall 相同，行数不变 |
| AC-7 | 铁律 | last_access 不变；源码无 `DELETE FROM` |
| AC-8 | 增量评分（修订 K，2026-11-20） | `opts.incremental=true` 只选「脏实体」：无评分行 / `updated_at > computed_at` / `last_access > computed_at`；干净实体不重评；不带 incremental 仍是全量 |

## 四、Non-Goals

- 不做红黄阈值判定（growth 配置，后续期）
- 不做 KESPI 历史表（`kespi_history` 属旧院，v2 暂不建）
- 不改实体列

## 五、契约

- 组件 id `kespi`，strand `wiki`，band `background`，reads `['entities','links']`，writes `['kespi_scores']`，budgetTick 1，reversible true
- 入口：`async kespiStep(store, opts) -> { scanned, scored }`；纯函数 `scoreEntity(ctx)`

## 六、依赖

- 上游：SPEC-0.1 修订 C、SPEC-1.4（镜像）、SPEC-1.7（边一致）
- 消费者：2.9/2.10 健康口径、2.12 动作判定

## 七、修订 A（2026-11-18，五维重构：催化率 / 时序相干 / 续航）

- 动机（真库 320 条实测）：八维里 **KG/KM/KC 恒等于 1.0、KR≈0.99、KQ 85% 卡 0.85 上限**，实际只有 KA/KD/KB 三维有分辨力。复算校验与库内读数零漂移，说明不是算错，是维度本身空转。
- 方向：KESPI 回答「这条知识在代谢里还活着吗」，不回答「它答得好不好」。据此重定义为五维（各 0.2，无加权）：

| 维 | 公式 | 数据来源 |
|---|---|---|
| KQ 质量 | `min(1, 去壳正文长度/400)×0.6 + min(1, 标签数/3)×0.25 + 置信度×0.15`，夹 [0,1] | 实体列（去卡片壳：首行标题、`## 来源/关系/KESPI 状态` 段） |
| KA 活跃 | 同旧：`last_access` 与 `access_hits` 取更近；≤7 天=1，否则 `exp(-d/30)`；无证据=0.2 | 实体列 + access_hits |
| KD 催化率 | `min(1, 出向强边数/3)`；强边 = `strength≥7` 且关系非 `sprout-candidate`/`pollinate-candidate`、`invalid_at IS NULL` | links |
| KC 时序相干 | 派生件（`relation='derived'`、出向）在最近 10 个 **executed 且已记账**的轮里与母件同轮在世的占比，按子件取均值；无派生件或轮数不足=**0.5 中性** | links + entity_rounds（SPEC-1.16） |
| KR 续航 | 最近 10 个 **executed 且已记账**的轮里该实体在场的占比；无轮次=**0.5 中性** | entity_rounds + meko_cycles |

- `overall = 五维无加权均值`。`kg/km/kb` 列保留但写 **NULL**（退役，不再参与 overall）；`kc`/`kr` 列改存新语义；`kd` 列改存催化率。
- 失败轮不计入 KC/KR（只 join `meko_cycles.status='executed'`），避免失败轮把在场率算虚；
- 记账前的旧轮没有 `entity_rounds` 行，**不能把「没记账」当「缺席」**：窗口只取「executed 且已有账行」的轮（2026-11-18 副本实测：不这么改，322 条 KR 全部被旧轮拖到 0.2）。
- 消费方阈值同步重定（绝对值整体下移，不可照搬旧值；真库 320 条实测命中）：
  | 消费方 | 旧 | 新 | 依据 |
  |---|---|---|---|
  | field-promote `KESPI_MIN` | 0.55（v1 下 320/320 全过，空转） | **0.55**（v2 下 = 前 36%，322 条实测 115 条通过；随记账轮次增加会收缩） | 阈值不变、含义变了：从「全员」变成真正的质量闸 |
  | evolution-team 平均健康 `≥0.6` | 恒真（均值 0.836） | **≥0.45**（≈中位） | 防止改为 v2 后恒假 |
  | self-optimize `ZONES` | red 0.65 / green 0.80 | **red 0.45 / green 0.60** | 五维实测分位：p25 0.46 / p50 0.51 / p67≈0.60；第一轮 KR 偏高（只有 2 个有账轮），10 轮后需复核 |
  | self-optimize 维规则 | kg/km/kd/kb 各一条 | **kq<0.50 / ka<0.30 / kr<0.30**（memo-card）、**kd<0.40**（rebond，仅「入向强边≥2」开单）；KC 暂不开单 | 零催化是常态，不是病；被引用却不向外催化才值得回炉；KC 的旧 reconcile 只补镜像，对派生相干无效，等派生边稳定后再定动作 |
- 边界：KC/KR 在第一轮几乎全是中性 0.5，随记账轮数增加才成形；公式里不编造数据。
- 测试：test-1.12-kespi（五维 + 中性 + 轮次口径）、test-6.8-self-optimize（新规则与阈值）。
