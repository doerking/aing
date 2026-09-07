#!/usr/bin/env node
/**
 * hermes-aing-adapter.js — Hermes 类 Agent → aing 适配层
 *
 * 目标：把宿主 Agent 的会话、检索和主动维护事件接入 aing，
 * 不绑定 Hermes 内部实现，也不复制一套平行 memory.db。
 *
 * 支持：
 *   - session:completed / ingest：会话消息写入 raw/，沿用 aing auto-ingest 链
 *   - memory:search：调用 aing 本地混合检索
 *   - consciousness:briefing：生成热点、告警和维护建议
 *
 * CLI：
 *   node src/hermes-aing-adapter.js ingest '<json>'
 *   node src/hermes-aing-adapter.js search '<query>' [limit]
 *   node src/hermes-aing-adapter.js briefing
 *   node src/hermes-aing-adapter.js deliberate [urgency]
 *
 * JSON ingest 示例：
 * {
 *   "sessionId": "hermes-session-1",
 *   "agentId": "doerone",
 *   "messages": [
 *     {"role":"user","content":"..."},
 *     {"role":"assistant","content":"..."}
 *   ]
 * }
 */

const path = require('path');
const { SessionStore } = require('./auto-ingest');
const KnowledgeStore = require('./knowledge-store');
const VectorSearch = require('./vector-search');
const ConsciousnessLayer = require('./consciousness-layer');
const NeuralGuideChain = require('./neural-guide-chain');
const { ConsciousnessKernel } = require('./consciousness-kernel');
const { GuideChainSwarm } = require('./guide-chain-swarm');

