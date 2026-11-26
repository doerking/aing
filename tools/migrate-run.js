'use strict';
// tools/migrate-run.js —— M4 真迁移入口（SPEC-4.0）
// 默认：源 = 旧 aing 库（相对本仓上一级），备份 = data/backup，目标 = data/knowledge.db
// 铁律：旧库只读；迁移前冷备份；报告落盘可回溯。

const fs = require('fs');
const path = require('path');
const store = require('../src/knowledge-store.js');
const M = require('../src/migrate.js');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

(async () => {
  const root = path.join(__dirname, '..');
  const source = path.resolve(arg('source', path.resolve(root, '..', 'aing', 'knowledge.db')));
  const backupDir = path.resolve(arg('backup', path.join(root, 'data', 'backup')));
  const target = path.resolve(arg('target', path.join(root, 'data', 'knowledge.db')));
  const reportPath = path.resolve(arg('report', path.join(root, 'data', 'migration-report.json')));

  // D1 前半：显式 --allow-cap 放行容量闸（默认 10 MB）。env AING_DB_CAP_ALLOW=1 保留作后门。
  // 用途：真旧库常 > 10 MB，迁移属一次性受控动作；用完即撤，唔该长开。
  const allowCap = process.argv.includes('--allow-cap') || process.env.AING_DB_CAP_ALLOW === '1';
  if (allowCap) process.env.AING_DB_CAP_ALLOW = '1';
  const capRelaxed = allowCap === true;

  if (!fs.existsSync(source)) { console.error('❌ 源库不存在: ' + source); process.exit(1); }
  if (fs.existsSync(target)) { console.error('❌ 目标库已存在，拒绝覆盖: ' + target); process.exit(2); }

  console.log('① 冷备份 ' + source);
  const backup = M.coldBackup(source, backupDir);
  console.log('   → ' + backup);

  console.log('② 迁移到 ' + target);
  if (capRelaxed) console.log('   ⚠ 本次放行了容量闸（--allow-cap / AING_DB_CAP_ALLOW=1）：源库超默认 10 MB 上限，迁移属一次性受控动作，用完即撤');
  await store.init(target);
  const rep = await M.migrateFrom(store, { sourcePath: backup });
  console.log(`   实体 ${rep.entities} / 边 ${rep.links} / 丢弃边 ${rep.droppedLinks} / 复核 ${JSON.stringify(rep.verified)}`);

  console.log('③ 全链首跑（1 轮）');
  const orch = new (require('../src/meko-orchestrator.js').MekoOrchestrator)({ store });
  for (const c of require('../src/metabolism.js').buildDefaultSteps()) orch.registerStep(c);
  const cyc = await orch.runCycle('迁移首跑', { rounds: 1, budgetMs: 60000 });
  console.log(`   ${cyc.ok ? '✅' : '❌'} 步数 ${cyc.results.length}${cyc.failedStep ? ' 失败步 ' + cyc.failedStep : ''}`);

  const failed = cyc.results.filter(r => !r.ok).map(r => r.id + ':' + (r.error || ''));
  const report = {
    ...rep,
    backup,
    target,
    capRelaxed,
    firstRun: { ok: cyc.ok, steps: cyc.results.length, failed },
    archived: true,
    at: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('④ 报告 ' + reportPath);
  if (!cyc.ok) process.exitCode = 1;
})().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
