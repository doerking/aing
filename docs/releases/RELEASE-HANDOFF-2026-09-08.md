# RELEASE-HANDOFF-2026-09-08.md — GitHub Release 说明页交接单

> 起草：2026-09-08 ｜ 起草方：Claude（本轮执行岗）｜ 接收：推送岗（Loomy/hana）｜ 优先级：中（tag 全部就位，随时可发）

## 一、任务

GitHub Release 说明页（tag 已就位，`releases/` 页面至今为空）。**文案已全部写好**，在 `docs/releases/` 下，推送岗只需复制粘贴到 GitHub 对应 tag 的 Release 页，无需再创作。

## 二、待发布清单（3 份，按序）

| # | 说明页文件 | 粘贴到 | commit/tag | 状态 |
|---|---|---|---|---|
| 1 | `docs/releases/v0.9.0-discipline.md` | tag `v0.9.0-discipline`（`16889c0`）| 已推远端 | 仅差发布 |
| 2 | `docs/releases/v0.9.1-housekeeping.md` | tag `v0.9.1-housekeeping`（`8494623`）| 已推远端 | 仅差发布 |
| 3 | `docs/releases/v0.9.2-calibration.md` | tag `v0.9.2`（`0ce858a`）| **尚未推送** | 先推 tag 再发布 |

## 三、执行步骤

### 前置：推送 v0.9.2 批次（若尚未推）

远端 main 当前 `8494623`，本地 master 领先三个提交（快进，无 force）：

```
git -C <repo-root> push origin master:main
git -C <repo-root> push origin v0.9.2
```

可选：若想把 sync-opt（`2796805`）单独成版，打 `v0.9.3-mirror` tag 后拆开发布；默认不拆，`v0.9.2` 说明页已涵盖两者（文内注明）。

### 发布每份 Release（以 v0.9.0 为例）

1. GitHub 仓库页 → Releases → **Draft a new release**
2. Choose a tag → 输入/选择 `v0.9.0-discipline`
3. Release title：照说明页的 `## aing vX.Y.Z — 主题` 行
4. 正文：粘贴对应 `docs/releases/*.md` 中第一个 `## aing` 标题及之后全部内容（**丢弃文首的 `> 发布对象` 引用块与 `# Release` 一级标题**——那是给推送岗看的元信息，不上页面）
5. v0.9.2 建议勾选 **Set as pre-release**（0.9.x 序列未到 1.0，且含未上线 tag）
6. Publish release

### 收尾核验（三份发完后）

- [ ] Releases 页显示 3 个 Release，各自指向正确 commit
- [ ] `docs/releases/` 三份文件随下次提交入库（本交接单同批）
- [ ] 推送报告（当日 PUSH-REPORT 文件）追加一节：长分割线 + 日期 + "Release ×3 published"，格式沿用当日报告惯例

## 四、文案纪律（已遵守，后续改动也请遵守）

1. **不超前吹**：每份说明只写该 tag 时点存在的能力（v0.9.0 里没有 bootstrap/all/sync-opt，已在安装段注明分步命令）
2. **已知边界如实声明**（v0.9.0 的"已知边界"节）：种子期 8 实体、新环境 C5/C6 首跑会红、metacognition 未接线、权重为经验值
3. **校验锚点齐全**：每份附 commit/tag/回滚锚/质量门状态表
4. 命令块与 README 用法一致，出现分歧以代码实况为准

## 五、相关链接

- 推送报告：当日 `PUSH-REPORT-AING-2026-09-08.md`（含 backup 分支、tag、质量门实测记录）
- 上游交接：`PUSH-HANDOFF-AING-2026-09-08.md`（第 2 号交接单）
- 回滚锚：`backup/remote-main-20260908` = `00abed2`；真源主机另有全史 bundle `aing-history-backup-20260908.bundle`（`<repo-root>` 同级，止于 `16889c0`）
