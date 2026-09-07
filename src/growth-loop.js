#!/usr/bin/env node
/**
 * growth-loop.js — 本地自学习/自成长闭环
 *
 * 三个能力：
 * 1) route learning：统计任务路线的成功率、重试和耗时
 * 2) memory routing：决定 answer/retrieve/reflect/verify/ask
 * 3) controlled improvement：候选策略进入 candidate，评估后才 promote
 *
 * 仅使用本地 JSON，不接外部蜂群、不执行候选代码、不自动覆盖核心配置。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'growth-loop.json');

const DEFAULT_STATE = {
  version: 2,
  routes: {},
  patterns: {},
  episodes: [],
  memoryDecisions: [],
  improvements: [],
  genes: [],
  elitePatterns: [],
  stats: { episodes: 0, successes: 0, failures: 0, memoryDecisions: 0 },
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function now() { return new Date().toISOString(); }

function slug(value) {
  return String(value || 'unknown').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'unknown';
}

function hash(value) {
  return crypto.createHash('sha1').update(String(value), 'utf8').digest('hex').slice(0, 12);
}

class GrowthLoop {
  constructor(stateFile = STATE_FILE) {
    this.stateFile = stateFile;
    this.state = this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.stateFile)) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      return {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        routes: parsed.routes || {},
        patterns: parsed.patterns || {},
        episodes: Array.isArray(parsed.episodes) ? parsed.episodes : [],
        memoryDecisions: Array.isArray(parsed.memoryDecisions) ? parsed.memoryDecisions : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
        genes: Array.isArray(parsed.genes) ? parsed.genes : [],
        elitePatterns: Array.isArray(parsed.elitePatterns) ? parsed.elitePatterns : [],
        stats: { ...DEFAULT_STATE.stats, ...(parsed.stats || {}) },
      };
    } catch (error) {
      return structuredClone(DEFAULT_STATE);
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    const tmp = `${this.stateFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.stateFile);
  }

  /** Record one completed task trajectory and update route statistics. */
  recordEpisode(input = {}) {
    const taskType = slug(input.taskType || input.task || 'unknown');
    const route = Array.isArray(input.route) ? input.route.map(String).filter(Boolean) : [];
    const routeId = route.join(' > ') || 'unrouted';
    const key = `${taskType}::${routeId}`;
    const patternKey = String(input.patternKey || `${taskType}::${routeId}`).slice(0, 240);
    const success = Boolean(input.success);
    const durationMs = Math.max(0, Number(input.durationMs) || 0);
    const retries = Math.max(0, Number(input.retries) || 0);
    const row = this.state.routes[key] || {
      taskType, route, attempts: 0, successes: 0, failures: 0,
      totalDurationMs: 0, totalRetries: 0, lastSeen: null,
    };
    row.attempts += 1;
    row.successes += success ? 1 : 0;
    row.failures += success ? 0 : 1;
    row.totalDurationMs += durationMs;
    row.totalRetries += retries;
    row.lastSeen = now();
    this.state.routes[key] = row;

    const pattern = this.state.patterns[patternKey] || {
      patternKey, taskType, route, occurrences: 0, successes: 0, failures: 0,
      recurrenceCount: 0, recallCount: 0, baseWeight: input.source === 'user_feedback' ? 1 : 0.7,
      weight: 0.7, status: 'candidate', firstSeen: null, lastSeen: null,
    };
    pattern.occurrences += 1;
    pattern.recurrenceCount = Math.max(0, pattern.occurrences - 1);
    pattern.successes += success ? 1 : 0;
    pattern.failures += success ? 0 : 1;
    pattern.lastSeen = now();
    if (!pattern.firstSeen) pattern.firstSeen = pattern.lastSeen;
    pattern.weight = clamp(pattern.baseWeight + Math.min(0.3, pattern.recurrenceCount * 0.1) + (success ? 0.05 : -0.05));
    pattern.status = pattern.successes >= 2 && pattern.weight >= 0.7 ? 'tested' : 'candidate';
    this.state.patterns[patternKey] = pattern;

    const episode = {
      id: `episode-${Date.now()}-${hash(`${taskType}:${routeId}:${Math.random()}`)}`,
      taskType, route, patternKey, success, durationMs, retries,
      lesson: String(input.lesson || '').slice(0, 2000),
      evidence: String(input.evidence || '').slice(0, 2000),
      selectedImprovementId: input.selectedImprovementId || null,
      createdAt: now(),
    };
    this.state.episodes.push(episode);
    this.state.episodes = this.state.episodes.slice(-500);
    this.state.stats.episodes += 1;
    this.state.stats.successes += success ? 1 : 0;
    this.state.stats.failures += success ? 0 : 1;
    if (episode.selectedImprovementId) this._recordImprovementExecution(episode.selectedImprovementId, success);
    this.save();
    return { episode, route: this.routeSummary(taskType), pattern: this.state.patterns[patternKey] };
  }

  routeSummary(taskType) {
    const rows = Object.values(this.state.routes)
      .filter(row => !taskType || row.taskType === slug(taskType))
      .map(row => ({
        ...row,
        successRate: row.attempts ? row.successes / row.attempts : 0,
        averageDurationMs: row.attempts ? row.totalDurationMs / row.attempts : 0,
        averageRetries: row.attempts ? row.totalRetries / row.attempts : 0,
      }))
      .sort((a, b) => (b.successRate - a.successRate) || (a.averageRetries - b.averageRetries));
    return rows;
  }

  _recordImprovementExecution(id, success) {
    const proposal = this.state.improvements.find(item => item.id === id);
    if (!proposal) return;
    proposal.executions = Number(proposal.executions || 0) + 1;
    proposal.successfulExecutions = Number(proposal.successfulExecutions || 0) + (success ? 1 : 0);
    proposal.recurrenceCount = Math.max(0, proposal.executions - 1);
    proposal.lastExecutionAt = now();
    if (proposal.successfulExecutions >= 3) proposal.eliteEligible = true;
  }

  /** Choose a memory action without loading the whole memory into context. */
  routeMemory(input = {}) {
    const query = String(input.query || '').trim();
    const hasHistory = Boolean(input.hasHistory);
    const evidenceGap = Boolean(input.evidenceGap);
    const ambiguity = clamp(input.ambiguity);
    const failureSignal = Boolean(input.failureSignal);
    let action = 'answer';
    if (!query) action = 'ask';
    else if (evidenceGap) action = 'verify';
    else if (failureSignal) action = 'reflect';
    else if (hasHistory || ambiguity >= 0.45) action = 'retrieve';
    const decision = {
      id: `memory-${Date.now()}-${hash(`${query}:${action}:${Math.random()}`)}`,
      action,
      query,
      reason: { hasHistory, evidenceGap, ambiguity, failureSignal },
      outcome: null,
      createdAt: now(),
    };
    this.state.memoryDecisions.push(decision);
    this.state.memoryDecisions = this.state.memoryDecisions.slice(-500);
    this.state.stats.memoryDecisions += 1;
    this.save();
    return decision;
  }

  recordMemoryOutcome(id, input = {}) {
    const decision = this.state.memoryDecisions.find(item => item.id === id);
    if (!decision) throw new Error(`memory decision not found: ${id}`);
    decision.outcome = {
      success: Boolean(input.success),
      useful: Boolean(input.useful),
      correction: String(input.correction || '').slice(0, 1000),
      measuredAt: now(),
    };
    this.save();
    return decision;
  }

  /** Create a proposal only; no code/config mutation happens here. */
  proposeImprovement(input = {}) {
    const title = String(input.title || 'untitled improvement').slice(0, 200);
    const proposal = {
      id: `improvement-${Date.now()}-${hash(`${title}:${Math.random()}`)}`,
      title,
      kind: String(input.kind || 'strategy'),
      baseline: String(input.baseline || '').slice(0, 2000),
      change: String(input.change || '').slice(0, 4000),
      testPlan: String(input.testPlan || '').slice(0, 4000),
      status: 'candidate',
      scores: null,
      generation: Math.max(1, Number(input.generation) || 1),
      parentId: input.parentId || null,
      populationId: input.populationId || `population-${Date.now()}`,
      executions: 0,
      successfulExecutions: 0,
      recurrenceCount: 0,
      eliteEligible: false,
      createdAt: now(),
    };
    this.state.improvements.push(proposal);
    this.save();
    return proposal;
  }

  evaluateImprovement(id, input = {}) {
    const proposal = this.state.improvements.find(item => item.id === id);
    if (!proposal) throw new Error(`improvement not found: ${id}`);
    const scores = {
      feasibility: clamp(input.feasibility),
      impact: clamp(input.impact),
      safety: clamp(input.safety),
      repeatability: clamp(input.repeatability),
      rollback: clamp(input.rollback),
    };
    const score = scores.feasibility * 0.25 + scores.impact * 0.25
      + scores.safety * 0.2 + scores.repeatability * 0.2 + scores.rollback * 0.1;
    proposal.scores = { ...scores, overall: score };
    proposal.status = score >= 0.7 && scores.safety >= 0.7 && scores.rollback >= 0.6
      ? 'tested' : 'rejected';
    proposal.testCount = Number(proposal.testCount || 0) + 1;
    proposal.evaluatedAt = now();
    proposal.evaluationNote = String(input.note || '').slice(0, 2000);
    this.save();
    return proposal;
  }

  promoteImprovement(id, confirmation = false) {
    const proposal = this.state.improvements.find(item => item.id === id);
    if (!proposal) throw new Error(`improvement not found: ${id}`);
    if (proposal.status !== 'tested') throw new Error('only tested improvements can be promoted');
    if (confirmation !== true) throw new Error('promotion requires explicit confirmation=true');
    proposal.status = 'promoted';
    proposal.promotedAt = now();
    const gene = {
      geneId: `gene-${hash(proposal.id)}`,
      sourceImprovementId: proposal.id,
      title: proposal.title,
      kind: proposal.kind,
      fitness: proposal.scores?.overall || 0,
      generation: proposal.generation,
      createdAt: now(),
    };
    if (!this.state.genes.some(item => item.geneId === gene.geneId)) this.state.genes.push(gene);
    if (proposal.eliteEligible && !this.state.elitePatterns.some(item => item.sourceImprovementId === proposal.id)) {
      this.state.elitePatterns.push({ ...gene, elite: true, promotedAt: now() });
    }
    this.save();
    return proposal;
  }

  decay(asOf = new Date()) {
    const current = asOf instanceof Date ? asOf.getTime() : new Date(asOf).getTime();
    for (const pattern of Object.values(this.state.patterns)) {
      const last = new Date(pattern.lastSeen || pattern.firstSeen || 0).getTime();
      const days = Math.max(0, (current - last) / 86400000);
      const decay = Math.max(0.1, 1 - days / 90);
      pattern.weight = clamp((pattern.baseWeight + Math.min(0.3, pattern.recurrenceCount * 0.1)) * decay);
      if (pattern.weight < 0.2) pattern.status = 'archived';
      else if (pattern.weight < 0.5) pattern.status = 'decaying';
    }
    this.save();
    return Object.values(this.state.patterns);
  }

  status() {
    return {
      version: this.state.version,
      stats: this.state.stats,
      routeCount: Object.keys(this.state.routes).length,
      patternCount: Object.keys(this.state.patterns).length,
      geneCount: this.state.genes.length,
      eliteCount: this.state.elitePatterns.length,
      improvementCounts: this.state.improvements.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {}),
      topRoutes: this.routeSummary().slice(0, 10),
      stateFile: this.stateFile,
    };
  }
}

