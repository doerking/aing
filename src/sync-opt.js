#!/usr/bin/env node
/**
 * sync-opt.js — OPT 副本对齐（2026-09-08）
 *
 * 原则：OPT 永远是 aing 的副本，"对齐 aing"是 OPT 的立身之本——本脚本把对齐从
 * 人的记性变成系统行为：git 层硬指向 aing master，运行时层原样保留。
 *
 * git 层（代码/文档/种子，跟随 aing master）：
 *   git fetch <aing> master → 对比 FETCH_HEAD 与 OPT HEAD → 不同则 reset --hard
 *   （工作树 clean 前提；OPT 独有白名单文件先备份后还原为未跟踪文件）
 *
 * 运行时层（OPT 自己的状态，不碰）：knowledge.db / models / node_modules /
 *   data/ / logs/ / mustard-seeds / src/growth.config.js / wiki
 *   唯一动作：代码变了才触发 OPT 侧 npm install + 代谢链 + verify-deploy 自证
 *
 * 启用方式（机器本地）：aing 根 data/opt-root.json = {"root":"<opt-root>","enabled":true}（如本机 "E:\\OPT"）
 *   文件不存在或 enabled=false → 本脚本直接退出 0（其他 clone 零影响）
 *   代谢链尾挂本步骤（sync-opt），每轮代谢自动对齐；已对齐时走秒级快路径
 *
 * 手动：npm run sync:opt
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const AING = path.resolve(__dirname, '..');
const MARKER = path.join(AING, 'data', 'opt-root.json');
// OPT 独有且需跨换血保留的文件（还原为未跟踪文件，reset 不再碰它）
const OPT_ONLY_WHITELIST = ['tools/verify-baseline.ps1'];

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} @ ${cwd}: ${(r.stderr || r.stdout || '').trim().split('\n')[0]}`);
  return (r.stdout || '').trim();
}

function run(name, cmd, args, cwd, env = {}) {
  console.log(`\n▶ [OPT] ${name}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`❌ [OPT] ${name} 失败 (exit=${r.status})`);
    return false;
  }
  return true;
}

function main() {
  // ── 启用门：marker 文件 ──
  if (!fs.existsSync(MARKER)) {
    console.log('⏭️  [sync-opt] data/opt-root.json 不存在，OPT 对齐未启用，跳过');
    return 0;
  }
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(MARKER, 'utf8')); } catch (e) { console.log('⏭️  [sync-opt] marker 解析失败，跳过'); return 0; }
  if (cfg.enabled === false) { console.log('⏭️  [sync-opt] marker enabled=false，跳过'); return 0; }
  const OPT = cfg.root;
  if (!OPT || !fs.existsSync(path.join(OPT, '.git'))) {
    console.log(`⏭️  [sync-opt] OPT 根无效（${OPT}），跳过`);
    return 0;
  }

  console.log(`♻️  [sync-opt] OPT 副本对齐：${OPT} ← ${AING}`);

  // ── 前提：aing 工作树状态只影响 aing 自己；OPT 侧要求 clean（reset 不可怜脏文件）──
  const optStatus = git(['status', '--porcelain'], OPT);
  // 白名单文件作为未跟踪文件还原后会成为 OPT 永久的 "??"，属预期状态，不阻塞对齐
  const whitelistSet = new Set(OPT_ONLY_WHITELIST);
  const blockers = optStatus ? optStatus.split('\n').filter(l => !whitelistSet.has(l.replace(/^\?\?\s*/, '').replace(/\\/g, '/'))) : [];
  if (blockers.length) {
    console.error('❌ [sync-opt] OPT 工作树不 clean，拒绝换血（先处理：\n' + blockers.slice(0, 5).join('\n') + '）');
    return 1;
  }

  // ── 快路径：已对齐 ──
  git(['fetch', AING, 'master'], OPT); // 本地路径 fetch，无网络
  const target = git(['rev-parse', 'FETCH_HEAD'], OPT);
  const optHead = git(['rev-parse', 'HEAD'], OPT);
  if (target === optHead) {
    console.log(`✅ [sync-opt] 已对齐（${target.slice(0, 7)}），秒级快路径返回`);
    return 0;
  }

  // ── 慢路径：换血 ──
  console.log(`🔄 [sync-opt] 版本移动：OPT ${optHead.slice(0, 7)} → aing master ${target.slice(0, 7)}`);

  // 0) 首次迁移保险：旧 OPT 历史存为本地备份分支（覆盖式，不累积）
  git(['branch', '-f', 'backup/pre-sync-opt', optHead], OPT);
  console.log('  📦 旧 OPT 历史已存分支 backup/pre-sync-opt（可随时回看）');

  // 1) 白名单文件先撤出（tracked in OPT、不在 aing master，reset 会删）
  const preserved = {};
  for (const rel of OPT_ONLY_WHITELIST) {
    const p = path.join(OPT, rel);
    if (fs.existsSync(p)) {
      preserved[rel] = fs.readFileSync(p);
      fs.rmSync(p);
      console.log(`  📦 暂存 OPT 独有文件: ${rel}`);
    }
  }

  // 2) git 层硬对齐
  git(['reset', '--hard', 'FETCH_HEAD'], OPT);
  console.log(`  ✅ git 层已对齐 aing master ${target.slice(0, 7)}`);

  // 3) 白名单还原为未跟踪文件（未来 reset 不再碰）
  for (const [rel, buf] of Object.entries(preserved)) {
    const p = path.join(OPT, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
    console.log(`  📦 还原 OPT 独有文件（未跟踪）: ${rel}`);
  }

  // 4) 运行时层刷新：npm install（依赖声明变了才实际动作）→ 代谢链 → 自证验收
  if (!run('依赖安装', 'npm', ['install', '--no-audit', '--no-fund'], OPT)) return 1;
  if (!run('代谢链（重建 wiki/DB 与新代码对齐）', 'node', ['src/run-metabolism.js'], OPT, { AING_NO_AUTOCOMMIT: '1' })) return 1;
  if (!run('语义重索引', 'node', ['src/index-vectors.js', '--semantic', '--reindex'], OPT)) return 1;
  if (!run('部署验收（基线自证）', 'node', ['verify-deploy.js'], OPT)) return 1;

  console.log(`\n🟢 [sync-opt] OPT 已对齐并自证通过：${target.slice(0, 7)}（OPT 永远是 aing 的副本）`);
  return 0;
}

process.exit(main());
