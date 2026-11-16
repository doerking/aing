'use strict';
// M3 任务 3.15 failing test —— 锁 SPEC-3.15 外派派单卡 AC-1~8
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-card-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let C = {};
try { C = require('../src/dispatch-card.js'); } catch (_) { C = {}; }
const D = require('../src/dispatch-swarm.js');
const store = require('../src/knowledge-store.js');
const call = (name, ...args) => (typeof C[name] === 'function' ? C[name](...args) : { __missing: true });
const rows = (sql) => { const s = store._getDb().prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };

const INPUT = {
  ticket: 'T-15',
  statement: '采集三家企业近三年市占与毛利率',
  criteria: '每项带出处、可交叉；市占按同一口径',
  path: '交叉验证',
  baseline: { language: { output: '简中' }, behavior: { rules: ['收线'] }, workflow: ['六步'] },
  framework: { background: '背景', statement: '命题', trace_policy: '事实+指针', output_schema: '五项' },
  thickness: { required: 6 },
  lanes: ['normal', 'cover', 'spot-check'],
  units: 3,
  batch: { id: 'b1' },
  flags: { swarmInstalled: true, inRuntimeSurface: true, bundledInPackage: true }
};
const clone = (o) => JSON.parse(JSON.stringify(o));

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));

  // AC-1 七段齐且有序
  const r1 = call('buildDispatchCard', INPUT);
  const HEADS = ['## 一、命题与判据', '## 二、路径', '## 三、厚度', '## 四、底版与框架', '## 五、编队与波次', '## 六、粒子与门', '## 七、回报 schema'];
  const idx = HEADS.map(h => String(r1.card || '').indexOf(h));
  ac('AC-1 卡七段齐且有序', idx.every(i => i >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]),
    JSON.stringify(idx));

  // AC-2 缺项不静默
  const noThick = clone(INPUT); delete noThick.thickness;
  const noBase = clone(INPUT); delete noBase.baseline.workflow;
  const noFw = clone(INPUT); delete noFw.framework.output_schema;
  const noCover = clone(INPUT); noCover.lanes = ['normal'];
  const r2a = call('buildDispatchCard', noThick);
  const r2b = call('buildDispatchCard', noBase);
  const r2c = call('buildDispatchCard', noFw);
  const r2d = call('buildDispatchCard', noCover);
  const pick = (r) => (r.problems || []).map(p => p.code).join(',');
  ac('AC-2 缺项不静默',
    r2a.ok === false && /thickness-missing/.test(pick(r2a)) && /不得派出/.test(String(r2a.card)) &&
    r2b.ok === false && /baseline-missing/.test(pick(r2b)) &&
    r2c.ok === false && /framework-missing/.test(pick(r2c)) &&
    r2d.ok === false && /lanes-cover-missing/.test(pick(r2d)),
    JSON.stringify({ a: pick(r2a), b: pick(r2b), c: pick(r2c), d: pick(r2d) }));

  // AC-3 模式如实
  const off = clone(INPUT); off.flags = { swarmInstalled: true, inRuntimeSurface: false, bundledInPackage: true };
  const r3a = call('buildDispatchCard', off);
  const r3b = call('buildDispatchCard', INPUT);
  ac('AC-3 模式如实', r3a.mode === 'inline-degraded' && r3b.mode === 'swarm-skill' &&
    /inline-degraded/.test(String(r3a.card)) && r3a.flags.swarmInstalled === true,
    JSON.stringify({ a: r3a.mode, b: r3b.mode }));

  // AC-4 不代派 / 不碰文件与进程
  const src = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'src', 'dispatch-card.js'), 'utf8'); } catch (_) { return ''; } })();
  ac('AC-4 不代派', /本卡不代派/.test(String(r1.card)) &&
    !/child_process|spawnSync|execSync|require\(\s*['"]fs['"]\s*\)/.test(src) &&
    !/INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/i.test(src),
    JSON.stringify({ card: /本卡不代派/.test(String(r1.card)) }));

  // AC-5 memo 挂载 + 纯读
  const memo = require('../src/memo.js');
  const before = rows('SELECT COUNT(*) AS n FROM entities')[0].n + '/' + rows('SELECT COUNT(*) AS n FROM links')[0].n;
  const m5a = await memo.buildMemo(store, { swarmCard: r1 });
  const m5b = await memo.buildMemo(store, {});
  const after = rows('SELECT COUNT(*) AS n FROM entities')[0].n + '/' + rows('SELECT COUNT(*) AS n FROM links')[0].n;
  ac('AC-5 memo 挂载', m5a.swarm && m5a.swarm.attached === true && /## 一、命题与判据/.test(m5a.swarm.card || '') &&
    m5b.swarm && m5b.swarm.attached === false && /未接入/.test(m5b.swarm.line || '') && before === after,
    JSON.stringify({ a: m5a.swarm && m5a.swarm.attached, b: m5b.swarm && m5b.swarm.line, before, after }));

  // AC-6 批间闸
  const lockedIn = clone(INPUT); lockedIn.batch = { id: 'b2', previous: 'b1' };
  const pasIn = clone(INPUT); pasIn.batch = { id: 'b2', previous: 'b1', continued: true };
  const r6a = call('buildDispatchCard', lockedIn);
  const r6b = call('buildDispatchCard', pasIn);
  ac('AC-6 批间闸', r6a.ok === false && /batch-locked/.test(pick(r6a)) && /批间待用户确认/.test(String(r6a.card)) &&
    r6b.ok === true && !/batch-locked/.test(pick(r6b)),
    JSON.stringify({ a: pick(r6a), b: pick(r6b) }));

  // AC-7 读数十实
  const r7a = call('buildDispatchCard', INPUT);
  const r7b = call('buildDispatchCard', INPUT, { snapshot: { units: [] } });
  const r7c = call('buildDispatchCard', INPUT, {
    snapshot: {
      batch: 'b1', units: [{ id: 'unit-1', ticket: 'T-15', thickness: { required: 6, achieved: 3 } }],
      closed: 1, refused: 2, updatedAt: '2026-11-17T10:00:00Z'
    }
  });
  ac('AC-7 读数十实', /未接/.test(String(r7a.reading || '')) &&
    /不完整/.test(String(r7b.reading || '')) &&
    /在跑 1/.test(String(r7c.reading || '')) && /收口 1/.test(String(r7c.reading || '')) &&
    /拒收 2/.test(String(r7c.reading || '')),
    JSON.stringify({ a: r7a.reading, b: r7b.reading, c: r7c.reading }));

  // AC-8 判据同源
  const plan = D.planWave({ units: 3 });
  const mode = D.dispatchMode(INPUT.flags);
  const fwMiss = D.checkFramework(INPUT.framework).missing;
  ac('AC-8 判据同源',
    JSON.stringify(r1.waves) === JSON.stringify(plan.waves) &&
    r1.mode === mode.mode &&
    fwMiss.length === 0 && r1.ok === true && r1.thickness.required === 6 &&
    JSON.stringify(r2c.problems.map(p => p.code)) === JSON.stringify(['framework-missing']),
    JSON.stringify({ waves: r1.waves, plan: plan.waves, mode: r1.mode }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
