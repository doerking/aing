#!/usr/bin/env node
/**
 * bootstrap.js — 一键冷启动（2026-09-08）
 *
 * 目标：新 clone 从零到"可查询的活库"只跑一条命令：
 *   npm run bootstrap
 *
 * 步骤（全部幂等，重复跑安全）：
 *   1. 环境自检：Node ≥ 18 / node_modules / src/growth.config.js（缺则从 example 复制）
 *   2. 数据库：不存在则建库（存在则保留用户数据，绝不 reset）
 *   3. 代谢链：完整跑一轮（compile → import → … → kespi），种子文档变实体
 *   4. 语义模型：models/ 缺失时尝试 setup-vectors.ps1（失败不阻断，自动回退 hash 模式）
 *   5. 语义重索引 + 验收：verify-deploy 全绿才算完成
 *
 * 注意：本脚本只补齐运行时产物，不引入任何演示数据；想加演示数据另跑 npm run seed:demo。
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let fails = 0;

function run(name, cmd, args, opts = {}) {
  console.log(`\n▶ ${name}`);
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts
  });
  if (res.status !== 0) {
    console.error(`❌ ${name} 失败 (exit=${res.status})`);
    fails++;
    return false;
  }
  return true;
}

(async () => {
  console.log('🌱 aing bootstrap — 一键冷启动\n');

  // 1) 环境自检
  const major = parseInt(process.version.slice(1).split('.')[0], 10);
  if (major < 18) {
    console.error(`❌ Node ${process.version} 过旧，需 >= 18`);
    process.exit(1);
  }
  console.log(`✅ Node ${process.version}`);

  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    if (!run('安装依赖 (npm install)', 'npm', ['install'])) process.exit(1);
  } else {
    console.log('✅ 依赖已就绪（node_modules 存在）');
  }

  const cfgPath = path.join(ROOT, 'src', 'growth.config.js');
  if (!fs.existsSync(cfgPath)) {
    fs.copyFileSync(path.join(ROOT, 'growth.config.example.js'), cfgPath);
    console.log('✅ 已从 example 生成 src/growth.config.js');
  } else {
    console.log('✅ growth.config.js 存在');
  }

  // 2) 数据库（存在则保留，绝不 reset）
  const dbPath = path.join(ROOT, 'knowledge.db');
  if (!fs.existsSync(dbPath)) {
    if (!run('初始化数据库', 'node', ['src/setup-db.js'])) process.exit(1);
  } else {
    console.log('✅ 数据库已存在（保留用户数据，不做 reset）');
  }

  // 3) 代谢链（种子文档 → 实体 → 链接 → KESPI）
  if (!run('代谢链（完整一轮）', 'node', ['src/run-metabolism.js'])) process.exit(1);

  // 4) 语义模型（best-effort，失败不阻断）
  const modelDir = path.join(ROOT, 'models', 'Xenova', 'all-MiniLM-L6-v2');
  if (!fs.existsSync(modelDir)) {
    console.log('\n▶ 语义模型未就位，尝试 setup-vectors.ps1（失败将回退 hash 模式，不阻断）');
    const r = spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', 'setup-vectors.ps1'], {
      cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32'
    });
    if (r.status !== 0) console.log('⚠️ 模型下载未完成（可稍后重跑 npm run setup:vectors），检索已自动回退 hash 模式');
  } else {
    console.log('\n✅ 语义模型已就位');
  }

  // 5) 语义重索引 + 验收
  run('向量重索引', 'node', ['src/index-vectors.js', '--semantic', '--reindex']);
  run('部署验收', 'node', ['verify-deploy.js']);

  console.log(fails === 0
    ? '\n🟢 bootstrap 完成：库已可用。试一下：npm run query -- "KESPI"   或   npm run all 启动常驻服务'
    : `\n🔴 bootstrap 有 ${fails} 步未通过，按上方输出排查后重跑（幂等）`);
  process.exit(fails === 0 ? 0 : 1);
})();
