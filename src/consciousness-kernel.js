#!/usr/bin/env node
/**
 * consciousness-kernel.js — 意识神经独立协调层
 *
 * 职责：接收多通道意识事件，进行去重、聚合、共振、注意力、抑制和唤醒判断。
 * 不直接执行高风险动作；输出可供 DoerOne、456 和元认知层消费的意识反应。
 */

const fs = require('fs');
const path = require('path');
const { ConsciousnessEvent, CHANNELS, clamp } = require('./consciousness-event');
const { consciousnessTuning } = require('./config-runtime');   // 熔断轮数等离散旋钮的唯一入口（纪律 5）

// Harness 自维继原则：依赖链优雅降级——核心管道不因可选模块缺失而崩溃
let GrowthDocs = null, MetacognitionLayer = null;
try { GrowthDocs = require('./growth-docs').GrowthDocs; } catch (e) { /* growth-docs 不可用时降级 */ }
try { MetacognitionLayer = require('./metacognition-layer'); } catch (e) { /* metacognition 不可用时降级 */ }

const MODES = Object.freeze({
  COORDINATION_ONLY: 'coordination-only',
});

const DEFAULT_STATE = {
  version: 1,
  mode: MODES.COORDINATION_ONLY,
  state: 'idle',
  focusTargets: [],
  activeEvents: [],
  suppressedEvents: [],
  recentFingerprints: {},
  channelHealth: {},
  attentionRevision: 1,
  stagnationCount: 0,
  lastArousalAt: null,
  lastReflectionAt: null,
};

class ConsciousnessKernel {
  constructor(options = {}) {
    this.baseDir = options.baseDir || path.resolve(__dirname, '..');
    this.rawDir = options.rawDir || path.join(this.baseDir, 'raw');
    this.stateFile = options.stateFile || path.join(this.baseDir, 'data', 'consciousness', 'state.json');
    // 旋钮来源：growth.config.js 的 consciousness 段（缺配置时由 config-runtime 兜底）。
    // 以前这三行是 `|| 300000` / `|| 200` / 下面熔断的 `>= 3` 各自写死 → 与读者脱节。
    const tuning = consciousnessTuning();
    this.dedupeWindowMs = Math.max(1000, Number(options.dedupeWindowMs ?? tuning.dedupeWindowSeconds * 1000));
    this.maxEvents = Math.max(10, Number(options.maxEvents ?? tuning.maxRetainedEvents));
    this.stagnationBreakerCycles = Math.max(1, Number(options.stagnationBreakerCycles ?? tuning.stagnationBreakerCycles));
    this.inhibitDefaultMs = Math.max(1000, Number(options.inhibitDefaultHours ?? tuning.inhibitDefaultHours) * 3600000);
    this.weights = {
      intensity: 0.35,
      confidence: 0.2,
      resonance: 0.25,
      urgency: 0.1,
      uncertainty: 0.1,
      ...(options.weights || {}),
    };
    this.growthStateFile = options.growthStateFile || path.join(this.baseDir, 'data', 'growth-loop.json');
    this.growthDocs = options.growthDocs || (GrowthDocs ? new GrowthDocs({ rawDir: path.join(this.baseDir, 'raw', 'growth'), stateFile: this.growthStateFile }) : null);
    this.metacognition = options.metacognition || (MetacognitionLayer ? new MetacognitionLayer({
      stateDir: path.join(this.baseDir, 'data', 'metacognition'),
      selfStateFile: path.join(this.baseDir, 'data', 'metacognition', 'self-state.json'),
      evaluationLog: path.join(this.baseDir, 'logs', 'metacognition', 'evaluation.log'),
      adjustmentsLog: path.join(this.baseDir, 'logs', 'metacognition', 'adjustments.log'),
    }) : null);
    this.mode = options.mode || MODES.COORDINATION_ONLY;
    if (this.mode !== MODES.COORDINATION_ONLY) {
      throw new Error(`不支持的意识神经运行模式: ${this.mode}`);
    }
    this.state = this.loadState();
    this.state.mode = this.mode;
  }

