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

// ── 热配置：轮询 data/scheduler-config.json，改间隔/开关无需重启（2026-09-08）──
// 文件格式：{ "intervalMs": 1800000, "watchRaw": true, "watchPollMs": 15000 }（字段均可省略）
// 语义：默认文件不存在 = 保持启动时配置（零行为变化）；存在则按内容覆盖；删除文件回退到启动值。
// 边界：intervalMs 最小 60000（1 分钟），防止误配置把代谢打成高频风暴；metabolismTimeoutMs 不支持热改（单轮保护）。
const HOT_CONFIG_FILE = path.join(CONFIG.kbRoot, 'data', 'scheduler-config.json');
const STARTUP_CONFIG = { ...CONFIG };

function _loadHotConfig() {
  try {
    const raw = fs.readFileSync(HOT_CONFIG_FILE, 'utf8');
    const j = JSON.parse(raw);
    const out = {};
    if (j.intervalMs != null) {
      const n = parseInt(j.intervalMs, 10);
      if (Number.isFinite(n)) out.intervalMs = Math.max(60000, n);
    }
    if (j.watchRaw != null) out.watchRaw = !!j.watchRaw;
    if (j.watchPollMs != null) {
      const n = parseInt(j.watchPollMs, 10);
      if (Number.isFinite(n) && n >= 1000) out.watchPollMs = n;
    }
    return out;
  } catch (e) { return null; } // 不存在/JSON 损坏 → 维持现状
}

function applyHotConfig(hot) {
  CONFIG.intervalMs = hot.intervalMs != null ? hot.intervalMs : STARTUP_CONFIG.intervalMs;
  CONFIG.watchRaw = hot.watchRaw != null ? hot.watchRaw : STARTUP_CONFIG.watchRaw;
  CONFIG.watchPollMs = hot.watchPollMs != null ? hot.watchPollMs : STARTUP_CONFIG.watchPollMs;
}

function startHotConfigWatcher() {
  function _hotSig() {
    try { return fs.statSync(HOT_CONFIG_FILE).mtimeMs + ':' + fs.statSync(HOT_CONFIG_FILE).size; }
    catch (e) { return ''; }
  }
  let lastSig = _hotSig();
  setInterval(() => {
    const sig = _hotSig();
    if (sig === lastSig) return;
    lastSig = sig;
    const hot = _loadHotConfig();
    applyHotConfig(hot || {});
    log(hot
      ? `🔥 热配置已生效: interval=${CONFIG.intervalMs / 1000}s watchRaw=${CONFIG.watchRaw} watchPoll=${CONFIG.watchPollMs / 1000}s${hot.intervalMs != null && hot.intervalMs < 60000 ? '（intervalMs 已钳到最小 60s）' : ''}`
      : `🔥 配置文件已移除/损坏，回退启动配置: interval=${CONFIG.intervalMs / 1000}s watchRaw=${CONFIG.watchRaw}`);
  }, 5000);
  log(`♨️  热配置已启用: data/scheduler-config.json（存在即生效，删除即回退）`);
}

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
  // 递归：入库产物落在 raw/inbox/ 子目录（运行态与版本化知识源分离），
  // 旧实现只 readdirSync 顶层 → 会话档再多也不会触发轮询。
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let items;
    try { items = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
    for (const it of items) {
      const full = path.join(cur, it.name);
      if (it.isDirectory()) { stack.push(full); continue; }
      if (!it.name.endsWith('.md')) continue;
      try { out.push(`${it.name}:${fs.statSync(full).mtimeMs}`); } catch (e) { /* 竞态删除忽略 */ }
    }
  }
  return out.sort().join('|');
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

  if (!process.argv.includes('--once')) startHotConfigWatcher();
  setInterval(() => runMetabolism('定时代谢'), CONFIG.intervalMs);
}

main();
