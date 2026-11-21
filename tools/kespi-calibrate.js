'use strict';
// tools/kespi-calibrate.js —— KESPI 消费者阈值校准（测量工具，不是门禁）
//
// 目的：给「KESPI 消费者四个阈值定得准不准」提供真库实测数据（SPEC-3.4 扩展 / STATUS §五·补五 8.6）。
// 阈值收进 config-runtime DEFAULTS.kespi 后，校准读数是唯一能回答「阈值该唔该动」嘅依据。
//
// 用法（本仓根）：node tools/kespi-calibrate.js [--db <源库>] [--json] [--keep]
//   源库缺省 data/knowledge.db（真库，只读源——拷一份副本，绝不碰源）。
//
// 输出：① 九列分布（p25/p50/p75/p90）② 四个阈值各自落点（过线实体数与占比）
//       ③ 与注释声明嘅分位数声明对账（漂移多少）。
// 阈值单源喺 src/config-runtime.js DEFAULTS.kespi——本工具只读，唔写库。

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.join(__dirname, '..');

function argv(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = process.argv[i + 1];
  if (v == null || v.startsWith('--')) throw new Error('--' + name + ' 缺参数值');
  return v;
}

const KEYS = ['kq', 'kg', 'ka', 'km', 'kd', 'kc', 'kr', 'kb', 'overall'];
const NAMES = { kq: '质量', kg: '广度', ka: '活性', km: '关联', kd: '催化', kc: '置信', kr: '重复', kb: '基础', overall: '总体' };
// 四个消费者阈值的路径与消费组件（与 config-runtime COMPONENT_MAP.kespi 同口径）
const THRESHOLDS = [
  ['kespi.promoteMin', '总体', 'field-promote 提升门槛'],
  ['kespi.geneMin', '总体', 'evolution-team 基因候选门槛'],
  ['kespi.redZone', '各维分', 'self-optimize 红区（逐维比对）'],
  ['kespi.greenZone', '总体', 'self-optimize 绿区（已声明，未入逻辑）']
];

function pctile(sorted, k) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * k));
  return Math.round(sorted[i] * 1000) / 1000;
}

function main() {
  const asJson = process.argv.includes('--json');
  const keep = process.argv.includes('--keep');
  const dbArg = argv('db', null);
  const src = dbArg ? path.resolve(dbArg) : path.join(REPO, 'data', 'knowledge.db');
  if (!fs.existsSync(src)) throw new Error('源库不存在: ' + src);

  const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kespi-cal-'));
  const copy = path.join(yard, 'knowledge.db');
  fs.copyFileSync(src, copy);

  const store = require(path.join(REPO, 'src', 'knowledge-store.js'));
  const knobs = require(path.join(REPO, 'src', 'config-runtime.js'));

  (async () => {
    await store.init(copy);
    const db = store._getDb();
    const rows = [];
    const st = db.prepare('SELECT ' + KEYS.join(', ') + ' FROM kespi_scores');
    while (st.step()) rows.push(st.getAsObject());
    st.free();

    const out = {
      source: src,
      copyBytes: fs.statSync(copy).size,
      scoredRows: rows.length,
      distribution: {},
      thresholds: [],
      drift: []
    };

    // ① 九列分布
    const perKey = {};
    for (const k of KEYS) {
      const v = rows.map(r => Number(r[k])).filter(x => Number.isFinite(x)).sort((a, b) => a - b);
      perKey[k] = v;
      out.distribution[k] = {
        name: NAMES[k], n: v.length,
        p25: pctile(v, .25), p50: pctile(v, .5), p75: pctile(v, .75), p90: pctile(v, .9)
      };
    }

    // ② 四个阈值落点
    const overall = perKey.overall;
    for (const [knobPath, scope, where] of THRESHOLDS) {
      const val = knobs.getKnob(store, knobPath);
      let above = null, total = null, detail = null;
      if (scope === '总体') {
        total = overall.length;
        above = overall.filter(x => x >= val).length;
      } else {
        // 逐维：任一维落红区即算「过线」；报各维过线数
        detail = {};
        for (const k of KEYS.slice(0, 8)) {
          total = (total == null ? 0 : total);
          detail[k] = { n: perKey[k].length, below: perKey[k].filter(x => x < val).length };
        }
        total = perKey.kq.length;
        above = null;
      }
      out.thresholds.push({
        knob: knobPath, value: val, scope, where,
        ...(scope === '总体' ? { above: above, total, pctAbove: total ? Math.round(above / total * 1000) / 10 : null } : { perDim: detail })
      });
    }

    // ③ 与注释声明对账：self-optimize 注释写「真库五维实测 p25 0.46 / p50 0.51 / p90 0.71」
    const CLAIMED = { p25: 0.46, p50: 0.51, p90: 0.71 };
    for (const p of Object.keys(CLAIMED)) {
      const got = out.distribution.overall[p];
      out.drift.push({ p, claimed: CLAIMED[p], got, diff: got == null ? null : Math.round((got - CLAIMED[p]) * 1000) / 1000 });
    }

    if (asJson) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log('KESPI 阈值校准 — 源 ' + src);
      console.log('副本 ' + (out.copyBytes / 1048576).toFixed(2) + ' MB / 评分行数 ' + rows.length + '\n');
      console.log('【九列分布】');
      console.log(pad('列', 8) + pad('n', 7) + pad('p25', 8) + pad('p50', 8) + pad('p75', 8) + pad('p90', 8));
      for (const k of KEYS) {
        const d = out.distribution[k];
        console.log(pad(NAMES[k], 8) + pad(String(d.n), 7) + pad(String(d.p25), 8) + pad(String(d.p50), 8) + pad(String(d.p75), 8) + pad(String(d.p90), 8));
      }
      console.log('\n【四个阈值落点】（单源 src/config-runtime.js DEFAULTS.kespi）');
      for (const t of out.thresholds) {
        const loc = t.pctAbove != null ? '过线 ' + t.above + '/' + t.total + '（' + t.pctAbove + '%）' : '逐维比对';
        console.log('  ' + t.knob.padEnd(20) + String(t.value).padStart(6) + '  ' + loc + '  ← ' + t.where);
      }
      console.log('\n【注释声明对账】（overall 分位数）');
      for (const d of out.drift) {
        const mark = d.diff == null ? '?' : (Math.abs(d.diff) < 0.02 ? '✅ 吻合' : Math.abs(d.diff) < 0.05 ? '△ 轻漂' : '⚠ 显著漂移');
        console.log('  ' + d.p.padEnd(5) + '声明 ' + d.claimed + '  实测 ' + d.got + '  差 ' + d.diff + '   ' + mark);
      }
    }

    store._close();
    if (!keep) { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} }
    else console.error('（现场保留: ' + yard + '）');
  })().catch(e => {
    console.error('❌ ' + e.message);
    try { store._close(); } catch (_) {}
    if (!keep) { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} }
    process.exit(1);
  });
}

function pad(s, w) {
  s = String(s);
  // CJK 宽字补偿：避免表格错位
  let n = 0;
  for (const ch of s) n += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return s + ' '.repeat(Math.max(0, w - n));
}

try { main(); } catch (e) { console.error('❌ ' + e.message); process.exit(1); }
