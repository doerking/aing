#!/usr/bin/env node
/**
 * verify-sibling-roots.js — 院际全量同源核验 / cross-yard full-surface same-origin check
 *
 * 为什么需要它：既有抽样核验只比 9 个文件（59 个 src 模块的 15%），
 * 而实际发生代差的 4 个文件（knowledge-store / scheduler / neural-architecture /
 * tri-path-orchestrator）恰好全在样本外——抽样核验对真实漂移的漏检率 100%。
 * 本脚本全量比对，并把「仅行尾差异」与「真实内容漂移」分开报告（CRLF 噪声不算漂移），
 * 另外比对各院 knowledge.db 的表/列结构（distill_meta 缺列事故的特征签名）。
 *
 * 只读 / read-only：不写任何文件，不改任何库。
 * 用法：
 *   node tools/verify-sibling-roots.js                     # 自动取本包同级的 aing / OPT / SQA
 *   node tools/verify-sibling-roots.js --root aing=<路径>  # 显式指定某院（可重复）
 *   node tools/verify-sibling-roots.js --verbose           # 列出每一处仅行尾差异
 * 退出码：0 = 全部同源；1 = 有真实漂移 / 缺文件 / 结构不一致（机器判定，可进门禁）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
const PARENT = path.resolve(REPO, '..');
const SELF = path.basename(REPO);
const verbose = process.argv.includes('--verbose');

// ── 院子发现：默认取本包同级的常见院名；--root name=path 可覆盖 ──
const roots = new Map();
for (const candidate of ['aing', 'OPT', 'SQA', 'Tip']) {
  const p = path.join(PARENT, candidate);
  if (candidate !== SELF && fs.existsSync(path.join(p, 'src'))) roots.set(candidate, p);
}
for (let i = 0; i < process.argv.length - 1; i++) {
  if (process.argv[i] === '--root') {
    const [name, ...rest] = String(process.argv[i + 1]).split('=');
    const p = path.resolve(rest.join('='));
    if (fs.existsSync(p)) roots.set(name, p);
    else console.log(`⚠️  指定的院子路径不存在，跳过: ${name}`);
  }
}

// ── 比对文件集：全部 src js + 关键根文件 ──
function trackedSurface(dir) {
  const out = [];
  const srcDir = path.join(dir, 'src');
  if (fs.existsSync(srcDir)) for (const f of fs.readdirSync(srcDir)) if (f.endsWith('.js')) out.push(`src/${f}`);
  const toolsDir = path.join(dir, 'tools');
  if (fs.existsSync(toolsDir)) for (const f of fs.readdirSync(toolsDir)) if (f.endsWith('.js')) out.push(`tools/${f}`);
  for (const f of ['verify-deploy.js', 'growth.config.example.js', 'package.json']) {
    if (fs.existsSync(path.join(dir, f))) out.push(f);
  }
  // 运行配置单独处理：它是机器本地运行时态（环境变可覆盖），差异只作信息报告、不计代差
  if (fs.existsSync(path.join(dir, 'src', 'growth.config.js'))) out.push('src/growth.config.js');
  return out.sort();
}

const crlfStrippedHash = p => {
  const buf = fs.readFileSync(p);
  return crypto.createHash('sha256').update(buf.toString('utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
};
const rawHash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);

const selfSurface = trackedSurface(REPO);
const RUNTIME_CONFIG = 'src/growth.config.js';
if (!selfSurface.length) { console.error('❌ 本包无可比对文件（应在包根运行）'); process.exitCode = 2; return; }

let driftTotal = 0, eolTotal = 0, missingTotal = 0;
console.log(`🔎 院际全量同源核验 / cross-yard same-origin: 本包 ${SELF}（${selfSurface.length} 个比对文件）`);

for (const [name, dir] of roots) {
  const theirs = new Set(trackedSurface(dir));
  const drift = [], eol = [], missing = [], extra = [], runtime = [];
  for (const rel of selfSurface) {
    const a = path.join(REPO, rel), b = path.join(dir, rel);
    if (!theirs.has(rel)) { missing.push(rel); continue; }
    if (rawHash(a) === rawHash(b)) continue;
    if (rel === RUNTIME_CONFIG) { runtime.push(rel); continue; }   // 运行配置归入信息项
    if (crlfStrippedHash(a) === crlfStrippedHash(b)) eol.push(rel);
    else drift.push(rel);
  }
  for (const rel of theirs) if (!selfSurface.includes(rel)) extra.push(rel);
  eolTotal += eol.length; missingTotal += missing.length; driftTotal += drift.length;
  const status = drift.length || missing.length ? '❌ 有真实代差' : (eol.length ? '🟡 仅行尾差异' : '✅ 全量同源');
  console.log(`\n${status}  对比 ${name}（${path.relative(PARENT, dir)}）  真实漂移 ${drift.length} · 仅行尾 ${eol.length} · 对方缺失 ${missing.length} · 对方独有 ${extra.length}`);
  if (runtime.length) {
    // 阈值唯一来源是运行配置，院际差异直接影响跑分口径 → 逐项列出 differing 段供人判断
    try {
      const A = require(path.join(REPO, RUNTIME_CONFIG)), B = require(path.join(dir, RUNTIME_CONFIG));
      const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
      const dd = [...keys].filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
      console.log(`   ℹ️  运行配置差异（不计代差）: ${dd.length ? dd.map(k => `${k}${!(k in B) ? '(对方无此段)' : !(k in A) ? '(本包无此段)' : ''}`).join(', ') : '无'}`);
    } catch (e) { console.log(`   ⚪ 运行配置无法解析比较: ${e.message.slice(0, 40)}`); }
  }
  const show = (label, arr) => {
    if (!arr.length) return;
    console.log(`   ${label}: ${arr.slice(0, verbose ? 999 : 8).join(', ')}${arr.length > 8 && !verbose ? ' …' : ''}`);
  };
  show('真实漂移（内容不同，需按真源对齐或在源码侧提交）', drift);
  show('对方缺失文件', missing);
  show('对方独有条目（可能是该院专属工具或本包漏同步）', extra);
  if (verbose) show('仅行尾差异（CRLF/LF，非内容漂移）', eol);
  else if (eol.length) console.log(`   仅行尾差异 ${eol.length} 个（加 --verbose 查看清单）→ 建议包根加 .gitattributes 统一 eol 后重检出`);
}

// ── 结构核验：各院 knowledge.db 的表/列集合（distill_meta 类缺陷的签名） ──
(async () => {
  try {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const schemaOf = dir => {
      const p = path.join(dir, 'knowledge.db');
      if (!fs.existsSync(p)) return null;
      const db = new SQL.Database(fs.readFileSync(p));
      const tables = {};
      const names = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
      for (const [t] of (names.length ? names[0].values : [])) {
        const cols = db.exec(`PRAGMA table_info(${t})`);
        tables[t] = (cols.length ? cols[0].values : []).map(r => r[1]).sort().join(',');
      }
      db.close();
      return tables;
    };
    const mine = schemaOf(REPO);
    if (mine) {
      console.log(`\n🧬 库结构核验 / schema parity（本包 ${Object.keys(mine).length} 表）`);
      for (const [name, dir] of roots) {
        const theirs = schemaOf(dir);
        if (!theirs) { console.log(`   ⚪ ${name}: 无 knowledge.db（未部署/已复原）`); continue; }
        const diffs = [];
        for (const t of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
          if (!theirs[t]) { diffs.push(`${t}: ${name} 缺表`); continue; }
          if (!mine[t]) { diffs.push(`${t}: 本包缺表`); continue; }
          const a = mine[t].split(','), b = theirs[t].split(',');
          const onlyMine = a.filter(c => !b.includes(c)), onlyTheirs = b.filter(c => !a.includes(c));
          if (onlyMine.length || onlyTheirs.length) {
            diffs.push(`${t}: ${name} 缺列[${onlyMine.join('|')}]${onlyTheirs.length ? ` / 多列[${onlyTheirs.join('|')}]` : ''}`);
          }
        }
        if (diffs.length) { driftTotal += diffs.length; console.log(`   ❌ ${name}: ${diffs.join('；')}`); }
        else console.log(`   ✅ ${name}: 表与列集合与本包一致`);
      }
    }
  } catch (e) {
    console.log(`\n⚪ 跳过库结构核验（sql.js 不可用: ${e.message.slice(0, 40)}）`);
  }

  console.log(`\n═══ 结论 / Verdict ═══`);
  console.log(`   比对院子 ${roots.size} 个 · 真实漂移/结构不一致 ${driftTotal} 项 · 仅行尾差异 ${eolTotal} 项 · 对方缺失 ${missingTotal} 项`);
  if (driftTotal) {
    console.log('🔴 存在院际代差 —— 落后一侧不得引用为真源，领先一侧的修复须回到源码提交后重新部署');
    process.exitCode = 1;   // N3 同类教训（见 tools/self-test.js）：sql.js 持有异步句柄，
    return;                  // 回调里硬 process.exit() 会撞 libuv 断言并使退出码失真
  }
  console.log('🟢 院际全量同源（内容层零漂移）' + (eolTotal ? `；${eolTotal} 个文件仅行尾不同，建议统一 eol 策略` : ''));
  process.exitCode = 0;
})();
