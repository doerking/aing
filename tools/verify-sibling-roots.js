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

// ── 比对文件集：src/ 与 tools/ 的 js + 关键根文件 + **assets/ 全量**（2026-09-14 W5 扩面）──
// ── 比对面 = 整包面（2026-09-15 第三次扩面）
//    前两次教训同形：只取 git ls-files → 漏 src/neural.js；面不含 assets → 漏 20 件资产；
//    面不含 docs/包根必读档 → 「同源 0 漂移」其实只证了码面。这次直接把面定义成「除依赖与
//    运行态之外的全部文件」，宁可慢，不再让代差藏在面外。
const NOISE_SEGMENTS = new Set(['node_modules', '.git', '.temp', 'models', 'dist', 'build', '__pycache__']);
const RUNTIME_DIRS = new Set(['logs', 'raw', 'wiki', 'data']);                       // 院属语料与日志，跟包走即污染
const RUNTIME_FILES = new Set([
  'tri-path-state.json',            // 三路突击运行态（tasks/stats）
  'src/package.json',               // src/ 里嵌套的第二个包清单 → src/node_modules 的根因
  'growth.config.example.ts',       // 与 .js 版内容已分叉的陈旧 .ts 双胞胎（本包口径 no TypeScript）
  'docs/index.html',                // 12KB 手搓文档页，仅 M4 提及
  'package-lock.json', 'knowledge.db',
]);

function trackedSurface(dir) {
  const out = new Set();
  const walk = rel => {
    let ents;
    try { ents = fs.readdirSync(path.join(dir, rel || '.'), { withFileTypes: true }); } catch (e) { return; }
    for (const ent of ents) {
      if (NOISE_SEGMENTS.has(ent.name)) continue;
      const rel2 = rel ? rel + '/' + ent.name : ent.name;
      if (ent.isDirectory()) {
        if (!rel && RUNTIME_DIRS.has(ent.name)) continue;
        walk(rel2);
      } else if (!RUNTIME_FILES.has(rel2) && !/\.db(-wal|-shm)?$/i.test(ent.name) && !/^-lock\.json$/.test(ent.name) && ent.name !== 'package-lock.json') {
        out.add(rel2);
      }
    }
  };
  walk('');
  // 组件登记簿在 data/ 下但属包内容（C9a/C9b 的账）→ 显式请回面内
  if (fs.existsSync(path.join(dir, 'data', 'component-registry.json'))) out.add('data/component-registry.json');
  // 运行配置单独处理：机器本地运行时态，差异只进信息栏不计代差
  if (fs.existsSync(path.join(dir, 'src', 'growth.config.js'))) out.add('src/growth.config.js');
  return [...out].sort();
}

const crlfStrippedHash = p => {
  const buf = fs.readFileSync(p);
  return crypto.createHash('sha256').update(buf.toString('utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
};
const rawHash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);

const selfSurface = trackedSurface(REPO);
// --print-face：把比对面单独打到 stdout（供跨院复制器消费，避免各方自写一份面定义）
if (process.argv.includes('--print-face')) { console.log(selfSurface.join('\n')); process.exit(0); }
const RUNTIME_CONFIG = 'src/growth.config.js';
if (!selfSurface.length) { console.error('❌ 本包无可比对文件（应在包根运行）'); process.exitCode = 2; return; }

let driftTotal = 0, eolTotal = 0, missingTotal = 0;
console.log(`🔎 院际全量同源核验 / cross-yard same-origin: 本包 ${SELF}（${selfSurface.length} 个比对文件）`);
console.log('   ℹ️  刻意不跨院携带（本包跟踪但判定为运行态/垃圾，不计对方缺失）: ' + [...RUNTIME_FILES].filter(f => fs.existsSync(path.join(REPO, f))).join(', '));

for (const [name, dir] of roots) {
  const theirs = new Set(trackedSurface(dir));
  const drift = [], eol = [], missing = [], extra = [], runtime = [];
  for (const rel of selfSurface) {
    const a = path.join(REPO, rel), b = path.join(dir, rel);
    if (!theirs.has(rel)) {
      // 未部署院本来就没有运行配置（C0 要求部署时 cp example）→ 归信息项，不得计进代差/缺失
      if (rel === RUNTIME_CONFIG) { runtime.push(rel); continue; }
      missing.push(rel); continue;
    }
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
    const aP = path.join(REPO, RUNTIME_CONFIG), bP = path.join(dir, RUNTIME_CONFIG);
    if (!fs.existsSync(aP) || !fs.existsSync(bP)) {
      console.log(`   ℹ️  运行配置：${!fs.existsSync(bP) ? '对方无（未部署院属正常，部署时 cp example 即可）' : '本包无'} → 不计代差`);
    } else {
    // 阈值唯一来源是运行配置，院际差异直接影响跑分口径 → 逐项列出 differing 段供人判断
    try {
      const A = require(aP), B = require(bP);
      const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
      const dd = [...keys].filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
      console.log(`   ℹ️  运行配置差异（不计代差）: ${dd.length ? dd.map(k => `${k}${!(k in B) ? '(对方无此段)' : !(k in A) ? '(本包无此段)' : ''}`).join(', ') : '无'}`);
    } catch (e) { console.log(`   ⚪ 运行配置无法解析比较: ${e.message.slice(0, 40)}`); }
    }
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
