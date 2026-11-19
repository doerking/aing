'use strict';
// M6 任务 6.42 failing test —— 标签白名单与存量洗消（SPEC-6.42）
// 要修的病：标签参与检索词面分（TAG_WEIGHT=0.6），脏标签一旦进 tags 列就长期污染召回。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-tag-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let H = null;
try { H = require('../src/tag-hygiene.js'); } catch (_) { H = null; }

const norm = (x) => (H && typeof H.normalizeTags === 'function' ? H.normalizeTags(x) : null);
const reasons = (r) => (r && Array.isArray(r.dropped) ? r.dropped.map(d => d.why) : []);

(async () => {
  // AC-1 合法标签原样保留
  const legal = ['x:9', 'y', '工程层:5', 'conv:9', 'src:narrative'];
  const r1 = norm(legal);
  ac('AC-1 合法标签原样保留（顺序/大小写/强度）',
    !!r1 && JSON.stringify(r1.tags) === JSON.stringify(legal) && (r1.dropped || []).length === 0,
    JSON.stringify(r1));

  // AC-2 全角冒号归一半角
  const r2 = norm(['skill：8', ' skill:5 ']);
  ac('AC-2 全角冒号归一 + 首尾空白剔除',
    !!r2 && JSON.stringify(r2.tags) === JSON.stringify(['skill:8', 'skill:5']),
    JSON.stringify(r2));

  // AC-3 空白 / 过长 / 坏强度 / 空串 → 丢弃并给理由码
  const r3 = norm(['', '有 空格', 'x'.repeat(30), 'x:0', 'x:10', 'x:abc', 'due:2026-11-19', 'good:7']);
  ac('AC-3 脏形状丢弃且理由齐（empty/whitespace/too-long/bad-strength）',
    !!r3 && JSON.stringify(r3.tags) === JSON.stringify(['good:7']) &&
    ['empty', 'whitespace', 'too-long', 'bad-strength', 'bad-strength', 'bad-strength', 'bad-strength'].every(w => reasons(r3).includes(w)),
    JSON.stringify(r3));

  // AC-4 净化后重复 → 保留首个
  const r4 = norm(['a:3', 'a:3', 'b', 'b']);
  ac('AC-4 重复保留首个并记 duplicate',
    !!r4 && JSON.stringify(r4.tags) === JSON.stringify(['a:3', 'b']) && reasons(r4).filter(w => w === 'duplicate').length === 2,
    JSON.stringify(r4));

  // AC-5 超过 24 条 → 溢出丢弃
  const many = Array.from({ length: 30 }, (_, i) => 't' + i + ':5');
  const r5 = norm(many);
  ac('AC-5 上限 24 条，溢出记 over-limit',
    !!r5 && r5.tags.length === 24 && reasons(r5).filter(w => w === 'over-limit').length === 6,
    JSON.stringify({ n: r5 && r5.tags.length, why: reasons(r5) }));

  // AC-6 非数组输入 → [] + non-array
  const r6a = norm(null), r6b = norm('a,b'), r6c = norm({ a: 1 });
  ac('AC-6 非数组输入整份作废',
    [r6a, r6b, r6c].every(r => !!r && Array.isArray(r.tags) && r.tags.length === 0 && reasons(r).includes('non-array')),
    JSON.stringify([r6a, r6b, r6c]));

  // AC-7 compile 端到端：frontmatter 脏标签 → 入库干净 + stats.tagsDropped
  await store.init(path.join(yard, 'knowledge.db'));
  const rawDir = path.join(yard, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'dirty.md'),
    '---\nid: ent-dirty\ntype: Concept\ntags: [good:7, "有 空格", "x:abc", "dup", "dup"]\n---\n正文内容');
  const compile = require('../src/compile.js');
  const stats = await compile.compile(rawDir, store);
  const ent = store.getEntity('ent-dirty');
  const tags = ent ? JSON.parse(ent.tags) : null;
  ac('AC-7 compile 写入前净化且 tagsDropped 计数',
    !!ent && JSON.stringify(tags) === JSON.stringify(['good:7', 'dup']) && Number(stats.tagsDropped) === 3,
    JSON.stringify({ tags, tagsDropped: stats && stats.tagsDropped }));

  // AC-8 洗消 dry-run 不写库；--apply 只改 tags 列
  const db = store._getDb();
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) " +
    "VALUES ('ent-polluted','ent-polluted','Concept','正文甲','[\"ok:5\",\"有 空格\",\"bad:0\"]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  store._persist();
  const row = () => { const s = db.prepare("SELECT content, status, confidence, tags FROM entities WHERE id='ent-polluted'"); s.step(); const r = s.getAsObject(); s.free(); return r; };
  const before = row();
  const dry = (H && typeof H.scrubStore === 'function') ? H.scrubStore(store, { apply: false }) : null;
  const afterDry = row();
  const applied = (H && typeof H.scrubStore === 'function') ? H.scrubStore(store, { apply: true }) : null;
  const afterApply = row();
  ac('AC-8 dry-run 不写库，apply 只改 tags 列',
    !!dry && dry.hits.some(h => h.id === 'ent-polluted') && JSON.stringify(afterDry) === JSON.stringify(before) &&
    !!applied && applied.applied >= 1 && afterApply.tags === '["ok:5"]' &&
    afterApply.content === before.content && afterApply.status === before.status && afterApply.confidence === before.confidence,
    JSON.stringify({ dry: dry && dry.hits.length, afterDry: afterDry.tags, afterApply, before }));

  // AC-9 洗消幂等
  const again = (H && typeof H.scrubStore === 'function') ? H.scrubStore(store, { apply: true }) : null;
  ac('AC-9 洗消幂等（再跑命中 0）', !!again && again.hits.length === 0, JSON.stringify(again && again.hits));

  console.log(`\n----- 6.42 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
