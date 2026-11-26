'use strict';
process.env.AING_ALLOWED_ACTORS = 'hana'; // 写面默认拒所有写，测试档显式配 hana 过闸
// M3 任务 3.14 failing test —— 锁 SPEC-3.14 CLI 入口接线（memo / ingest / orchestrate）
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-cli-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

let C;
try {
  C = require('../src/cli.js');
  for (const k of ['openStore', 'cmdMemo', 'cmdIngest', 'cmdOrchestrate']) {
    if (typeof C[k] !== 'function') throw new Error(k + ' 未导出');
  }
} catch (e) { console.error('❌ 红（正确的红）—— src/cli.js 未实现 SPEC-3.14'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }

(async () => {
  const dbPath = path.join(yard, 'knowledge.db');

  // AC-1 memo 冷启动诚实
  const cold = await C.cmdMemo(dbPath, {});
  ac('AC-1 memo 冷启动诚实', cold.user.coldStart === true && cold.user.recent.length === 0 && typeof cold.systemLine === 'string',
    JSON.stringify(cold.user));

  // AC-2 ingest 真写 + memo 读到
  const ing = await C.cmdIngest(dbPath, { actor: 'hana', sessionId: 'c1', topic: 'CLI接线', reply: 'CLI 入口接好了。', rationale: '接线优先', outcome: 'open' });
  const memo = await C.cmdMemo(dbPath, {});
  const hit = memo.user.recent.find(r => r.topic === 'CLI接线');
  ac('AC-2 ingest 真写 + memo 读到', ing.ingested === true && !!hit && hit.sessionId === 'c1',
    JSON.stringify({ ingested: ing.ingested, recent: memo.user.recent }));

  // AC-3 ingest 只认 hana
  let thrown = null;
  try { await C.cmdIngest(dbPath, { actor: 'user', sessionId: 'c2', reply: 'x' }); } catch (e) { thrown = e.message; }
  ac('AC-3 ingest 只认 hana', /identity-rejected/.test(String(thrown)), String(thrown));

  // AC-4 orchestrate 真跑一轮（注入最小步，唔依赖真代谢原料）
  const step = { id: 'probe', strand: 'raw', band: 'entry', reads: [], writes: [], budgetTick: 1, reversible: true, onCycle: async () => ({ ok: true }) };
  const orch = await C.cmdOrchestrate(dbPath, { rounds: 1, steps: [step] });
  ac('AC-4 orchestrate 真跑出 ok + rounds', orch.ok === true && orch.rounds === 1, JSON.stringify({ ok: orch.ok, rounds: orch.rounds }));

  // AC-5 CLI 真跑（spawn memo --json）
  const cliPath = path.join(__dirname, '..', 'src', 'cli.js');
  const r = spawnSync(process.execPath, [cliPath, 'memo', '--json', '--db', dbPath], { encoding: 'utf8' });
  let parsed = null; try { parsed = JSON.parse(r.stdout); } catch (_) {}
  ac('AC-5 CLI memo --json 真跑', r.status === 0 && parsed && parsed.user && parsed.user.recent.some(x => x.topic === 'CLI接线'),
    (r.stdout || r.stderr || '').slice(0, 120));

  // AC-6 arch-lint 白名单含 cli.js 且本仓绿
  const lint = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'arch-lint.js')], { encoding: 'utf8' });
  ac('AC-6 arch-lint 本仓绿（cli.js 已白名单）', lint.status === 0, (lint.stdout || '').trim().split('\n').slice(-1)[0]);

  console.log(`${pass}/${pass + fail} 绿`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
