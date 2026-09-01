#!/usr/bin/env node
/**
 * tri-path-orchestrator.js — 三路突击蜂群路由
 * 
 * 功能：
 * 1. 三路并行突击（探索/验证/优化）
 * 2. 交叉校验降级
 * 3. 队正裁决机制
 * 4. 熔断保护
 * 
 * 借鉴：agent-orchestration-patterns 蜂群编排模式
 * 
 * 使用：
 *   node tri-path-orchestrator.js run <task>
 *   node tri-path-orchestrator.js status
 *   node tri-path-orchestrator.js熔断
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  logsDir: path.join(__dirname, '..', 'logs', 'tri-path'),
  stateFile: path.join(__dirname, '..', 'data', 'tri-path-state.json'),
  circuitBreaker: {
    failureThreshold: 5,    // 连续失败阈值
    resetTimeout: 60000,    // 熔断重置时间 (ms)
    halfOpenMax: 3          // 半开状态最大尝试
  }
};

// 三路突击模式
const PATHS = {
  EXPLORE: 'explore',      // 探索路径：发散思维，生成候选
  VERIFY: 'verify',        // 验证路径：交叉检查，筛选候选
  OPTIMIZE: 'optimize'     // 优化路径：迭代改进，最终输出
};

/**
 * 三路突击编排器
 */
class TriPathOrchestrator {
constructor() {
this.state = this.loadState();
// 从持久化状态恢复熔断器（向后兼容：无 circuit 字段默认 CLOSED）
const c = this.state.circuit || { state: 'CLOSED', failureCount: 0, lastFailureTime: null, halfOpenAttempts: 0 };
this.circuitState = c.state; // CLOSED | OPEN | HALF_OPEN
this.failureCount = c.failureCount;
this.lastFailureTime = c.lastFailureTime;
this.halfOpenAttempts = c.halfOpenAttempts;
}

  /**
   * 加载状态
   */
loadState() {
if (fs.existsSync(CONFIG.stateFile)) {
try {
const state = JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8'));
// 熔断器字段持久化（向后兼容旧 state 文件）
if (!state.circuit) {
state.circuit = { state: 'CLOSED', failureCount: 0, lastFailureTime: null, halfOpenAttempts: 0 };
}
return state;
} catch (e) {
return { tasks: [], stats: { total: 0, success: 0, failed: 0 }, circuit: { state: 'CLOSED', failureCount: 0, lastFailureTime: null, halfOpenAttempts: 0 } };
}
}
return { tasks: [], stats: { total: 0, success: 0, failed: 0 }, circuit: { state: 'CLOSED', failureCount: 0, lastFailureTime: null, halfOpenAttempts: 0 } };
}

  /**
   * 保存状态
   */
saveState() {
// 熔断器状态一并持久化，否则重启即回 CLOSED，熔断命令形同虚设
this.state.circuit = {
state: this.circuitState,
failureCount: this.failureCount,
lastFailureTime: this.lastFailureTime,
halfOpenAttempts: this.halfOpenAttempts
};
fs.mkdirSync(path.dirname(CONFIG.stateFile), { recursive: true });
fs.writeFileSync(CONFIG.stateFile, JSON.stringify(this.state, null, 2), 'utf8');
}

  /**
   * 检查熔断器
   */
  checkCircuit() {
    if (this.circuitState === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > CONFIG.circuitBreaker.resetTimeout) {
        this.circuitState = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
        console.log('  ⚡ 熔断器: OPEN → HALF_OPEN');
        return true;
      }
      console.log('  🚫 熔断器: OPEN (熔断中)');
      return false;
    }
    if (this.circuitState === 'HALF_OPEN') {
      if (this.halfOpenAttempts >= CONFIG.circuitBreaker.halfOpenMax) {
        this.circuitState = 'OPEN';
        console.log('  🚫 熔断器: HALF_OPEN → OPEN');
        return false;
      }
      return true;
    }
    return true; // CLOSED
  }

  /**
   * 记录成功
   */
