#!/usr/bin/env node
/**
 * scheduler.js — 常驻代谢调度器
 *
 * 功能：
 * 1. 定时触发完整代谢链（run-metabolism.js，间隔可配）
 * 2. 轮询 raw/ 目录变化（mtime 快照对比，不用 fs.watch——Windows 上 watch 事件不可靠）
 * 3. 单实例互斥：上一轮未结束不叠加（防止并发锁库）
 * 4. 运行日志落盘 logs/scheduler.log
 *
 * 用法：
 *   node src/scheduler.js            # 常驻运行
 *   node src/scheduler.js --once     # 只跑一轮（用于验证/CI）
 *
 * 环境变量：
 *   AING_SCHEDULER_INTERVAL_MS   定时间隔，默认 1800000（30 分钟）
 *   AING_WATCH_RAW=0             关闭 raw/ 目录轮询
 *   AING_WATCH_POLL_MS           raw/ 轮询间隔，默认 15000
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  kbRoot: process.env.KB_ROOT || path.resolve(__dirname, '..'),
  intervalMs: parseInt(process.env.AING_SCHEDULER_INTERVAL_MS, 10) || 30 * 60 * 1000,
  watchRaw: process.env.AING_WATCH_RAW !== '0',
  watchPollMs: parseInt(process.env.AING_WATCH_POLL_MS, 10) || 15000,
  metabolismTimeoutMs: 10 * 60 * 1000,
  logFile: path.join(__dirname, '..', 'logs', 'scheduler.log')
};

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(path.dirname(CONFIG.logFile), { recursive: true });
    fs.appendFileSync(CONFIG.logFile, line + '\n', 'utf8');
  } catch (e) { /* 日志失败不影响调度 */ }
}

let running = false;
let pendingKick = false;

function runMetabolism(trigger) {
  if (running) {
    pendingKick = true; // 上一轮还在跑：本轮结束后立即补跑
    log(`⏭️  上一轮代谢仍在运行，本次触发(${trigger})挂起待补跑`);
    return;
  }
  running = true;
  log(`🚀 触发代谢 (${trigger})`);
  const child = spawn(process.execPath, [path.join(CONFIG.kbRoot, 'src', 'run-metabolism.js')], {
    cwd: CONFIG.kbRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let timer = setTimeout(() => {
    log(`⏰ 代谢超时 (${CONFIG.metabolismTimeoutMs / 1000}s)，强制终止`);
    child.kill();
  }, CONFIG.metabolismTimeoutMs);

  const collect = (buf) => log(`  [metabolism] ${buf.toString().trim().replace(/\n/g, '\n  [metabolism] ')}`);
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);

  child.on('close', (code) => {
    clearTimeout(timer);
    running = false;
    log(code === 0 ? `✅ 代谢完成` : `❌ 代谢退出码 ${code}`);
    if (pendingKick) {
      pendingKick = false;
      setImmediate(() => runMetabolism('补跑挂起触发'));
    }
  });
}

function snapshotRawDir(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const st = fs.statSync(path.join(dir, f));
        return `${f}:${st.mtimeMs}`;
      })
      .sort()
      .join('|');
  } catch (e) {
    return '';
  }
}

function startWatcher() {
  const rawDir = path.join(CONFIG.kbRoot, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  let lastSnapshot = snapshotRawDir(rawDir);
  setInterval(() => {
    const snap = snapshotRawDir(rawDir);
    if (snap !== lastSnapshot) {
      lastSnapshot = snap;
      runMetabolism('raw/ 变化检测');
    }
  }, CONFIG.watchPollMs);
  log(`👁️  轮询 raw/ 目录（${CONFIG.watchPollMs / 1000}s 间隔，mtime 快照对比）`);
}

function main() {
  log('🧬 aing 常驻调度器启动');
  log(`📂 知识库: ${CONFIG.kbRoot}`);
  log(`⏱️  定时代谢间隔: ${CONFIG.intervalMs / 1000}s`);

  if (CONFIG.watchRaw) startWatcher();

  const once = process.argv.includes('--once');
  runMetabolism(once ? '--once 启动即跑' : '启动即跑');
  if (once) {
    // --once 模式：首轮结束后退出（含补跑）
    const exitCheck = setInterval(() => {
      if (!running && !pendingKick) {
        clearInterval(exitCheck);
        log('🏁 --once 模式结束');
        process.exit(0);
      }
    }, 1000);
    return;
  }

  setInterval(() => runMetabolism('定时代谢'), CONFIG.intervalMs);
}

main();
