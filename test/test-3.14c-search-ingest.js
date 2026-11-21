'use strict';
// SPEC-3.14 修订 B failing test —— search-and-ingest（cli.js ingest-search）
// 语义：query 拆词评分源档（name+tags+content 命中占比），选 top-N ≥ threshold，
// 经 compile(source, store, {files}) 入库（复用 compile 管线：gate/upsert/audit/幂等）。
// compile 扩展 opts.files（绝对路径数组）——「扩展非平行」。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-cli-s-'));
const src = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-src-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); fs.rmSync(src, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const mk = (name, body) => `---
tags: [${name}]
type: Concept
name: ${name}
description: ${name} 测试档
status: active
---

# ${name}

${body}`;

(async () => {
  const cli = require('../src/cli.js');
  const store = require('../src/knowledge-store.js');
  const dbPath = path.join(yard, 'knowledge.db');

  // 源档：rel-a 双词命中、rel-b 单词命中、unrelated 零命中
  fs.writeFileSync(path.join(src, 'rel-a.md'), mk('batch-ingest', '呢个系 batch ingest 知识档案，讲 batch 同 ingest 嘅做法。'), 'utf8');
  fs.writeFileSync(path.join(src, 'rel-b.md'), mk('ingest-only', '呢个净系讲 ingest 程序嘅细节，唔涉及批次。'), 'utf8');
  fs.writeFileSync(path.join(src, 'unrelated.md'), mk('unrelated', '呢个讲天气同季节嘅变化规律。'), 'utf8');

  // AC-1 cmdSearchIngest 存在
  ac('AC-1 cmdSearchIngest 已暴露', typeof cli.cmdSearchIngest === 'function', String(typeof cli.cmdSearchIngest));

  // AC-2 评分 + 选档入库：query "batch ingest" threshold 0.6 → 只 rel-a（score 1.0）
  const r1 = await cli.cmdSearchIngest(dbPath, { query: 'batch ingest', source: src, top: 5, threshold: 0.6 });
  const db = store._getDb();
  const has = (id) => { const s = db.prepare('SELECT 1 AS x FROM entities WHERE id = ?'); s.bind([id]); const o = s.step() ? s.getAsObject() : null; s.free(); return !!o; };
  ac('AC-2 评分选档入库（rel-a 入、rel-b/unrelated 唔入）',
    r1.scored === 3 && r1.ingested === 1 && has('rel-a') && !has('rel-b') && !has('unrelated'),
    JSON.stringify({ scored: r1.scored, ingested: r1.ingested, relA: has('rel-a'), relB: has('rel-b'), unrel: has('unrelated') }));

  // AC-3 幂等：重跑唔重插（skipped）
  const r2 = await cli.cmdSearchIngest(dbPath, { query: 'batch ingest', source: src, top: 5, threshold: 0.6 });
  ac('AC-3 幂等重跑 skipped', r2.ingested === 0 && r2.skipped === 1 && has('rel-a'),
    JSON.stringify({ ingested: r2.ingested, skipped: r2.skipped }));

  // AC-4 threshold 过滤：threshold 0.9 → 零入库（rel-a 1.0 唔过 0.9？1.0>=0.9 过……用 query 三词）
  const r3 = await cli.cmdSearchIngest(dbPath, { query: 'batch ingest 天气', source: src, top: 5, threshold: 0.99 });
  ac('AC-4 高阈值零入库', r3.ingested === 0, JSON.stringify({ ingested: r3.ingested, scored: r3.scored }));

  store._close();
  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