function parseJson(value, name) {
  try { return JSON.parse(value || '{}'); } catch (error) { throw new Error(`${name} JSON 无效: ${error.message}`); }
}

async function main() {
  const [command, payload, extra] = process.argv.slice(2);
  const loop = new GrowthLoop();
  let result;
  if (command === 'episode') result = loop.recordEpisode(parseJson(payload, 'episode'));
  else if (command === 'memory') result = loop.routeMemory(parseJson(payload, 'memory'));
  else if (command === 'memory-outcome') result = loop.recordMemoryOutcome(payload, parseJson(extra, 'memory-outcome'));
  else if (command === 'decay') result = loop.decay();
  else if (command === 'propose') result = loop.proposeImprovement(parseJson(payload, 'propose'));
  else if (command === 'evaluate') result = loop.evaluateImprovement(payload, parseJson(extra, 'evaluate'));
  else if (command === 'promote') result = loop.promoteImprovement(payload, extra === 'true');
  else if (command === 'routes') result = loop.routeSummary(payload);
  else if (command === 'status') result = loop.status();
  else throw new Error('用法: episode <json> | memory <json> | propose <json> | evaluate <id> <json> | promote <id> true | routes [taskType] | status');
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main().catch(error => { console.error(`❌ growth-loop: ${error.message}`); process.exit(1); });

module.exports = { GrowthLoop, STATE_FILE };
