#!/usr/bin/env node
/**
 * start-all.js — scheduler + api-server 一键同起（2026-09-08，改进项 #3）
 *
 * 用法：
 *   npm run all          # 等价 node src/start-all.js
 *   npm run start-all    # 同上
 *
 * 行为：
 *   1. 同时拉起 src/scheduler.js 与 src/api-server.js（各自独立子进程，日志带前缀转发）
 *   2. Ctrl+C / SIGTERM：整组树杀（含 scheduler 正在跑的 metabolism 孙进程，不留孤儿）
 *   3. fail-fast：任一子进程退出即整组关停（防半死状态：调度活着但 API 已死或反之）
 *
 * 环境变量照旧透传：AING_SCHEDULER_INTERVAL_MS / AING_API_PORT / KB_ROOT 等。
 */

const { spawn } = require('child_process');
const path = require('path');

const KB_ROOT = path.resolve(__dirname, '..');

const CHILDREN = [
  { name: 'scheduler', file: path.join(__dirname, 'scheduler.js') },
  { name: 'api-server', file: path.join(__dirname, 'api-server.js') }
];

const procs = [];
let shuttingDown = false;

function forwardLog(name) {
  return (buf) => {
    const lines = buf.toString().trimEnd().split(/\r?\n/);
    for (const l of lines) console.log(`[${name}] ${l}`);
  };
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n🛑 start-all 关停中（整组树杀，含代谢子进程）...');
  for (const p of procs) {
    if (p.exitCode === null && !p.killed) {
      try {
        // Windows：taskkill /T 连树杀，避免 scheduler 的 metabolism 孙进程变孤儿
        spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } catch (e) {
        try { p.kill(); } catch (_) {}
      }
    }
  }
  setTimeout(() => process.exit(code), 500);
}

for (const c of CHILDREN) {
  const p = spawn(process.execPath, [c.file], {
    cwd: KB_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  p.stdout.on('data', forwardLog(c.name));
  p.stderr.on('data', forwardLog(c.name));
  p.on('close', (code, signal) => {
    if (shuttingDown) return;
    console.error(`❌ [${c.name}] 意外退出 (code=${code} signal=${signal})，整组关停`);
    shutdown(code == null ? 1 : code);
  });
  procs.push(p);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('🟢 start-all: scheduler + api-server 已同起（Ctrl+C 整组关停）');
console.log(`   API: http://localhost:${process.env.AING_API_PORT || 3789}`);
