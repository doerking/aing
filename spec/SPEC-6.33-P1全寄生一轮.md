---
tags: [aing-v2, spec, 六段叙事, P1, 寄生位, 工单, 写回, 闭环, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.33 P1 全寄生一轮——外部件领 P1 单交六段，系统渲染写回并保留 turns，重算 kq 后验收转 verified
date: 2026-11-19
status: 已落地（test-6.33-p1-round 7/7）
owner: hana
upstream: [spec/SPEC-6.32-叙事工单口径对齐六段.md, spec/SPEC-6.19-寄生位注册表与取单口.md, spec/SPEC-6.24-P2半寄生端到端.md]
---

# SPEC-6.33 · P1 全寄生一轮

> **一句话**：6.32 已经能对烂叙事开 P1 工单，但没有接单方交六段、系统写回的那一段——工单开得出来，走不到「重写后转 verified」。

## 一、链路

```
低分叙事 → kq-low-narrative 单（P1/full）
        → 外部件 claim（只读单+原料）
        → 回单 { sections: 六段, result: 四证据 }
        → 系统 applyReturn：renderSections → 写 content
        → kespiStep 重算 → verifyTickets 按 acceptance 判 → verified
```

## 二、写回口径（`applyReturnNarrative`）

- 解析原 content 的 narrative JSON，**只换 `markdown` 与 `stats.bodyChars`**。
- `turns` 原样保留——外部件写叙事不代表抹掉既有轨迹（与 6.28「full 不生成 turns」不冲突：那条讲的是新入库，这里讲的是改写已有件）。
- `narrative` 标记置 `{mode:'full', slot:'P1', provided:true}`，与系统自拼可区分。
- 标签不动（外部件回单不带标签时）；要加标签须明写在 `patch.addTags`。
- 坏 JSON / 非叙事 content → 抛错，不静默改写（这不是能猜的场景）。

## 三、边界

- 外部件仍不写库：`externalPartNarrative` 前后库快照必须一致。
- 回单缺 `selfAssessment` 由既有 `gate:publish` 拒，不经本层兜底。
- 只对副本跑（工具保持真库拒跑）。

## 四、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | `NARRATIVE_REG` 为 P1/full |
| AC-1b | 低分叙事开出的 P1 单，P1 接单方 claim 得到 |
| AC-2 | 外部件取单+读原料前后，库快照逐表一致（不写库） |
| AC-3 | 写回后 content 可解析，markdown 六段齐全，`turns` 保留 |
| AC-4 | `narrative` 标记为 P1/full/provided |
| AC-5 | 重算后 kq ≥ 0.50，工单转 verified 且 reason=accepted |
| AC-6 | P2 接单方 claim 不到 P1 单（位不混） |

## 五、仍开着的

1. P1 的「注册—取单」仍靠工具/测试驱动，没有常驻进程自动接单。
2. 外部件的六段由本工具按模板生成——真实模型写六段的质量未验（接模型属下一层）。
3. 改写叙事会覆盖旧 markdown；旧版本没有留档（是否要版本记录，待议）。
