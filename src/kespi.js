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
// SPEC-6.29：六段叙事的正文在 JSON 的 markdown 字段里，别拿 JSON 外壳量质量
const NARRATIVE_FORMAT = 'capability-narrative-v1';
function narrativeBody(content) {
  const s = String(content == null ? '' : content);
  const t = s.trim();
  if (t.charCodeAt(0) !== 123) return s;   // 不是 '{' 就原样返回
  let j = null;
  try { j = JSON.parse(t); } catch (_) { return s; }
  if (j && j.format === NARRATIVE_FORMAT && typeof j.markdown === 'string') return j.markdown;
  return s;
}

function cleanBody(content) {
  return _cleanText(narrativeBody(content));
}

// SPEC-6.30：六段覆盖率进 kq——缺段要掉分，外部件才有动力写全六段
// 口径：覆盖率只对六段叙事生效；非叙事实体 factor 恒为 1，读数不变
const NARRATIVE_SECTIONS = ['场景（触发）', '思维（能力内核）', '手段（工具执行）', '编排（子agent）', '产出', '会话级校准'];
const COVERAGE_FLOOR = 0.6;   // 零段 ×0.6，六段齐 ×1.0，线性
const MIN_SECTION_CHARS = 20; // 基准；实际按实体滑动 ±5（SPEC-6.35）
const SECTION_CHARS_JITTER = 5;

