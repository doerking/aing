#!/usr/bin/env node
/**
 * consciousness-event.js — 意识神经统一事件协议
 *
 * 所有意识通道先归一化为 ConsciousnessEvent，再交给意识神经核整合。
 */

const crypto = require('crypto');

const CHANNELS = new Set([
  'structure', 'semantic', 'temporal', 'kespi', 'behavior', 'feedback', 'anomaly', 'intent', 'generic',
]);

function clamp(value, fallback = 0.5) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function text(value, fallback = '') {
  const v = value == null ? fallback : value;
  // W8 (2026-11-03)：null/undefined 归一为空串，不再 String(null)→"null"。
  // 旧写法在 fallback=null（center/candidateId 调用点 :32/:33）时产出字符串 "null"，
  // 使调用点的 `|| null` 因 "null" 为 truthy 而失效 → state.json 的 centers/candidateIds
  // 落 "null" 垃圾值。现 v==null 一律返回 ''，调用点 `|| null` 归位成真正的 null。
  // 所有字符串 fallback 调用点（'generic'/'unknown'/'system'/'observed'...）行为零变化。
  return v == null ? '' : String(v).trim();
}

function stableHash(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value), 'utf8').digest('hex').slice(0, 16);
}

class ConsciousnessEvent {
  constructor(input = {}) {
    const channel = text(input.channel, 'generic').toLowerCase();
    this.eventId = text(input.eventId || input.id) || `consciousness-event-${Date.now()}-${stableHash(Math.random())}`;
    this.source = text(input.source, 'unknown');
    this.center = text(input.center, null) || null;
    this.candidateId = text(input.candidateId, null) || null;
    this.timestamp = input.timestamp || new Date().toISOString();
    this.channel = CHANNELS.has(channel) ? channel : 'generic';
    this.signalType = text(input.signalType || input.signal_type, 'observed');
    this.target = text(input.target, 'system');
    this.intensity = clamp(input.intensity);
    this.confidence = clamp(input.confidence, 0.7);
    this.evidence = input.evidence && typeof input.evidence === 'object' ? input.evidence : {};
    this.relatedEntities = Array.isArray(input.relatedEntities) ? input.relatedEntities.map(String) : [];
    this.suggestedAction = text(input.suggestedAction || input.suggested_action, 'observe');
    this.requiresApproval = Boolean(input.requiresApproval);
    this.promotion = text(input.promotion, 'none');
    this.status = text(input.status, 'observed');
    this.lineageId = text(input.lineageId || input.lineage_id) || null;
    this.tags = Array.isArray(input.tags) ? [...new Set(input.tags.map(String).filter(Boolean))] : [];
    this.fingerprint = text(input.fingerprint) || ConsciousnessEvent.fingerprint(this);
  }

  static fingerprint(input) {
    return stableHash({
      channel: input.channel || 'generic',
      signalType: input.signalType || 'observed',
      target: input.target || 'system',
      evidence: input.evidence || {},
      source: input.source || 'unknown',
      candidateId: input.candidateId || null,
    });
  }

  toJSON() {
    return { ...this };
  }
}

module.exports = { ConsciousnessEvent, CHANNELS, clamp };
