#!/usr/bin/env node
/**
 * interchange-router.js — aing 立交链路只读路由器
 *
 * 只负责读取实体/链接、按车道策略分类、生成路径、冲突和抑制报告。
 * 不写 knowledge.db，不更新实体状态，不执行命令，不自动晋升候选。
 */

const fs = require('fs');
const path = require('path');

const LANES = ['structure', 'evidence', 'semantic', 'growth', 'feedback'];
const ROUTABLE_STATUSES = new Set(['observed', 'derived', 'proposed', 'candidate', 'tested', 'review-approved', 'active']);
const BLOCKED_STATUSES = new Set(['rejected', 'superseded']);

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function loadPolicy(policyPath) {
  const resolved = policyPath || path.join(__dirname, '..', 'config', 'interchange-routing.json');
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !parsed.relations || !parsed.safety) {
    throw new Error(`invalid interchange policy: ${resolved}`);
  }
  return parsed;
}

class InterchangeRouter {
  constructor(options = {}) {
    this.store = options.store || null;
    this.policy = options.policy || loadPolicy(options.policyPath);
    this.clock = options.clock || (() => Date.now());
    this._validatePolicy();
  }

  _validatePolicy() {
    if (!LANES.includes(this.policy.defaultLane)) {
      throw new Error(`invalid default lane: ${this.policy.defaultLane}`);
    }
    for (const [relation, config] of Object.entries(this.policy.relations)) {
      if (!LANES.includes(config.lane)) throw new Error(`invalid lane for relation ${relation}`);
      if (Number(config.minConfidence) < 0 || Number(config.minConfidence) > 1) {
        throw new Error(`invalid minConfidence for relation ${relation}`);
      }
      if (config.maxDegree !== null && config.maxDegree !== undefined && Number(config.maxDegree) < 1) {
        throw new Error(`invalid maxDegree for relation ${relation}`);
      }
    }
  }

  _readGraph(input = {}) {
    if (Array.isArray(input.entities) && Array.isArray(input.links)) {
      return { entities: input.entities, links: input.links };
    }
    if (!this.store) throw new Error('InterchangeRouter requires store or in-memory entities/links');
    return {
      entities: this.store.all('SELECT id, name, type, status, confidence, updated_at FROM entities'),
      links: this.store.all('SELECT source_id AS source, target_id AS target, relation, confidence, created_at FROM links'),
    };
  }

  route(input = {}) {
    const startedAt = this.clock();
    const graph = this._readGraph(input);
    const entityMap = new Map(graph.entities.map(entity => [String(entity.id), entity]));
    const seedIds = (input.seedIds || []).map(String).filter(Boolean);
    const requestedLanes = Array.isArray(input.lanes) && input.lanes.length
      ? new Set(input.lanes.filter(lane => LANES.includes(lane)))
      : new Set(LANES);
    const minConfidence = clamp(input.minConfidence === undefined ? 0 : input.minConfidence);
    const maxDepth = Math.max(1, Math.min(Number(input.maxDepth) || 3, 12));
    const maxPaths = Math.max(1, Math.min(Number(input.maxPaths) || 20, 200));
    const purpose = String(input.purpose || 'retrieve');
    const lanes = Object.fromEntries(LANES.map(lane => [lane, []]));
    const suppressed = [];
    const invalid = [];

    for (const rawEdge of graph.links) {
      const edge = {
        source: String(rawEdge.source ?? rawEdge.source_id ?? ''),
        target: String(rawEdge.target ?? rawEdge.target_id ?? ''),
        relation: String(rawEdge.relation || ''),
        confidence: clamp(rawEdge.confidence),
        created_at: rawEdge.created_at || null,
      };
      if (!edge.source || !edge.target || !entityMap.has(edge.source) || !entityMap.has(edge.target)) {
        invalid.push({ ...edge, reason: 'missing-source-or-target' });
        continue;
      }
      const relationPolicy = this.policy.relations[edge.relation];
      if (!relationPolicy) {
        suppressed.push({ ...edge, reason: 'unknown-relation' });
        continue;
      }
      if (!requestedLanes.has(relationPolicy.lane)) {
        suppressed.push({ ...edge, reason: 'lane-not-requested' });
        continue;
      }
      if (edge.confidence < Math.max(minConfidence, Number(relationPolicy.minConfidence) || 0)) {
        suppressed.push({ ...edge, reason: 'below-confidence' });
        continue;
      }
      const sourceStatus = String(entityMap.get(edge.source).status || 'observed');
      const targetStatus = String(entityMap.get(edge.target).status || 'observed');
      if (BLOCKED_STATUSES.has(sourceStatus) || BLOCKED_STATUSES.has(targetStatus)) {
        suppressed.push({ ...edge, reason: 'blocked-status', sourceStatus, targetStatus });
        continue;
      }
      if (!ROUTABLE_STATUSES.has(sourceStatus) || !ROUTABLE_STATUSES.has(targetStatus)) {
        suppressed.push({ ...edge, reason: 'unknown-status', sourceStatus, targetStatus });
        continue;
      }
      lanes[relationPolicy.lane].push({
        ...edge,
        lane: relationPolicy.lane,
        requiresApproval: Boolean(relationPolicy.requiresApproval),
        sourceStatus,
        targetStatus,
      });
    }

    for (const lane of LANES) this._applyDegreeLimit(lane, lanes[lane], suppressed);
    const acceptedEdges = LANES.flatMap(lane => lanes[lane]);
    const conflicts = this._detectConflicts(lanes.evidence);
    const paths = this._buildPaths(seedIds, acceptedEdges, maxDepth, maxPaths, purpose);

    return {
      seedIds,
      purpose,
      paths,
      lanes,
      conflicts,
      suppressed: [...suppressed, ...invalid],
      metrics: {
        scannedEdges: graph.links.length,
        acceptedEdges: acceptedEdges.length,
        suppressedEdges: suppressed.length,
        invalidEdges: invalid.length,
        conflictCount: conflicts.length,
        durationMs: Math.max(0, this.clock() - startedAt),
      },
      safety: {
        allowAutoPromote: false,
        allowHighRiskExecution: false,
        candidateMayRouteToActive: false,
      },
    };
  }