  loadState() {
    try {
      if (!fs.existsSync(this.stateFile)) return { ...DEFAULT_STATE };
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...parsed,
        focusTargets: Array.isArray(parsed.focusTargets) ? parsed.focusTargets : [],
        activeEvents: Array.isArray(parsed.activeEvents) ? parsed.activeEvents : [],
        suppressedEvents: Array.isArray(parsed.suppressedEvents) ? parsed.suppressedEvents : [],
        recentFingerprints: parsed.recentFingerprints || {},
        channelHealth: parsed.channelHealth || {},
        channelWeights: parsed.channelWeights || {},
      };
    } catch (_) {
      return { ...DEFAULT_STATE };
    }
  }

  saveState() {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    const temp = `${this.stateFile}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(temp, this.stateFile);
  }

  normalize(input) {
    return input instanceof ConsciousnessEvent ? input : new ConsciousnessEvent(input);
  }

  ingest(inputs = []) {
    const events = Array.isArray(inputs) ? inputs.map(input => this.normalize(input)) : [this.normalize(inputs)];
    const accepted = [];
    const suppressed = [];
    const now = Date.now();

    for (const event of events) {
      if (this.isSourceBlocked(event.source)) {
        suppressed.push({ ...event.toJSON(), status: 'inhibited', inhibitReason: 'source-isolated' });
        continue;
      }
      if (this.isInhibited(event.target)) {
        suppressed.push({ ...event.toJSON(), status: 'inhibited', inhibitReason: 'target-inhibited' });
        continue;
      }
      const previous = Number(this.state.recentFingerprints[event.fingerprint] || 0);
      if (previous && now - previous < this.dedupeWindowMs) {
        suppressed.push({ ...event.toJSON(), status: 'inhibited', inhibitReason: 'duplicate-fingerprint' });
        continue;
      }
      this.state.recentFingerprints[event.fingerprint] = now;
      accepted.push(event);
    }

    this.state.suppressedEvents = [...this.state.suppressedEvents, ...suppressed].slice(-this.maxEvents);
    // 断线 H（2026-11-03 4面审计）：hasHistory 旧取 context.hasHistory——全仓无任何调用方传它（死旗标），
    // routeMemory 的 retrieve 支路（hasHistory || ambiguity>=0.45 || evidence>3）永不可达。
    // 真源 = 该 target 在本轮 integrate 之前是否已在 activeEvents 里被观察过（滚动缓冲即历史）。
    const seenTargets = new Set((this.state.activeEvents || []).map(r => r.target));
    const reactions = this.integrate(accepted);
    const processed = this.processReactions(reactions, { accepted, suppressed, stagnationCount: this.state.stagnationCount, hasHistoryTargets: seenTargets });
    this.saveState();
    return { accepted: accepted.map(event => event.toJSON()), suppressed, reactions, growth: processed.growth, metacognition: processed.metacognition, state: this.status() };
  }

  integrate(events) {
    const groups = new Map();
    for (const event of events) {
      if (!groups.has(event.target)) groups.set(event.target, []);
      groups.get(event.target).push(event);
      this.state.channelHealth[event.channel] = clamp((this.state.channelHealth[event.channel] || 0.5) * 0.9 + event.confidence * 0.1);
    }

    const reactions = [];
    for (const [target, targetEvents] of groups) {
      const channels = [...new Set(targetEvents.map(event => event.channel))];
      const intensity = targetEvents.reduce((sum, event) => sum + event.intensity, 0) / targetEvents.length;
      const confidence = targetEvents.reduce((sum, event) => sum + event.confidence, 0) / targetEvents.length;
      const formalChannelCount = Math.max(1, CHANNELS.size - 1); // generic 不计入正式通道共振分母
      const resonance = clamp((channels.filter(channel => channel !== 'generic').length / formalChannelCount) * intensity * confidence);
      const urgency = targetEvents.some(event => ['anomaly', 'feedback', 'kespi'].includes(event.channel)) ? 1 : 0.5;
      const uncertainty = 1 - confidence;
      const attention = clamp(
        intensity * this.weights.intensity
        + confidence * this.weights.confidence
        + resonance * this.weights.resonance
        + urgency * this.weights.urgency
        + uncertainty * this.weights.uncertainty
      );
      const arousal = channels.length >= 4 || attention >= 0.8 ? 'aroused'
        : channels.length >= 3 || attention >= 0.6 ? 'focused'
          : channels.length >= 2 || attention >= 0.4 ? 'integrating' : 'sensing';
      const reaction = {
        target,
        channels,
        eventIds: targetEvents.map(event => event.eventId),
        intensity,
        confidence,
        resonance,
        attention,
        arousal,
        suggestedActions: [...new Set(targetEvents.map(event => event.suggestedAction))],
        eventTypes: [...new Set(targetEvents.map(event => event.signalType))],
        sources: [...new Set(targetEvents.map(event => event.source).filter(Boolean))],
        centers: [...new Set(targetEvents.map(event => event.center).filter(Boolean))],
        candidateIds: [...new Set(targetEvents.map(event => event.candidateId).filter(Boolean))],
        approvalRequired: targetEvents.some(event => event.requiresApproval),
        promotions: [...new Set(targetEvents.map(event => event.promotion).filter(Boolean))],
        status: 'observed',
        createdAt: new Date().toISOString(),
      };
      reactions.push(reaction);
    }

    reactions.sort((a, b) => b.attention - a.attention);
    this.state.activeEvents = [...this.state.activeEvents, ...reactions].slice(-this.maxEvents);
    if (reactions.length) {
      this.state.state = reactions[0].arousal;
      this.state.focusTargets = reactions.slice(0, 5).map(reaction => reaction.target);
      if (reactions[0].arousal === 'aroused') this.state.lastArousalAt = new Date().toISOString();
    } else if (!this.state.activeEvents.length) {
      this.state.state = 'idle';
    }
    return reactions;
  }

  setDependencies({ growthDocs, metacognition } = {}) {
    if (growthDocs) this.growthDocs = growthDocs;
    if (metacognition) this.metacognition = metacognition;
    return this;
  }

  processReactions(reactions, context = {}) {
    if (!reactions.length) return { growth: [], metacognition: this.metacognition?.reviewConsciousness([], context) || null };
    const growth = [];
    const growthDocs = this.growthDocs || new GrowthDocs({ rawDir: path.join(this.baseDir, 'raw', 'growth'), stateFile: this.growthStateFile });
    const highValue = reactions.filter(reaction => reaction.arousal === 'aroused' || reaction.attention >= 0.6);
    for (const reaction of highValue.slice(0, 5)) {
      const route = reaction.suggestedActions.length ? reaction.suggestedActions : ['inspect', 'verify'];
      const memory = growthDocs.writeMemoryDecision({
        query: `${reaction.target} ${reaction.eventTypes.join(' ')}`,
        // 断线 H：从 kernel 滚动缓冲（activeEvents）判"同 target 已有历史观察"，
        // 替代旧的全仓无人传入的 context.hasHistory 死旗标。
        hasHistory: Boolean(context.hasHistoryTargets && context.hasHistoryTargets.has(reaction.target)),
        evidenceGap: reaction.confidence < 0.65,
        ambiguity: 1 - reaction.confidence,
        failureSignal: reaction.channels.includes('feedback') || reaction.channels.includes('anomaly'),
        source: 'consciousness-kernel',
        origin: 'derived',
        originRef: reaction.eventIds[0],
      });
      const episode = growthDocs.recordEpisode({
        taskType: `consciousness-${reaction.eventTypes[0] || 'review'}`,
        route,
        success: false,
        retries: 0,
        lesson: `意识事件 ${reaction.target} 需要后续验证`,
        evidence: JSON.stringify({ reaction, context }),
        source: 'consciousness-kernel',
        origin: 'observed',
        originRef: reaction.eventIds[0],
      });
      const improvement = growthDocs.proposeImprovement({
        title: `处理意识事件：${reaction.target}`,
        kind: 'consciousness-workflow',
        baseline: '由 DoerOne 按当前维护路线处理',
        change: `根据 ${reaction.channels.join('、')} 通道共振，优先执行：${route.join(' → ')}`,
        testPlan: '由后续独立任务验证成功率、重试次数和 KESPI 变化；通过前保持 candidate。',
        source: 'consciousness-kernel',
        origin: 'proposal',
        originRef: reaction.eventIds[0],
      });
      growth.push({ reaction, memory, episode, improvement });
    }
    const metacognition = this.metacognition?.reviewConsciousness(reactions, context) || null;
    if (metacognition) {
      this.state.channelWeights = { ...(this.state.channelWeights || {}), ...metacognition.channelHealth };
      this.state.attentionRevision += 1;
    }
    return { growth, metacognition };
  }

  inhibit(target, reason = 'manual', durationMs = this.inhibitDefaultMs) {
    const until = Date.now() + Math.max(1000, Number(durationMs) || this.inhibitDefaultMs);
    this.state.suppressedEvents.push({ target, reason, until, status: 'inhibited', createdAt: new Date().toISOString() });
    this.state.suppressedEvents = this.state.suppressedEvents.slice(-this.maxEvents);
    this.saveState();
    return { target, reason, until };
  }

  /**
   * archiveObservedEvents — 把超龄且低注意力的 observed 事件搬入归档台账（写端衰减）
   *
   * 背景：kernel 的 activeEvents 是滚动缓冲（上限 maxEvents），低强度 observed 事件
   * 一旦进来就常驻到被新事件挤出，期间一直挂在备忘录的 consciousnessAlerts 里，
   * 账面「有告警」但实际无故障。本方法是补上的「有界写端衰减」通道：
   *   - 只搬 status='observed' AND attention < attentionFloor AND 创建超过 minAgeHours 的项
   *   - aroused / focused / approvalRequired / 高注意力事件永不归档
   *   - 默认 dryRun=true 只预测；apply=true 才真搬
   *   - 真搬时逐条写 logs/consciousness/archived-events.jsonl（可回溯，留痕不删）
   *   - 归档后 activeEvents 空则 state 落回 idle（对齐 integrate 的 idle 语义）
   *   - 旋钮单源（纪律 5）：minAgeHours / attentionFloor 缺省取 consciousnessTuning()
   *
   * @param {{dryRun?:boolean, target?:string, minAgeHours?:number, attentionFloor?:number}} [opts]
   * @returns 预测/执行报告（dryRun / toArchive / kept / archived / applied / archiveFile）
   */
  archiveObservedEvents(opts = {}) {
    const tuning = consciousnessTuning();
    const dryRun = opts.dryRun !== false;
    const attentionFloor = Number.isFinite(Number(opts.attentionFloor))
      ? Number(opts.attentionFloor)
      : Number(tuning.archiveObservedAttentionFloor);
    const minAgeMs = Number.isFinite(Number(opts.minAgeHours))
      ? Number(opts.minAgeHours) * 3600000
      : Number(tuning.archiveObservedMinAgeHours) * 3600000;
    const now = Date.now();

    const reasons = [];
    const archived = [];
    const kept = [];
    for (const ev of this.state.activeEvents || []) {
      const isObserved = ev.status === 'observed';
      const ageMs = now - Date.parse(ev.createdAt || '1970-01-01T00:00:00Z');
      const stale = ageMs >= minAgeMs;
      const lowAttention = Number(ev.attention ?? ev.intensity ?? 1) < attentionFloor;
      const notApproval = !ev.approvalRequired;
      const arousalOk = ev.arousal === 'sensing' || ev.arousal === 'integrating' || !ev.arousal;
      const targetOk = !opts.target || ev.target === opts.target;
      if (isObserved && stale && lowAttention && notApproval && arousalOk && targetOk) {
        archived.push(ev);
        reasons.push(`${ev.target || '?'}@${ev.createdAt} attention=${(ev.attention ?? 0).toFixed(3)}`);
      } else {
        kept.push(ev);
      }
    }

    const out = {
      dryRun,
      toArchive: archived.length,
      kept: kept.length,
      archived: 0,
      reasons: reasons.slice(0, 8),
      state: this.state.state,
      attentionFloor,
      minAgeMs,
      now: new Date(now).toISOString(),
      applied: false,
    };
    if (dryRun) {
      out.note = 'dry-run：只预测将归档的旧观察项，未写 state.json / 未写归档台账';
      return out;
    }
    // 真搬：写归档台账（可回溯），更新 activeEvents，必要时 state 落回 idle
    const archiveFile = path.join(this.baseDir, 'logs', 'consciousness', 'archived-events.jsonl');
    fs.mkdirSync(path.dirname(archiveFile), { recursive: true });
    const stamp = new Date(now).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const batchId = `arch-batch-${stamp}`;
    const lines = archived.map((ev) => JSON.stringify({
      batchId,
      target: ev.target,
      channels: ev.channels,
      attention: ev.attention,
      intensity: ev.intensity,
      status: ev.status,
      arousal: ev.arousal,
      createdAt: ev.createdAt,
      archivedAt: new Date(now).toISOString(),
      reason: 'archiveObservedEvents: stale low-attention observed event',
      eventIds: ev.eventIds,
    }) + '\n');
    fs.appendFileSync(archiveFile, lines.join(''), 'utf8');
    this.state.activeEvents = kept;
    if (!kept.length) this.state.state = DEFAULT_STATE.state;
    this.saveState();
    out.archived = archived.length;
    out.applied = true;
    out.archiveFile = archiveFile;
    out.batchId = batchId;
    out.state = this.state.state;
    out.note = `applied：${archived.length} 条旧观察项已搬入 ${path.basename(archiveFile)}（可回溯），activeEvents 余 ${kept.length}`;
    return out;
  }

  isInhibited(target) {
    const now = Date.now();
    return this.state.suppressedEvents.some(item => item.target === target && Number(item.until || 0) > now);
  }

  isSourceBlocked(source) {
    return this.mode === MODES.COORDINATION_ONLY
      && /^(456(?:[.:_-]|$)|456\.coil-corrector)/i.test(String(source || '').trim());
  }

  recordCycleResult(hasValidOutput, cause = '', context = {}) {
    this.state.stagnationCount = hasValidOutput ? 0 : Number(this.state.stagnationCount || 0) + 1;
    const broken = this.state.stagnationCount >= this.stagnationBreakerCycles;   // 轮数取 config（旧版此处写死 3）
    let metaKnowledge = null;
    if (broken) {
      this.state.state = 'stagnant';
      this.state.lastReflectionAt = new Date().toISOString();
      metaKnowledge = this._writeMetaKnowledge({ cause, context });
    } else if (hasValidOutput && this.state.state === 'stagnant') {
      // 解锁（2026-09-14 W3）：停滞必须是可释放的闩。此前 'stagnant' 只在上面赋值、
      // 全仓无人清除 → 一次停滞就永久误报：src/memo.js 的健康判定与 nextActions 都读它，
      // 仪表台会一直建议派工程师去修一个早就修好的问题。有效产出即回到默认态。
      this.state.state = DEFAULT_STATE.state;
    }
    this.saveState();
    return { hasValidOutput: Boolean(hasValidOutput), stagnationCount: this.state.stagnationCount, broken, cause, metaKnowledge };
  }

  _writeMetaKnowledge({ cause = '', context = {} } = {}) {
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const id = `meta-breaker-${stamp}`;
    const output = path.join(this.rawDir, `${id}.md`);
    const attemptedPaths = Array.isArray(context.attemptedPaths) ? context.attemptedPaths : [];
    const lines = [
      '---',
      `name: MetaKnowledge-${id}`,
      `id: ${id}`,
      'type: MetaKnowledge',
      'tags: [meta, breaker, stagnation, recovery]',
      'confidence: 1',
      'status: verified',
      'origin: meta',
      'channel: anomaly',
      'signal_type: chain-break',
      `break_location: ${String(context.breakLocation || 'unknown').replace(/\n/g, ' ')}`,
      `empty_cycles: ${this.state.stagnationCount}`,
      `cause: ${String(cause || 'unspecified').replace(/\n/g, ' ')}`,
      `lineage_id: ${String(context.lineageId || id).replace(/\n/g, ' ')}`,
      `created: ${now.toISOString()}`,
      '---',
      '',
      '# 数据链断链元知识',
      '',
      `- 断链位置：${context.breakLocation || 'unknown'}`,
      `- 连续空产出：${this.state.stagnationCount} 次`,
      `- 原因：${cause || '未提供'}`,
      `- 上下文：${JSON.stringify(context)}`,
      `- 已尝试路径：${attemptedPaths.length ? attemptedPaths.join(' → ') : '未记录'}`,
      `- 恢复建议：${context.recoverySuggestion || '等待新的有效输入后重新感知、路由并验证'}`,
      '',
      '该元知识由意识神经断链协议生成，作为下一轮 aing raw/ 识别、分理、查询和代谢入口。',
      '',
    ];
    fs.mkdirSync(this.rawDir, { recursive: true });
    const temp = `${output}.tmp`;
    fs.writeFileSync(temp, lines.join('\n'), 'utf8');
    fs.renameSync(temp, output);
    return { id, path: output, type: 'MetaKnowledge', status: 'verified' };
  }

  status() {
    return {
      version: this.state.version,
      mode: this.mode,
      state: this.state.state,
      focusTargets: this.state.focusTargets,
      activeEventCount: this.state.activeEvents.length,
      suppressedEventCount: this.state.suppressedEvents.length,
      stagnationCount: this.state.stagnationCount,
      breakerCycles: this.stagnationBreakerCycles,   // 回报当前生效的熔断轮数（C17 行为证明靠它）
      channelHealth: this.state.channelHealth,
      channelWeights: this.state.channelWeights || {},
      attentionRevision: this.state.attentionRevision,
      lastArousalAt: this.state.lastArousalAt,
      lastReflectionAt: this.state.lastReflectionAt,
      stateFile: this.stateFile,
    };
  }
}

module.exports = { ConsciousnessKernel, DEFAULT_STATE, MODES };
