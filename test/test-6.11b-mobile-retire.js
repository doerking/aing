'use strict';
// M6 任务 6.11b failing test —— 移动端退役模式（SPEC-6.11 修订 A）
// 口径：手机只挂更短热窗（7 天）+ 只出退役请求，不执行物理删；归档与校验归桌面端。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-mobretire-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const R = require('../src/retention.js');
// 模块未实现时应报断言失败而非环境异常（红必须是断言红）
let MR = {};
try { MR = require('../src/mobile-retire.js'); } catch (_) { MR = {}; }
const call = (fn, ...args) => { try { return fn(...args); } catch (e) { return { error: e.message }; } };
const rowsOf = (db, sql, binds = []) => { const s = db.prepare(sql); if (binds.length) s.bind(binds); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const NOW = new Date('2026-11-17T12:00:00Z');

(async () => {
  const DB = path.join(yard, 'k.db');
  await store.init(DB);
  const db = store._getDb();
  const put = (id, type = 'Conversation') => store.insertEntity({ id, name: id, type, content: '正文' + id, tags: '["t"]' });
  put('old40'); put('mid10'); put('fresh1'); put('raw-old', 'RawDocument'); put('concept-old', 'Concept');
  put('edge-hit'); put('hub');
  db.run("UPDATE entities SET updated_at = '2026-10-08 12:00:00', created_at = '2026-10-08 12:00:00' WHERE id = 'old40'");
  db.run("UPDATE entities SET updated_at = '2026-11-07 12:00:00', created_at = '2026-11-07 12:00:00' WHERE id = 'mid10'");
  db.run("UPDATE entities SET updated_at = '2026-11-16 12:00:00', created_at = '2026-11-16 12:00:00' WHERE id = 'fresh1'");
  db.run("UPDATE entities SET updated_at = '2026-07-01 12:00:00', created_at = '2026-07-01 12:00:00' WHERE id IN ('raw-old','concept-old')");
  db.run("UPDATE entities SET updated_at = '2026-10-28 12:00:00', created_at = '2026-10-28 12:00:00' WHERE id = 'edge-hit'");
  store.insertLink({ source_id: 'edge-hit', target_id: 'hub', relation: 'related' });
  db.run('UPDATE links SET strength = 5');
  store._persist();

  // AC-1 默认热窗：桌面 30 天 vs 手机 7 天（10 天料只在手机侧到期）
  const desk = R.planRetention(store, { now: NOW });
  const mob = R.planRetention(store, { now: NOW, mode: 'mobile-retire' });
  const idsOf = (p) => p.candidates.map((c) => c.id).sort().join(',');
  ac('AC-1 手机更短热窗', desk.windowDays === 30 && mob.windowDays === 7 &&
    idsOf(desk) === 'old40' && idsOf(mob) === 'mid10,old40',
    JSON.stringify({ desk: { w: desk.windowDays, ids: idsOf(desk) }, mob: { w: mob.windowDays, ids: idsOf(mob) } }));

  // AC-2 手机模式永不落删：applyAllowed=false；强边/原稿/知识层一律不进候选
  ac('AC-2 手机不落删', mob.applyAllowed === false && desk.applyAllowed === true &&
    !mob.candidates.some((c) => ['edge-hit', 'raw-old', 'concept-old'].includes(c.id)),
    JSON.stringify({ applyAllowed: mob.applyAllowed, ids: idsOf(mob) }));

  // AC-3 退役请求形状与确定性：同库同 now 两次摘要一致，sha256 为 64 位十六进制
  const q1 = call(MR.buildRetireRequest, store, { now: NOW });
  const q2 = call(MR.buildRetireRequest, store, { now: NOW });
  ac('AC-3 请求确定性', q1 && !q1.error && q1.version === 1 && q1.mode === 'mobile-retire' &&
    /^[0-9a-f]{64}$/.test(String(q1.sha256)) && q1.sha256 === (q2 && q2.sha256),
    JSON.stringify({ q1: q1 && { v: q1.version, m: q1.mode, sha: String(q1.sha256).slice(0, 8), err: q1.error }, q2: q2 && String(q2.sha256).slice(0, 8) }));

  // AC-4 请求内容 = 候选清单：字段齐、按 id 排序、不含原稿/知识层
  const ids = (q1.candidates || []).map((c) => c.id);
  const c0 = q1.candidates && q1.candidates.find((c) => c.id === 'old40');
  ac('AC-4 请求内容', ids.join(',') === 'mid10,old40' &&
    c0 && c0.type === 'Conversation' && c0.name === 'old40' &&
    typeof c0.updatedAt === 'string' && c0.updatedAt.startsWith('2026-10-08') &&
    typeof c0.ageDays === 'number' && c0.ageDays === 40,
    JSON.stringify({ ids, c0 }));

  // AC-5 铁律：构建请求不动库；源码无物理删/无写实体
  const snap = () => JSON.stringify(rowsOf(db, 'SELECT id,name,type,status,last_access,invalid_at,updated_at FROM entities ORDER BY id'));
  const before = snap();
  call(MR.buildRetireRequest, store, { now: NOW });
  let src = '';
  try { src = fs.readFileSync(path.join(__dirname, '..', 'src', 'mobile-retire.js'), 'utf8'); } catch (_) {}
  ac('AC-5 铁律', before === snap() && !/DELETE\s+FROM/i.test(src) && !/UPDATE\s+entities/i.test(src) && !/INSERT\s+INTO/i.test(src),
    '构建请求改动了库或源码含写语句');

  // AC-6 CLI：手机模式 --apply 被拒（退出码 5），请求落盘，实体一条没少
  const outDir = path.join(yard, 'req');
  const cli = path.join(__dirname, '..', 'tools', 'archive.js');
  const r = spawnSync(process.execPath, [cli, '--db', DB, '--out', outDir, '--mode', 'mobile-retire', '--apply', '--now', NOW.toISOString()], { encoding: 'utf8' });
  const reqPath = path.join(outDir, 'retire-request.json');
  const written = fs.existsSync(reqPath) ? JSON.parse(fs.readFileSync(reqPath, 'utf8')) : null;
  await store.init(DB);
  const nAfter = rowsOf(store._getDb(), 'SELECT COUNT(*) AS n FROM entities')[0].n;
  ac('AC-6 CLI 拒绝物理删', r.status === 5 && written && written.candidates.length === 2 && nAfter === 7,
    JSON.stringify({ status: r.status, err: (r.stderr || '').slice(-160), w: written && written.candidates.length, nAfter }));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
