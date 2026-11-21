'use strict';
// SPEC-3.14 修订 A failing test —— batch-ingest（cli.js compile）
// 发现：src/compile.js 嘅 compile() 本身就系 batch-ingest（walk 目录 → frontmatter →
// 实体 upsert → compile_audit，幂等、ID 去重）——按「唔另起平行机制」纪律，
// batch-ingest = 喺 cli.js 暴露 compile 命令（node src/cli.js compile --dir <path>）。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-cli-c-'));
const src = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kb-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); fs.rmSync(src, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const KB_MD = `---
tags: [batch, test, knowledge:7]
type: Concept
name: 批次知识甲
description: batch-ingest 测试档
status: active
---

# 批次知识甲

呢个系 batch-ingest 测试正文，长度足够。`;

(async () => {
  const cli = require('../src/cli.js');
  const store = require('../src/knowledge-store.js');
  const dbPath = path.join(yard, 'knowledge.db');

  // 知识档（replaceAll 先会全换，body 都要换）
  fs.writeFileSync(path.join(src, 'knowledge-a.md'), KB_MD, 'utf8');
  fs.writeFileSync(path.join(src, 'knowledge-b.md'), KB_MD.replaceAll('批次知识甲', '批次知识乙'), 'utf8');

  // AC-1 cmdCompile 存在（batch-ingest 入口）
  ac('AC-1 cmdCompile 已暴露', typeof cli.cmdCompile === 'function', String(typeof cli.cmdCompile));

  // AC-2 跑 batch-ingest 建实体（frontmatter 解析：type/tags/name）
  const r1 = await cli.cmdCompile(dbPath, { dir: src });
  let db = store._getDb();
  const row = (id) => { const s = db.prepare('SELECT * FROM entities WHERE id = ?'); s.bind([id]); const o = s.step() ? s.getAsObject() : null; s.free(); return o; };
  const eA = row('knowledge-a'), eB = row('knowledge-b');
  ac('AC-2 建实体 + frontmatter 解析', r1.created === 2 && eA && eA.type === 'Concept' && eA.name === '批次知识甲' &&
    eA.tags && eA.tags.includes('batch') && eB && eB.name === '批次知识乙' && eB.content.includes('批次知识乙'),
    JSON.stringify({ created: r1.created, type: eA && eA.type, name: eA && eA.name, bName: eB && eB.name }));

  // AC-3 幂等：重跑唔重插（skipped）
  const r2 = await cli.cmdCompile(dbPath, { dir: src });
  db = store._getDb();
  ac('AC-3 幂等重跑 skipped', r2.created === 0 && r2.skipped === 2 && row('knowledge-a') != null,
    JSON.stringify({ created: r2.created, skipped: r2.skipped }));

  // AC-4 compile_audit 留痕（每次跑一行，只追加）
  db = store._getDb();
  const audit = (() => { const s = db.prepare('SELECT COUNT(*) AS n FROM compile_audit'); s.step(); const r = s.getAsObject(); s.free(); return r; })();
  ac('AC-4 compile_audit 留痕', audit && audit.n >= 2, JSON.stringify(audit));

  store._close();
  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