recordSuccess() {
this.failureCount = 0;
if (this.circuitState === 'HALF_OPEN') {
this.circuitState = 'CLOSED';
console.log('  ✅ 熔断器: HALF_OPEN → CLOSED');
}
this.saveState();
}

  /**
   * 记录失败
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.halfOpenAttempts++;
    
if (this.failureCount >= CONFIG.circuitBreaker.failureThreshold) {
this.circuitState = 'OPEN';
console.log(`  🚫 熔断器: CLOSED → OPEN (连续失败 ${this.failureCount} 次)`);
}
this.saveState();
}

  /**
   * 执行三路突击
   */
  async execute(task, onProgress) {
    if (!this.checkCircuit()) {
      return { success: false, error: 'CIRCUIT_OPEN' };
    }

    const taskId = `task-${Date.now()}`;
    const startTime = Date.now();

    console.log(`\n🚀 启动三路突击: ${taskId}`);
    console.log(`   任务: ${task.description || task}`);

    // 单条路径失败不应拖垮整个任务：捕获后标记该路径失败并计入熔断
    const runSafe = async (pathKey, label) => {
      try {
        const result = await this.runPath(pathKey, task, onProgress);
        onProgress?.({ path: pathKey, status: 'done', result });
        return result;
      } catch (err) {
        console.error(`  ❌ 路径 ${label} 执行失败: ${err.message}`);
        this.recordFailure();
        onProgress?.({ path: pathKey, status: 'error', error: err.message });
        return { error: err.message };
      }
    };

    // 路径 1: 探索（发散生成候选）
    console.log('\n🔍 路径 1: 探索 (EXPLORE)');
    const exploreResult = await runSafe(PATHS.EXPLORE, 'EXPLORE');

    // 路径 2: 验证（交叉检查）
    console.log('\n✅ 路径 2: 验证 (VERIFY)');
    const verifyResult = await runSafe(PATHS.VERIFY, 'VERIFY');

    // 路径 3: 优化（迭代改进）
    console.log('\n🎯 路径 3: 优化 (OPTIMIZE)');
    const optimizeResult = await runSafe(PATHS.OPTIMIZE, 'OPTIMIZE');

    // 队正裁决
    console.log('\n⚖️  队正裁决...');
    const 裁决 = this.裁决([exploreResult, verifyResult, optimizeResult]);

    // 接通熔断器：裁决结果反馌到熔断状态（此前 recordSuccess/recordFailure 从未被调用，熔断器形同虚设）
    if (裁决.success) {
      this.recordSuccess();
    } else {
      this.recordFailure();
    }

    const duration = Date.now() - startTime;
    console.log(`\n🏁 完成: ${taskId} (${duration}ms)`);

    // 更新状态
    this.state.tasks.push({
      id: taskId,
      task,
      paths: { explore: exploreResult, verify: verifyResult, optimize: optimizeResult },
      裁决,
      duration,
      timestamp: new Date().toISOString()
    });
    this.state.stats.total++;
    if (裁决.success) this.state.stats.success++;
    else this.state.stats.failed++;
    this.saveState();

    return {
      success: 裁决.success,
      taskId,
      duration,
      裁决
    };
  }

  /**
   * 运行单条路径
   */
  async runPath(path, task, onProgress) {
    // 模拟路径执行
    const mockResults = {
      [PATHS.EXPLORE]: {
        candidates: ['候选 A', '候选 B', '候选 C'],
        diversity: 0.8,
        quality: 0.6
      },
      [PATHS.VERIFY]: {
        validated: ['候选 B'],
        confidence: 0.9,
        crossCheck: 'passed'
      },
      [PATHS.OPTIMIZE]: {
        result: '候选 B (优化版)',
        improvement: 0.15,
        finalScore: 0.85
      }
    };

    return mockResults[path] || { status: 'unknown' };
  }

  /**
   * 队正裁决
   */
  裁决(results) {
    // 各路径取各自的核心指标（此前统一取 finalScore||quality||0.5，
    // 导致 verify 恒为 0.5 兑底，min>=0.7 永不成立、avg>=0.8 也难以达到，裁决恒失败）
    const metrics = {
      explore:  results[0]?.diversity  ?? 0.5,   // 探索路：多样性
      verify:   results[1]?.confidence ?? 0.5,   // 验证路：置信度
      optimize: results[2]?.finalScore ?? 0.5    // 优化路：最终得分
    };
    const scores = Object.values(metrics);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);

    // 各路径独立判定是否“同意”
    const passed = {
      explore:  metrics.explore >= 0.5,
      verify:   metrics.verify >= 0.7 && results[1]?.crossCheck === 'passed',
      optimize: metrics.optimize >= 0.7
    };
    const agreeCount = Object.values(passed).filter(Boolean).length;

    // 交叉校验：至少 2 条路径同意才算通过
    const success = agreeCount >= 2;

    return {
      success,
      agreeCount,
      passed,
      scores,
      average: avg,
      minScore: min,
      method: 'cross_validation'
    };
  }

  /**
   * 查看状态
   */
  status() {
    console.log('\n📊 三路突击状态\n');
    console.log(`  熔断器: ${this.circuitState}`);
    console.log(`  连续失败: ${this.failureCount}`);
    console.log(`  总任务: ${this.state.stats.total}`);
    console.log(`  成功: ${this.state.stats.success}`);
    console.log(`  失败: ${this.state.stats.failed}`);
    console.log(`  成功率: ${this.state.stats.total > 0 ? (this.state.stats.success / this.state.stats.total * 100).toFixed(1) : 0}%`);
    
    console.log('\n  最近任务:');
    this.state.tasks.slice(-5).forEach(t => {
      console.log(`    ${t.id} | ${t.duration}ms | ${t.裁决.success ? '✅' : '❌'}`);
    });
  }
}

// CLI
const args = process.argv.slice(2);
const action = args[0];
const orchestrator = new TriPathOrchestrator();

switch (action) {
  case 'run':
    const task = args[1] || 'default-task';
    orchestrator.execute({ description: task }).then(r => {
      console.log('\n结果:', JSON.stringify(r, null, 2));
    }).catch(err => {
      console.error('\n❌ 三路突击执行异常:', err.message);
      process.exitCode = 1;
    });
    break;
  case 'status':
    orchestrator.status();
    break;
  case '熔断':
    orchestrator.circuitState = 'OPEN';
    orchestrator.saveState();
    console.log('🚫 熔断器已强制打开');
    break;
  case 'reset':
    orchestrator.circuitState = 'CLOSED';
    orchestrator.failureCount = 0;
    orchestrator.saveState();
    console.log('✅ 熔断器已重置');
    break;
  default:
    console.log('用法:');
    console.log('  node tri-path-orchestrator.js run <task>  # 执行三路突击');
    console.log('  node tri-path-orchestrator.js status      # 查看状态');
    console.log('  node tri-path-orchestrator.js 熔断        # 强制熔断');
    console.log('  node tri-path-orchestrator.js reset       # 重置熔断器');
}