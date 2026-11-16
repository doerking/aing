'use strict';
// M3 任务 3.11c failing test —— memo 系统行的守恒读数改用边层（SPEC-2.10 修订 C）
// 2.10c 已把主读数统一到边层，但 memo 还在印旧混口径比值（分子边、分母实体），读起来是假数。
// 本件只改显示：边层 growth:pruned + 实体待退 backlog；混口径不出门（API 仍保留）。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-memoconst-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const M = require('../src/memo.js');

async function fresh(tag, { grow = 0, edgeRetire = 0, entityRetire = 0, staleConvs = 0 } = {}) {
  await store.init(path.join(yard, tag + '.db'));
  const db = store._getDb();
  for (let i = 0; i < grow; i++) {
    db.run(`INSERT INTO links (source_id, target_id, relation, created_at) VALUES (?, ?, 'sprout-candidate', CURRENT_TIMESTAMP)`, ['g' + tag + i, 'h' + tag + i]);
  }
  for (let i = 0; i < edgeRetire; i++) {
    db.run(`INSERT INTO links (source_id, target_id, relation, created_at, invalid_at) VALUES (?, ?, 'related', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, ['r' + tag + i, 's' + tag + i]);
  }
  for (let i = 0; i < entityRetire; i++) {
    db.run(`INSERT INTO entities (id, name, type, content, status) VALUES (?, ?, 'Conversation', 'x', 'active')`, ['e' + tag + i, 'e' + tag + i]);
    db.run(`UPDATE entities SET invalid_at = CURRENT_TIMESTAMP WHERE id = ?`, ['e' + tag + i]);
  }
  // 到窗、无访问、无强边的短料 → retention 候选（待退 backlog）
  for (let i = 0; i < staleConvs; i++) {
    db.run(`INSERT INTO entities (id, name, type, content, status, created_at, updated_at)
            VALUES (?, ?, 'Conversation', 'x', 'active', '2026-09-01 00:00:00', '2026-09-01 00:00:00')`,
      ['old' + tag + i, 'old' + tag + i]);
  }
  return M.buildMemo(store, { limit: 3 });
}

const consPart = (line) => (String(line).split(' / ').find((x) => x.startsWith('守恒')) || '');

(async () => {
  // AC-1 边层读数上屏：产 3 退 1 → 「守恒 3:1」
  const m1 = await fresh('a', { grow: 3, edgeRetire: 1 });
  ac('AC-1 边层比值上屏', /守恒 3:1$/.test(consPart(m1.systemLine)),
    JSON.stringify({ line: m1.systemLine, part: consPart(m1.systemLine) }));

  // AC-2 待退 backlog：有候选才显示，且与 retention 同一来源
  const m2 = await fresh('b', { grow: 2, staleConvs: 2 });
  const planN = require('../src/retention.js').planRetention(store, {}).candidates.length;
  ac('AC-2 待退上屏', planN >= 2 && /守恒 2:0 待退\d+$/.test(consPart(m2.systemLine)),
    JSON.stringify({ line: m2.systemLine, part: consPart(m2.systemLine), planN }));

  // AC-3 不用混口径：实体退 2、边退 0 → 仍显示 3:0，不出现混比 1.5
  const CDB = path.join(yard, 'c.db');
  await store.init(CDB);
  const cdb = store._getDb();
  for (let i = 0; i < 3; i++) cdb.run(`INSERT INTO links (source_id, target_id, relation, created_at) VALUES (?, ?, 'sprout-candidate', CURRENT_TIMESTAMP)`, ['gc' + i, 'hc' + i]);
  for (let i = 0; i < 2; i++) {
    cdb.run(`INSERT INTO entities (id, name, type, content, status) VALUES (?, ?, 'Conversation', 'x', 'active')`, ['ec' + i, 'ec' + i]);
    cdb.run(`UPDATE entities SET invalid_at = CURRENT_TIMESTAMP WHERE id = ?`, ['ec' + i]);
  }
  const m3 = await M.buildMemo(store, { limit: 3 });
  ac('AC-3 混口径不出门', /守恒 3:0/.test(consPart(m3.systemLine)) && !/1\.5/.test(m3.systemLine),
    JSON.stringify({ line: m3.systemLine }));

  // AC-4 顺序与长度：健康在前、向量紧随、守恒在前半段；整行 ≤ 80
  const line = m3.systemLine;
  ac('AC-4 顺序与长度', line.startsWith('健康') && line.indexOf('向量') < 30 &&
    line.length <= 80 && consPart(line).length > 0 && line.indexOf('守恒') < 50,
    JSON.stringify({ line, len: line.length }));

  // AC-5 只读
  const db = store._getDb();
  const before = JSON.stringify((() => { const s = db.prepare('SELECT id,content,last_access,status,invalid_at FROM entities ORDER BY id'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  await M.buildMemo(store, { limit: 3 });
  const after = JSON.stringify((() => { const s = db.prepare('SELECT id,content,last_access,status,invalid_at FROM entities ORDER BY id'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  ac('AC-5 只读', before === after, 'memo 改动了实体');

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
