'use strict';
// M2 任务 2.9b failing test —— 回炉实体名用可读话题（SPEC-2.9 修订 A）
// 回炉出的 MetaKnowledge 名是「回炉·<原名>」；原名若是 markdown 会话的时间戳，
// 这条微粒以后在人前就叫「回炉·会话-2026-11-09T01:23:41.985Z」。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-recycle-name-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const R = require('../src/recycle.js');
const NL = String.fromCharCode(10);
const mdConv = (ts, summary) => ['# 会话-' + ts, '', '## 蒸馏摘要', '', '- ' + summary, ''].join(NL);

const one = (db, sql) => { const s = db.prepare(sql); s.step(); const r = s.getAsObject(); s.free(); return r; };

(async () => {
  await store.init(path.join(yard, 'k.db'));
  const db = store._getDb();
  const put = (id, name, type, content) => db.run(
    `INSERT INTO entities (id, name, type, content, status) VALUES (?, ?, ?, ?, 'active')`, [id, name, type, content]);
  const seed = (id) => db.run(`INSERT INTO compressed_seeds (entity_id, content_hash, active, recycled) VALUES (?, 'h', 1, 0)`, [id]);

  put('conv-md', '会话-2026-11-09T01:23:41.985Z', 'Conversation', mdConv('2026-11-09T01:23:41.985Z', '回炉闭环要先补接链'));
  put('conv-json', '旧名', 'Conversation', JSON.stringify({ topic: '检索融合', reply: '检索融合要加 IDF 通道。' }));
  seed('conv-md');
  seed('conv-json');

  const st = await R.recycleStep(store, {});
  const md = one(db, "SELECT * FROM entities WHERE id = 'mz-conv-md'");
  const js = one(db, "SELECT * FROM entities WHERE id = 'mz-conv-json'");

  // AC-1 markdown 会话：回炉名取摘要首句，不带时间戳
  ac('AC-1 markdown 回炉名可读', st.recycled === 2 && md && /^回炉·/.test(md.name) &&
    /回炉闭环/.test(md.name) && !/T01:23:41/.test(md.name),
    JSON.stringify({ stats: st, name: md && md.name }));

  // AC-2 JSON 会话：用原文 topic
  ac('AC-2 JSON 回炉名用 topic', js && js.name === '回炉·检索融合', JSON.stringify({ name: js && js.name }));

  // AC-3 正文与来源锚不变
  ac('AC-3 正文契约不变', md && String(md.content).includes('[recycled-from:conv-md]') && md.type === 'MetaKnowledge',
    JSON.stringify({ tail: md && String(md.content).slice(-40), type: md && md.type }));

  // AC-4 复跑幂等：同籽不重插
  const st2 = await R.recycleStep(store, {});
  ac('AC-4 复跑幂等', st2.recycled === 0 && st2.skipped === 0, JSON.stringify(st2));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
