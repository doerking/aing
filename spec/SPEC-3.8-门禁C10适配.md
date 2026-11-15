---
tags: [aing-v2, spec, 门禁, C10a-C10i, 入库契约, 身份闸, M3, spec:9, gate:9]
description: M3.8 门禁 C10a–C10i 适配——绿名单双射、面板读数同源、蒸馏真写、旋钮三面同构、库内完整性、防复活、入库端到端、痕迹剥除、写面双闸
date: 2026-11-16
status: draft（Hana 定判据）
owner: hana
upstream: [SPEC-3.5, SPEC-3.6, SPEC-3.11, SPEC-3.4, SPEC-1.5]
---

# SPEC-3.8 · 门禁 C10a–C10i 适配

> 旧院 C10 九道闸全部有真实教训。v2 保留语义、落到新组件：
> 绿名单、面板读数、蒸馏写路径、旋钮模板、库内完整性、砍件防复活、入库契约、剥除、写面双闸。

---

## 一、目标

C10a–C10i 九项全绿，且每项指向 v2 真写路径或真契约，唔留空转。

## 二、闸表（v2 映射）

| # | 判据 | 实现 |
|---|---|---|
| C10a | baseline ↔ test 文件双射 | `test/baseline.json` ↔ `test/test-*.js` |
| C10b | 面板读数与库同源 | `test-3.11-memo.js` |
| C10c | distill 临时库真写 | `test-1.5-distill.js` |
| C10d | DEFAULTS ↔ KNOB_PATHS ↔ COMPONENT_MAP 三面同构 | `config-runtime.js` |
| C10e | 采样库真写后孤儿行 0、主键去重 | `tools/db-integrity.js` |
| C10f | 砍件防复活（tenant/guardrails 等） | src require 扫描零命中 |
| C10g | 入库端到端契约（三源 + 身份） | `test-3.5` + `test-3.13` |
| C10h | 采集痕迹真剥净 ≥3 处 | `ingest-scrub.js` 真跑 |
| C10i | 写面身份闸 + 标签闸 | `test-3.6-api-gate.js` |

## 三、Acceptance Criteria

| # | 判据 | 检验方式 |
|---|---|---|
| AC-1 | 九项全在 | VD_ONLY 跑 C10a–C10i 逐个 ✅ |
| AC-2 | 无红 | 退出码 0 |
| AC-3 | 关键闸真跑 | 输出含「剥除 N 处」与「身份/标签双闸绿」 |

## 四、Non-Goals

- 唔测 HTTP 服务外网暴露（控制面归 3.2）
- 唔做旧院 panel.json 新鲜度（v2 面板由 memo 现算，无落盘读数）

## 五、契约

- 每道闸独立可跑：`VD_ONLY=C10h node verify-deploy.js`
- 闸失败必须有非零退出码

## 六、依赖

- 上游：SPEC-3.5、SPEC-3.6、SPEC-3.11、SPEC-3.4、SPEC-1.5
- 消费者：3.9（意识层/读端闸）