function _hash32(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** 洗牌：种子决定顺序，可复算（Fisher-Yates） */
function _shuffle(arr, seed) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = _hash32(seed + '|' + i) % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
const SLIDE_CYCLE = 6;   // 1 次基准 + 5 个幅度 = 一个周期
// SPEC-6.37：方向符号串 ++-+----+-++，12 轮一循环，前后 6 个互为反相
const SIGN_CHART = ['+', '+', '-', '+', '-', '-', '-', '-', '+', '-', '+', '+'];
/**
 * SPEC-6.36：阈值游标——20 出现一次，随后 ±5..±1 各走一遍再回 20，
 * 方向按周期交替；shuffle 种子 = 实体 id + 周期号，同实体同轮可复算。
 */
function sectionThreshold(entityId, opts = {}) {
  if (entityId == null || entityId === '') return MIN_SECTION_CHARS;
  const round = Number.isFinite(Number(opts && opts.round)) ? Math.max(0, Math.floor(Number(opts.round))) : 0;
  const cycle = Math.floor(round / SLIDE_CYCLE);
  const pos = round % SLIDE_CYCLE;
  if (pos === 0) return MIN_SECTION_CHARS;
  const sign = SIGN_CHART[round % SIGN_CHART.length] === '+' ? 1 : -1;
  const mags = _shuffle([1, 2, 3, 4, 5], String(entityId) + '#' + cycle);
  return MIN_SECTION_CHARS + sign * mags[pos - 1];
}

/** 按标题行切段：返回 [{title, body}]（任何 1~4 级标题都切） */
function _sectionBodies(md) {
  const out = []; let cur = null;
  for (const line of String(md).split(/\r?\n/)) {
    const m = /^#{1,4}\s*(.+?)\s*$/.exec(line);
    if (m) { cur = { title: m[1], body: '' }; out.push(cur); continue; }
    if (cur) cur.body += line + '\n';
  }
  return out;
}

// SPEC-6.39：必填段随能力面浮动——分母不再恒为六段。
// 证据只认系统观测的会话事实（stats.capability），写作者改不了分母；无证据 → 六段全必填。
const BASE_REQUIRED_SECTIONS = ['场景（触发）', '思维（能力内核）', '产出'];
const CONDITIONAL_SECTIONS = [
  ['手段（工具执行）', 'toolCalls'],
  ['编排（子agent）', 'subagentCalls'],
  ['会话级校准', 'calibrations'],
];
/** 从 content JSON 读系统观测到的能力面；不是叙事或没有 capability 字段 → null（不知情） */
function narrativeCapability(content) {
  const s = String(content == null ? '' : content);
  const t = s.trim();
  if (t.charCodeAt(0) !== 123) return null;
  let j = null;
  try { j = JSON.parse(t); } catch (_) { return null; }
  if (!j || j.format !== NARRATIVE_FORMAT) return null;
  const c = j.stats && j.stats.capability;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const n = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
  return { toolCalls: n(c.toolCalls), subagentCalls: n(c.subagentCalls), calibrations: n(c.calibrations), source: c.source || 'unknown' };
}
/** 必填段：恒三段 + 按能力面各加一段；无证据 → 六段全必填（从严，防缩分母） */
function requiredSections(content) {
  const c = narrativeCapability(content);
  if (!c) return NARRATIVE_SECTIONS.slice();
  const met = {};
  for (const [key, field] of CONDITIONAL_SECTIONS) met[key] = c[field] > 0;
  return NARRATIVE_SECTIONS.filter(k => BASE_REQUIRED_SECTIONS.includes(k) || met[k] === true);
}
function narrativeCoverage(markdown, opts = {}) {
  const md = String(markdown == null ? '' : markdown);
  const min = sectionThreshold(opts && opts.entityId, opts);
  const required = (Array.isArray(opts && opts.required) && opts.required.length) ? opts.required : NARRATIVE_SECTIONS;
  const bodies = _sectionBodies(md);
  let n = 0;
  for (const key of required) {
    const hit = bodies.find(b => b.title === key);
    if (hit && hit.body.replace(/\s+/g, '').length >= min) n++;
  }
  return n / required.length;
}
function narrativeFactor(content, opts = {}) {
  const raw = String(content == null ? '' : content);
  const body = narrativeBody(raw);
  if (body === raw) return 1;   // 不是叙事 → 不参与覆盖率
  const required = (Array.isArray(opts && opts.required) && opts.required.length) ? opts.required : requiredSections(content);
  return COVERAGE_FLOOR + (1 - COVERAGE_FLOOR) * narrativeCoverage(body, { ...opts, required });
}

// SPEC-6.32：叙事长度只量六段正文——段外填充（别处几写字）不进 kq 长度分
function narrativeSectionText(markdown) {
  const wanted = new Set(NARRATIVE_SECTIONS);
  return _sectionBodies(String(markdown == null ? '' : markdown))
    .filter(b => wanted.has(b.title))
    .map(b => b.body)
    .join('\n');
}

function _cleanText(content) {
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

// SPEC-6.40：游标推进兜底——轮次源三级优先
//   1. 显式 opts.round（重放/审计，不读不写库）
//   2. meko_cycles 行数（有代谢轮就用轮数，原口径不变）
//   3. 按日推进的评分轮次（config 键 kespi.scoreDay = {day, round}；同日内幂等，跨日 +1）
const SCORE_DAY_KEY = 'kespi.scoreDay';
function _getConfigJson(db, key) {
  try {
    const s = db.prepare('SELECT value_json FROM config WHERE key = ?'); s.bind([key]);
    const r = s.step() ? s.getAsObject() : null; s.free();
    return r ? JSON.parse(r.value_json) : null;
  } catch (_) { return null; }
}
function _setConfigJson(db, key, value) {
  db.run('INSERT INTO config (key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ' +
    'ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP',
    [key, JSON.stringify(value)]);
}
function resolveRound(store, opts = {}) {
  const db = store._getDb();
  if (Number.isFinite(Number(opts.round))) return { round: Math.max(0, Math.floor(Number(opts.round))), source: 'explicit' };
  const cycles = Number((_scalar(db, 'SELECT COUNT(*) AS n FROM meko_cycles') || {}).n || 0);
  if (cycles > 0) return { round: cycles, source: 'meko_cycles' };
  const now = Number.isInteger(opts.now) ? opts.now : Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const prev = _getConfigJson(db, SCORE_DAY_KEY);
  const prevRound = prev && typeof prev === 'object' && Number.isFinite(Number(prev.round)) ? Math.max(0, Number(prev.round)) : 0;
  if (!prev || typeof prev !== 'object' || typeof prev.day !== 'string') {
    _setConfigJson(db, SCORE_DAY_KEY, { day, round: 0 });
    if (typeof store._persist === 'function') store._persist();
    return { round: 0, source: 'daily' };
  }
  if (prev.day === day) return { round: prevRound, source: 'daily' };
  if (day < prev.day) return { round: prevRound, source: 'daily' };   // 时钟回拨：不倒退、不重写
  const next = prevRound + 1;
  _setConfigJson(db, SCORE_DAY_KEY, { day, round: next });
  if (typeof store._persist === 'function') store._persist();
  return { round: next, source: 'daily' };
}

async function kespiStep(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('kespi 需要 store 注入（SPEC-1.15 契约）');
  const stats = { scanned: 0, scored: 0 };
  const now = Number.isInteger(opts.now) ? opts.now : Date.now();
  const db = store._getDb();
  // SPEC-6.36 / SPEC-6.40：阈值游标的轮次——显式传入 > 代谢轮计数 > 按日推进的评分轮次
  const round = resolveRound(store, opts).round;

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
  // SPEC-6.51：links 主键是 (source,target)，import 先占下 raw→wiki 的 hydrogen-bond，
  // distill 的 derived 便永不落地 → kc 全库恒 0.5。镜像边按身份认定即加工边（D21）。
  const derived = new Map();
  const ds = db.prepare(
    `SELECT source_id, target_id FROM links WHERE invalid_at IS NULL AND (
       relation = 'derived'
       OR (relation = 'hydrogen-bond' AND source_id LIKE 'raw-%'
           AND target_id = 'wiki-' || substr(source_id, 5))
     )`);
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

    // KQ 质量：去壳正文长度 + 标签 + 置信度（SPEC-1.12 修订 A），
    // 叙事只量六段正文（SPEC-6.32），再乘六段覆盖率（SPEC-6.30）
    const narrBody = narrativeBody(content);
    const isNarr = narrBody !== content;
    const bodyLen = isNarr
      ? narrativeSectionText(narrBody).replace(/\s+/g, '').length
      : cleanBody(content).length;
    const kq = clamp01((Math.min(1, bodyLen / 400) * 0.6 +
      Math.min(1, tagCount(e.tags) / 3) * 0.25 +
      (e.confidence == null ? 0.5 : Number(e.confidence)) * 0.15) * narrativeFactor(content, { entityId: eid, round }));

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

module.exports = { kespiStep, cleanBody, narrativeBody, narrativeCoverage, narrativeFactor, narrativeSectionText, narrativeCapability, requiredSections, resolveRound, sectionThreshold, NARRATIVE_SECTIONS, BASE_REQUIRED_SECTIONS, CONDITIONAL_SECTIONS, COVERAGE_FLOOR, MIN_SECTION_CHARS, SECTION_CHARS_JITTER, SIGN_CHART, ROUND_WINDOW, CANDIDATE_RELATIONS };
