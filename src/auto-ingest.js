'use strict';
// aing-v2 auto-ingest.js —— M3 任务 3.5 实现（SPEC-3.5 入库主线）
// 主线：身份闸 → 三源剥除 → 三源入库（G1）→ 回执 scrubTrace。
// 双向钉：产生段必须 ⊆ 蒸馏毛段，两处唔准各写各的（C10g）。
// 铁律：唔碰 last_access；无物理 DELETE。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const { scrubCollectionTrace } = require('./ingest-scrub.js');
const { assertActor } = require('./api-gate.js');
const { ingestSession } = require('./session-ingest.js');
const { ingestNarrative } = require('./capability-narrative.js');

const PRODUCED_SECTIONS = ['用户提问', 'Agent 回复', 'Agent 分析', '收集资料'];
const RAW_SECTIONS = ['用户提问', 'Agent 回复', 'Agent 分析', '收集资料'];

function assertSectionContract() {
  const missing = PRODUCED_SECTIONS.filter(s => !RAW_SECTIONS.includes(s));
  if (missing.length) throw new Error('section-contract-violation: ' + missing.join(','));
  return true;
}

async function autoIngest(store, payload = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('auto-ingest 需要 store 注入（SPEC-3.5 契约）');
  assertSectionContract();

  // 1) 身份闸（C10i）：写面只认 hana（纯校验，唔落任何行）
  assertActor(payload.actor);

  // 2) 分流（SPEC-6.1 修订 A）：有 messages 走六段叙事，否则走三源。
  //    两条路径同号 conv-<sessionId>，先到先得、后到跳过（只追加）。
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (messages.length) {
    const r = await ingestNarrative(store, {
      sessionId: payload.sessionId,
      topic: payload.topic,
      at: payload.at,
      trigger: payload.trigger,
      messages,
      calibrations: Array.isArray(payload.calibrations) ? payload.calibrations : [],
      cfg: payload.cfg,
      narrative: payload.narrative
    });
    return { ...r, route: 'narrative', scrubTrace: 0 };
  }

  // 3) 三源剥除
  const reply = scrubCollectionTrace(payload.reply);
  const searchShown = (Array.isArray(payload.searchShown) ? payload.searchShown : []).map(x => scrubCollectionTrace(x));
  const rationale = scrubCollectionTrace(payload.rationale);
  const scrubTrace = reply.scrubbed
    + searchShown.reduce((n, x) => n + x.scrubbed, 0)
    + rationale.scrubbed;

  // 4) 三源入库（G1：缺回复拒入）
  const r = await ingestSession(store, {
    sessionId: payload.sessionId,
    at: payload.at,
    topic: payload.topic,
    reply: reply.text,
    searchShown: searchShown.map(x => x.text).filter(Boolean),
    rationale: rationale.text,
    outcome: payload.outcome
  });
  return { ...r, route: 'three-source', scrubTrace };
}

module.exports = { PRODUCED_SECTIONS, RAW_SECTIONS, assertSectionContract, autoIngest };
