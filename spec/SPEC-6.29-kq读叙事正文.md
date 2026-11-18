---
tags: [aing-v2, spec, 六段叙事, kq, 读数, 入库, 质量, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.29 kq 读叙事正文——cleanBody 先取 narrative JSON 的 markdown 再量长度，避免 JSON 外壳与 turns 虚增质量分
date: 2026-11-19
status: 已落地（test-6.29-narrative-kq 5/5）
owner: hana
upstream: [spec/SPEC-6.28-P1入口成形六段叙事.md, spec/SPEC-6.12-KESPI读数.md]
---

# SPEC-6.29 · kq 读叙事正文

> **一句话**：六段叙事存的是 JSON（markdown + turns + stats），`cleanBody` 直接量整串——键名和 turns 把长度撑大，一段只有四个字的叙事也能拿到 0.675 的质量分。

## 一、病证

| 实体 | 正文 | JSON 外壳 | 修前 kq | 修后 kq |
|---|---|---|---|---|
| 薄叙事（正文 4 字、turns 8000 字） | 4 字 | 8.1k | **0.675** | 0.078 |
| 同长度纯文本 | 4 字 | — | 0.078 | 0.078 |

外壳比正文大两千倍，读数完全失真。

## 二、改法

```js
narrativeBody(content)  // content 是 narrative JSON → 取 markdown；否则原样
cleanBody(content)      // = _cleanText(narrativeBody(content))
```

- 只认 `format === 'capability-narrative-v1'` 且 `markdown` 是字符串；其他 JSON 一律原样。
- 坏 JSON、缺 markdown → 退回原串，**不抛**（读数环节不能因一条脏数据停摆）。
- `cleanBody` 签名不变，调用方无感。

## 三、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 薄叙事不被 JSON 外壳抬分（≤ 同长度纯文本 + 0.1） |
| AC-2 | 厚叙事读数与同长度纯文本相当（差 ≤ 0.15） |
| AC-3 | 坏 JSON / 缺 markdown 退回原串不抛 |
| AC-4 | 非叙事实体读数不受影响 |
| AC-5 | `narrativeBody` 纯函数且取 markdown |

## 四、边界

- 不改 kq 公式（长度 / 标签 / 置信度三段权重）。
- 不解析 `turns` 做额外加权——结构化轨迹另有 trajectory 链负责。

## 五、仍开着的

1. 真库里 139 条会话全是三源格式，六段叙事**至今 0 条**——本轮修的是「第一条叙事进来时不会错」，不是回填历史。
2. 叙事「六段是否齐全」没有进读数：缺段的叙事只要正文够长，kq 一样高。要不要给段覆盖率加权，是下一个决定。
