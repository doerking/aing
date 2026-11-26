'use strict';
process.env.AING_ALLOWED_ACTORS = 'hana'; // 写面默认拒所有写，测试档显式配 hana 过闸
// M3 任务 3.5 failing test —— 锁 SPEC-3.5 入库主线六条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-autoingest-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let A, S, store;
try {
  A = require('../src/auto-ingest.js');
  S = require('../src/ingest-scrub.js');
  store = require('../src/knowledge-store.js');
  if (typeof A.autoIngest !== 'function') throw new Error('autoIngest 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/auto-ingest.js / src/ingest-scrub.js 未实现 SPEC-3.5'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  store.insertEntity({ id: 'old', name: '旧', type: 'Concept', content: '旧料', status: 'active', confidence: 0.5 });
  db.run("UPDATE entities SET last_access='2021-01-01 00:00:00'");
  store._persist();

  const dirtyReply = '引用:1\n来源: 某站\n正文结论是先把回炉接链。[cite: 42]\n【检索】补一句检索说明。';
  const r = await A.autoIngest(store, {
    actor: 'hana', sessionId: 'z1', topic: '入库剥除',
    reply: dirtyReply,
    searchShown: ['引用：2 某条结果', 'Source: https://example.com 另一条'],
    rationale: 'URL: https://example.com/a 分析缘由 [citation: 7]'
  });
  const e = store.getEntity('conv-z1');
  const body = e ? JSON.parse(e.content) : { reply: '', searchShown: [], rationale: '' };
  const clean = (t) => !/引用[:：]\s*\d/.test(t) && !/^\s*(来源|Source)[:：]/m.test(t) && !/\[cite[^\]]*\]/i.test(t) && !/【检索】|【搜索】/.test(t);

  ac('AC-1 痕迹真剥', r.ingested && clean(body.reply) && body.reply.includes('回炉接链') && r.scrubTrace >= 3,
    JSON.stringify({ scrubTrace: r.scrubTrace, reply: body.reply }));
  ac('AC-2 三源都剥', clean(body.searchShown.join(' ')) && clean(body.rationale),
    JSON.stringify({ searchShown: body.searchShown, rationale: body.rationale }));

  const contract = (() => { try { return { ok: A.assertSectionContract() }; } catch (e) { return { err: e.message }; } })();
  ac('AC-3 双向钉', contract.ok === true && A.PRODUCED_SECTIONS.length === 4 &&
    A.PRODUCED_SECTIONS.every(s => A.RAW_SECTIONS.includes(s)), JSON.stringify(contract));

  const n0 = rows('SELECT COUNT(*) AS n FROM entities')[0].n;
  let thrown = null;
  try { await A.autoIngest(store, { actor: 'user', sessionId: 'z2', reply: 'x' }); } catch (e) { thrown = e.message; }
  ac('AC-4 身份闸串联', /identity-rejected/.test(String(thrown)) && rows('SELECT COUNT(*) AS n FROM entities')[0].n === n0, String(thrown));

  let thrown2 = null;
  try { await A.autoIngest(store, { actor: 'hana', sessionId: 'z3', reply: '引用:1\n来源: 空壳' }); } catch (e) { thrown2 = e.message; }
  ac('AC-5 缺回复拒入', /reply-required/.test(String(thrown2)), String(thrown2));

  const la = rows("SELECT last_access FROM entities WHERE id='old'")[0].last_access;
  ac('AC-6 铁律', String(la) === '2021-01-01 00:00:00' &&
    !/DELETE\s+FROM/i.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'ingest-scrub.js'), 'utf8')) &&
    !/DELETE\s+FROM/i.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'auto-ingest.js'), 'utf8')));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
