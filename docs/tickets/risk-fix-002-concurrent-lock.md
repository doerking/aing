---
tags: [ticket, risk, fix, concurrent, lock]
priority: P1
status: open
created: 2026-09-08
source: deep-analysis-report
---

# 工单 #002：并发冲突（原子锁陈旧回收）

## 问题描述

**现状**：`run-metabolism.js` 使用跨进程原子锁（N1 纪律），锁文件损坏时保守拒绝（exit code 1）。

**风险**：
- 锁文件损坏（如进程崩溃）导致代谢永久阻塞
- 陈旧锁回收窗口 30min，长代谢任务可能被误判
- 无强制清理命令，需手动删除锁文件

## 影响范围

- 定时代谢（scheduler）可能卡死
- 手动触发代谢可能被拒绝
- 运维成本增加

## 修复方案

### 方案 A：添加强制清理命令

```bash
# 新增 CLI 命令
node src/run-metabolism.js --force-lock
# 或删除锁文件
rm data/metabolism.lock
```

### 方案 B：缩短陈旧锁回收窗口

```javascript
// run-metabolism.js
const LOCK_STALE_MS = 10 * 60 * 1000; // 10min（原 30min）
```

### 方案 C：锁文件健康检查

```javascript
function validateLockFile(lockPath) {
  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    const { pid, startedAt } = JSON.parse(content);
    if (!pid || !startedAt) throw new Error('Invalid lock format');
    return true;
  } catch (e) {
    console.warn(`⚠️  锁文件损坏: ${e.message}`);
    return false;
  }
}
```

### 方案 D：锁竞争退避策略

```javascript
function acquireLockWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const lock = acquireLock();
    if (lock.ok) return lock;
    console.log(`⏳ 锁竞争中，重试 ${i + 1}/${maxRetries}...`);
    sleep(5000);
  }
  throw new Error('Lock acquisition failed after retries');
}
```

## 验收标准

- [ ] `--force-lock` 命令可用
- [ ] 锁文件损坏时给出友好错误提示
- [ ] 陈旧锁回收窗口可配置（环境变量）
- [ ] 添加集成测试验证锁竞争场景

## 优先级

**P1** — 影响运维稳定性，需修复但不阻塞核心功能

## 负责人

待定

## 截止日期

2026-09-22

---

*来源：deep-analysis-report（2026-09-08）*
*关联：AGENTS.md N1 纪律，run-metabolism.js 并发控制*