  _applyDegreeLimit(lane, edges, suppressed) {
    const groups = new Map();
    for (const edge of edges) {
      const config = this.policy.relations[edge.relation];
      if (!config || config.maxDegree === null || config.maxDegree === undefined) continue;
      for (const id of [edge.source, edge.target]) {
        if (!groups.has(id)) groups.set(id, { limit: Number(config.maxDegree), edges: [] });
        groups.get(id).edges.push(edge);
        groups.get(id).limit = Math.min(groups.get(id).limit, Number(config.maxDegree));
      }
    }
    const removed = new Set();
    for (const [id, group] of groups) {
      if (group.edges.length <= group.limit) continue;
      const keep = [...group.edges].sort((a, b) => b.confidence - a.confidence).slice(0, group.limit);
      const keepSet = new Set(keep);
      for (const edge of group.edges) {
        if (!keepSet.has(edge)) removed.add(edge);
      }
    }
    if (removed.size) {
      for (const edge of removed) suppressed.push({ ...edge, reason: `${lane}-max-degree` });
      for (let index = edges.length - 1; index >= 0; index--) {
        if (removed.has(edges[index])) edges.splice(index, 1);
      }
    }
  }

  _detectConflicts(evidenceEdges) {
    const supports = evidenceEdges.filter(edge => edge.relation === 'supports');
    const contradicts = evidenceEdges.filter(edge => edge.relation === 'contradicts');
    const conflicts = [];
    for (const contradiction of contradicts) {
      const relatedSupports = supports.filter(edge => edge.target === contradiction.target);
      if (relatedSupports.length) {
        conflicts.push({
          target: contradiction.target,
          status: 'verify-required',
          evidence: [...relatedSupports, contradiction],
        });
      }
    }
    return conflicts;
  }

  _buildPaths(seedIds, edges, maxDepth, maxPaths, purpose) {
    if (!seedIds.length) return [];
    const outgoing = new Map();
    for (const edge of edges) {
      if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
      outgoing.get(edge.source).push(edge);
    }
    const paths = [];
    const visit = (node, nodes, pathEdges, visited) => {
      if (paths.length >= maxPaths || pathEdges.length >= maxDepth) return;
      const nextEdges = outgoing.get(node) || [];
      for (const edge of nextEdges) {
        if (visited.has(edge.target)) continue;
        const nextNodes = [...nodes, edge.target];
        const nextEdgesPath = [...pathEdges, edge];
        const requiresApproval = nextEdgesPath.some(item => item.requiresApproval);
        const status = this._pathStatus(nextEdgesPath, purpose);
        paths.push({
          nodes: nextNodes,
          edges: nextEdgesPath,
          confidence: nextEdgesPath.reduce((score, item) => score * item.confidence, 1),
          status,
          requiresApproval,
        });
        visit(edge.target, nextNodes, nextEdgesPath, new Set([...visited, edge.target]));
        if (paths.length >= maxPaths) return;
      }
    };
    for (const seed of seedIds) visit(seed, [seed], [], new Set([seed]));
    return paths.sort((a, b) => b.confidence - a.confidence).slice(0, maxPaths);
  }

  _pathStatus(edges, purpose) {
    if (edges.some(edge => edge.relation === 'contradicts')) return 'verify-required';
    if (edges.some(edge => edge.requiresApproval)) return 'approval-required';
    if (purpose === 'growth' || edges.some(edge => edge.lane === 'growth')) return 'candidate';
    if (edges.some(edge => edge.lane === 'feedback')) return 'tested';
    if (edges.some(edge => edge.lane === 'evidence')) return 'derived';
    return 'observed';
  }
}

module.exports = { InterchangeRouter, loadPolicy, LANES };

if (require.main === module) {
  console.error('InterchangeRouter is a read-only library. Use it from a caller with a store or in-memory graph.');
  process.exitCode = 1;
}
