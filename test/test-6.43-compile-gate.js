'use strict';
// M6 任务 6.43 failing test —— 编译前闸（SPEC-6.43）
// 要修的病：旧院 shared-spine 的「编译前核验 + 低分拒收 + 审计日志」在 v2 一件都没有。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-gate-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const compile = require('../src/compile.js');

const write = (dir, name, text) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), text); };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const run = (dir, opts) => (typeof compile.compile === 'function' ? compile.compile(dir, store, opts) : Promise.resolve(null));
  const auditRows = () => { try { const s = db.prepare('SELECT * FROM compile_audit ORDER BY id'); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return a; } catch (_) { return []; } };

  // AC-1 L0：空正文 / 坏 id 拒收
  const d1 = path.join(yard, 'r1');
  write(d1, 'empty.md', '---\nid: ent-empty\ntype: Concept\n---\n\n');
  write(d1, 'badid.md', '---\nid: "bad id"\ntype: Concept\n---\n有正文');
  write(d1, 'ok.md', '---\nid: ent-ok\ntype: Concept\n---\n正常正文一条');
  const s1 = await run(d1);
  const rej1 = s1 && Array.isArray(s1.rejectedReasons) ? s1.rejectedReasons : [];
  ac('AC-1 L0 空正文/坏 id 拒收且不写库',
    !!s1 && s1.rejected === 2 && store.getEntity('ent-empty') == null && store.getEntity('bad id') == null &&
    rej1.some(r => r.id === 'ent-empty' && r.reasons.includes('empty-content')) &&
    rej1.some(r => r.id === 'bad id' && r.reasons.includes('bad-id')) && store.getEntity('ent-ok') != null,
    JSON.stringify({ s1, rej1 }));

  // AC-2 L1 默认关
  const d2 = path.join(yard, 'r2');
  write(d2, 'short.md', '---\nid: ent-short\ntype: Concept\n---\n短');
  const s2 = await run(d2);
  ac('AC-2 L1 默认关：短档照常入库', !!s2 && s2.rejected === 0 && s2.created === 1 && store.getEntity('ent-short') != null, JSON.stringify(s2));

  // AC-3 L1 开：短 / 无 tags 拒收
  const d3 = path.join(yard, 'r3');
  write(d3, 'short2.md', '---\nid: ent-short2\ntype: Concept\ntags: [a:5]\n---\n短');
  write(d3, 'notag.md', '---\nid: ent-notag\ntype: Concept\n---\n' + '甲'.repeat(300));
  const s3 = await run(d3, { quality: true });
  const rej3 = s3 && Array.isArray(s3.rejectedReasons) ? s3.rejectedReasons : [];
  ac('AC-3 L1 开：短正文/无 tags 被拒',
    !!s3 && s3.rejected === 2 && store.getEntity('ent-short2') == null && store.getEntity('ent-notag') == null &&
    rej3.some(r => r.reasons.includes('short-content')) && rej3.some(r => r.reasons.includes('no-tags')),
    JSON.stringify({ s3, rej3 }));

  // AC-4 L2：低分实体 + 更短新文 → 拒收降级
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,created_at,updated_at) VALUES ('ent-low','ent-low','Concept',?,'[\"a:5\"]','active',0.5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", ['乙'.repeat(400)]);
  db.run("INSERT INTO kespi_scores (entity_id, kq, computed_at) VALUES ('ent-low', 0.30, CURRENT_TIMESTAMP)");
  store._persist();
  const d4 = path.join(yard, 'r4');
  write(d4, 'low.md', '---\nid: ent-low\ntype: Concept\ntags: [a:5]\n---\n丙');
  const s4 = await run(d4);
  const lowRow = store.getEntity('ent-low');
  ac('AC-4 L2 低分档被更短内容覆盖 → 拒收且旧内容不变',
    !!s4 && s4.rejected === 1 && s4.updated === 0 && lowRow.content === '乙'.repeat(400) &&
    (s4.rejectedReasons || []).some(r => r.id === 'ent-low' && r.reasons.includes('kespi-downgrade')),
    JSON.stringify({ s4, content: lowRow && lowRow.content.slice(0, 8) }));

  // AC-5 L2：更长新文放行
  const d5 = path.join(yard, 'r5');
  write(d5, 'low2.md', '---\nid: ent-low\ntype: Concept\ntags: [a:5]\n---\n' + '丁'.repeat(600));
  const s5 = await run(d5);
  ac('AC-5 L2 更长新文放行并更新', !!s5 && s5.updated === 1 && s5.rejected === 0 && store.getEntity('ent-low').content === '丁'.repeat(600), JSON.stringify(s5));

  // AC-6 审计行与计数一致
  const rows = auditRows();
  const sum = rows.reduce((a, r) => ({ rejected: a.rejected + Number(r.rejected || 0) }), { rejected: 0 });
  ac('AC-6 审计行写入且拒收计数一致',
    rows.length >= 5 && sum.rejected === 5 &&
    rows.every(r => typeof r.rejected_json === 'string') &&
    (() => { const last = rows[rows.length - 1]; const j = JSON.parse(last.rejected_json || '[]'); return Number(last.rejected) === j.length; })(),
    JSON.stringify({ rows: rows.length, sum, last: rows[rows.length - 1] && rows[rows.length - 1].rejected }));

  // AC-7 拒收不影响同轮其他档
  const d7 = path.join(yard, 'r7');
  write(d7, 'bad.md', '---\nid: ent-bad7\ntype: Concept\n---\n');
  write(d7, 'good.md', '---\nid: ent-good7\ntype: Concept\n---\n正常内容七');
  const s7 = await run(d7);
  ac('AC-7 拒收不影响同轮其他档', !!s7 && s7.rejected === 1 && s7.created === 1 && store.getEntity('ent-good7') != null, JSON.stringify(s7));

  // AC-8 重跑：拒收仍拒、合规全 skipped、审计只追加
  const n8 = auditRows().length;
  const a8 = await run(d7);
  const b8 = await run(d7);
  ac('AC-8 重跑幂等且审计只追加',
    !!a8 && a8.rejected === 1 && a8.created === 0 && a8.skipped === 1 && a8.updated === 0 &&
    !!b8 && b8.rejected === 1 && auditRows().length === n8 + 2,
    JSON.stringify({ a8, b8, audit: auditRows().length, n8 }));

  console.log(`\n----- 6.43 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
