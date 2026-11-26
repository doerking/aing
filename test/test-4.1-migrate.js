'use strict';
// M4 数据迁移 + 总验收 —— 先红后绿（SPEC-4.0）
const fs = require('fs'); const os = require('os'); const path = require('path');
const crypto = require('crypto');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-migrate-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

// A0 发布阻断修：旧库改由 fixture 生成器现造（唔再依赖 repo 外嘅 aing-retired-2026-11-22/knowledge.db，
// 陌生人 clone 拿唔到 ⇒ 曾令 run-all 1 红 / verify-deploy C1+C2 共 2 红）。
// 生成器造「真旧 schema」：links 5 栏（无 strength/invalid_at）、entities 无新列 ⇒ 走 migrate 列探测降级路径。
let M, store, makeLegacyDb;
try {
  M = require('../src/migrate.js');
  store = require('../src/knowledge-store.js');
  makeLegacyDb = require('./fixtures/make-legacy-db.js').makeLegacyDb;
  if (typeof M.migrateFrom !== 'function') throw new Error('migrateFrom 未导出');
  if (typeof makeLegacyDb !== 'function') throw new Error('make-legacy-db 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— migrate 或 fixture 未实现 SPEC-4.0'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const OLD_DB = path.join(yard, 'legacy-fixture.db');

(async () => {
  // 现造旧库 fixture（自包含，陌生人 clone 都拿到）
  const fx = await makeLegacyDb(OLD_DB, { entities: 6, links: 5 });
  const beforeBytes = fs.readFileSync(OLD_DB);
  const beforeHash = sha(beforeBytes);
  const beforeMtime = fs.statSync(OLD_DB).mtimeMs;

  // 4.1 冷备份：迁移前对旧库做字节级副本
  const backupDir = path.join(yard, 'backup');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = M.coldBackup(OLD_DB, backupDir);
  ac('AC-1 冷备份字节一致', fs.existsSync(backupPath) && sha(fs.readFileSync(backupPath)) === beforeHash,
    backupPath);

  // 4.3/4.4 实体 + 边迁移零丢失
  await store.init(path.join(yard, 'knowledge.db'));
  const rep = await M.migrateFrom(store, { sourcePath: backupPath });
  const SQL = await require('sql.js')();
  const old = new SQL.Database(beforeBytes);
  const oldEntities = old.exec('SELECT id, content FROM entities ORDER BY id')[0].values;
  // 旧 links 只有 5 栏（无 strength/invalid_at）：旧侧对照按缺省补（strength=5 / invalid_at=null），
  // 再跟新侧对账 —— 同时验证 migrate 嘅 links 列探测降级路径（A0 fixture 走嘅正系这条）。
  const oldLinksRaw = old.exec('SELECT source_id, target_id, relation, confidence, created_at FROM links ORDER BY source_id, target_id')[0].values;
  const oldLinkKeys = oldLinksRaw.map(r => r[0] + '|' + r[1] + '|' + r[2]);
  const newEntities = rows('SELECT id, content FROM entities ORDER BY id').map(r => [r.id, r.content]);
  const newLinks = rows('SELECT source_id, target_id, strength, invalid_at FROM links ORDER BY source_id, target_id')
    .map(r => [r.source_id, r.target_id, r.strength, r.invalid_at]);
  const entLoss = oldEntities.length - newEntities.length;
  const linkLoss = oldLinksRaw.length - newLinks.length;
  ac('AC-2 实体零丢失', entLoss === 0 && JSON.stringify(oldEntities) === JSON.stringify(newEntities),
    `old=${oldEntities.length} new=${newEntities.length} loss=${entLoss}`);
  // 边零丢失：新旧逐条对齐（按 source|target|relation），新侧 strength 应回退成缺省 5、invalid_at=null
  const newByKey = new Map(newLinks.map(l => [l[0] + '|' + l[1], l]));
  let linkMismatch = [];
  for (const [sid, tid, rel, conf, cat] of oldLinksRaw) {
    const nl = newByKey.get(sid + '|' + tid);
    if (!nl) { linkMismatch.push('missing:' + sid + '->' + tid); continue; }
    if (Number(nl[2]) !== 5 || nl[3] !== null) linkMismatch.push('degrade:' + sid + '->' + tid + ' strength=' + nl[2] + ' invalid=' + nl[3]);
  }
  ac('AC-3 边零丢失（缺列降级：strength→5 / invalid→null）',
    linkLoss === 0 && linkMismatch.length === 0,
    `old=${oldLinksRaw.length} new=${newLinks.length} loss=${linkLoss} mismatch=${JSON.stringify(linkMismatch.slice(0, 3))} report=${JSON.stringify(rep)}`);

  // 边界：重复迁移须拒（唔默默叠加）
  let again = null;
  try { await M.migrateFrom(store, { sourcePath: backupPath }); } catch (e) { again = e.message; }
  ac('AC-4 非空目标拒重迁', /target-not-empty/.test(String(again)), String(again));

  // 4.5 迁移后全量代谢首跑
  const orch = new (require('../src/meko-orchestrator.js').MekoOrchestrator)({ store });
  for (const c of require('../src/metabolism.js').buildDefaultSteps()) orch.registerStep(c);
  const cycle = await orch.runCycle('首跑', { rounds: 1, budgetMs: 60000 });
  const cyc = rows('SELECT COUNT(*) AS n FROM meko_cycles')[0].n;
  ac('AC-5 全量代谢首跑', cycle.ok === true && cycle.results.length >= 14 && Number(cyc) >= 1,
    JSON.stringify({ ok: cycle.ok, steps: cycle.results.length, failed: cycle.failedStep || null, cyc }));

  // 4.6 旧库未动 + 迁移报告落盘
  const afterBytes = fs.readFileSync(OLD_DB);
  const reportPath = path.join(yard, 'migration-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ ...rep, source: { path: OLD_DB, sha256: beforeHash }, archived: true }, null, 2));
  ac('AC-6 旧库未动 + 报告可回溯',
    sha(afterBytes) === beforeHash && fs.statSync(OLD_DB).mtimeMs === beforeMtime &&
    JSON.parse(fs.readFileSync(reportPath, 'utf8')).archived === true,
    JSON.stringify({ sameHash: sha(afterBytes) === beforeHash, sameMtime: fs.statSync(OLD_DB).mtimeMs === beforeMtime }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
