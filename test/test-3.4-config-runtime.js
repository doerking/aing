'use strict';
// M3 任务 3.4 failing test —— 锁 SPEC-3.4 离散旋钮单源五条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-config-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let C, store;
try {
  C = require('../src/config-runtime.js');
  store = require('../src/knowledge-store.js');
  if (typeof C.getKnob !== 'function') throw new Error('getKnob 未导出');
} catch (e) { console.error('❌ 红（正确的红）—— src/config-runtime.js 未实现 SPEC-3.4'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

(async () => {
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);
  const db = store._getDb();

  const paths = ['compress.inactiveDays', 'compress.minLength', 'sprout.floor', 'sprout.cap',
    'conservation.band', 'hubTrim.degreeCap', 'hubTrim.weakBelow', 'kernel.stagnantAfter'];
  const defaults = paths.map(p => C.getKnob(store, p));
  ac('AC-1 默认值单源', JSON.stringify(defaults[1]) === '50' && JSON.stringify(defaults[3]) === '4' &&
    Array.isArray(C.getKnob(store, 'conservation.band')) && C.getKnob(store, 'conservation.band').length === 2,
    JSON.stringify(defaults));

  // AC-2 改真变行为
  C.setKnob(store, 'sprout.cap', 1);
  const opts = C.resolveOptions(store, 'sprout');
  // 造足够候选（共享标签 + 关键词）
  store.insertEntity({ id: 'e1', name: '共现甲', type: 'Concept', content: '时界场域双链守恒发芽样本', tags: '["主题:7"]', status: 'active', confidence: 0.5 });
  store.insertEntity({ id: 'e2', name: '共现乙', type: 'Concept', content: '时界场域双链守恒发芽样本', tags: '["主题:7"]', status: 'active', confidence: 0.5 });
  store.insertEntity({ id: 'e3', name: '共现丙', type: 'Concept', content: '时界场域双链守恒发芽样本', tags: '["主题:7"]', status: 'active', confidence: 0.5 });
  store._persist();
  const sprout = require('../src/sprout.js');
  const r = await sprout.sproutStep(store, opts);
  ac('AC-2 改真变行为', opts.cap === 1 && r.seeded <= 1, JSON.stringify({ opts, r }));

  // AC-3 持久化
  const keep = C.getKnob(store, 'sprout.cap');
  ac('AC-3 持久化', keep === 1, JSON.stringify({ keep }));

  // AC-4 未知旋钮拒
  let threw = null;
  try { C.setKnob(store, 'nope.x', 1); } catch (e) { threw = e.message; }
  ac('AC-4 未知旋钮拒', /unknown-knob/.test(String(threw)), String(threw));

  // AC-5 组件不重复写死
  const sproutSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'sprout.js'), 'utf8');
  const compressSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'compress.js'), 'utf8');
  ac('AC-5 组件不重复写死',
    !/opts\.cap\s*:\s*4/.test(sproutSrc) && !/opts\.floor\s*:\s*2/.test(sproutSrc) &&
    !/opts\.inactiveDays\s*:\s*30/.test(compressSrc) && !/opts\.minLength\s*:\s*50/.test(compressSrc),
    JSON.stringify({ sprout: sproutSrc.match(/opts\.(cap|floor)[^\n]*/g), compress: compressSrc.match(/opts\.(inactiveDays|minLength)[^\n]*/g) }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
