'use strict';
// M6 任务 6.11 failing test —— 锁 SPEC-6.11 分层留存 AC-1~8（归档 + 干跑还原 + 墓碑）
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-ret-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let R = {}, A = {};
try { R = require('../src/retention.js'); } catch (_) { R = {}; }
try { A = require('../tools/archive.js'); } catch (_) { A = {}; }
const store = require('../src/knowledge-store.js');
const rows = (sql, b = []) => { const s = store._getDb().prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const callR = (n, ...a) => (typeof R[n] === 'function' ? R[n](...a) : { __missing: true });
const callA = (n, ...a) => (typeof A[n] === 'function' ? A[n](...a) : { __missing: true });

const OLD = '2021-01-01 00:00:00';
const ins = (id, type, name, content, at) => {
  store._getDb().run(`INSERT INTO entities (id,type,name,content,status,tolaria_strength,created_at,updated_at) VALUES (?,?,?,?, 'active',5,?,?)`,
    [id, type, name, content, at, at]);
};

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));

  ins('raw-r1', 'RawDocument', '原稿一', '原稿正文', OLD);
  ins('conv-old', 'Conversation', '老会话', '{"topic":"老"}', OLD);
  ins('conv-new', 'Conversation', '新会话', '{"topic":"新"}', new Date().toISOString().slice(0, 19).replace('T', ' '));
  ins('conv-accessed', 'Conversation', '被访问', '{"topic":"访"}', OLD);
  ins('conv-linked', 'Conversation', '强边', '{"topic":"边"}', OLD);
  ins('concept-old', 'Concept', '老概念', '知识正文', OLD);
  ins('mystery-old', 'Mystery', '未知类型', '未知正文', OLD);
  store._getDb().run('INSERT INTO access_hits (entity_id, hit_at, source) VALUES (?, datetime(\'now\'), \'test\')', ['conv-accessed']);
  store._getDb().run('INSERT INTO links (source_id,target_id,relation,strength) VALUES (?,?,?,6)', ['conv-linked', 'conv-new', 'mention']);
  store._persist();

  const plan = callR('planRetention', store, { windowDays: 30, maxHot: 1 });
  const ids = (plan.candidates || []).map(c => c.id);

  // AC-1 分层判定
  ac('AC-1 分层判定', callR('tierOf', { id: 'raw-x', type: 'Concept' }) === 'origin' &&
    callR('tierOf', { id: 'conv-x', type: 'Conversation' }) === 'short' &&
    callR('tierOf', { id: 'c-x', type: 'Concept' }) === 'knowledge' &&
    callR('tierOf', { id: 'm-x', type: 'Mystery' }) === 'knowledge' &&
    plan.counts && plan.counts.origin === 1 && plan.counts.short === 4 && plan.counts.knowledge === 2,
    JSON.stringify(plan.counts || plan));

  // AC-6 判据替换：只有 conv-old 命中四件
  ac('AC-6 判据四件', JSON.stringify(ids) === JSON.stringify(['conv-old']) &&
    !ids.includes('conv-new') && !ids.includes('conv-accessed') && !ids.includes('conv-linked'),
    JSON.stringify({ ids, skipped: plan.skipped }));

  // AC-7 知识层不按时间删
  ac('AC-7 知识层不删', !ids.includes('concept-old') && !ids.includes('mystery-old') && !ids.includes('raw-r1'),
    JSON.stringify(ids));

  // AC-8 移动端接口位
  const mplan = callR('planRetention', store, { mode: 'mobile-retire' });
  ac('AC-8 移动端接口位', Array.isArray(R.MODES) && R.MODES.includes('desktop') && R.MODES.includes('mobile-retire') &&
    mplan.applyAllowed === false && plan.applyAllowed === true,
    JSON.stringify({ modes: R.MODES, m: mplan.applyAllowed }));

  // AC-2 归档先于删：没有归档包 → 拒删
  const entBefore = rows('SELECT COUNT(*) AS n FROM entities')[0].n;
  const badApply = callA('applyRetention', store, { plan, outDir: path.join(yard, 'nope'), month: '2021-01', manifest: { entities: { 'conv-old': 'x' } } });
  const entAfterBad = rows('SELECT COUNT(*) AS n FROM entities')[0].n;
  ac('AC-2 归档先于删', badApply.ok === false && badApply.reason === 'archive-unverified' && entBefore === entAfterBad,
    JSON.stringify({ badApply, entBefore, entAfterBad }));

  // 正常归档 + 校验
  const outDir = path.join(yard, 'archive');
  const exp = callA('exportMonth', store, { month: '2021-01', outDir, plan });
  const good = callA('verifyArchive', outDir, '2021-01');

  // AC-3 校验门槛：篡改 ndjson → 校验失败
  const ndPath = path.join(outDir, '2021-01.ndjson');
  const original = fs.readFileSync(ndPath, 'utf8');
  fs.writeFileSync(ndPath, original + JSON.stringify({ id: 'ghost', content: 'x' }) + '\n', 'utf8');
  const tampered = callA('verifyArchive', outDir, '2021-01');
  const tamperApply = callA('applyRetention', store, { plan, outDir, month: '2021-01', manifest: exp.manifest });
  ac('AC-3 校验门槛', exp.ok === true && exp.count === 1 && good.ok === true &&
    tampered.ok === false && tampered.problems.includes('ndjson-sha-mismatch') && tamperApply.ok === false,
    JSON.stringify({ expCount: exp.count, good: good.problems, tampered: tampered.problems }));

  // AC-4 不可逆不删：篡改期间行数不变
  const entAfterTamper = rows('SELECT COUNT(*) AS n FROM entities')[0].n;
  ac('AC-4 校验不过不删', entAfterTamper === entBefore, JSON.stringify({ entAfterTamper, entBefore }));

  // 复原后正式删
  fs.writeFileSync(ndPath, original, 'utf8');
  const reVerify = callA('verifyArchive', outDir, '2021-01');
  const applied = callA('applyRetention', store, { plan, outDir, month: '2021-01', manifest: exp.manifest });

  // AC-5 墓碑可查
  const tombs = rows('SELECT * FROM tombstones');
  const gone = rows("SELECT COUNT(*) AS n FROM entities WHERE id = 'conv-old'")[0].n;
  ac('AC-5 墓碑可查', reVerify.ok === true && applied.ok === true && applied.deleted === 1 &&
    tombs.length === 1 && tombs[0].id === 'conv-old' && tombs[0].archive_ref === '2021-01.ndjson' && Number(gone) === 0,
    JSON.stringify({ reVerify: reVerify.ok, applied, tombs, gone }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
