'use strict';
// M6 任务 6.6b failing test —— 待蒸馏洞察名可读（SPEC-6.6 修订 A）
// 维护简报的「待蒸馏洞察」名会被 memo / 进化循环引用；markdown 实体名是时间戳时等于没名字。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-insight-name-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const R = require('../src/maintenance-report.js');
const NL = String.fromCharCode(10);
const mdBody = (ts, summary) => ['# 会话-' + ts, '', '## 蒸馏摘要', '', '- ' + summary, ''].join(NL);

(async () => {
  await store.init(path.join(yard, 'k.db'));
  const db = store._getDb();
  const put = (id, name, content) => db.run(
    `INSERT INTO entities (id, name, type, content, status) VALUES (?, ?, 'MetaKnowledge', ?, 'pending-distillation')`, [id, name, content]);

  put('mz-md', '会话-2026-11-09T01:23:41.985Z', mdBody('2026-11-09T01:23:41.985Z', '回炉闭环要先补接链'));
  put('mz-json', '旧名', JSON.stringify({ topic: '检索融合', reply: '检索融合要加 IDF 通道。' }));

  const rep = R.buildReport(store);
  const items = (rep.external && rep.external.pendingInsights && rep.external.pendingInsights.items) || [];
  const names = items.map((x) => String(x.name));

  // AC-1 markdown 实体：名取摘要首句，不带时间戳
  ac('AC-1 markdown 名可读', names.some((n) => /回炉闭环/.test(n)) && !names.some((n) => /T01:23:41/.test(n)),
    JSON.stringify({ names }));

  // AC-2 JSON 实体：用原文 topic
  ac('AC-2 JSON 名用 topic', names.includes('检索融合'), JSON.stringify({ names }));

  // AC-3 计数与形状不变
  ac('AC-3 形状不变', rep.external.pendingInsights.count === 2 &&
    items.every((x) => typeof x.id === 'string' && typeof x.name === 'string' && Object.keys(x).sort().join(',') === 'id,name'),
    JSON.stringify({ count: rep.external.pendingInsights.count, item: items[0] }));

  // AC-4 只读
  const before = JSON.stringify((() => { const s = db.prepare('SELECT id,name,content,status FROM entities ORDER BY id'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  R.buildReport(store);
  const after = JSON.stringify((() => { const s = db.prepare('SELECT id,name,content,status FROM entities ORDER BY id'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  ac('AC-4 只读', before === after, '报告改动了实体');

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
