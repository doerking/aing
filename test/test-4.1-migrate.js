'use strict';
// M4 数据迁移 + 总验收 —— 先红后绿（SPEC-4.0）
const fs = require('fs'); const os = require('os'); const path = require('path');
const crypto = require('crypto');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-migrate-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const OLD_DB = process.env.AING_OLD_DB || path.resolve(__dirname, '..', '..', 'aing-retired-2026-11-22', 'knowledge.db');

let M, store;
try {
  M = require('../src/migrate.js');
  store = require('../src/knowledge-store.js');
  if (typeof M.migrateFrom !== 'function') throw new Error('migrateFrom 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/migrate.js 未实现 SPEC-4.0'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

(async () => {
  if (!fs.existsSync(OLD_DB)) { console.error('❌ 旧库不存在: ' + OLD_DB); process.exit(1); }
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
  const oldLinks = old.exec('SELECT source_id, target_id, strength, invalid_at FROM links ORDER BY source_id, target_id')[0].values;
  const newEntities = rows('SELECT id, content FROM entities ORDER BY id').map(r => [r.id, r.content]);
  const newLinks = rows('SELECT source_id, target_id, strength, invalid_at FROM links ORDER BY source_id, target_id')
    .map(r => [r.source_id, r.target_id, r.strength, r.invalid_at]);
  const entLoss = oldEntities.length - newEntities.length;
  const linkLoss = oldLinks.length - newLinks.length;
  ac('AC-2 实体零丢失', entLoss === 0 && JSON.stringify(oldEntities) === JSON.stringify(newEntities),
    `old=${oldEntities.length} new=${newEntities.length} loss=${entLoss}`);
  ac('AC-3 边零丢失（强度/失效期原样）', linkLoss === 0 && JSON.stringify(oldLinks) === JSON.stringify(newLinks),
    `old=${oldLinks.length} new=${newLinks.length} loss=${linkLoss} report=${JSON.stringify(rep)}`);

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
