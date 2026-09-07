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
  return String(value == null ? fallback : value).trim();
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
