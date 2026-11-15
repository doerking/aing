'use strict';
// aing-v2 meko-hydrogen-bond.js —— M1 任务 1.14 实现（SPEC-0.2 §2.1 ①氢键结合）
// 弱键可逆：bond → wired，unwind → 原样返、wired 翻 false。
// 内存 Map 存 bondId → { rawEntity, wikiEntity, wired }；生产 M2 可迁 meko_cycles 表。

const crypto = require('crypto');

class HydrogenBond {
  constructor(store) {
    this.store = store;
    this.bonds = new Map(); // bondId → { rawEntity, wikiEntity, wired }
  }

  async bond(rawEntity, wikiEntity) {
    const bondId = 'bond-' + crypto.randomBytes(8).toString('hex');
    this.bonds.set(bondId, { rawEntity, wikiEntity, wired: true });
    return { bondId, wired: true };
  }

  async unwind(bondId) {
    const b = this.bonds.get(bondId);
    if (!b) throw new Error('bondId 不存在: ' + bondId);
    b.wired = false;
    this.bonds.delete(bondId);
    return { unwound: true, rawEntity: b.rawEntity, wikiEntity: b.wikiEntity };
  }
}

module.exports = { HydrogenBond };
