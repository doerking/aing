---
tags: [aing-v2, spec, 错误码, 行动表, 运维, engineering:7, must-read:6, capability, delivery, operations]
description: SPEC-6.46 错误码行动表——src 里抛出的每个带码错误都登记分类与处置动作；新增错误码不登记会被结构测试抓住
date: 2026-11-19
status: 已落地（test-6.46-error-codes 7/7）
owner: hana
upstream: [docs/COVERAGE-旧院功能面覆盖判定-2026-11-18.md, spec/SPEC-6.12-落盘安全.md, spec/SPEC-3.6-身份闸标签闸.md]
---

# SPEC-6.46 · 错误码行动表

> **一句话**：旧院有 error-handler，v2 的错误散在 40 多个 `throw new Error('code: ...')` 里，没人知道哪条该重试、哪条该补输入、哪条是接线炸了。现在统一登记，并让测试守住「新码必登记」。

## 一、口径

### 1.1 四类处置

| 类别 | 含义 | 动作 |
|---|---|---|
| `wiring` | 调用方没接好（如未注入 store） | 改接线，不是用户能处理的事 |
| `fix-input` | 输入不合契约（缺 id、叙事不全、边方向非法） | 按 action 补输入后重试 |
| `retryable` | 暂时性冲突（锁、外部改写、落盘竞争） | 等待/重载后再试 |
| `operator` | 需人拍板或查现场（迁移指纹、容量、写面被改） | 人工介入 |

### 1.2 表结构

```
ERROR_TABLE = { code: { klass, action } }
classify(errOrString) → { code, klass, action, known }
```

- **未知码不抛**：返回 `klass:'unknown'` + 通用动作（先看原文、再查 spec）。
- **wiring 家族**：`... 需要 store 注入（SPEC-…）` 一类消息按模式识别，不逐条登记。
- **结构守卫**：测试扫描 `src/*.js` 的 `throw new Error('<code>`，凡形如小写错误码的必须在表内——新增码不登记即红。

### 1.3 CLI

`node tools/errors.js`：打印全表（code / klass / action）。
`node tools/errors.js --json`：输出 JSON，供脚本消费。
`node tools/errors.js --explain "<消息>"`：单条分类。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | 结构守卫：src 中所有小写错误码都在表内 |
| AC-2 | 表项四要素齐（klass 属于四类、action 非空），code 不重复 |
| AC-3 | `classify` 对 identity-rejected / db-locked / id-required 分类正确 |
| AC-4 | `classify` 接受 Error 实例与字符串两种入参 |
| AC-5 | 未知码返回 `unknown` 且不抛 |
| AC-6 | wiring 家族（「需要 store 注入」）被识别为 `wiring` |
| AC-7 | CLI `--json` 可解析且条数与表一致 |

## 三、边界

- 不改任何 `throw` 语句、不改错误消息文本（消息是被测契约）。
- 表是**分类**不是**翻译**；不做错误码重命名。
- 不接告警、不写库。

## 四、仍开着的

1. 分类是静态表，没有按运行上下文细化（同一 code 在不同调用点的动作可能不同）。
2. tools/ 层的错误码未纳入守卫（只守 src）。
3. 「零 LLM 核心」下影响低，暂不接自动恢复动作。
