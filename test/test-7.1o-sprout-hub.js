'use strict';
// M7 任务 7.1o failing test —— 锁 SPEC-7.1 AC-7 的剩余两件：报告工具 + hub 警戒线
// 依据：§十一 风险——`agent` 这类超高频词在强边下会长成新 hub（现读数 96 实体），
//       发芽报告必须带警戒线，超线只报不扩；§十 第 7 步要求「发芽度报告工具」可跑。
// 契约：report 出 sprout/variants 两列 + hubLine 与 flagged 词；实体级 hub 单列；
//       CLI 只读（源库逐位不动）、可 --json、同库两次结果一致。
const fs = require('fs'); const os = require('os'); const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-hub-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const SR = require('../src/sprout-report.js');
const CLI = path.join(__dirname, '..', 'tools', 'sprout-report.js');

const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
function rows(db, sql) { const s = db.prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; }
function snap(db) {
  const ents = rows(db, 'SELECT id, name, title, type, content, tags, status, invalid_at FROM entities ORDER BY id');
  const lnks = rows(db, 'SELECT source_id, target_id, relation, strength, invalid_at FROM links ORDER BY source_id, target_id');
  return sha(JSON.stringify({ ents, lnks }));
}

(async () => {
  const DB = path.join(yard, 'knowledge.db');
  await store.init(DB);
  const db = store._getDb();
  const put = (id, tags, content) => store.insertEntity({ id, name: id, type: 'Concept', content, tags: JSON.stringify(tags), status: 'active' });

  // 宽词：8 个种子，各自强边连到一片实体（会被判 hub）
  for (let i = 0; i < 8; i++) put('wide-' + i, ['宽词:9'], '宽词种子 ' + i);
  for (let i = 0; i < 8; i++) put('wt-' + i, [], '触达物 ' + i);
  for (let i = 0; i < 8; i++) store.insertLink({ source_id: 'wide-' + i, target_id: 'wt-' + i, relation: 'sprout-candidate', confidence: 0.9 });
  // 窄词：1 个种子，1 条强边
  put('narrow-0', ['窄词:9'], '窄词种子');
  put('nt-0', [], '触达物窄');
  store.insertLink({ source_id: 'narrow-0', target_id: 'nt-0', relation: 'pollinate-candidate', confidence: 0.9 });
  db.run("UPDATE links SET strength=8 WHERE relation IN ('sprout-candidate','pollinate-candidate')");
  // 中间 hub 实体：被 3 个词同时触达
  for (const k of ['词甲', '词乙', '词丙']) {
    put(k + '-s', [k + ':9'], k + ' 种子');
    store.insertLink({ source_id: k + '-s', target_id: 'shared-hub', relation: 'sprout-candidate', confidence: 0.9 });
  }
  put('shared-hub', [], '公共枢纽');
  db.run("UPDATE links SET strength=8 WHERE target_id='shared-hub'");
  store._persist();

  const before = snap(db);
  const rep = SR.report(store, { keywords: ['宽词', '窄词', '词甲', '词乙', '词丙'], hubRatio: 0.2, hubMin: 3 });
  const by = Object.fromEntries(rep.keywords.map((k) => [k.kw, k]));

  ac('AC-1 报告带 sprout/variants 两列与 hubLine',
    typeof rep.distribution.hubLine === 'number' && rep.distribution.hubLine > 0 &&
    typeof by['宽词'].sprout === 'number' && typeof by['宽词'].variants === 'number',
    JSON.stringify(rep.distribution));

  ac('AC-2 超线判 hub，且只报不扩（flagged 里只标不产生新边）',
    by['宽词'].hub === true && by['窄词'].hub === false &&
    (rep.distribution.hubs || []).includes('宽词') && !(rep.distribution.hubs || []).includes('窄词'),
    JSON.stringify({ wide: by['宽词'], narrow: by['窄词'], hubs: rep.distribution.hubs }));

  ac('AC-3 实体级 hub 单列（被 ≥3 个关键词触达的实体）',
    Array.isArray(rep.entityHubs) && rep.entityHubs.some((h) => h.id === 'shared-hub' && h.byKeywords >= 3),
    JSON.stringify(rep.entityHubs));

  const rep2 = SR.report(store, { keywords: ['宽词', '窄词', '词甲', '词乙', '词丙'], hubRatio: 0.2, hubMin: 3 });
  ac('AC-4 同库同关键词两次结果逐位一致（可复算）',
    JSON.stringify(rep) === JSON.stringify(rep2), '两次不一致');

  ac('AC-5 报告纯读（跑完库快照不变）', snap(db) === before, '库被改了');

  // CLI：默认在副本上跑，不碰源库；--json 可解析；人读含两列
  const mtimeBefore = fs.statSync(DB).mtimeMs;
  const r = spawnSync(process.execPath, [CLI, '--db', DB, '--keywords', '宽词,窄词', '--json'], { encoding: 'utf8' });
  let j = null; try { j = JSON.parse(r.stdout); } catch (_) {}
  ac('AC-6 CLI --json 可解析',
    r.status === 0 && j && Array.isArray(j.keywords) && j.keywords.length === 2 && typeof j.distribution.hubLine === 'number',
    JSON.stringify({ status: r.status, err: (r.stderr || '').slice(-200), head: (r.stdout || '').slice(0, 100) }));

  const r2 = spawnSync(process.execPath, [CLI, '--db', DB, '--keywords', '宽词,窄词'], { encoding: 'utf8' });
  ac('AC-7 CLI 人读含 sprout/variants 两列与 hub 警示',
    r2.status === 0 && /sprout/i.test(r2.stdout) && /variants/i.test(r2.stdout) && /hub/i.test(r2.stdout),
    JSON.stringify({ status: r2.status, out: (r2.stdout || '').slice(0, 200) }));

  ac('AC-8 CLI 只读：源库文件 mtime 与内容都不变',
    Math.abs(fs.statSync(DB).mtimeMs - mtimeBefore) < 1 && snap(db) === before,
    JSON.stringify({ mtimeBefore, mtimeAfter: fs.statSync(DB).mtimeMs }));

  console.log(`\n----- 7.1o pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
