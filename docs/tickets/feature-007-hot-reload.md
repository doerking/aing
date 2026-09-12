---
tags: [ticket, feature, hot-reload, config]
priority: P2
status: open
created: 2026-09-08
source: deep-analysis-report
---

# 工单 #007：热重载支持

## 问题描述

**现状**：修改 `growth.config.js` 后需重启进程才能生效。

**影响**：
- 运维成本高（需重启 scheduler/api-server）
- 调试不便（改配置→重启→验证）
- 生产环境风险（重启导致服务中断）

## 影响范围

- `growth.config.js`（配置中心）
- `src/*.js`（所有引用配置的模块）
- `src/scheduler.js`（常驻进程）
- `src/api-server.js`（HTTP 服务）

## 修复方案

### 方案 A：配置监听 + 缓存清除（推荐）

```javascript
// src/config-runtime.js
const fs = require('fs');
const path = require('path');

class ConfigRuntime {
  constructor(configPath) {
    this.configPath = configPath;
    this.cache = null;
    this.watchers = new Map();
    this._load();
    this._watch();
  }
  
  _load() {
    delete require.cache[require.resolve(this.configPath)];
    this.cache = require(this.configPath);
    console.log(`✅ 配置已加载: ${this.configPath}`);
  }
  
  _watch() {
    const watcher = fs.watch(this.configPath, () => {
      console.log('📝 检测到配置变更，重新加载...');
      this._load();
      this._notifySubscribers();
    });
    this.watchers.set(this.configPath, watcher);
  }
  
  get() {
    return this.cache;
  }
  
  _notifySubscribers() {
    for (const callback of this.subscribers) {
      callback(this.cache);
    }
  }
  
  subscribe(callback) {
    this.subscribers.add(callback);
  }
}

module.exports = new ConfigRuntime(path.join(__dirname, 'growth.config.js'));
```

### 方案 B：进程级热重载

```javascript
// src/scheduler.js
const { gracefulReload } = require('./hot-reload');

gracefulReload({
  onConfigChange: () => {
    console.log('🔄 配置变更，重新初始化...');
    // 重新初始化组件
  },
  onCodeChange: () => {
    console.log('🔄 代码变更，重启进程...');
    process.exit(0); // 让 PM2/系统重启
  }
});
```

### 方案 C：环境变量覆盖（临时方案）

```bash
# 无需重启，直接覆盖
export KESPI_GREEN_LIGHT=0.85
export TRI_PATH_EXPLORE_AGREE=0.75

node src/scheduler.js
```

## 验收标准

- [ ] 修改 growth.config.js 后自动重载
- [ ] 不中断现有请求（api-server）
- [ ] 不丢失内存状态（scheduler）
- [ ] 添加配置变更日志
- [ ] 单元测试验证重载逻辑

## 优先级

**P2** — 运维体验优化

## 负责人

待定

## 截止日期

2026-10-15

---

*来源：deep-analysis-report（2026-09-08）*
*关联：growth.config.js, scheduler.js, api-server.js*
