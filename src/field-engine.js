'use strict';
// aing-v2 field-engine.js —— M1 任务 1.15 实现（SPEC-1.15 场域骨架）
// 场域只作业于中间带 6/5/4；promote 需 ≥2 独立证据；demote 需 ≥1 理由；动作全可逆。
// 无物理删：只改 tolaria_strength；record 保留 from/to 供 revert。

const FIELD_MIN = 4;
const FIELD_MAX = 6;
const ENTRY_MIN = 7;
const MAX_STRENGTH = 9;

function _err(code, msg) {
  const e = new Error(`${code}: ${msg}`);
  e.code = code;
  return e;
}

class FieldEngine {
  constructor({ store } = {}) {
    if (!store) throw new Error('FieldEngine 需要 store（由编排器注入）');
    this.store = store;
  }

  bandOf(strength) {
    const s = Number(strength);
    if (s >= ENTRY_MIN) return 'entry';
    if (s >= FIELD_MIN) return 'field';
    return 'background';
  }

  async scan() {
    const db = this.store._getDb();
    const stmt = db.prepare(
      'SELECT id FROM entities WHERE invalid_at IS NULL AND tolaria_strength BETWEEN ? AND ? ORDER BY id'
    );
    stmt.bind([FIELD_MIN, FIELD_MAX]);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject().id);
    stmt.free();
    return out;
  }

  _setStrength(id, value) {
    const db = this.store._getDb();
    const stmt = db.prepare('UPDATE entities SET tolaria_strength = ? WHERE id = ?');
    stmt.run([value, id]);
    stmt.free();
    this.store._persist();
  }

  async promote(id, evidence, opts = {}) {
    if (!Array.isArray(evidence) || evidence.length < 2) {
      throw _err('insufficient-evidence', `promote 需 ≥2 独立证据（现有 ${Array.isArray(evidence) ? evidence.length : 0}）`);
    }
    const row = this.store.getEntity(id);
    if (!row) throw _err('not-found', `实体不存在: ${id}`);
    const from = Number(row.tolaria_strength);
    // 只准 3..6：3→4 进场域，6→7 进入口；7 以上或 2 以下唔归场域管
    if (from < FIELD_MIN - 1 || from > FIELD_MAX) {
      throw _err('band-boundary', `strength=${from} 不在场域可升级区间（3..6）`);
    }
    const to = from + 1;
    this._setStrength(id, to);
    return { id, action: 'promote', from, to, evidence, at: new Date().toISOString(), ...opts };
  }

  async demote(id, reasons) {
    if (!Array.isArray(reasons) || reasons.length < 1) {
      throw _err('insufficient-evidence', 'demote 需 ≥1 理由');
    }
    const row = this.store.getEntity(id);
    if (!row) throw _err('not-found', `实体不存在: ${id}`);
    const from = Number(row.tolaria_strength);
    if (from < FIELD_MIN || from > MAX_STRENGTH) {
      throw _err('band-boundary', `strength=${from} 不在可降级区间（4..9）`);
    }
    const to = from - 1;
    this._setStrength(id, to);
    return { id, action: 'demote', from, to, reasons, at: new Date().toISOString() };
  }

  async revert(record) {
    if (!record || record.id == null || record.from == null) {
      throw _err('bad-record', 'revert 需要含 id/from 的动作记录');
    }
    this._setStrength(record.id, record.from);
    return { id: record.id, revertedTo: record.from, at: new Date().toISOString() };
  }
}

module.exports = { FieldEngine, FIELD_MIN, FIELD_MAX, ENTRY_MIN };
