'use strict';
// M6 任务 6.16 failing test —— 锁 SPEC-6.16 回单外接屏（L4）
// 要修的实病：回单结果只躺在 evidence_json 里，人看不见；闸拒带 stage 却无出口显示。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-board-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const one = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const r = s.step() ? s.getAsObject() : null; s.free(); return r; };
const cnt = (db, t) => Number((one(db, `SELECT COUNT(*) AS n FROM ${t}`) || {}).n || 0);

const FULLTEXT_MARK = '全文尾判据锚';
const CONCLUSION_MARK = '所以合并成一条';

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, title) => db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,title,created_at,updated_at,last_access) VALUES (?,?,'Concept',?, '[]','active',0.8,5,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'2026-11-01T00:00:00Z')",
    [id, id, '正文足够长以通过质量评分。'.repeat(8), title]);
  const ticket = (id, ent, status, ev, attempts = 1) => db.run("INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,cycle_id,created_at,updated_at) VALUES (?,?,'kd','kd-low','rebond',0.50,'red',?,?,?,'c1',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, ent, status, attempts, JSON.stringify(ev)]);

  put('e-ok', '已收单卡');
  put('e-gate', '闸拒卡');
  put('e-esc', '改派卡');
  put('e-wait', '待回单卡');
  put('e-nobeat', '无心跳卡');

  // 已收单：带结论与全文，屏面必须只取事实+指针
  ticket('t-ok', 'e-ok', 'verified', {
    score: 0.50, before: 0.50, after: 0.80,
    result: { facts: ['检索命中 86.9%'], pointers: ['eval/frozen@2026-11-18'],
      conclusion: CONCLUSION_MARK, fulltext: '全文'.repeat(40) + FULLTEXT_MARK }
  });
  // 闸拒：缺自评，带宽上 stage/reasons
  ticket('t-gate', 'e-gate', 'rejected', {
    score: 0.50, reason: 'gate:publish:no-self-assessment',
    gate: { admitted: false, stage: 'publish', reasons: ['no-self-assessment'], payload: {} }
  });
  // 改派：失败≥2 交深工
  ticket('t-esc', 'e-esc', 'rejected', {
    score: 0.50, before: 0.50, after: 0.50, reason: 'escalate-deep-work',
    followup: { beatAt: '2026-11-18T00:00:00Z', beats: 3 }
  });
  // 待回单：有心跳
  ticket('t-wait', 'e-wait', 'dispatched', {
    score: 0.50, reason: 'awaiting-return', before: 0.50, after: 0.50,
    followup: { beatAt: '2026-11-18T01:00:00Z', beats: 2 }
  });
  // 待回单：无心跳
  ticket('t-nobeat', 'e-nobeat', 'dispatched', { score: 0.50, reason: 'awaiting-return' });
  // 未派（proposed）：不进三节，但屏面要点名，不静默吞
  ticket('t-prop', 'e-ok', 'proposed', { score: 0.50, reason: 'proposal-only' });
  store._persist();

  // AC-1 纯读：调用前后快照一致
  const snap = () => JSON.stringify({
    tickets: cnt(db, 'opt_tickets'), ents: cnt(db, 'entities'), links: cnt(db, 'links'),
    access: cnt(db, 'access_hits'), kespi: cnt(db, 'kespi_scores'),
    lastAccess: one(db, "SELECT id, last_access FROM entities ORDER BY id") || null
  });
  const beforeSnap = snap();

  let B = null;
  try { B = require('../src/ticket-board.js'); } catch (_) { B = null; }
  if (!B || typeof B.boardOf !== 'function') {
    ['AC-1 纯读（不写表、不碰 last_access）', 'AC-2 三节齐（待回单 / 闸拒改派 / 已收单）', 'AC-3 只显事实与指针',
      'AC-4 拒因分阶段（stage + reasons）', 'AC-5 改派单列（kind=escalate）', 'AC-6 心跳可见（缺则明说）',
      'AC-7 空库诚实', 'AC-8 无 I/O'].forEach(n => ac(n, false, 'ticket-board.js 未实现'));
  } else {
    const board = B.boardOf(store, {});
    const afterSnap = snap();
    const keys = (board.sections || []).map(s => s.key);
    const sec = (k) => (board.sections || []).find(s => s.key === k) || { rows: [] };
    const allRows = (board.sections || []).flatMap(s => s.rows || []);
    const rowOf = (id) => allRows.find(r => r.id === id) || null;

    ac('AC-1 纯读（不写表、不碰 last_access）', beforeSnap === afterSnap, beforeSnap !== afterSnap ? '调用前后快照不同' : '');

    ac('AC-2 三节齐（待回单 / 闸拒改派 / 已收单）',
      ['pending', 'blocked', 'verified'].every(k => keys.includes(k)) &&
      sec('pending').rows.length === 2 && sec('blocked').rows.length === 2 && sec('verified').rows.length === 1,
      JSON.stringify(keys.map(k => k + ':' + (sec(k).rows || []).length)));

    const blob = JSON.stringify(board);
    ac('AC-3 只显事实与指针（结论/全文不入屏）',
      !blob.includes(CONCLUSION_MARK) && !blob.includes(FULLTEXT_MARK) &&
      (rowOf('t-ok') || {}).facts && (rowOf('t-ok') || {}).facts[0] === '检索命中 86.9%' &&
      (rowOf('t-ok') || {}).pointers[0] === 'eval/frozen@2026-11-18',
      blob.slice(0, 200));

    const g = rowOf('t-gate') || {};
    ac('AC-4 拒因分阶段（stage + reasons）',
      g.kind === 'gate' && g.stage === 'publish' && Array.isArray(g.reasons) && g.reasons.includes('no-self-assessment'),
      JSON.stringify(g));

    const e = rowOf('t-esc') || {};
    ac('AC-5 改派单列（kind=escalate）', e.kind === 'escalate', JSON.stringify(e));

    const w = rowOf('t-wait') || {};
    const nb = rowOf('t-nobeat') || {};
    ac('AC-6 心跳可见（缺则明说）',
      w.beatAt === '2026-11-18T01:00:00Z' && Number(w.beats) === 2 &&
      (nb.beats == null) && (nb.note === '无心跳' || /无心跳/.test((board.lines || []).join('\n'))),
      JSON.stringify({ w, nb }));

    // AC-9 CLI 面真跑（外接屏要有个能按的开关）
    let cliOut = null;
    try {
      const { execFileSync } = require('child_process');
      const raw = execFileSync(process.execPath, [path.join(__dirname, '..', 'src', 'cli.js'), 'board', '--db', path.join(yard, 'knowledge.db'), '--json'], { encoding: 'utf8' });
      cliOut = JSON.parse(raw);
    } catch (e) { cliOut = null; }
    ac('AC-9 CLI board 真跑出屏', !!cliOut && cliOut.summary && cliOut.summary.total === 6 && Array.isArray(cliOut.lines) && cliOut.lines.length >= 2,
      cliOut ? JSON.stringify(cliOut.summary) : 'CLI 跑红');

    ac('AC-10 屏外状态点名（other 不静默吞）',
      board.summary.total === 6 && board.summary.other === 1 &&
      (board.lines || []).some(l => /其他状态 1 单/.test(l)),
      JSON.stringify(board.summary));

    // AC-7 空库诚实（清空后重来）
    db.run('DELETE FROM opt_tickets');
    store._persist();
    const empty = B.boardOf(store, {});
    ac('AC-7 空库诚实',
      empty.summary && empty.summary.total === 0 && (empty.lines || []).some(l => /暂无回单/.test(l)) &&
      (empty.sections || []).every(s => (s.rows || []).length === 0),
      JSON.stringify(empty.summary));

    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ticket-board.js'), 'utf8');
    const dirty = [/require\(['"]fs['"]\)/, /child_process/, /https?:\/\//, /fetch\(/].filter(re => re.test(src));
    const writes = /(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)/i.test(src);
    ac('AC-8 无 I/O 且只读（无写语句）', dirty.length === 0 && !writes, JSON.stringify({ dirty, writes }));
  }

  console.log(`\n----- 6.16 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
