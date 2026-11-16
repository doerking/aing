'use strict';
// M6 任务 6.4b failing test —— 锁 SPEC-6.4b markdown 会话轨迹回填五条 AC
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-mdconv-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let T;
try {
  T = require('../src/trajectory.js');
  if (typeof T.syncSessions !== 'function') throw new Error('syncSessions 未导出');
} catch (e) {
  console.error('❌ 红（正确的红）—— 6.4b markdown 轨迹回填未实现'); console.error('   ' + e.message.split('\n')[0]); process.exit(1);
}

const rows = (db, sql, b = []) => { const s = db.prepare(sql); if (b.length) s.bind(b); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const one = (db, sql, b = []) => rows(db, sql, b)[0] || null;
const parse = (s, fb) => { try { return JSON.parse(s); } catch (_) { return fb; } };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();

  const MD = [
    '# 会话-md1', '',
    '## 来源', '- 原始资料：dispatch-x', '',
    '## 内容', '正文若干，足够非空。', '',
    '## 蒸馏摘要', '- 摘要一条'
  ].join('\n');
  const JSON6 = JSON.stringify({ format: 'capability-narrative-v1', topic: '六段样本', turns: [{ scene: 's', output: 'o' }], stats: { toolCalls: 0, turnCount: 1, bodyChars: 10 } });
  const JSON3 = JSON.stringify({ topic: '三源样本', reply: '已复核', searchShown: ['来源甲'], rationale: '先对表' });
  const JSONX = JSON.stringify({ foo: 1 });

  const ins = db.prepare(`INSERT INTO entities
    (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at,last_access)
    VALUES (?,?, 'Conversation', ?, '[]', 'active', 0.6, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '2021-06-01 00:00:00')`);
  ins.run(['conv-md1', '会话-md1', MD]);
  ins.run(['conv-empty', '空会话', '   ']);
  ins.run(['conv-json1', '六段', JSON6]);
  ins.run(['conv-json2', '三源', JSON3]);
  ins.run(['conv-obj', '怪对象', JSONX]);
  ins.free();
  store._persist();

  const before = JSON.stringify(rows(db, 'SELECT id,content,last_access FROM entities ORDER BY id'));
  const r1 = await T.syncSessions(store, {});
  const after = JSON.stringify(rows(db, 'SELECT id,content,last_access FROM entities ORDER BY id'));

  // ── AC-1 markdown 会话落轨迹 ────────────────────────────
  const md = one(db, "SELECT * FROM task_trajectories WHERE id='traj-conv-md1'");
  const mEv = md ? parse(md.evidence, {}) : {};
  const mSeq = md ? parse(md.step_sequence, []) : [];
  const mRoute = md ? parse(md.route, []) : [];
  ac('AC-1 markdown 会话轨迹',
    md && md.task_type === 'session' && md.source === 'session-markdown' && Number(md.success) === 1 &&
    mRoute[0] === '摘要一条' && mSeq.includes('来源') && mSeq.includes('内容') && mSeq.includes('蒸馏摘要') &&
    mEv.convId === 'conv-md1' && mEv.format === 'markdown-conversation' && mEv.bodyChars === MD.length && mEv.sectionCount === 3,
    JSON.stringify({ row: md && { s: md.source, ok: md.success }, mRoute, mSeq, mEv }));

  // ── AC-2 空正文 / 怪 JSON 不落 ─────────────────────────
  const none1 = one(db, "SELECT * FROM task_trajectories WHERE id='traj-conv-empty'");
  const none2 = one(db, "SELECT * FROM task_trajectories WHERE id='traj-conv-obj'");
  ac('AC-2 空正文与怪 JSON 不落轨迹', !none1 && !none2 && r1.noBody === 2,
    JSON.stringify({ empty: !!none1, obj: !!none2, noBody: r1.noBody }));

  // ── AC-3 幂等 ───────────────────────────────────────────
  const r2 = await T.syncSessions(store, {});
  ac('AC-3 二次同步跳过', r2.logged === 0 && r2.skipped >= 3, JSON.stringify(r2));

  // ── AC-4 两种 JSON 形状不回归 ───────────────────────────
  const n6 = one(db, "SELECT * FROM task_trajectories WHERE id='traj-conv-json1'");
  const n3 = one(db, "SELECT * FROM task_trajectories WHERE id='traj-conv-json2'");
  const n3seq = n3 ? parse(n3.step_sequence, []) : [];
  ac('AC-4 六段/三源不回归',
    n6 && n6.source === 'session-narrative' && n3 && n3.source === 'session-three-source' &&
    n3seq.includes('回复') && n3seq.includes('搜索展示') && n3seq.includes('事由分析'),
    JSON.stringify({ n6: n6 && n6.source, n3: n3 && n3.source, n3seq }));

  // ── AC-5 铁律 ───────────────────────────────────────────
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'trajectory.js'), 'utf8');
  ac('AC-5 实体/last_access 零变化 + 无删 + 不直连 store',
    before === after && !/DELETE\s+FROM/i.test(src) && !/require\(['"][^'"]*knowledge-store/.test(src),
    JSON.stringify({ same: before === after }));

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
