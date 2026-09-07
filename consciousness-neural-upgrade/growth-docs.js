#!/usr/bin/env node
/**
 * growth-docs.js — 456 业务层的 Tolaria Markdown 适配器
 *
 * 将 growth-loop 的路线、记忆路由和候选改进写入独立 raw/growth/ 目录，
 * 供 aing 现有 compile/import/metabolism 链路处理。
 * 不修改 DoerOne 核心，不写 knowledge.db，不执行候选改动。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { GrowthLoop } = require('./growth-loop');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_RAW_DIR = path.join(ROOT, 'raw', 'growth');

const TYPE_TAGS = {
  episode: ['growth', 'episode', 'route', 'lesson'],
  route: ['growth', 'route', 'strategy', 'verified'],
  memory: ['growth', 'memory', 'strategy'],
  assessment: ['growth', 'kespi', 'assessment'],
  improvement: ['growth', 'candidate', 'strategy', 'skill'],
};

function iso() { return new Date().toISOString(); }
function safe(value, max = 4000) { return String(value == null ? '' : value).replace(/\r/g, '').slice(0, max); }
function slug(value) {
  return String(value || 'unknown').trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'unknown';
}
function id(value) { return crypto.createHash('sha1').update(`${value}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 12); }
function yamlString(value) { return JSON.stringify(String(value == null ? '' : value)); }
function yamlArray(values) { return `[${values.map(v => yamlString(v)).join(', ')}]`; }

class GrowthDocs {
  constructor(options = {}) {
    this.rawDir = options.rawDir || DEFAULT_RAW_DIR;
    this.loop = options.loop || new GrowthLoop(options.stateFile);
  }

  writeDocument(kind, metadata, body) {
    const timestamp = iso();
    const docId = metadata.id || `${kind}-${Date.now()}-${id(kind)}`;
    const tags = [...new Set([...(TYPE_TAGS[kind] || ['growth']), ...(metadata.tags || [])])];
    const frontmatter = [
      '---',
      `name: ${yamlString(metadata.name || docId)}`,
      `type: ${metadata.type || 'GrowthLearning'}`,
      `id: ${docId}`,
      `created: ${yamlString(metadata.created || timestamp)}`,
      `modified: ${yamlString(timestamp)}`,
      `tags: ${yamlArray(tags)}`,
      `status: ${metadata.status || 'candidate'}`,
      `confidence: ${Number.isFinite(Number(metadata.confidence)) ? Number(metadata.confidence) : 0.7}`,
      `source: ${yamlString(metadata.source || 'growth-loop')}`,
      `origin: ${yamlString(metadata.origin || 'derived')}`,
      ...(metadata.originRef ? [`origin_ref: ${yamlString(metadata.originRef)}`] : []),
      '---',
      '',
      safe(body, 12000).trim(),
      '',
    ].join('\n');
    const filename = `${slug(docId)}.md`;
    const output = path.join(this.rawDir, filename);
    fs.mkdirSync(this.rawDir, { recursive: true });
    const tmp = `${output}.tmp`;
    fs.writeFileSync(tmp, frontmatter, 'utf8');
    fs.renameSync(tmp, output);
    return { id: docId, path: output, type: metadata.type || 'GrowthLearning', status: metadata.status || 'candidate', tags };
  }

  recordEpisode(input = {}) {
    const result = this.loop.recordEpisode(input);
    const episode = result.episode;
    const route = episode.route.length ? episode.route.join(' → ') : '未记录';
    return this.writeDocument('episode', {
      id: episode.id,
      name: `任务经历·${episode.taskType}`,
      type: 'Episode',
      status: episode.success ? 'verified' : 'candidate',
      confidence: episode.success ? 0.85 : 0.55,
      tags: episode.success ? ['success'] : ['failure'],
      source: input.source || 'growth-loop.recordEpisode',
      origin: input.origin || 'derived',
      originRef: input.originRef,
    }, `# 任务经历\n\n## 任务类型\n${episode.taskType}\n\n## 执行路线\n${route}\n\n## 结果\n${episode.success ? '成功' : '失败'}\n\n## 性能\n- 耗时：${episode.durationMs} ms\n- 重试：${episode.retries}\n\n## 教训\n${safe(episode.lesson) || '待补充'}\n\n## 证据\n${safe(episode.evidence) || '待补充'}\n\n## 数据链状态\n- 记录层：episode\n- 后续动作：由 aing 代谢链编译、建链、评估\n`);
  }

  writeRouteSummary(taskType, lineage = {}) {
    const routes = this.loop.routeSummary(taskType);
    const body = routes.length === 0 ? '暂无路线统计。' : routes.map((r, i) => [
      `## 路线 ${i + 1}`,
      `- 任务类型：${r.taskType}`,
      `- 路线：${r.route.join(' → ') || '未记录'}`,
      `- 尝试：${r.attempts}`,
      `- 成功率：${(r.successRate * 100).toFixed(1)}%`,
      `- 平均耗时：${Math.round(r.averageDurationMs)} ms`,
      `- 平均重试：${r.averageRetries.toFixed(2)}`,
    ].join('\n')).join('\n\n');
    return this.writeDocument('route', {
      name: `路线统计·${taskType || '全部任务'}`,
      type: 'RouteKnowledge',
      status: routes.length ? 'verified' : 'candidate',
      confidence: routes.length ? 0.8 : 0.3,
      source: 'growth-loop.routeSummary',
      origin: 'derived',
      originRef: lineage.originRef || lineage.lineageId || taskType,
    }, `# 路线学习\n\n- lineage_id: ${lineage.lineageId || 'aggregate'}\n- cycle_id: ${lineage.cycleId || 'unknown'}\n\n${body}\n\n## 晋升条件\n路线需有可重复的成功证据，才可作为策略建议使用。\n`);
  }

  writeMemoryDecision(input = {}) {
    const decision = this.loop.routeMemory(input);
    return this.writeDocument('memory', {
      id: decision.id,
      name: `记忆路由·${decision.action}`,
      type: 'MemoryRouting',
      status: 'verified',
      confidence: 0.75,
      tags: [decision.action],
      source: input.source || 'growth-loop.routeMemory',
      origin: input.origin || 'derived',
      originRef: input.originRef,
    }, `# 记忆路由决策\n\n## 查询\n${safe(decision.query)}\n\n## 动作\n\`${decision.action}\`\n\n## 判断依据\n- 有历史：${decision.reason.hasHistory}\n- 证据缺口：${decision.reason.evidenceGap}\n- 歧义度：${decision.reason.ambiguity}\n- 失败信号：${decision.reason.failureSignal}\n\n## 业务边界\n此文档只提供记忆业务层建议，不直接执行工具调用或修改核心运行时。\n`);
  }

  recordMemoryOutcome(id, input = {}) {
    return this.loop.recordMemoryOutcome(id, input);
  }

  decay() {
    return this.loop.decay();
  }

  writeKespiAssessment(input = {}) {
    const dimensions = input.dimensions || {};
    const dimensionLines = Object.entries(dimensions).map(([key, value]) => `- ${key}：${Number(value).toFixed(2)}`).join('\n') || '暂无八维明细。';
    return this.writeDocument('assessment', {
      id: input.id,
      name: input.name || `八维评估·${input.lineageId || 'aing'}`,
      type: 'KespiAssessment',
      status: input.status || 'verified',
      confidence: input.confidence == null ? 0.8 : input.confidence,
      tags: ['kespi', 'eight-dimensions', ...(input.tags || [])],
      source: input.source || 'aing.kespi_history',
      origin: input.origin || 'observed',
      originRef: input.originRef || input.lineageId,
    }, `# KESPI 八维评估\n\n## 综合分\n${Number(input.overall || 0).toFixed(2)}\n\n## 八维明细\n${dimensionLines}\n\n## 变化\n${input.delta == null ? '暂无前后对比' : Number(input.delta).toFixed(2)}\n\n## 数据链\n- lineage_id: ${input.lineageId || 'unknown'}\n- cycle_id: ${input.cycleId || 'unknown'}\n- 角色：aing 处理后的观察评估，供 456 路线/记忆/候选改进使用\n`);
  }

  proposeImprovement(input = {}) {
    const proposal = this.loop.proposeImprovement(input);
    return this.writeDocument('improvement', {
      id: proposal.id,
      name: `候选改进·${proposal.title}`,
      type: 'ImprovementCandidate',
      status: 'candidate',
      confidence: 0.5,
      tags: [proposal.kind],
      source: input.source || 'growth-loop.proposeImprovement',
      origin: input.origin || 'proposal',
      originRef: input.originRef,
    }, `# 候选改进\n\n## 标题\n${safe(proposal.title)}\n\n## 基线\n${safe(proposal.baseline) || '待填写'}\n\n## 改动设想\n${safe(proposal.change) || '待填写'}\n\n## 测试计划\n${safe(proposal.testPlan) || '待填写'}\n\n## 状态\ncandidate\n\n## 晋升门槛\n先评估，再由显式确认决定是否晋升；本业务层不自动修改核心代码。\n`);
  }
}

async function main() {
  const [command, payload, extra] = process.argv.slice(2);
  const docs = new GrowthDocs();
  let result;
  if (command === 'episode') result = docs.recordEpisode(JSON.parse(payload || '{}'));
  else if (command === 'memory') result = docs.writeMemoryDecision(JSON.parse(payload || '{}'));
  else if (command === 'memory-outcome') result = docs.recordMemoryOutcome(payload, JSON.parse(extra || '{}'));
  else if (command === 'decay') result = docs.decay();
  else if (command === 'route') result = docs.writeRouteSummary(payload);
  else if (command === 'propose') result = docs.proposeImprovement(JSON.parse(payload || '{}'));
  else throw new Error('用法: episode <json> | memory <json> | route [taskType] | propose <json>');
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main().catch(error => { console.error(`❌ growth-docs: ${error.message}`); process.exit(1); });

module.exports = { GrowthDocs, DEFAULT_RAW_DIR };
