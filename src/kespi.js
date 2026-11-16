'use strict';
// aing-v2 kespi.js —— M1 任务 1.12 实现（SPEC-1.12 八维）
// spec-first：本文件是 SPEC-1.12 的代码结果，契约在 spec/SPEC-1.12-kespi八维.md。
// 全维可测：每维都从库内事实算，唔发明；KD 只认有效邻居，KC 走双链一致。
// 日粒度衰减：同日内重复计算结果一致（幂等可测）。
// 铁律：只写 kespi_scores，不反写 entities；不碰 last_access；无物理删。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const DAY = 86400000;

function parseTs(v) {
  if (v == null || v === '') return null;
  const raw = String(v).trim();
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const zoned = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  const t = Date.parse(zoned);
  return Number.isFinite(t) ? t : null;
}
function daysSince(now, v) {
  const t = parseTs(v);
  return t == null ? null : Math.floor((now - t) / DAY);
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const round4 = (x) => Math.round(x * 10000) / 10000;

async function kespiStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('kespi 需要 store 注入（SPEC-1.15 契约）');
  const stats = { scanned: 0, scored: 0 };
  const now = Number.isInteger(opts.now) ? opts.now : Date.now();
  const db = store._getDb();

  const ents = [];
  const es = db.prepare('SELECT * FROM entities WHERE invalid_at IS NULL');
  while (es.step()) ents.push(es.getAsObject());
  es.free();

  const byId = new Map(ents.map(e => [e.id, e]));

  const deg = new Map();
  const ls = db.prepare('SELECT source_id, target_id FROM links WHERE invalid_at IS NULL');
  while (ls.step()) {
    const l = ls.getAsObject();
    deg.set(l.source_id, (deg.get(l.source_id) || 0) + 1);
    deg.set(l.target_id, (deg.get(l.target_id) || 0) + 1);
  }
  ls.free();

  // 访问事件（SPEC-6.7）：与 last_access 取更近的一次，作为 KA 的活跃锚
  const hitMap = new Map();
  const hs = db.prepare('SELECT entity_id, MAX(hit_at) AS at FROM access_hits GROUP BY entity_id');
  while (hs.step()) {
    const r = hs.getAsObject();
    if (r.at != null) hitMap.set(String(r.entity_id), String(r.at));
  }
  hs.free();

  const upsert = db.prepare(
    `INSERT OR REPLACE INTO kespi_scores (entity_id, kq, kg, ka, km, kd, kc, kr, kb, overall, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );

  let dirty = false;
  for (const e of ents) {
    stats.scanned++;
    const content = String(e.content == null ? '' : e.content);

    // KQ 质量
    const kq = clamp01(Math.min(1, content.length / 200) * 0.7 +
      (e.tags ? 0.15 : 0) +
      (e.confidence == null ? 0.5 : Number(e.confidence)) * 0.15);

    // KG 成长
    const upd = daysSince(now, e.updated_at);
    const kg = upd == null ? 0.5 : (upd <= 30 ? 1 : Math.exp(-upd / 90));

    // KA 活跃：last_access 与访问事件取更近者
    const laDays = daysSince(now, e.last_access);
    const hitDays = daysSince(now, hitMap.get(e.id));
    const accessDays = [laDays, hitDays].filter(v => v != null).sort((a, b) => a - b)[0];
    const ka = accessDays == null ? 0.2 : (accessDays <= 7 ? 1 : Math.exp(-accessDays / 30));

    // KM 完整
    const km = [e.name, e.type, e.content, e.tags].filter(v => v != null && String(v) !== '').length / 4;

    // KD 连接（有效邻居）
    const n = Number(deg.get(e.id) || 0);
    const kd = clamp01(n / 5);

    // KC 双链一致
    let kc;
    if (String(e.id).startsWith('wiki-')) {
      const base = String(e.id).slice(5);
      const src = byId.get('raw-' + base) || byId.get(base);
      if (!src) kc = 0.3;
      else kc = String(src.content == null ? '' : src.content) === content ? 1 : 0.4;
    } else {
      const base = String(e.id).startsWith('raw-') ? String(e.id).slice(4) : String(e.id);
      const mirror = byId.get('wiki-' + base);
      if (!mirror) kc = 0.3;
      else kc = String(mirror.content == null ? '' : mirror.content) === content ? 1 : 0.4;
    }

    // KR 时效
    const createdDays = daysSince(now, e.created_at);
    const kr = createdDays == null ? 0.5 : Math.exp(-createdDays / 365);

    // KB 平衡
    const strength = Number(e.tolaria_strength == null ? 5 : e.tolaria_strength);
    const kb = clamp01(1 - Math.abs(strength / 9 - kd));

    const dims = { kq, kg, ka, km, kd, kc, kr, kb };
    const overall = Object.values(dims).reduce((a, b) => a + b, 0) / 8;
    upsert.run([e.id, round4(kq), round4(kg), round4(ka), round4(km), round4(kd), round4(kc), round4(kr), round4(kb), round4(overall)]);
    stats.scored++;
    dirty = true;
  }

  upsert.free();
  if (dirty) store._persist();
  return stats;
}

module.exports = { kespiStep };
