'use strict';
// M7 任务 7.1 failing test —— 锁 SPEC-7.1 的 AC-3/4/14/15/16
// AC-16（单圈门槛）是既有行为的护栏，预期已绿；其余四条按 spec 新能力写，先红后实现。
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-m7-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let derive = null;
try { derive = require('../src/derive.js'); } catch (e) { derive = null; }

(async () => {
  // ── AC-3 繁简双形 ──
  const v = derive && derive.variants ? derive.variants('意識神經') : null;
  ac('AC-3a 派生器产出繁简双形', !!v && String(v.traditional || '').includes('意識神經') && String(v.simplified || '').includes('意识神经'),
    v ? JSON.stringify(v).slice(0, 120) : 'derive.variants 未实现');
  const nq = derive && derive.normalizeQuery ? derive.normalizeQuery('意識神經') : null;
  ac('AC-3b 查询归一：繁体查询可命中简体形', !!nq && (nq.forms || []).some(f => f.includes('意识神经')),
    nq ? JSON.stringify(nq).slice(0, 120) : 'derive.normalizeQuery 未实现');

  // ── AC-4 粤语拆解 ──
  const s1 = derive && derive.segment ? derive.segment('搞掂') : null;
  ac('AC-4a 粤语拆词素 + 粤普对照（搞掂）', !!s1 && (s1.tokens || []).length >= 2 && (s1.mandarin || []).length >= 1,
    s1 ? JSON.stringify(s1).slice(0, 120) : 'derive.segment 未实现');
  const s2 = derive && derive.segment ? derive.segment('边个跟') : null;
  ac('AC-4b 边个 → 谁', !!s2 && (s2.mandarin || []).some(x => x.includes('谁')),
    s2 ? JSON.stringify(s2).slice(0, 120) : 'derive.segment 未实现');
  const s3 = derive && derive.segment ? derive.segment('唔返来') : null;
  ac('AC-4c 唔返来 → 不回来', !!s3 && (s3.mandarin || []).join('').includes('不回来'),
    s3 ? JSON.stringify(s3).slice(0, 120) : 'derive.segment 未实现');

  // ── 数据面：双链与产物标记 ──
  await store.init(path.join(yard, 'knowledge.db'));
  const cols = store.columns('entities');
  ac('AC-14a entities 有 strand 列', cols.includes('strand'), cols.join(','));
  ac('AC-15a entities 有 metabolized_at 列', cols.includes('metabolized_at'), cols.join(','));

  const ins = (id, strand) => store.insertEntity({ id, name: id, type: 'Concept', content: '正文 ' + id, tags: '[]', status: 'active', confidence: 0.6, strand });
  ins('past-1', 'past');
  ins('future-1', 'future');
  let guard = false;
  try { store.insertLink({ source_id: 'future-1', target_id: 'past-1', relation: 'related', confidence: 0.5 }); }
  catch (e) { guard = true; }
  ac('AC-14b future → past 边被拒', guard);
  let okLink = true;
  try { store.insertLink({ source_id: 'past-1', target_id: 'future-1', relation: 'derived', confidence: 0.8 }); }
  catch (e) { okLink = false; }
  ac('AC-14c past → future 加工边可建', okLink);

  const hasMark = typeof store.markMetabolized === 'function';
  if (!hasMark) {
    ac('AC-15b 一次加标签（metabolized_at + meta）', false, 'store.markMetabolized 未实现');
    ac('AC-15c 重跑标记不变（幂等）', false, 'store.markMetabolized 未实现');
  } else {
    const r1 = store.markMetabolized('future-1');
    const row1 = store.getEntity('future-1');
    ac('AC-15b 一次加标签（metabolized_at + meta）',
      !!row1.metabolized_at && JSON.parse(row1.tags || '[]').some(t => String(t).startsWith('meta')),
      JSON.stringify({ r: r1, tags: row1.tags }));
    const r2 = store.markMetabolized('future-1');
    const row2 = store.getEntity('future-1');
    ac('AC-15c 重跑标记不变（幂等）', row2.metabolized_at === row1.metabolized_at && r2.changed === false,
      JSON.stringify({ a: row1.metabolized_at, b: row2.metabolized_at, r2 }));
  }

  // ── AC-16 单圈走得完（护栏：既有行为，预期绿）──
  const dbFile = path.join(yard, 'loop.db');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'cli.js'), 'orchestrate', '--db', dbFile, '--rounds', '1', '--json'], { encoding: 'utf8' });
  let out = null;
  try { out = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch (_) { /* 保留 null */ }
  const steps = (out && out.results) || [];
  const allOk = steps.length === 21 && steps.every(s => s.ok);
  ac('AC-16 单圈 21 步全 OK', r.status === 0 && allOk,
    `exit=${r.status} steps=${steps.length} bad=${steps.filter(s => !s.ok).map(s => s.id).join(',') || '无'}`);

  console.log(`\n----- 7.1 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
