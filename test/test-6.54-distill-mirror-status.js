'use strict';
// M6 任务 6.54 failing test —— 蒸馏镜像状态收口（SPEC-6.54）
// 要修的病：distill 只翻原料，镜像永远挂在 pending-distillation（选择集又排除 wiki-%），蒸馏债虚高。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-dst-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const distill = require('../src/distill.js');

(async () => {
  await store.init(path.join(yard, 'k.db'));
  const db = store._getDb();
  const st = (id) => { const s = db.prepare('SELECT status FROM entities WHERE id = ?'); s.bind([id]); s.step(); const r = s.getAsObject(); s.free(); return r && r.status; };
  const debt = () => { const r = db.exec("SELECT COUNT(*) FROM entities WHERE status='pending-distillation' AND invalid_at IS NULL"); return r && r[0] ? Number(r[0].values[0][0]) : -1; };

  const mk = (id, status) => store.insertEntity({ id, name: id, type: 'Concept', content: '正文 ' + id, tags: '["t:7"]', status });

  // 场景一：原料与镜像双 pending
  mk('raw-a', 'pending-distillation');
  mk('wiki-a', 'pending-distillation');
  // 场景二：镜像已是 done
  mk('raw-b', 'pending-distillation');
  mk('wiki-b', 'done');
  // 场景三：无镜像（本步新建）
  mk('raw-c', 'pending-distillation');

  const r1 = await distill.distillStep(store, {});
  ac('AC-1 双 pending → 两侧都 active、债 0',
    r1.distilled === 3 && st('raw-a') === 'active' && st('wiki-a') === 'active' && debt() === 0,
    JSON.stringify({ r1, a: st('raw-a'), wa: st('wiki-a'), debt: debt() }));

  ac('AC-3 镜像已 done 不被翻',
    st('wiki-b') === 'done', JSON.stringify({ wb: st('wiki-b') }));

  ac('AC-4 本步新建镜像为 active', st('wiki-c') === 'active', JSON.stringify({ wc: st('wiki-c') }));

  ac('AC-5 原料侧行为不变：raw 全翻 active',
    st('raw-a') === 'active' && st('raw-b') === 'active' && st('raw-c') === 'active',
    JSON.stringify({ ra: st('raw-a'), rb: st('raw-b'), rc: st('raw-c') }));

  // AC-2 幂等：二跑
  const before = { a: st('raw-a'), wa: st('wiki-a'), wb: st('wiki-b'), wc: st('wiki-c') };
  const r2 = await distill.distillStep(store, {});
  ac('AC-2 幂等：二跑不改状态、债仍 0',
    r2.distilled === 0 && debt() === 0 && st('raw-a') === before.a && st('wiki-a') === before.wa &&
    st('wiki-b') === before.wb && st('wiki-c') === before.wc,
    JSON.stringify({ r2, debt: debt(), before, now: { a: st('raw-a'), wa: st('wiki-a'), wb: st('wiki-b'), wc: st('wiki-c') } }));

  console.log(`\n----- 6.54 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
