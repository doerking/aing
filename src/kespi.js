'use strict';
// aing-v2 kespi.js —— M1 任务 1.12 实现（SPEC-1.12 五维，2026-11-18 修订 A）
// spec-first：本文件是 SPEC-1.12（§七 修订 A）的代码结果，契约在 spec/SPEC-1.12-kespi八维.md。
// 五维：KQ 质量 / KA 活跃 / KD 催化率 / KC 时序相干 / KR 续航；各 0.2，无加权。
// 退役：KG（成长）、KM（完整）、KB（平衡）——真库实测恒为常数，列保留写 NULL。
// 全维可测：每维都从库内事实算，唔发明；缺数据就落中性 0.5，不编造。
// 日粒度衰减：同日内重复计算结果一致（幂等可测）。
// 铁律：只写 kespi_scores，不反写 entities；不碰 last_access；无物理删。
// 组件唔直连 knowledge-store：store 由编排器注入（arch-lint C5 守）。

const DAY = 86400000;
const ROUND_WINDOW = 10;        // KC/KR 只回看最近 10 个 executed 轮

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

// 去卡片壳：首行标题、来源/关系/KESPI 状态段、原始资料行——只量真正的内容
function cleanBody(content) {
  return String(content == null ? '' : content)
    .replace(/^#.*$/m, '')
    .replace(/##\s*(来源|关系|KESPI 状态)[\s\S]*?(?=\n##|$)/g, '')
    .replace(/^##\s*内容\s*$/gm, '')
    .replace(/- 原始资料：[^\n]*/g, '')
    .replace(/\s+/g, ' ').trim();
}

function tagCount(tags) {
  try { const t = JSON.parse(tags || '[]'); return Array.isArray(t) ? t.length : 0; } catch (_) { return 0; }
}

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  s.bind(binds);
  let v = null;
  if (s.step()) v = s.getAsObject();
  s.free();
  return v;
}

const CANDIDATE_RELATIONS = ['sprout-candidate', 'pollinate-candidate'];

async function kespiStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('kespi 需要 store 注入（SPEC-1.15 契约）');
  const stats = { scanned: 0, scored: 0 };
  const now = Number.isInteger(opts.now) ? opts.now : Date.now();
  const db = store._getDb();

  const ents = [];
  const es = db.prepare('SELECT * FROM entities WHERE invalid_at IS NULL');
  while (es.step()) ents.push(es.getAsObject());
  es.free();

  // 催化率：出向强边（非候选关系）
  const outStrong = new Map();
  const ls = db.prepare('SELECT source_id, relation, strength FROM links WHERE invalid_at IS NULL');
  while (ls.step()) {
    const l = ls.getAsObject();
    if (Number(l.strength) >= 7 && !CANDIDATE_RELATIONS.includes(String(l.relation))) {
      outStrong.set(String(l.source_id), (outStrong.get(String(l.source_id)) || 0) + 1);
    }
  }
  ls.free();

  // 派生件（时序相干用）
  const derived = new Map();
  const ds = db.prepare("SELECT source_id, target_id FROM links WHERE relation = 'derived' AND invalid_at IS NULL");
  while (ds.step()) {
    const d = ds.getAsObject();
    const k = String(d.source_id);
    (derived.get(k) || derived.set(k, []).get(k)).push(String(d.target_id));
  }
  ds.free();

  // 最近 N 个「executed 且已记账」的轮 + 每轮在场实体集合（SPEC-1.12 修订 A）
  // 记账前的旧轮没有 entity_rounds 行——不能把「没记账」当「缺席」。
  const roundIds = [];
  const rs = db.prepare("SELECT c.id FROM meko_cycles c JOIN entity_rounds r ON r.cycle_id = c.id WHERE c.status = 'executed' GROUP BY c.id ORDER BY MAX(c.executed_at) DESC, MAX(c.rowid) DESC LIMIT ?");
  rs.bind([ROUND_WINDOW]);
  while (rs.step()) roundIds.push(String(rs.getAsObject().id));
  rs.free();
  const aliveByRound = new Map();   // roundId -> Set(entity_id)
  if (roundIds.length) {
    const ph = roundIds.map(() => '?').join(',');
    const as = db.prepare(`SELECT cycle_id, entity_id FROM entity_rounds WHERE cycle_id IN (${ph}) AND alive = 1`);
    as.bind(roundIds);
    while (as.step()) {
      const r = as.getAsObject();
      const k = String(r.cycle_id);
      (aliveByRound.get(k) || aliveByRound.set(k, new Set()).get(k)).add(String(r.entity_id));
    }
    as.free();
  }

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
     VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, NULL, ?, CURRENT_TIMESTAMP)`
  );

  let dirty = false;
  for (const e of ents) {
    stats.scanned++;
    const content = String(e.content == null ? '' : e.content);
    const eid = String(e.id);

    // KQ 质量：去壳正文长度 + 标签 + 置信度（SPEC-1.12 修订 A）
    const bodyLen = cleanBody(content).length;
    const kq = clamp01(Math.min(1, bodyLen / 400) * 0.6 +
      Math.min(1, tagCount(e.tags) / 3) * 0.25 +
      (e.confidence == null ? 0.5 : Number(e.confidence)) * 0.15);

    // KA 活跃：last_access 与访问事件取更近者
    const laDays = daysSince(now, e.last_access);
    const hitDays = daysSince(now, hitMap.get(eid));
    const accessDays = [laDays, hitDays].filter(v => v != null).sort((a, b) => a - b)[0];
    const ka = accessDays == null ? 0.2 : (accessDays <= 7 ? 1 : Math.exp(-accessDays / 30));

    // KD 催化率：出向强边数 / 3
    const kd = clamp01((outStrong.get(eid) || 0) / 3);

    // KR 续航：最近 N 个 executed 轮里在场的占比；无轮次 → 中性 0.5
    let kr = 0.5;
    if (roundIds.length) {
      let alive = 0;
      for (const rid of roundIds) {
        const set = aliveByRound.get(rid);
        if (set && set.has(eid)) alive++;
      }
      kr = alive / roundIds.length;
    }

    // KC 时序相干：派生件与母件同轮在世的占比，按子件取均值；无派生件/无轮次 → 中性 0.5
    let kc = 0.5;
    const kids = derived.get(eid) || [];
    if (kids.length && roundIds.length) {
      let sum = 0;
      for (const kid of kids) {
        let both = 0;
        for (const rid of roundIds) {
          const set = aliveByRound.get(rid);
          if (set && set.has(eid) && set.has(kid)) both++;
        }
        sum += both / roundIds.length;
      }
      kc = sum / kids.length;
    }

    const dims = [kq, ka, kd, kc, kr];
    const overall = dims.reduce((a, b) => a + b, 0) / dims.length;
    upsert.run([eid, round4(kq), round4(ka), round4(kd), round4(kc), round4(kr), round4(overall)]);
    stats.scored++;
    dirty = true;
  }

  upsert.free();
  if (dirty) store._persist();
  return stats;
}

module.exports = { kespiStep, cleanBody, ROUND_WINDOW, CANDIDATE_RELATIONS };
