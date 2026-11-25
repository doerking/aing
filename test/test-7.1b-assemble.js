'use strict';
// M7 任务 7.1b failing test —— 锁 SPEC-7.1 AC-10（抽库四件）/ AC-11（时间序）
// 口径：给一句用户表达，assemble 返回 源头/派生/关联/链 四件，链按 links.created_at 升序，纯读。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-assemble-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let assemble = null;
try { ({ assemble } = require('../src/assemble.js')); } catch (e) { assemble = null; }

(async () => {
  const dbFile = path.join(yard, 'knowledge.db');
  await store.init(dbFile);
  const ins = (id, o = {}) => store.insertEntity({
    id, name: o.name || id, type: o.type || 'Concept', content: o.content || ('正文 ' + id),
    tags: JSON.stringify(o.tags || []), status: 'active', confidence: o.confidence == null ? 0.7 : o.confidence,
    strand: o.strand || 'past'
  });

  // 源头（past）：三条会话，原始时间故意乱序
  ins('c-old', { type: 'Conversation', content: '三分编组攻防学说草案 v0 落档，搞掂', strand: 'past' });
  ins('c-new', { type: 'Conversation', content: '三分编组草案 v1 修订，边个跟？', strand: 'past' });
  ins('doc-1', { content: '三分编组学说综述', strand: 'past' });
  // 产物（future）
  ins('f-sum', { type: 'MetaKnowledge', content: '三分编组草案摘要：三面合拢', strand: 'future' });
  ins('f-ins', { type: 'MetaKnowledge', content: '三分编组洞察：派单节奏', strand: 'future' });
  const db = store._getDb();
  // 原始时间定死，便于断言时间序
  db.run("UPDATE entities SET created_at='2026-11-01 09:00:00' WHERE id='c-old'");
  db.run("UPDATE entities SET created_at='2026-11-05 09:00:00' WHERE id='c-new'");
  db.run("UPDATE entities SET created_at='2026-11-03 09:00:00' WHERE id='doc-1'");

  // 边：强边（>=7）与候选关系进链；弱 related(3) 不入链
  store.insertLink({ source_id: 'c-old', target_id: 'f-sum', relation: 'derived', confidence: 0.9 });
  store.insertLink({ source_id: 'c-new', target_id: 'f-ins', relation: 'derived', confidence: 0.9 });
  store.insertLink({ source_id: 'f-sum', target_id: 'f-ins', relation: 'sprout-candidate', confidence: 0.6 });
  store.insertLink({ source_id: 'doc-1', target_id: 'f-sum', relation: 'related', confidence: 0.2 });
  db.run("UPDATE links SET strength=8 WHERE relation='derived'");
  db.run("UPDATE links SET strength=5 WHERE relation='sprout-candidate'");
  db.run("UPDATE links SET strength=3 WHERE relation='related'");
  // 边时间：故意乱序写入后定值
  db.run("UPDATE links SET created_at='2026-11-06 10:00:00' WHERE source_id='c-old'");
  db.run("UPDATE links SET created_at='2026-11-04 10:00:00' WHERE source_id='c-new'");
  db.run("UPDATE links SET created_at='2026-11-07 10:00:00' WHERE source_id='f-sum'");
  db.run("UPDATE links SET created_at='2026-11-02 10:00:00' WHERE source_id='doc-1'");
  store._persist();

  if (!assemble) {
    ac('AC-10a 抽库四件齐', false, 'src/assemble.js 未实现');
    ac('AC-10b 源头只取 past 且带原始时间', false, 'src/assemble.js 未实现');
    ac('AC-10c 派生含繁简与粤普对照', false, 'src/assemble.js 未实现');
    ac('AC-10d 关联只收强边/候选关系', false, 'src/assemble.js 未实现');
    ac('AC-11a 链按 links.created_at 升序', false, 'src/assemble.js 未实现');
    ac('AC-11b 两次抽取结果一致（可复现）', false, 'src/assemble.js 未实现');
    ac('AC-11c 抽库纯读（库文件不变）', false, 'src/assemble.js 未实现');
  } else {
    const before = fs.readFileSync(dbFile);
    const r1 = await assemble(store, '三分编组草案 搞掂之后点样跟进');
    const r2 = await assemble(store, '三分编组草案 搞掂之后点样跟进');

    ac('AC-10a 抽库四件齐', r1 && ['source', 'derived', 'links', 'chain'].every(k => k in r1),
      JSON.stringify(r1 && Object.keys(r1)));
    const srcIds = (r1.source || []).map(x => x.id);
    const srcHasTime = (r1.source || []).every(x => x.createdAt);
    ac('AC-10b 源头只取 past 且带原始时间',
      srcIds.length > 0 && (r1.source || []).every(x => x.strand === 'past') && srcHasTime,
      JSON.stringify({ srcIds, strands: (r1.source || []).map(x => x.strand) }));
    const dstr = JSON.stringify(r1.derived || {});
    ac('AC-10c 派生含繁简与粤普对照',
      dstr.includes('三分编组') && /誰|谁/.test(dstr) && /怎|点样|怎样/.test(dstr),
      dstr.slice(0, 160));
    const rels = (r1.links || []).map(x => x.relation + ':' + x.strength);
    ac('AC-10d 关联只收强边/候选关系',
      rels.some(x => x === 'derived:8') && rels.some(x => x.startsWith('sprout-candidate')) && !rels.some(x => x === 'related:3'),
      JSON.stringify(rels));
    const ats = (r1.chain || []).map(x => x.at);
    const sorted = ats.every((v, i) => i === 0 || String(ats[i - 1]) <= String(v));
    ac('AC-11a 链按 links.created_at 升序', ats.length > 0 && sorted, JSON.stringify(ats));
    ac('AC-11b 两次抽取结果一致（可复现）', JSON.stringify(r1.chain) === JSON.stringify(r2.chain) && JSON.stringify(r1.source) === JSON.stringify(r2.source));
    const after = fs.readFileSync(dbFile);
    ac('AC-11c 抽库纯读（库文件不变）', Buffer.compare(before, after) === 0, `before=${before.length}B after=${after.length}B`);
  }

  console.log(`\n----- 7.1b pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });

