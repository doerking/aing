'use strict';
// M7 任务 7.1i failing test —— 锁 AC-19（distill 落股）
// 口径：旧行不动（正文/身份/原始时间/元数据全不改，只翻工作状态）；产物落 future；
//       past → future 的加工边必须建出来；重跑不重写产物（幂等）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-d19-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const { distillStep } = require('../src/distill.js');

function rows(db, sql, b = []) { const s = db.prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; }

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  const body = '第一行\n\n  第二行有缩进  \n第三行';
  store.insertEntity({ id: 'raw-p1', name: 'P1', type: 'Concept', content: body, tags: '["a:7"]', status: 'pending-distillation', confidence: 0.7 });
  db.run("UPDATE entities SET last_access='2021-06-01 00:00:00', created_at='2026-01-01 08:00:00' WHERE id='raw-p1'");
  store._persist();

  const src = () => store.getEntity('raw-p1');
  const snap = () => {
    const r = src();
    return { name: r.name, type: r.type, content: r.content, tags: r.tags, confidence: r.confidence, created_at: String(r.created_at) };
  };
  const beforeSnap = snap();

  const r1 = await distillStep(store, {});
  const after = snap();
  const w = store.getEntity('wiki-p1');
  const edges = rows(db, "SELECT * FROM links WHERE source_id='raw-p1' AND target_id='wiki-p1'");

  ac('AC-19a 旧行不动（正文/身份/元数据/原始时间全不改，只翻工作状态）',
    JSON.stringify(beforeSnap) === JSON.stringify(after) && src().status === 'active',
    JSON.stringify({ beforeSnap, after, status: src().status }));

  ac('AC-19b 产物落 future 档', !!w && w.strand === 'future' && w.content === body,
    JSON.stringify({ strand: w && w.strand, same: w && w.content === body }));

  ac('AC-19c past → future 加工边有建',
    edges.length === 1 && edges[0].relation === 'derived' &&
    rows(db, "SELECT 1 AS one FROM links WHERE source_id='wiki-p1' AND target_id='raw-p1'").length === 0,
    JSON.stringify(edges));

  const wUpdated = String(w && w.updated_at);
  const r2 = await distillStep(store, {});
  const w2 = store.getEntity('wiki-p1');
  ac('AC-19d 重跑不重写产物（幂等）',
    r2.distilled === 0 && String(w2.updated_at) === wUpdated &&
    rows(db, "SELECT 1 AS one FROM links WHERE source_id='raw-p1' AND target_id='wiki-p1'").length === 1,
    JSON.stringify({ r2, wUpdated, w2: String(w2.updated_at) }));

  console.log(`\n----- 7.1i pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
