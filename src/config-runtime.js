'use strict';
// aing-v2 config-runtime.js —— M3 任务 3.4 实现（SPEC-3.4 离散旋钮单源）
// 所有可调阈值只在此处定义一次；组件经 resolveOptions 取值，唔准再写死同一数值（C17）。
// 库内 config 表覆盖默认；未知旋钮拒写；唔碰业务表与 last_access。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const DEFAULTS = {
  compress: { inactiveDays: 30, minLength: 50 },
  sprout: { floor: 2, cap: 4 },
  conservation: { band: [0.8, 1.5] },
  hubTrim: { degreeCap: 8, weakBelow: 5 },
  kernel: { stagnantAfter: 3, inhibitHours: 1 },
  // KESPI 消费者阈值（2026-11-21 集中；SPEC-3.4 扩展）——原散落三处硬编码：
  //   promoteMin  field-promote 提升门槛 0.55
  //   geneMin     evolution-team 基因候选门槛 0.45（SPEC-1.12 修订 A，真库均值≈0.46）
  //   redZone     self-optimize 红区 0.45
  //   greenZone   self-optimize 绿区 0.60
  kespi: { promoteMin: 0.55, geneMin: 0.45, redZone: 0.45, greenZone: 0.60 }
};

const KNOB_PATHS = [
  'compress.inactiveDays', 'compress.minLength',
  'sprout.floor', 'sprout.cap',
  'conservation.band',
  'hubTrim.degreeCap', 'hubTrim.weakBelow',
  'kernel.stagnantAfter', 'kernel.inhibitHours',
  'kespi.promoteMin', 'kespi.geneMin', 'kespi.redZone', 'kespi.greenZone'
];

const COMPONENT_MAP = {
  sprout: ['sprout.floor', 'sprout.cap'],
  compress: ['compress.inactiveDays', 'compress.minLength'],
  'hub-trim': ['hubTrim.degreeCap', 'hubTrim.weakBelow'],
  conservation: ['conservation.band'],
  kernel: ['kernel.stagnantAfter', 'kernel.inhibitHours'],
  kespi: ['kespi.promoteMin', 'kespi.geneMin', 'kespi.redZone', 'kespi.greenZone']
};

function _defaultOf(p) {
  const [group, key] = p.split('.');
  const g = DEFAULTS[group];
  return g ? g[key] : undefined;
}

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

function getKnob(store, p) {
  if (!KNOB_PATHS.includes(p)) throw new Error('unknown-knob: ' + p);
  const db = store._getDb();
  const row = _scalar(db, 'SELECT value_json FROM config WHERE key = ?', [p]);
  if (row && row.value_json != null) {
    try { return JSON.parse(row.value_json); } catch (_) { /* 落回默认 */ }
  }
  return _defaultOf(p);
}

function setKnob(store, p, value) {
  if (!KNOB_PATHS.includes(p)) throw new Error('unknown-knob: ' + p);
  const db = store._getDb();
  const stmt = db.prepare(
    `INSERT INTO config (key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`
  );
  stmt.run([p, JSON.stringify(value)]);
  stmt.free();
  store._persist();
  return { key: p, value };
}

function resolveOptions(store, componentId) {
  const paths = COMPONENT_MAP[componentId];
  if (!paths) throw new Error('unknown-component: ' + componentId);
  const out = {};
  for (const p of paths) {
    const short = p.split('.').slice(1).join('.');
    const v = getKnob(store, p);
    if (componentId === 'conservation' && short === 'band') {
      out.bandLow = Array.isArray(v) ? v[0] : undefined;
      out.bandHigh = Array.isArray(v) ? v[1] : undefined;
    } else {
      out[short] = v;
    }
  }
  return out;
}

function listKnobs(store) {
  return KNOB_PATHS.map(p => ({ path: p, value: getKnob(store, p), default: _defaultOf(p) }));
}

module.exports = { DEFAULTS, KNOB_PATHS, COMPONENT_MAP, getKnob, setKnob, resolveOptions, listKnobs };
