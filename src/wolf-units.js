'use strict';
// aing-v2 wolf-units.js —— M2 任务 2.17 实现（SPEC-2.17 子agent 狼位）
// 狼位 = 临时眼睛：只读采样、零写权、完即弃只回一行残渣。
// 五角色身份一字不动（IDENTITY_SNAPSHOT 冻结比对）；每位 ≤2 狼位；D1–D5 观察缺口由狼位补。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const { MEMBERS } = require('./evolution-team.js');

const WOLF_DIMENSIONS = ['D1', 'D2', 'D3', 'D4', 'D5'];
const WOLVES_PER_OWNER = 2;

function _deepFreeze(obj) {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) _deepFreeze(obj[k]);
  }
  return obj;
}

// 身份快照：五员 id/name/role/reads/writes 冻结拷贝
const IDENTITY_SNAPSHOT = _deepFreeze(MEMBERS.map(m => ({
  id: m.id, name: m.name, role: m.role, reads: m.reads.slice(), writes: m.writes.slice()
})));

function assertIdentitiesUnchanged() {
  if (IDENTITY_SNAPSHOT.length !== MEMBERS.length) throw new Error('身份快照员数不符');
  for (const m of MEMBERS) {
    const s = IDENTITY_SNAPSHOT.find(x => x.id === m.id);
    if (!s) throw new Error('身份快照缺员: ' + m.id);
    if (s.name !== m.name || s.role !== m.role) throw new Error('身份被改: ' + m.id);
    if (JSON.stringify(s.reads) !== JSON.stringify(m.reads)) throw new Error('读数面被改: ' + m.id);
    if (JSON.stringify(s.writes) !== JSON.stringify(m.writes)) throw new Error('写面被改: ' + m.id);
  }
  return true;
}

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  s.step();
  const r = s.getAsObject();
  s.free();
  return r;
}

/** 五维采样（只读） */
function _sampleDimension(db, dimension) {
  if (dimension === 'D1') {
    const raw = Number(_scalar(db, `SELECT COUNT(*) AS n FROM entities WHERE id LIKE 'raw-%' AND invalid_at IS NULL`).n || 0);
    const wiki = Number(_scalar(db, `SELECT COUNT(*) AS n FROM entities WHERE id LIKE 'wiki-%' AND invalid_at IS NULL`).n || 0);
    return { value: Math.abs(raw - wiki), definition: '双链同位缺口数' };
  }
  if (dimension === 'D2') {
    return { value: Number(_scalar(db, `SELECT COUNT(*) AS n FROM field_actions WHERE action IN ('demote','promote','promote-edge')`).n || 0), definition: '越带动作数' };
  }
  if (dimension === 'D3') {
    const a = Number(_scalar(db, 'SELECT AVG(overall) AS a FROM kespi_scores').a || 0);
    return { value: Math.round(a * 1000) / 1000, definition: 'KESPI 均值' };
  }
  if (dimension === 'D4') {
    const s = db.prepare('SELECT growth, pruned FROM meko_cycles ORDER BY executed_at DESC, rowid DESC LIMIT 20');
    let streak = 0;
    while (s.step()) {
      const r = s.getAsObject();
      if (Number(r.growth || 0) === 0 && Number(r.pruned || 0) === 0) streak++;
      else break;
    }
    s.free();
    return { value: streak, definition: '连续无动作轮数' };
  }
  if (dimension === 'D5') {
    return { value: Number(_scalar(db, `SELECT COUNT(*) AS n FROM genes WHERE status = 'active'`).n || 0), definition: '活跃 gene 数' };
  }
  throw new Error('未知观察维: ' + dimension);
}

class WolfUnits {
  constructor({ members } = {}) {
    this.owners = new Set((members || MEMBERS.map(m => m.id)));
    this.wolves = new Map();
    this.seq = new Map();
  }

  spawn(ownerId, opts = {}) {
    if (!this.owners.has(ownerId)) throw new Error('未知单元长: ' + ownerId);
    const dimension = String(opts.dimension || 'D1');
    if (!WOLF_DIMENSIONS.includes(dimension)) throw new Error('未知观察维: ' + dimension);
    const mine = [...this.wolves.values()].filter(w => w.ownerId === ownerId);
    if (mine.length >= WOLVES_PER_OWNER) throw new Error(`狼位超编制: ${ownerId} 已有 ${mine.length} > ${WOLVES_PER_OWNER}`);
    const n = (this.seq.get(ownerId) || 0) + 1;
    this.seq.set(ownerId, n);
    const id = `wolf-${ownerId}-${dimension}-${n}`;
    const wolf = Object.freeze({
      id, ownerId, dimension,
      writes: Object.freeze([]),
      reads: Object.freeze([dimension])
    });
    this.wolves.set(id, wolf);
    return wolf;
  }

  sample(wolfId, { store } = {}) {
    const w = this.wolves.get(wolfId);
    if (!w) throw new Error('狼位不存在: ' + wolfId);
    if (!store || typeof store._getDb !== 'function') throw new Error('sample 需要 store 注入');
    return _sampleDimension(store._getDb(), w.dimension);
  }

  write(wolfId, table, row) {
    // 狼位零写权：任何写意图一律拒
    throw new Error('wolf-no-write: 狼位只读，写由场域执行件负责');
  }

  retire(wolfId, opts = {}) {
    const w = this.wolves.get(wolfId);
    if (!w) return { retired: false, wolfId };
    let sample = null;
    if (opts.store && typeof opts.store._getDb === 'function') {
      try { sample = _sampleDimension(opts.store._getDb(), w.dimension).value; } catch (_) { sample = null; }
    }
    this.wolves.delete(wolfId);
    return {
      retired: true,
      wolfId,
      dimension: w.dimension,
      sample,
      residue: `${w.dimension} 采样狼（${w.ownerId}）已收队，残渣已并入单元长观察层`
    };
  }

  snapshot() {
    return [...this.wolves.values()].map(w => ({ id: w.id, ownerId: w.ownerId, dimension: w.dimension, writes: w.writes.length }));
  }
}

module.exports = { WOLF_DIMENSIONS, WOLVES_PER_OWNER, IDENTITY_SNAPSHOT, assertIdentitiesUnchanged, WolfUnits, sampleDimension: _sampleDimension };
