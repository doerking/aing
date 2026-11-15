'use strict';
// aing-v2 dispatch-swarm.js —— M2 任务 2.18 实现（SPEC-2.18 外派三分编组）
// 常驻 3 员（主责/协同/校验）、底版先于任务链、单间不互斥滚动派发、收口只回残渣、交接不继承。
// 外派零写权：只出轨迹与标签，残渣回流 meko 吸入口由场域件决定是否落库。
// 本模块唔接触知识库（无 store 依赖）；arch-lint C5 天然满足。

const crypto = require('crypto');

const BASELINE_REQUIRED = ['language', 'behavior', 'workflow'];
const REQUIRED_TAGS = ['unit', 'ticket', 'outcome'];

const UNIT_ROLES = [
  { role: '主责', responsibility: '定方向、担结果、收口签认' },
  { role: '协同', responsibility: '并行展开、补齐材料、推进到可判' },
  { role: '校验', responsibility: '独立复核、挑错、守判据' }
];

function _id(prefix) { return prefix + '-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'); }

class DispatchUnit {
  constructor({ id, ticket, baseline, inherited }) {
    this.id = id;
    this.ticket = ticket;
    this.state = 'running';
    this.baseline = baseline;
    this.inherited = Array.isArray(inherited) ? inherited.slice() : [];
    this.openedAt = new Date().toISOString();
    this.members = UNIT_ROLES.map((r, i) => ({
      id: `${id}-m${i + 1}`,
      role: r.role,
      responsibility: r.responsibility,
      writes: []
    }));
  }

  write() { throw new Error('swarm-no-write: 外派单位对知识库零写权'); }
}

class DispatchDesk {
  constructor({ maxUnits = Infinity } = {}) {
    this.maxUnits = maxUnits;
    this._units = new Map();
    this._closed = 0;
  }

  dispatch({ ticket, baseline, inherited } = {}) {
    if (!ticket || typeof ticket !== 'string') throw new Error('dispatch 需要 ticket');
    const missing = BASELINE_REQUIRED.filter(k => !baseline || baseline[k] == null || baseline[k] === '');
    if (missing.length) throw new Error(`baseline-missing: 缺 ${missing.join(',')}`);
    if (this._units.size >= this.maxUnits) throw new Error(`编制已满: ${this._units.size}/${this.maxUnits}`);
    const unit = new DispatchUnit({ id: _id('unit'), ticket, baseline, inherited });
    this._units.set(unit.id, unit);
    return unit;
  }

  async close(unitId, { traces, tags } = {}) {
    const unit = this._units.get(unitId);
    if (!unit) return { closed: false, reason: 'not-found' };
    const trail = Array.isArray(traces) ? traces : [];
    if (!trail.length) return { closed: false, reason: 'traces-incomplete' };
    const tagSet = new Set(Array.isArray(tags) ? tags : []);
    const missingTags = REQUIRED_TAGS.filter(t => !tagSet.has(t));
    if (missingTags.length) return { closed: false, reason: 'tags-incomplete', missing: missingTags };

    this._units.delete(unitId);
    this._closed++;
    return {
      closed: true,
      residue: {
        unitId,
        ticket: unit.ticket,
        traces: trail,
        tags: [...tagSet],
        // 交接唔继承：只回残渣，人走人路、料归料堆
        inherited: [],
        residue: `${unit.ticket} 收口：轨迹 ${trail.length} 步，标签齐；上下文不入下一单`
      }
    };
  }

  units() {
    return [...this._units.values()].map(u => ({
      id: u.id, ticket: u.ticket, state: u.state,
      members: u.members.length, inherited: u.inherited.length
    }));
  }

  write(unitId) {
    throw new Error('swarm-no-write: 外派单位对知识库零写权');
  }
}

module.exports = { BASELINE_REQUIRED, REQUIRED_TAGS, UNIT_ROLES, DispatchUnit, DispatchDesk };
