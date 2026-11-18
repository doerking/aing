'use strict';
// M6 任务 6.31 failing test —— 段有效性阈值（正文不足 20 字不算有段）
// 要修的病：6.30 只数标题在不在，六段各写「无」照样拿满覆盖率。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-sect-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');

const mdOf = (bodies) => N.SECTIONS.map((k, i) => `### ${k}\n${bodies[i]}`).join('\n\n');
const narrative = (markdown) => JSON.stringify({
  format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
  markdown, turns: [], stats: { bodyChars: markdown.length }, calibrations: []
});
const FULL = N.SECTIONS.map(() => '甲'.repeat(130));
const EMPTY = N.SECTIONS.map(() => '无');
const HALF = N.SECTIONS.map((_, i) => (i === 5 ? '同上' : '乙'.repeat(130)));

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const put = (id, content) => db.run(
    "INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES (?,?,'Conversation',?,'[]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
    [id, id, content]);

  put('n-full', narrative(mdOf(FULL)));
  put('n-empty', narrative(mdOf(EMPTY)));
  put('n-half', narrative(mdOf(HALF)));
  put('p-plain', '# 会话\n\n' + '甲'.repeat(1600));
  store._persist();
  await K.kespiStep(store, {});
  const sc = (id) => { const s = db.prepare('SELECT kq FROM kespi_scores WHERE entity_id = ?'); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r ? Number(r.kq) : null; };
  const cov = (md) => K.narrativeCoverage ? K.narrativeCoverage(md) : null;

  // AC-1 六段各 130 字 → 1
  ac('AC-1 六段有料 → 覆盖率 1', cov(mdOf(FULL)) === 1, JSON.stringify({ cov: cov(mdOf(FULL)) }));

  // AC-2 六段各「无」→ 0
  ac('AC-2 六段凑数 → 覆盖率 0', cov(mdOf(EMPTY)) === 0, JSON.stringify({ cov: cov(mdOf(EMPTY)) }));

  // AC-3 五段有料 + 一段「同上」→ 5/6
  const h = cov(mdOf(HALF));
  ac('AC-3 一段凑数 → 覆盖率 5/6', Math.abs(h - 5 / 6) < 1e-9, JSON.stringify({ cov: h }));

  // AC-4 factor 落点：凑数 ×0.6，五段居间；kq 排序 full > half > empty
  const f = (md) => (K.narrativeFactor ? K.narrativeFactor(narrative(md)) : null);
  const f0 = f(mdOf(EMPTY)), f5 = f(mdOf(HALF));
  ac('AC-4 factor 凑数 ×0.6、五段居间，kq 三者有序',
    f0 != null && Math.abs(f0 - 0.6) < 1e-9 && Math.abs(f5 - (0.6 + 0.4 * 5 / 6)) < 1e-9 &&
    sc('n-full') > sc('n-half') && sc('n-half') > sc('n-empty'),
    JSON.stringify({ f0, f5, full: sc('n-full'), half: sc('n-half'), empty: sc('n-empty') }));

  // AC-5 非叙事实体读数不变
  ac('AC-5 非叙事实体不受影响', Math.abs(sc('p-plain') - 0.675) <= 0.02, JSON.stringify({ plain: sc('p-plain') }));

  // AC-6 正文里的普通行不误切段（段内出现 "### 子标题" 之外的行不改判定）；纯函数
  const weird = '### 场景（触发）\n' + '甲'.repeat(60) + '\n### 产出\n' + '乙'.repeat(60);
  ac('AC-6 纯函数且只认六段名', cov(weird) === cov(weird) && Math.abs(cov(weird) - 2 / 6) < 1e-9,
    JSON.stringify({ cov: cov(weird) }));

  console.log(`\n----- 6.31 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
