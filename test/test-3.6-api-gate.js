'use strict';
// M3 任务 3.6 failing test —— 锁 SPEC-3.6 身份闸 + 标签闸五条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-apigate-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let G, store;
try {
  G = require('../src/api-gate.js');
  store = require('../src/knowledge-store.js');
  if (typeof G.gateWrite !== 'function') throw new Error('gateWrite 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/api-gate.js 未实现 SPEC-3.6'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  store.insertEntity({ id: 'old', name: '旧', type: 'Concept', content: '旧料', status: 'active', confidence: 0.5 });
  db.run("UPDATE entities SET last_access='2021-01-01 00:00:00'");
  store._persist();
  const n0 = rows('SELECT COUNT(*) AS n FROM entities')[0].n;

  let thrown = null;
  try {
    await G.gateWrite(store, { actor: 'user', payload: { id: 'raw-x', name: 'X', content: '正文' } });
  } catch (e) { thrown = e.message; }
  ac('AC-1 身份闸', /identity-rejected/.test(String(thrown)) && rows('SELECT COUNT(*) AS n FROM entities')[0].n === n0, String(thrown));

  const payload = {
    id: 'raw-x', name: 'X', type: 'Concept', content: '原始正文',
    status: 'active', confidence: 0.99, tags: ['客户标签:9', '另一标:5']
  };
  const r = await G.gateWrite(store, { actor: 'hana', payload });
  const e = store.getEntity('raw-x');
  ac('AC-2 自报状态忽略', r.accepted && e.status === 'pending-distillation', JSON.stringify({ r, status: e && e.status }));
  ac('AC-3 自报置信忽略', e.confidence == null, JSON.stringify({ conf: e && e.confidence }));
  ac('AC-4 标签闸',
    !String(e.tags || '').includes('客户标签') &&
    String(e.content).includes('Agent 提议（未核验）') && String(e.content).includes('客户标签:9'),
    JSON.stringify({ tags: e.tags, content: e.content }));

  const again = await G.gateWrite(store, { actor: 'hana', payload: { ...payload, content: '改过的正文' } });
  const e2 = store.getEntity('raw-x');
  const la = rows("SELECT last_access FROM entities WHERE id='old'")[0].last_access;
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'api-gate.js'), 'utf8');
  ac('AC-5 铁律', again.exists && e2.content === e.content && String(la) === '2021-01-01 00:00:00' && !/DELETE\s+FROM/i.test(src),
    JSON.stringify({ again, same: e2.content === e.content }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
