'use strict';
// M6 任务 6.55 failing test —— 票面收缩（SPEC-6.55）
// 要修的病：每维护轮开满 20 张票，全部 proposed、TTL 作废、下轮重开——读数被当成任务。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-face-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const SO = require('../src/self-optimize.js');
const kespi = require('../src/kespi.js');

const rows = (sql, binds = []) => { const s = store._getDb().prepare(sql); if (binds.length) s.bind(binds); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return a; };
const ticket = (id) => rows('SELECT * FROM opt_tickets WHERE entity_id = ?', [id])[0];
const evOf = (t) => { try { return JSON.parse(t.evidence_json || '{}'); } catch (_) { return {}; } };

(async () => {
  await store.init(path.join(yard, 'k.db'));
  const db = store._getDb();
  const ins = (id) => store.insertEntity({ id, name: id, type: 'Concept', content: '正文 ' + id, tags: '["t:7"]', status: 'active', confidence: 0.5 });

  // 样本实体
  for (const id of ['ka-low', 'kr-low', 'ov-red', 'kq-low', 'kd-raw', 'kd-cited']) ins(id);
  ins('kd-raw-wiki');
  // ka/kr/overall 低但各维过线：直接写分数（kespiStep 会重算，故用独立库分两步）
  db.run(`INSERT OR REPLACE INTO kespi_scores (entity_id,kq,ka,kd,kc,kr,overall) VALUES
    ('ka-low',0.6,0.2,0.5,0.6,0.6,0.5),
    ('kr-low',0.6,0.6,0.5,0.6,0.2,0.5),
    ('ov-red',0.5,0.3,0.3,0.4,0.3,0.36),
    ('kq-low',0.20,0.6,0.5,0.6,0.6,0.5),
    ('kd-raw',0.6,0.6,0.10,0.6,0.6,0.5),
    ('kd-cited',0.6,0.6,0.10,0.6,0.6,0.5)`);
  // kd-raw：raw 前缀 + 无镜像边 → 可自愈 rebond；kd-cited：入向强边 ≥2
  db.run("UPDATE entities SET id = 'raw-kd' WHERE id = 'kd-raw'");
  db.run("UPDATE kespi_scores SET entity_id = 'raw-kd' WHERE entity_id = 'kd-raw'");
  store.insertEntity({ id: 'wiki-kd', name: 'wiki-kd', type: 'Concept', content: '正文 wiki-kd', tags: '["t:7"]', status: 'active' });
  for (const [s, t] of [['ka-low', 'kd-cited'], ['kr-low', 'kd-cited']]) {
    store.insertLink({ source_id: s, target_id: t, relation: 'related', confidence: 0.9, strength: 8 });
  }
  store._persist();

  const r = await SO.scanTickets(store, {});
  const byDim = rows("SELECT dim, action, COUNT(*) c FROM opt_tickets GROUP BY dim, action");

  // AC-1/2/3：不开单
  ac('AC-1 ka 低不开单', !ticket('ka-low') && !byDim.some(x => x.dim === 'ka'), JSON.stringify({ byDim }));
  ac('AC-2 kr 低不开单', !ticket('kr-low') && !byDim.some(x => x.dim === 'kr'), JSON.stringify({ byDim }));
  ac('AC-3 overall 红不开单', !ticket('ov-red') && !byDim.some(x => x.dim === 'overall'), JSON.stringify({ byDim }));

  // AC-4 kq → slot，demand.slot=P2 / semi
  const tq = ticket('kq-low');
  const dq = tq ? evOf(tq).demand : null;
  ac('AC-4 kq 开 slot 单且 demand 指 P2/semi',
    !!tq && tq.action === 'slot' && !!dq && dq.slot === 'P2' && dq.mode === 'semi' && dq.ttlRounds === 3,
    JSON.stringify({ tq, dq }));

  // AC-5 kd 两路
  const tr = ticket('raw-kd');
  const tc = ticket('kd-cited');
  const dc = tc ? evOf(tc).demand : null;
  ac('AC-5 kd 可自愈 → rebond；被引用不催化 → slot(P3)',
    !!tr && tr.action === 'rebond' && !!tc && tc.action === 'slot' && !!dc && dc.slot === 'P3',
    JSON.stringify({ tr, tc, dc }));

  // AC-6 dispatch 对 slot 单标 proposed
  const disp = await SO.dispatchTickets(store, {});
  const st = (id) => (rows('SELECT status FROM opt_tickets WHERE entity_id = ?', [id])[0] || {}).status;
  ac('AC-6 dispatch 把 slot 单标 proposed（不判 unknown-action）',
    disp.rejected.length === 0 && st('kq-low') === 'proposed' && st('kd-cited') === 'proposed' && st('raw-kd') === 'dispatched',
    JSON.stringify({ disp, statuses: { kq: st('kq-low'), cited: st('kd-cited'), raw: st('raw-kd') } }));

  // AC-7 票面只含 kq/kd(/kc) 三维
  const dims = new Set(byDim.map(x => x.dim));
  ac('AC-7 票面只由 kq/kc/kd 配额决定',
    [...dims].every(d => ['kq', 'kc', 'kd'].includes(d)) && r.created > 0,
    JSON.stringify({ dims: [...dims], created: r.created }));

  console.log(`\n----- 6.55 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
