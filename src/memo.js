'use strict';
// aing-v2 memo.js —— M3 任务 3.11 实现（SPEC-3.11 memo 用户面）
// 新 memo = 主驾睇用户的窗：以往主题 / 未闭环 / 模式 / 预案在前，系统细节压成一行。
// 纯读（C16）：唔写任何表、唔投事件；空库 coldStart 诚实（G6）。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const SYSTEM_LINE_MAX = 80;

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

function _body(entity) {
  try { return JSON.parse(entity.content || '{}'); } catch (_) { return {}; }
}

async function buildMemo(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('memo 需要 store 注入（SPEC-3.11 契约）');
  const db = store._getDb();
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 5;
  const plansLimit = Number.isInteger(opts.plansLimit) && opts.plansLimit > 0 ? opts.plansLimit : 3;

  const convs = _rows(db,
    `SELECT * FROM entities WHERE type = 'Conversation' AND invalid_at IS NULL
     ORDER BY created_at DESC, rowid DESC LIMIT ?`, [Math.max(limit, 20)]);

  const recent = convs.slice(0, limit).map(e => {
    const b = _body(e);
    return {
      sessionId: String(e.id).replace(/^conv-/, ''),
      at: b.at || String(e.created_at || ''),
      topic: b.topic || e.name || '',
      outcome: b.outcome == null ? 'open' : b.outcome
    };
  });

  const openLoops = convs
    .map(e => ({ e, b: _body(e) }))
    .filter(x => x.b.outcome == null || x.b.outcome === 'open')
    .slice(0, limit)
    .map(x => ({
      id: x.e.id,
      text: x.b.topic || x.e.name || String(x.e.id),
      since: x.b.at || String(x.e.created_at || '')
    }));

  // 模式：同 topic ≥2 次
  const byTopic = new Map();
  for (const e of convs) {
    const b = _body(e);
    const topic = String(b.topic || '').trim();
    if (!topic) continue;
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic).push(e.id);
  }
  const patterns = [...byTopic.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([pattern, ids]) => ({ pattern, evidenceIds: ids, hits: ids.length }));

  // 预案：以最新主题为消息
  let plans = [];
  if (convs.length) {
    const latest = _body(convs[0]);
    try {
      const p = await require('./predict.js').predict(store, { message: String(latest.topic || '') });
      plans = (p.plans || []).slice(0, plansLimit);
    } catch (_) { plans = []; }
  } else {
    plans = [{
      id: 'plan-cold',
      hypothesis: '无以往依据：此话题库内无会话可依',
      basis: [],
      suggested: '先按常规做法推进，边做边把本轮会话入库',
      risk: '无历史可参照，建议先行确认关键假设',
      confidenceBand: 'low'
    }];
  }

  // 系统一行摘要：健康 / 蒸馏债 / 上轮场域动作
  let cons = { ratio: 1, inBand: true, verdict: 'balanced' };
  try { cons = require('./conservation.js').measureConservation(store, {}); } catch (_) { /* 保持默认 */ }
  const seeds = Number(_scalar(db, `SELECT COUNT(*) AS n FROM compressed_seeds WHERE active = 1`).n || 0);
  const pendingDistill = Number(_scalar(db, `SELECT COUNT(*) AS n FROM entities WHERE status = 'pending-distillation' AND invalid_at IS NULL`).n || 0);
  const lastCycle = _scalar(db, `SELECT * FROM meko_cycles ORDER BY executed_at DESC, rowid DESC LIMIT 1`);
  const lastField = _scalar(db, `SELECT COUNT(*) AS n FROM field_actions`);
  const ratioText = cons.ratio === Infinity ? 'inf' : String(cons.ratio);
  let systemLine = `健康 ${cons.inBand ? 'ok' : cons.verdict} / 蒸馏债 ${pendingDistill} / 籽 ${seeds} / 场域动作 ${lastField ? lastField.n : 0} / 守恒比 ${ratioText}`;
  if (systemLine.length > SYSTEM_LINE_MAX) systemLine = systemLine.slice(0, SYSTEM_LINE_MAX - 1) + '…';

  return {
    user: {
      recent,
      openLoops,
      patterns,
      plans,
      coldStart: convs.length === 0
    },
    systemLine,
    agentTodos: []
  };
}

module.exports = { buildMemo, SYSTEM_LINE_MAX };
