---
tags: [aing-v2, spec, 红队, 演练, 防线, 攻击载荷, engineering:8, must-read:7, capability, delivery, operations]
description: SPEC-6.44 红队沙盘演练——五类已知攻击载荷对 v2 防线做双向断言（投了必被抓 + 干净料必不被误抓），全程临时库、真库零污染
date: 2026-11-19
status: 已落地（test-6.44-red-drill 7/7）
owner: hana
upstream: [docs/COVERAGE-旧院功能面覆盖判定-2026-11-18.md, spec/SPEC-3.6-身份闸标签闸.md, spec/SPEC-6.42-标签白名单与存量洗消.md, spec/SPEC-6.43-编译前闸.md]
---

# SPEC-6.44 · 红队沙盘演练

> **一句话**：覆盖判定说 v2 缺「红队演练」——对抗审查与门禁不等于进攻演练。现在把五类已知载荷在临时库上真投一遍，抓不到就是防线退化。

## 一、口径

### 1.1 纪律

- **全程沙盘**：`mkdtemp` 临时库，跑完即删（`--keep` 才留现场）。
- **真库零污染**：不读不写真库；工具不接受真库路径。
- **双向断言**：每类攻击必须被抓，同时干净料必须照常通过——防「见什么都拒」的假绿。
- **只断言现有防线**：不新造防线；演练红了改防线，不改演练。

### 1.2 五类载荷

| # | 载荷 | 打哪条防线 | 判定（抓到的样子） |
|---|---|---|---|
| S1 | 注入文本 + 内联 `[tag:evil:9]` 混在 raw 正文 | 惰性入库（零执行面） | 正文逐字入库、不被解释；tags 列不受正文影响 |
| S2 | frontmatter 塞脏标签（`bad tag` / `x:99` / 空串） | 6.42 标签形状白名单 | 脏标签一条都不入列，`tagsDropped` 计数如实 |
| S3 | 把已有实体对应 raw 改写成空正文 | 6.43 L0 完整性 | 拒收 `empty-content`，库内旧正文分毫不动 |
| S4 | 低分实体被更短正文覆盖 | 6.43 L2 KESPI 降级闸 | 拒收 `kespi-downgrade`，旧正文不动 |
| S5 | 自报身份与自报标签（非授权 actor / status=active / confidence=0.9） | 3.6 身份闸 + 标签闸 | 非授权 actor 直接拒；授权 actor 也只落 `pending-distillation`、conf NULL、tags NULL，自报标签只进正文「Agent 提议（未核验）」 |

### 1.3 输出

```
runDrills({ store, opts }) → { results: [{ id, name, pass, detail }], failures }
```

CLI：`node tools/red-drill.js [--keep]`，全过 exit 0，任一失守 exit 1。

## 二、Acceptance Criteria

| # | 判据 |
|---|---|
| AC-1 | S1 注入载荷惰性入库，tags 列不受污染 |
| AC-2 | S2 脏标签零入列且 tagsDropped 计数正确 |
| AC-3 | S3 空壳覆盖被拒、旧正文不变 |
| AC-4 | S4 降级覆盖被拒、旧正文不变 |
| AC-5 | S5 身份闸拒非授权 actor；标签闸把自报标签降为提议 |
| AC-6 | 干净对照：合规档正常入库（双侧断言） |
| AC-7 | 演练只在临时库跑，真库路径零接触 |

## 三、边界

- 不覆盖网络面（v2 无 web 取料桥）、不覆盖 shell 面（v2 无 URL 抓取）——旧院 D2/D3 类载荷在 v2 无对应攻击面，登记为「无攻击面」。
- 演练不自动修复；红了由人按 detail 定位。
- 演练不写 trajectory / 工单。

## 四、仍开着的

1. 载荷集是静态五类；没有变体生成（同义注入、编码绕过）。
2. 不测并发写与锁竞争（6.12 落盘安全另有门禁）。
3. v2 若将来接入 web 取料，需补 D2/D3 类 shell/隔离载荷。
