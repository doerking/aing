'use strict';
// tools/greenzone-probe.js —— greenZoneGate「开闸影响面」只读探针（SPEC-6.8 修订 A 量档）
//
// 缘起：2026-11-21 拍板「greenZoneGate 保持关」嘅依据系「真库 13 个 ticket 候选全部 overall<0.60
//       → 开闸 0 影响」。库演进后（实体 101→410、全量已评分）该依据需要复量。
// 做法：默认先把真库复制到临时 yard 再量（唔动真库）；--db 可指一个已备副本直接量。
// 语义：闸扫用 scanTickets({persist:false})，唔落工单、唔改库。
//
// 用法：
//   node tools/greenzone-probe.js                     # 复制 data/knowledge.db 到临时 yard 再量
//   node tools/greenzone-probe.js --db <副本路径>     # 直接量指定副本
//   node tools/greenzone-probe.js --json
const fs = require('fs'); const os = require('os'); const path = require('path');
const ROOT = path.join(__dirname, '..');

function parse(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const n = argv[i + 1]; if (n == null || n.startsWith('--')) flags[k] = true; else { flags[k] = n; i++; } }
  }
  return flags;
}

(async () => {
  const flags = parse(process.argv.slice(2));
  const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-gzprobe-'));
  let owned = true;
  try {
    const store = require(path.join(ROOT, 'src', 'knowledge-store.js'));
    const C = require(path.join(ROOT, 'src', 'config-runtime.js'));
    const so = require(path.join(ROOT, 'src', 'self-optimize.js'));

    let dbPath = flags.db;
    if (!dbPath) {
      dbPath = path.join(yard, 'knowledge.db');
      fs.copyFileSync(path.join(ROOT, 'data', 'knowledge.db'), dbPath);
    } else { owned = false; dbPath = path.resolve(String(dbPath)); }
    await store.init(dbPath);
    const db = store._getDb();
    const one = (sql, binds) => { const s = db.prepare(sql); if (binds && binds.length) s.bind(binds); const f = s.step(); const r = f ? s.getAsObject() : null; s.free(); return r; };

    const greenZone = Number(C.getKnob(store, 'kespi.greenZone')) || 0;
    const total = Number(one('SELECT COUNT(*) AS n FROM entities').n);
    const scored = Number(one('SELECT COUNT(*) AS n FROM kespi_scores').n);
    const greenish = greenZone > 0 ? Number(one('SELECT COUNT(*) AS n FROM kespi_scores WHERE overall >= ?', [greenZone]).n) : 0;

    const off = so.scanTickets(store, { persist: false });
    const offKeys = new Set(off.tickets.map(t => t.entity_id + ':' + t.dim));
    C.setKnob(store, 'kespi.greenZoneGate', 1);
    const on = so.scanTickets(store, { persist: false });
    const onKeys = new Set(on.tickets.map(t => t.entity_id + ':' + t.dim));
    const dropped = [...offKeys].filter(k => !onKeys.has(k));
    C.setKnob(store, 'kespi.greenZoneGate', 0);

    // 被剔实体逐个读：kd 量出向强边，入向边系「被引用」——两者方向唔同
    const dropIds = [...new Set(dropped.map(k => k.split(':')[0]))];
    const detail = dropIds.map((id) => {
      const ks = one('SELECT kq, ka, kd, kc, kr, overall FROM kespi_scores WHERE entity_id = ?', [id]);
      const e = one('SELECT type, status FROM entities WHERE id = ?', [id]);
      const outStrong = Number(one('SELECT COUNT(*) AS n FROM links WHERE source_id = ? AND invalid_at IS NULL AND strength >= 7', [id]).n);
      const inEdges = Number(one('SELECT COUNT(*) AS n FROM links WHERE target_id = ? AND invalid_at IS NULL', [id]).n);
      return { id, type: e && e.type, kq: ks && ks.kq, kd: ks && ks.kd, overall: ks && ks.overall, 出向强边: outStrong, 入向边: inEdges };
    });

    const out = {
      db: dbPath,
      greenZone, 实体: total, 已评分: scored, overall_ge_greenZone: greenish,
      闸关单数: offKeys.size, 闸开单数: onKeys.size, 被剔单数: dropped.length,
      剔单明细: dropped, 被剔实体读数: detail
    };
    console.log(flags.json ? JSON.stringify(out, null, 2) : [
      `库：${dbPath}（${owned ? '临时副本' : '指定副本'}）`,
      `greenZone=${greenZone} · 实体 ${total} · 已评分 ${scored} · overall≥${greenZone} 有 ${greenish} 张`,
      `闸关 ${offKeys.size} 单 → 闸开 ${onKeys.size} 单（剔 ${dropped.length}）`,
      ...(dropped.length ? dropped.map(d => `  剔 ${d}`) : ['  （开闸零影响）']),
      ...(detail.length ? detail.map(d => `  ${d.id}：${d.type} overall=${d.overall} kd=${d.kd} 出向强边=${d.出向强边} 入向边=${d.入向边}`) : [])
    ].join('\n'));
    store._close();
  } finally {
    if (owned) { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} }
  }
})().catch(e => { console.error('探针异常: ' + e.message); process.exit(1); });
