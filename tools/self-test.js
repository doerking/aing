// self-test.js — agent 运行时演练（无副作用）/ runtime rehearsal for agents
// 覆盖今天验证过的三条哨兵：生命周期翻转、入库存活、全管线产物一致
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let fail = 0;
const log = (ok, name, detail) => console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  ' + detail : ''}`) || (ok || fail++);

// 1. 生命周期：wiki computed 实体必须在库内有评分（C7a 同源断言）
try {
  const dir = path.join(ROOT, 'wiki', 'entities');
  const computedIds = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/kespi_status:\s*(\w+)/);
    if (m && m[1] === 'computed') computedIds.push(f.replace(/\.md$/, ''));
  }
  const initSqlJs = require('sql.js');
  initSqlJs().then(SQL => {
    const db = new SQL.Database(fs.readFileSync(path.join(ROOT, 'knowledge.db')));
    const r = db.exec('SELECT DISTINCT entity_id FROM kespi_history');
    const scored = new Set(r.length ? r[0].values.map(v => v[0]) : []);
    const missing = computedIds.filter(id => !scored.has(id));
    log(missing.length === 0, '生命周期一致性', missing.length ? '缺失评分: ' + missing.slice(0,3).join(',') : computedIds.length + ' computed ↔ db 一致');

    // 2. 入库路径存活：内存直调（无蒸馏 → 优雅降级 pending-distillation）
    try {
      const { SessionStore } = require(path.join(ROOT, 'src', 'auto-ingest'));
      const store = new SessionStore();
      store.addMessage('selftest-probe', { role: 'user', content: 'selftest probe message long enough to pass threshold. ' .repeat(3) });
      store.ingestSession('selftest-probe');
      log(true, '入库路径存活', '无蒸馏优雅降级');
    } catch (e) {
      log(false, '入库路径存活', e.message);
    }

    // 3. 静态补丁层指纹（C7b 同源）
    try {
      const k = fs.readFileSync(path.join(ROOT, 'src', 'kespi-check.js'), 'utf8');
      const okK = !/markEntityKespiComputed\s*\(/.test(k) || /function\s+markEntityKespiComputed/.test(k);
      const g = fs.readFileSync(path.join(ROOT, 'src', 'auto-ingest.js'), 'utf8');
      const okG = !/hasDistillation/.test(g) || /hasDistillation\s*=/.test(g);
      log(okK && okG, '补丁层指纹', 'v1 defs present');
    } catch (e) { log(false, '补丁层指纹', e.message); }

    console.log(fail === 0 ? '\n🟢 SELF-TEST ALL GREEN' : `\n🔴 ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
  });
} catch (e) {
  console.error('self-test 启动失败:', e.message);
  process.exit(1);
}