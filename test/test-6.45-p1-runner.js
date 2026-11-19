'use strict';
// M6 任务 6.45 failing test —— P1 自动领单循环（SPEC-6.45）
// 要修的病：6.33 的 P1 一轮要靠工具/测试手推，没有一次调用跑完整轮的入口。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-p1run-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/kespi.js');
const N = require('../src/capability-narrative.js');
const S = require('../src/self-optimize.js');
let R = null;
try { R = require('../src/parasite-runner.js'); } catch (_) { R = null; }

const narrative = (markdown, turns) => JSON.stringify({
  format: N.FORMAT, topic: null, at: '2026-11-19T00:00:00Z', trigger: 'test',
  markdown, turns: turns || [], stats: { bodyChars: markdown.length }, calibrations: []
});
const thin = () => narrative(N.SECTIONS.map(k => `### ${k}\n无`).join('\n\n'), [{
  scene: '把上一轮巡检里失败的三个节点列出来，并说明各自的失败原因。',
  thinking: '先按错误码分类，再看是否同源，避免把同源故障重复计三次。',
  output: '三个节点分别是 A、B、C；A 是超时，B、C 同源（上游限流），共两类原因。',
  tools: [{ name: 'Read', isSub: false, input: '{"path":"logs/run.log"}', result: 'ok', approval: null }]
}]);

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('n-thin','n-thin','Conversation',?,'[\"a\",\"b\",\"c\"]','active',0.6,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)", [thin()]);
  db.run("INSERT INTO entities (id,name,type,content,tags,status,confidence,tolaria_strength,created_at,updated_at) VALUES ('p-thin','p-thin','Conversation','短。','[]','active',0.5,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  store._persist();
  await K.kespiStep(store, {});
  S.scanTickets(store, { persist: true, maxTickets: 50 });
  S.dispatchTickets(store, {});

  const ticket = (id) => { const s = db.prepare("SELECT status, evidence_json FROM opt_tickets WHERE entity_id=? AND dim='kq'"); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r; };
  const ent = (id) => { const s = db.prepare('SELECT content, tags FROM entities WHERE id=?'); s.bind([id]); const r = s.step() ? s.getAsObject() : null; s.free(); return r; };

  // AC-1 一轮跑通：领走 → 六段写回 → 验收 verified
  const run = (R && typeof R.runP1Once === 'function') ? await R.runP1Once(store, { round: 1 }) : null;
  const t1 = ticket('n-thin');
  const e1 = ent('n-thin');
  const cov = e1 ? K.narrativeCoverage(JSON.parse(e1.content).markdown) : null;
  const kq = (() => { const s = db.prepare("SELECT kq FROM kespi_scores WHERE entity_id='n-thin'"); s.step(); const r = s.getAsObject(); s.free(); return Number(r.kq); })();
  ac('AC-1 低分叙事单被领走、六段写回、验收 verified',
    !!run && run.claimed.length === 1 && run.rewritten.length === 1 && t1 && t1.status === 'verified' && kq >= 0.5 && cov >= 0.8,
    JSON.stringify({ run: run && { claimed: run.claimed.length, rewritten: run.rewritten, verify: run.verify }, status: t1 && t1.status, kq, cov }));

  // AC-2 第二轮 claimed=0，库不因空转变化
  const snap = () => { const s = db.prepare('SELECT id, content, tags, status FROM entities ORDER BY id'); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return JSON.stringify(a); };
  const before = snap();
  const run2 = (R && typeof R.runP1Once === 'function') ? await R.runP1Once(store, { round: 2 }) : null;
  ac('AC-2 第二轮 claimed=0 且实体表零变化', !!run2 && run2.claimed.length === 0 && snap() === before, JSON.stringify({ run2: run2 && run2.claimed, same: snap() === before }));

  // AC-3 写回保留 turns
  const doc = e1 ? JSON.parse(e1.content) : {};
  ac('AC-3 写回保留 turns（P1 契约）', Array.isArray(doc.turns) && doc.turns.length === 1, JSON.stringify({ turns: doc.turns && doc.turns.length }));

  // AC-4 只认 P1：claimed 全为 P1 单
  ac('AC-4 runner 只领 P1 单', !!run && run.claimed.every(c => String(c.slot) === 'P1' || String(JSON.parse(c.evidence_json || '{}').demand && JSON.parse(c.evidence_json || '{}').demand.slot) === 'P1'),
    JSON.stringify(run && run.claimed.map(c => c.slot)));

  // AC-5 开关：score:false / verify:false 如实反映
  const run3 = (R && typeof R.runP1Once === 'function') ? await R.runP1Once(store, { round: 3, score: false, verify: false }) : null;
  ac('AC-5 score/verify 可单关且返回如实', !!run3 && run3.verify === null && run3.scored === false, JSON.stringify(run3 && { verify: run3.verify, scored: run3.scored }));

  // AC-6 返回四块齐
  ac('AC-6 返回形状四块齐', !!run && Number.isFinite(Number(run.round)) && Array.isArray(run.claimed) && Array.isArray(run.rewritten) && run.verify !== undefined,
    JSON.stringify(run && Object.keys(run)));

  // AC-7 CLI 拒真库
  const { spawnSync } = require('child_process');
  const r7 = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'parasite-loop.js'), '--db', path.join(__dirname, '..', 'data', 'knowledge.db'), '--once'], { encoding: 'utf8', timeout: 60000 });
  ac('AC-7 CLI 拒绝真库路径', r7.status === 3 && /拒在真库/.test(String(r7.stderr)), JSON.stringify({ status: r7.status, err: String(r7.stderr).slice(0, 80) }));

  console.log(`\n----- 6.45 pass=${pass} fail=${fail} -----`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ 红（环境）—— ' + e.message); process.exit(1); });
