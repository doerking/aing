'use strict';
// tools/sprout-report.js —— SPEC-7.1 §十 第 7 步：发芽度报告工具（AC-7）
// 用法：
//   node tools/sprout-report.js                        # 真库副本，关键词取标签词面
//   node tools/sprout-report.js --keywords 三分编组,意识神经
//   node tools/sprout-report.js --db <path> --json
// 口径：sprout(kw)=经 strength≥7 的三类候选边可触达实体数；variants(kw)=派生的其它写法数；
//       hub 警戒线只报不扩（超线不因此补边）。纯读：默认在副本上跑，源库文件不动。
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_DB = path.join(ROOT, 'data', 'knowledge.db');

function parseArgs(args) {
  const get = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
  const has = (k) => args.includes('--' + k);
  const kw = get('keywords');
  return {
    db: get('db'),
    keywords: kw ? String(kw).split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    json: has('json'),
    top: get('top') ? Number(get('top')) : 30
  };
}

async function run(opts = {}) {
  const src = opts.db || DEFAULT_DB;
  if (!fs.existsSync(src)) throw new Error('db-missing: ' + src);

  // 纯读：复制到临时目录再打开（打开库会跑 schema 迁移，不能落到源库上）
  const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-sprout-'));
  const copy = path.join(yard, 'knowledge.db');
  fs.copyFileSync(src, copy);

  const store = require(path.join(ROOT, 'src', 'knowledge-store.js'));
  const SR = require(path.join(ROOT, 'src', 'sprout-report.js'));
  try {
    await store.init(copy);
    const rep = SR.report(store, { keywords: opts.keywords });
    return rep;
  } finally {
    store._close();   // nodesqlite 文件库持句柄，先关再 rm（Windows EPERM）
    fs.rmSync(yard, { recursive: true, force: true });
  }
}

function printTable(rep, top = 30) {
  const d = rep.distribution;
  console.log(`发芽度报告 · 关键词 ${d.n} 个 · 死胡同 ${d.dead} · 中位 ${d.median} · p90 ${d.p90} · 最大 ${d.max}`);
  console.log(`hub 警戒线 ${d.hubLine}（≥ 此值只报不扩）；超线词 ${d.hubs.length ? d.hubs.join('、') : '无'}`);
  console.log('');
  const rows = rep.keywords.slice(0, top);
  const w1 = Math.max(4, ...rows.map((k) => [...k.kw].length));
  console.log(`${'关键词'.padEnd(w1, '　')}  sprout  variants  种子  hub`);
  for (const k of rows) {
    console.log(`${k.kw.padEnd(w1, '　')}  ${String(k.sprout).padStart(6)}  ${String(k.variants).padStart(8)}  ${String(k.seeds).padStart(4)}  ${k.hub ? '⚠' : ''}`);
  }
  if (rep.entityHubs && rep.entityHubs.length) {
    console.log('');
    console.log('实体级 hub（被多个关键词触达，泛词在把同一张卡连到所有人身上）：');
    for (const h of rep.entityHubs.slice(0, 10)) {
      console.log(`  ${h.id}  ← ${h.byKeywords} 个词：${h.keywords.slice(0, 6).join('、')}`);
    }
  }
}

module.exports = { run, printTable, parseArgs };

if (require.main === module) {
  (async () => {
    const opts = parseArgs(process.argv.slice(2));
    const rep = await run(opts);
    if (opts.json) console.log(JSON.stringify(rep, null, 2));
    else printTable(rep, opts.top);
  })().catch((e) => { console.error('sprout-report 失败: ' + e.message); process.exitCode = 1; });
}