const KB_ROOT = process.env.KB_ROOT || path.resolve(__dirname, '..');

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} 必须是非空字符串`);
  }
  return value.trim();
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') throw new Error('消息必须是对象');
  const role = String(message.role || 'user');
  const content = requireNonEmptyString(String(message.content || ''), 'message.content');
  return { role, content };
}

class HermesAingAdapter {
  constructor(options = {}) {
    this.kbRoot = options.kbRoot || KB_ROOT;
    this.sessions = options.sessions || new SessionStore();
    this.store = options.store || null;
    this.vectorSearch = options.vectorSearch || null;
    this.consciousness = options.consciousness || new ConsciousnessLayer({ baseDir: this.kbRoot });
    this.consciousnessKernel = options.consciousnessKernel || new ConsciousnessKernel({
      baseDir: this.kbRoot,
      mode: 'coordination-only',
    });
    this.guideChain = options.guideChain || new NeuralGuideChain({ baseDir: this.kbRoot });
    this.swarm = options.swarm || new GuideChainSwarm(path.join(this.kbRoot, 'knowledge.db'));
    this.swarmInitialized = false;
  }

  async _ensureSwarm() {
    if (!this.swarmInitialized) {
      await this.swarm.init();
      this.swarmInitialized = true;
    }
    return this.swarm;
  }

  async _ensureSearch() {
    if (!this.store) {
      this.store = new KnowledgeStore();
      await this.store.init();
    }
    if (!this.vectorSearch) {
      this.vectorSearch = new VectorSearch(this.store);
      await this.vectorSearch.init();
      try {
        await this.vectorSearch.enableSemantic();
      } catch (e) {
        // aing 自身会回退到 64 维 hash 检索；不因本地语义模型缺失阻断接入。
      }
    }
    return this.vectorSearch;
  }

  /**
   * 接收 Hermes/任意宿主的会话事件。
   * 默认只接收消息，不把宿主的系统提示、技能清单或内部记忆整包复制进 aing。
   */
  async ingestSession(event, options = {}) {
    if (!event || typeof event !== 'object') throw new Error('会话事件必须是对象');
    const sessionId = requireNonEmptyString(
      event.sessionId || event.session_id || `${event.agentId || event.agent_id || 'agent'}-session`,
      'sessionId'
    );
    const messages = Array.isArray(event.messages)
      ? event.messages.map(normalizeMessage)
      : [normalizeMessage(event)];

    const source = String(event.agentId || event.agent_id || 'unknown-agent');
    const scopedSessionId = `${source}::${sessionId}`;
    for (const message of messages) {
      this.sessions.addMessage(scopedSessionId, message);
    }

    // 会话完成时立即冲洗，避免等待 auto-ingest 的时间批处理窗口。
    const flush = options.flush !== false && event.completed !== false && event.session_completed !== false;
    if (flush) this.sessions.ingestSession(scopedSessionId);

    return {
      accepted: true,
      agentId: source,
      sessionId,
      messageCount: messages.length,
      flushed: flush,
      rawDir: path.join(this.kbRoot, 'raw'),
      note: '会话进入 aing raw/；后续由 aing 代谢链处理',
    };
  }

  async search(query, limit = 8) {
    const q = requireNonEmptyString(query, 'query');
    const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 50));
    const vs = await this._ensureSearch();
    const hits = await vs.semanticSearch(q, safeLimit);
    return {
      query: q,
      mode: vs.mode,
      results: hits.map(hit => ({
        id: hit.id,
        name: hit.name,
        type: hit.type,
        score: hit.score,
        updated_at: hit.updated_at,
      })),
    };
  }

  generateBriefing() {
    const briefing = this.consciousness.generateBriefing();
    const signals = [
      ...briefing.alerts.map(alert => ({
        channel: alert.type === 'broken-links' ? 'structure' : 'anomaly',
        signalType: alert.type,
        target: alert.entity || alert.message,
        intensity: Number(alert.severity) || 0.5,
        confidence: 0.75,
        evidence: alert.details || { message: alert.message },
        suggestedAction: alert.type === 'broken-links' ? 'verify' : 'observe',
        tags: ['consciousness', alert.type],
      })),
      ...briefing.hotspots.slice(0, 5).map(hotspot => ({
        channel: 'temporal',
        signalType: 'hotspot',
        target: hotspot.entity,
        intensity: Number(hotspot.heat) || 0.5,
        confidence: 0.7,
        evidence: { vitality: hotspot.vitality, connections: hotspot.connections },
        suggestedAction: 'retrieve',
        tags: ['consciousness', 'hotspot'],
      })),
    ];
    const neural = this.consciousnessKernel.ingest(signals);
    return {
      event: 'knowledge.maintenance_suggested',
      source: 'aing.consciousness',
      priority: neural.reactions.some(r => r.arousal === 'aroused') || briefing.alerts.some(a => Number(a.severity) >= 0.8) ? 'high' : 'normal',
      briefing,
      consciousness: neural,
      growth: neural.growth || [],
      metacognition: neural.metacognition || null,
      requiresApproval: briefing.recommendations.some(r => ['fix-links', 'compile'].includes(r.type)),
    };
  }

  /**
   * 隐藏回环：意识神经导链给信号排优先级，随后交给 aing 原有多 Agent 蜂群协商。
   * 这里只返回共识，不直接执行高风险维护动作。
   */
  async deliberateMaintenance(event = {}) {
    const signals = Array.isArray(event.signals) ? event.signals : [];
    const briefing = event.briefing || this.generateBriefing().briefing;
    const alertSeverity = briefing.alerts.reduce(
      (max, alert) => Math.max(max, Number(alert.severity) || 0),
      0
    );
    const sourceSignals = signals.length > 0
      ? signals
      : briefing.alerts.map(alert => ({
        type: alert.type,
        source: 'aing.consciousness',
        timestamp: Date.now(),
        relativePath: alert.entity || alert.message,
        severity: Number(alert.severity) || 0.5,
      }));
    const neural = this.consciousnessKernel.ingest(sourceSignals.map(signal => ({
      ...signal,
      channel: signal.channel || (signal.type === 'delete' ? 'anomaly' : 'structure'),
      signalType: signal.signalType || signal.type || 'observed',
      target: signal.target || signal.relativePath || 'system',
      intensity: signal.intensity ?? signal.severity ?? 0.5,
      confidence: signal.confidence ?? 0.7,
      suggestedAction: signal.suggestedAction || 'observe',
    })));
    const routes = this.guideChain.routeSignals(sourceSignals);
    const topAttention = Math.max(routes[0]?.attentionScore || 0, neural.reactions[0]?.attention || 0);
    const urgencyLevel = event.urgency || (
      alertSeverity >= 0.8 || topAttention >= 0.8 ? 'critical' :
      alertSeverity >= 0.6 || topAttention >= 0.6 ? 'high' :
      routes.length > 0 ? 'medium' : 'low'
    );
    const swarm = await this._ensureSwarm();
    const deliberation = await swarm.deliberate({
      decision: { urgencyLevel, action: 'maintenance_review' },
      signals: {
        kespiTrend: event.kespiTrend || { decline: 0 },
        fileChanges: event.fileChanges || sourceSignals.length,
        knowledgeGaps: event.knowledgeGaps || {
          highPriority: briefing.recommendations.filter(r => r.priority === 'high').length,
          normal: briefing.recommendations.filter(r => r.priority !== 'high').length,
        },
        stagnantDays: event.stagnantDays || 0,
        metabolismStatus: event.metabolismStatus || 'stable',
        timeTrigger: Boolean(event.timeTrigger),
      },
    });
    return {
      event: 'knowledge.maintenance_deliberated',
      source: 'aing.consciousness.guide-chain-swarm',
      urgencyLevel,
      routes,
      consciousness: neural,
      growth: neural.growth || [],
      metacognition: neural.metacognition || null,
      deliberation,
      requiresApproval: true,
    };
  }
}

async function main() {
  const [command, payload, limit] = process.argv.slice(2);
  const adapter = new HermesAingAdapter();
  let result;

  if (command === 'ingest') {
    let event;
    try { event = JSON.parse(payload || '{}'); } catch (e) { throw new Error(`ingest JSON 无效: ${e.message}`); }
    result = await adapter.ingestSession(event);
  } else if (command === 'search') {
    result = await adapter.search(payload, limit);
  } else if (command === 'briefing') {
    result = adapter.generateBriefing();
  } else if (command === 'deliberate') {
    result = await adapter.deliberateMaintenance({ urgency: payload || undefined });
  } else {
    throw new Error('用法: ingest <json> | search <query> [limit] | briefing');
  }

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ Hermes→aing 适配失败: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { HermesAingAdapter, KB_ROOT };
