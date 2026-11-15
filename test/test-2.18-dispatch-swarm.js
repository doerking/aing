'use strict';
// M2 任务 2.18 failing test —— 锁 SPEC-2.18 外派三分编组五条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-dispatch-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let D, store;
try {
  D = require('../src/dispatch-swarm.js');
  store = require('../src/knowledge-store.js');
  if (typeof D.DispatchDesk !== 'function') throw new Error('DispatchDesk 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/dispatch-swarm.js 未实现 SPEC-2.18'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const BASELINE = {
  language: { thinking: '务实优先', output: '普通话简体' },
  behavior: { rules: ['留面', '阈值收线'] },
  workflow: ['六步：立项→展开→校验→收口']
};

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const desk = new D.DispatchDesk();

  // AC-1 缺底版拒派
  let thrown = null;
  try { desk.dispatch({ ticket: 'T-1', baseline: { language: BASELINE.language, behavior: BASELINE.behavior } }); }
  catch (e) { thrown = e.message; }
  ac('AC-1 缺底版拒派', /baseline-missing/.test(String(thrown)) && desk.units().length === 0, String(thrown));

  // AC-2 单间不互斥
  const d1 = desk.dispatch({ ticket: 'T-1', baseline: BASELINE });
  const d2 = desk.dispatch({ ticket: 'T-2', baseline: BASELINE });
  ac('AC-2 单间不互斥', d1.state === 'running' && d2.state === 'running' && desk.units().length === 2,
    JSON.stringify(desk.units()));

  // AC-4 3 员职责不重叠
  const roles = d1.members.map(m => m.role);
  const resps = d1.members.map(m => m.responsibility);
  ac('AC-4 3 员职责不重叠', roles.length === 3 && new Set(roles).size === 3 && new Set(resps).size === 3,
    JSON.stringify(d1.members));

  // AC-3 收口校验
  const bad = await desk.close(d1.id, { traces: [], tags: ['unit', 'ticket', 'outcome'] });
  const bad2 = await desk.close(d1.id, { traces: [{ step: 1 }], tags: ['unit'] });
  const stillRunning = desk.units().some(u => u.id === d1.id);
  ac('AC-3a 缺轨迹/标签拒收', !bad.closed && !bad2.closed && stillRunning && desk.units().length === 2,
    JSON.stringify({ bad, bad2, running: stillRunning }));

  const ok = await desk.close(d1.id, { traces: [{ step: 1 }, { step: 2 }], tags: ['unit', 'ticket', 'outcome'] });
  const d3 = desk.dispatch({ ticket: 'T-3', baseline: BASELINE });
  ac('AC-3b 收口解散 + 交接不继承',
    ok.closed && ok.residue && ok.residue.traces.length === 2 && d3.inherited.length === 0 &&
    !desk.units().some(u => u.id === d1.id) && desk.units().length === 2,
    JSON.stringify({ ok, d3: { inherited: d3.inherited }, units: desk.units() }));

  // AC-5 零写权
  let writeThrew = null;
  try { desk.write(d2.id, 'entities', { id: 'x' }); } catch (e) { writeThrew = e.message; }
  let unitWrite = null;
  try { d2.write(); } catch (e) { unitWrite = e.message; }
  const nEnt = rows('SELECT COUNT(*) AS n FROM entities')[0].n;
  ac('AC-5 零写权', /swarm-no-write/.test(String(writeThrew)) && /swarm-no-write/.test(String(unitWrite)) && Number(nEnt) === 0,
    JSON.stringify({ writeThrew, unitWrite, nEnt }));

  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'dispatch-swarm.js'), 'utf8');
  ac('AC-5b 无物理删', !/DELETE\s+FROM/i.test(src));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
