'use strict';
// M6 任务 6.40 failing test —— 游标推进兜底（SPEC-6.40）
// 要修的病：轮次取 meko_cycles 行数，不跑代谢轮的部署轮次恒 0、段门槛恒 20，游标整套白搭。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-round-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');

const T0 = Date.parse('2026-11-19T10:00:00Z');
const DAY = 86400000;
const narrative = (markdown) => JSON.stringify({
  format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
  markdown, turns: [], stats: { bodyChars: markdown.length }, calibrations: []
});
const mdOf = (keys, body = '甲'.repeat(60)) => keys.map(k => `### ${k}\n${body}`).join('\n\n');

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, type, content, tags) => db.run(
    "INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES (?,?,?,?,?,'active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, id, type, content, tags || '[]']);
  put('n-req', 'Conversation', narrative(mdOf(N.SECTIONS)));
  put('p-plain', 'Knowledge', '# 会话\n\n' + '甲'.repeat(800));
  store._persist();

  const cfg = () => { const s = db.prepare("SELECT value_json FROM config WHERE key='kespi.scoreDay'"); const r = s.step() ? s.getAsObject() : null; s.free(); return r ? JSON.parse(r.value_json) : null; };
  const resolve = (o) => (typeof K.resolveRound === 'function' ? K.resolveRound(store, o || {}) : null);

  // AC-1 无代谢轮首次评分 → round 0，config 落 {day, round:0}
  const r1 = resolve({ now: T0 });
  ac('AC-1 无代谢轮首日 → round 0 且落 config',
    !!r1 && r1.round === 0 && r1.source === 'daily' && !!cfg() && cfg().day === '2026-11-19' && cfg().round === 0,
    JSON.stringify({ r1, cfg: cfg() }));

  // AC-2 同日重复评分 → 不推进、不重写
  const before = JSON.stringify(cfg());
  const r2 = resolve({ now: T0 + 6 * 3600 * 1000 });
  ac('AC-2 同日重复 → round 不变且 config 不重写',
    !!r2 && r2.round === 0 && JSON.stringify(cfg()) === before,
    JSON.stringify({ r2, cfg: cfg() }));

  // AC-3 跨日 → +1，写新日期
  const r3 = resolve({ now: T0 + DAY });
  ac('AC-3 跨日 → round 1 且写新日期',
    !!r3 && r3.round === 1 && cfg().day === '2026-11-20' && cfg().round === 1,
    JSON.stringify({ r3, cfg: cfg() }));

  // AC-5 显式 opts.round 优先且不落库
  const snap5 = JSON.stringify(cfg());
  const r5 = resolve({ now: T0 + 2 * DAY, round: 42 });
  ac('AC-5 显式 opts.round 优先、不落库',
    !!r5 && r5.round === 42 && r5.source === 'explicit' && JSON.stringify(cfg()) === snap5,
    JSON.stringify({ r5, cfg: cfg() }));

  // AC-4 有代谢轮 → 以轮数为准，config 不写不推进
  db.run("INSERT INTO meko_cycles (id, cycle_type, status, executed_at) VALUES ('c-1','normal','executed',CURRENT_TIMESTAMP)");
  db.run("INSERT INTO meko_cycles (id, cycle_type, status, executed_at) VALUES ('c-2','normal','executed',CURRENT_TIMESTAMP)");
  db.run("DELETE FROM config WHERE key='kespi.scoreDay'");
  store._persist();
  const r4 = resolve({ now: T0 + 3 * DAY });
  ac('AC-4 有 meko_cycles → 轮数为准且不落 config',
    !!r4 && r4.round === 2 && r4.source === 'meko_cycles' && cfg() === null,
    JSON.stringify({ r4, cfg: cfg() }));

  // AC-6 连续 7 日评分，round 序列 0..6 与 sectionThreshold 逐日一致
  db.run("DELETE FROM meko_cycles");
  db.run("DELETE FROM config WHERE key='kespi.scoreDay'");
  store._persist();
  const seq = [];
  const thrOk = [];
  for (let d = 0; d < 7; d++) {
    const r = resolve({ now: T0 + d * DAY });
    seq.push(r && r.round);
    thrOk.push(r && K.sectionThreshold('n-req', { round: r.round }) === K.sectionThreshold('n-req', { round: d }));
  }
  ac('AC-6 连续 7 日 round=0..6，段门槛逐日按游标走',
    JSON.stringify(seq) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]) && thrOk.every(Boolean),
    JSON.stringify({ seq, thrOk }));

  // AC-7 兜底不改其他行（entities / links 前后一致）
  const snapRows = () => {
    const out = {};
    const s = db.prepare('SELECT id, content, tags, status, confidence FROM entities ORDER BY id'); const a = [];
    while (s.step()) a.push(s.getAsObject()); s.free(); out.entities = JSON.stringify(a);
    const t = db.prepare('SELECT * FROM links ORDER BY rowid'); const b = [];
    while (t.step()) b.push(t.getAsObject()); t.free(); out.links = JSON.stringify(b);
    return JSON.stringify(out);
  };
  const pre7 = snapRows();
  await K.kespiStep(store, { now: T0 + 8 * DAY });
  ac('AC-7 兜底推进不动 entities / links',
    snapRows() === pre7, snapRows() === pre7 ? '' : 'rows changed');

  // AC-8 非叙事实体读数不变（轮次源改动零影响）
  const sc = (id) => { const s = db.prepare('SELECT kq FROM kespi_scores WHERE entity_id = ?'); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r ? Number(r.kq) : null; };
  ac('AC-8 非叙事实体 kq 仍 ~0.675', Math.abs(sc('p-plain') - 0.675) <= 0.02, JSON.stringify({ plain: sc('p-plain') }));

  console.log(`\n----- 6.40 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
