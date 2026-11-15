'use strict';
// tools/db-integrity.js —— C10e：库内引用完整性（孤儿行零残留）
// 在隔离临时库真写两家实体 + 一条边，验证主键去重、合法写入零孤儿。
const fs = require('fs');
const os = require('os');
const path = require('path');

(async () => {
  const store = require('../src/knowledge-store.js');
  const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-integrity-'));
  try {
    await store.init(path.join(yard, 'knowledge.db'));
    const db = store._getDb();
    store.insertEntity({ id: 'a', name: 'A', type: 'Concept', content: '甲', status: 'active', confidence: 0.5 });
    store.insertEntity({ id: 'b', name: 'B', type: 'Concept', content: '乙', status: 'active', confidence: 0.5 });
    store.insertLink({ source_id: 'a', target_id: 'b', relation: 'rel' });
    let dupRejected = false;
    try { store.insertLink({ source_id: 'a', target_id: 'b', relation: 'rel-again' }); } catch (_) { dupRejected = true; }
    const s = db.prepare('SELECT COUNT(*) AS n FROM links l LEFT JOIN entities e ON e.id = l.source_id WHERE e.id IS NULL');
    s.step(); const orphans = Number(s.getAsObject().n); s.free();
    const ok = dupRejected && orphans === 0;
    console.log(ok ? '🟢 主键去重、孤儿行 0' : `🔴 dupRejected=${dupRejected} orphans=${orphans}`);
    process.exitCode = ok ? 0 : 1;
  } finally {
    try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {}
  }
})().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
