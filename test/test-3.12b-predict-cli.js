'use strict';
// M3 任务 3.12b failing test —— predict 接 CLI（SPEC-3.12 修订 A）
// 目标：人能真跑「读 memo → 看预案 → 采纳反馈」这一圈；本件只补读侧命令，不写库。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-predict-cli-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
let CLI = {};
try { CLI = require('../src/cli.js'); } catch (_) { CLI = {}; }
const call = async (fn, ...args) => { try { return await fn(...args); } catch (e) { return { error: e.message }; } };
const CLI_PATH = path.join(__dirname, '..', 'src', 'cli.js');

(async () => {
  const DB = path.join(yard, 'k.db');
  await store.init(DB);
  const S = require('../src/session-ingest.js');
  await S.ingestSession(store, { sessionId: 'a', topic: '回炉闭环', at: '2026-11-01T10:00:00Z',
    reply: '回炉要接进代谢链，否则压缩单向泄漏。', searchShown: ['回炉设计'], rationale: '先补闭环' });
  await store._persist?.();
  const V = require('../src/vector.js');
  await V.vectorStep(store, {});
  store._persist();
  const db = store._getDb();
  const snap = () => JSON.stringify((() => { const s = db.prepare('SELECT id,name,type,content,last_access,status,invalid_at FROM entities ORDER BY id'); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; })());
  const before = snap();
  const mtimeBefore = fs.statSync(DB).mtimeMs;

  // AC-1 模块入口：cmdPredict 可调、返回预案结构
  const out = await call(CLI.cmdPredict, DB, { message: '回炉闭环下一步接哪？' });
  ac('AC-1 cmdPredict 入口', out && !out.error && out.coldStart === false &&
    Array.isArray(out.plans) && out.plans.length >= 1 && Array.isArray(out.plans[0].basis),
    JSON.stringify({ err: out && out.error, plans: out && out.plans && out.plans.length }));

  // AC-2 子进程 human 输出：退出 0，含预案与依据字样
  const r2 = spawnSync(process.execPath, [CLI_PATH, 'predict', '--message', '回炉闭环下一步接哪？', '--db', DB], { encoding: 'utf8' });
  ac('AC-2 CLI 人读输出', r2.status === 0 && /预案/.test(r2.stdout) && /依据/.test(r2.stdout) &&
    /回炉闭环/.test(r2.stdout),
    JSON.stringify({ status: r2.status, out: (r2.stdout || '').slice(0, 200), err: (r2.stderr || '').slice(-200) }));

  // AC-3 --json 可解析
  const r3 = spawnSync(process.execPath, [CLI_PATH, 'predict', '--message', '回炉闭环下一步接哪？', '--db', DB, '--json'], { encoding: 'utf8' });
  let j = null;
  try { j = JSON.parse(r3.stdout); } catch (_) {}
  ac('AC-3 JSON 输出', r3.status === 0 && j && Array.isArray(j.plans) && j.plans.length >= 1,
    JSON.stringify({ status: r3.status, head: (r3.stdout || '').slice(0, 120) }));

  // AC-4 缺词不猜：无 --message → 退出 2 并给用法，不崩
  const r4 = spawnSync(process.execPath, [CLI_PATH, 'predict', '--db', DB], { encoding: 'utf8' });
  ac('AC-4 缺参拒绝', r4.status === 2 && /predict --message/.test(r4.stdout + r4.stderr),
    JSON.stringify({ status: r4.status, out: (r4.stdout || '').slice(0, 120) }));

  // AC-5 只读：跑完实体字段与库文件 mtime 都不变
  const after = snap();
  const mtimeAfter = fs.statSync(DB).mtimeMs;
  ac('AC-5 只读', before === after && mtimeBefore === mtimeAfter,
    JSON.stringify({ changed: before !== after, mtime: mtimeBefore !== mtimeAfter }));

  // AC-6 铁律：CLI 侧无物理删、不改实体
  const src = fs.readFileSync(CLI_PATH, 'utf8');
  ac('AC-6 铁律', !/DELETE\s+FROM/i.test(src) && !/UPDATE\s+entities/i.test(src), 'CLI 源码含写实体语句');

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
