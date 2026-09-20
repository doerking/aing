// self-test.js — agent 运行时演练（无副作用）/ runtime rehearsal for agents
// 覆盖今天验证过的三条哨兵：生命周期翻转、入库存活、全管线产物一致
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
// 自测绝不替用户提交工作树：compile 的 gitCommit() 会 `git add -A` + `commit --no-verify`，
// 2026-09-14 实测一条 self-test 探针就把 26 个未获批改动打包成 "chore: compile knowledge base"。
process.env.AING_NO_AUTOCOMMIT = '1';
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
      const nonce = new Date().toISOString(); // 每轮内容唯一，否则必然撞上批次去重，断言退化成空转
      store.addMessage('selftest-probe', { role: 'user', content: ('selftest probe message long enough to pass threshold. ').repeat(3) + ' [run ' + nonce + ']' });
      store.ingestSession('selftest-probe');
      log(true, '入库路径存活', '无蒸馏优雅降级');

      // 2b. 回收探针产物：库行（FK 级联）+ wiki 实体档 + raw/inbox 入库档
      const docs = [];
      for (const dir of [path.join(ROOT, 'raw', 'inbox'), path.join(ROOT, 'wiki', 'entities')]) {
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) if (/^selftest-probe/.test(f)) { fs.rmSync(path.join(dir, f), { force: true }); docs.push(f); }
      }
      const db2 = new SQL.Database(fs.readFileSync(path.join(ROOT, 'knowledge.db')));
      db2.run('PRAGMA foreign_keys = ON');
      const found = db2.exec("SELECT id FROM entities WHERE id LIKE 'selftest-probe%'");
      const ids = found.length ? found[0].values.map(v => v[0]) : [];
      for (const id of ids) db2.run('DELETE FROM entities WHERE id = ?', [id]);
      fs.writeFileSync(path.join(ROOT, 'knowledge.db'), Buffer.from(db2.export()));
      db2.close();
      log(true, '自测残留清理', `实体 ${ids.length} / 文档 ${docs.length} 已回收`);
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

    // 2026-09-17 深度检查 F7：director 动作映射 ↔ STEPS 同源真跑断言（文字里的步数 C20 管，
    // 代码里的数组从前没人管——旧 10 脚本私拼清单漏 link-sync 且绕锁，就是这片盲区拖出来的）。
    try {
      const gd = require(path.join(ROOT, 'src', 'growth-director.js'));
      const Cls = gd.GrowthDirector || gd;
      const d = Object.create(Cls.prototype); // 不过构造函数，只验纯映射
      const full = d._getCommandSequence('full_metabolism');
      const sched = d._getCommandSequence('scheduled_metabolism');
      const delegated = Array.isArray(full) && full.length === 1 && full[0] === 'run-metabolism'
                     && Array.isArray(sched) && sched.length === 1 && sched[0] === 'run-metabolism';
      let allExist = true;
      for (const act of ['emergency_fix', 'compile', 'boost_growth', 'pollinate', 'maintain', 'targeted_pollinate']) {
        for (const c of (d._getCommandSequence(act) || [])) {
          if (!fs.existsSync(path.join(ROOT, 'src', c + '.js'))) { allExist = false; console.log('   缺脚本: ' + act + ' → ' + c); }
        }
      }
      log(delegated && allExist, 'director↔STEPS 同源(F7)', delegated ? (allExist ? '整链委托 + 定向脚本全在位' : '有脚本缺失') : '仍在私拼清单');
    } catch (e) { log(false, 'director↔STEPS 同源(F7)', e.message); }

    console.log(fail === 0 ? '\n🟢 SELF-TEST ALL GREEN' : `\n🔴 ${fail} failed`);
    process.exitCode = fail === 0 ? 0 : 1; // N3: 自然排空异步句柄后带码退出，不在回调里硬杀（0xC0000409 同族，同 distill v1.1 教训）
  });
} catch (e) {
  console.error('self-test 启动失败:', e.message);
  process.exitCode = 1; // N3: 同上
}