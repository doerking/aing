#!/usr/bin/env node
/**
 * consciousness-controller.js — Agent 侧意识神经控制器
 *
 * 只负责 Agent 主控侧的模式、调用边界和 decision lineage。
 * 不执行命令，不自动批准，不把 456 signal 送入 ConsciousnessKernel。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MODES = Object.freeze({
  OBSERVE_ONLY: 'observe-only',
  COORDINATION_ONLY: 'coordination-only',
  EXECUTION_ASSISTED: 'execution-assisted',
});

const ALLOWED_MODES = new Set(Object.values(MODES));
const OPERATIONAL_STATES = Object.freeze({
  IDLE: 'idle',
  SENSING: 'sensing',
  ORIENTING: 'orienting',
  PLANNING: 'planning',
  WAITING_APPROVAL: 'waiting-approval',
  EXECUTING: 'executing',
  VERIFYING: 'verifying',
  RECORDING: 'recording',
  RECOVERING: 'recovering',
  STAGNANT: 'stagnant',
});
const ALLOWED_OPERATIONAL_STATES = new Set(Object.values(OPERATIONAL_STATES));
const BLOCKED_SOURCE_RE = /^(456(?:[.:_-]|$)|456\.coil-corrector)/i;

function nonEmpty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} 必须是非空字符串`);
  return value.trim();
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class ConsciousnessController {
  constructor(options = {}) {
    this.adapter = options.adapter || null;
    this.baseDir = options.baseDir || path.resolve(__dirname, '..');
    this.lineageFile = options.lineageFile || path.join(this.baseDir, 'logs', 'agent-decision-lineage.jsonl');
    this.mode = options.mode || MODES.COORDINATION_ONLY;
    this.agentOperationalState = options.agentOperationalState || OPERATIONAL_STATES.ORIENTING;
    this.taskExecutionState = options.taskExecutionState || 'no-active-task';
    this.aingConsciousnessState = options.aingConsciousnessState || 'read-from-kernel-status';
    this.activeContext = clone(options.activeContext || {});
    this.setMode(this.mode);
    this.setOperationalState(this.agentOperationalState);
  }

  setMode(mode) {
    if (!ALLOWED_MODES.has(mode)) throw new Error(`不支持的 Agent 运行模式: ${mode}`);
    this.mode = mode;
    return this.mode;
  }

  getMode() {
    return this.mode;
  }

  setOperationalState(state) {
    if (!ALLOWED_OPERATIONAL_STATES.has(state)) throw new Error(`不支持的 Agent 工作阶段: ${state}`);
    this.agentOperationalState = state;
    return this.agentOperationalState;
  }

  getOperationalContext() {
    return {
      agentOperationalState: this.agentOperationalState,
      agentMode: this.mode,
      aingConsciousnessState: this.aingConsciousnessState,
      taskExecutionState: this.taskExecutionState,
      controller: 'agent',
      provider: 'aing',
      executionOwner: 'doerone/agent',
      activeContext: clone(this.activeContext),
    };
  }

  updateOperationalContext(input = {}) {
    if (input.agentOperationalState) this.setOperationalState(input.agentOperationalState);
    if (input.taskExecutionState) this.taskExecutionState = nonEmpty(input.taskExecutionState, 'taskExecutionState');
    if (input.aingConsciousnessState) this.aingConsciousnessState = nonEmpty(input.aingConsciousnessState, 'aingConsciousnessState');
    if (input.activeContext && typeof input.activeContext === 'object') this.activeContext = clone(input.activeContext);
    return this.getOperationalContext();
  }

  _stateId(kind, taskId) {
    const suffix = crypto.randomBytes(5).toString('hex');
    return `${kind}-${taskId || 'unbound'}-${Date.now()}-${suffix}`;
  }

  _lineageId(kind, taskId) {
    const suffix = crypto.randomBytes(6).toString('hex');
    return `lineage-${kind}-${taskId || 'unbound'}-${Date.now()}-${suffix}`;
  }

  _begin(kind, taskId, input) {
    return {
      lineageId: this._lineageId(kind, taskId),
      parentLineageId: input?.parentLineageId || null,
      kind,
      taskId: taskId || null,
      mode: this.mode,
      controller: 'agent',
      provider: 'aing',
      decisionOwner: 'agent',
      executionOwner: 'doerone/agent',
      agentOperationalState: this.agentOperationalState,
      taskExecutionState: this.taskExecutionState,
      stateChain: {
        taskId: taskId || null,
        observationId: input?.observationId || null,
        assessmentId: input?.assessmentId || null,
        hypothesisId: input?.hypothesisId || null,
        decisionId: input?.decisionId || null,
        actionId: input?.actionId || null,
        verificationId: input?.verificationId || null,
        episodeId: input?.episodeId || null,
      },
      createdAt: new Date().toISOString(),
    };
  }

  _assertAdapter() {
    if (!this.adapter) throw new Error('ConsciousnessController 需要 adapter');
  }

  _assertNo456(events) {
    const list = Array.isArray(events) ? events : [events];
    const blocked = list.filter(event => BLOCKED_SOURCE_RE.test(String(event?.source || '').trim()));
    if (blocked.length) throw new Error('456 signal 在当前控制器中保持旁路，不得进入正式 assess');
  }

  _record(lineage) {
    fs.mkdirSync(path.dirname(this.lineageFile), { recursive: true });
    fs.appendFileSync(this.lineageFile, `${JSON.stringify(lineage)}\n`, 'utf8');
    return lineage;
  }

  async sense(input = {}) {
    this._assertAdapter();
    const taskId = input.taskId || null;
    const observationId = input.observationId || this._stateId('observation', taskId);
    this.setOperationalState(OPERATIONAL_STATES.SENSING);
    const lineage = this._begin('sense', taskId, { ...input, observationId });
    const result = await this.adapter.search(input.query, input.limit);
    this.setOperationalState(OPERATIONAL_STATES.ORIENTING);
    return this._record({
      ...lineage,
      status: 'observed',
      input: { query: input.query, limit: input.limit },
      observationId,
      output: clone(result),
      requiresApproval: false,
      promotion: 'none',
    });
  }

  assess(input = {}) {
    this._assertAdapter();
    const taskId = input.taskId || null;
    const assessmentId = input.assessmentId || this._stateId('assessment', taskId);
    this.setOperationalState(OPERATIONAL_STATES.ORIENTING);
    const events = Array.isArray(input.events) ? input.events : [input.events];
    if (!events.length || !events[0]) throw new Error('assess.events 不能为空');
    this._assertNo456(events);
    const lineage = this._begin('assess', taskId, { ...input, assessmentId });
    const eventsWithDefaults = events.map(event => ({
      ...event,
      source: event.source || 'agent',
      center: event.center || 'agent-task',
      promotion: event.promotion || 'none',
    }));
    const result = this.adapter.consciousnessKernel.ingest(eventsWithDefaults);
    return this._record({
      ...lineage,
      status: 'assessed',
      input: { eventCount: events.length, sources: [...new Set(events.map(e => e.source || 'agent'))] },
      assessmentId,
      output: clone(result),
      requiresApproval: Boolean(result.reactions?.some(reaction => reaction.approvalRequired)),
      promotion: 'none',
    });
  }

  async deliberate(input = {}) {
    this._assertAdapter();
    const taskId = input.taskId || null;
    const hypothesisId = input.hypothesisId || this._stateId('hypothesis', taskId);
    this.setOperationalState(OPERATIONAL_STATES.PLANNING);
    const lineage = this._begin('deliberate', taskId, { ...input, hypothesisId });
    const result = await this.adapter.deliberateMaintenance(input);
    return this._record({
      ...lineage,
      status: 'deliberated',
      input: clone(input),
      hypothesisId,
      output: clone(result),
      requiresApproval: true,
      promotion: 'none',
    });
  }

  verify(input = {}) {
    const taskId = input.taskId || null;
    const actionId = input.actionId || this._stateId('action', taskId);
    const verificationId = input.verificationId || this._stateId('verification', taskId);
    this.setOperationalState(OPERATIONAL_STATES.VERIFYING);
    const lineage = this._begin('verify', taskId, { ...input, actionId, verificationId });
    const checks = Array.isArray(input.checks) ? input.checks : [];
    const passedChecks = checks.filter(check => check && check.passed === true).length;
    const failedChecks = checks.filter(check => check && check.passed === false).length;
    const status = input.status || (failedChecks > 0 ? 'failed' : checks.length > 0 && passedChecks === checks.length ? 'verified' : 'inconclusive');
    const verification = {
      verificationId,
      actionId,
      taskId,
      status,
      checks: clone(checks),
      passedChecks,
      failedChecks,
      evidence: clone(input.evidence || []),
      observedOutcome: clone(input.observedOutcome || null),
      expectedOutcome: clone(input.expectedOutcome || null),
      deviation: clone(input.deviation || null),
      rollbackSuggested: input.rollbackSuggested === true,
      promotion: 'none',
    };
    return this._record({ ...lineage, verification });
  }

  record(input = {}) {
    const taskId = input.taskId || null;
    const episodeId = input.episodeId || this._stateId('episode', taskId);
    const verificationId = input.verificationId || null;
    this.setOperationalState(OPERATIONAL_STATES.RECORDING);
    const lineage = this._begin('record', taskId, { ...input, episodeId, verificationId });
    const output = {
      accepted: true,
      status: 'recorded-for-provider-integration',
      taskId,
      episodeId,
      verificationId,
      result: clone(input.result || null),
      verification: clone(input.verification || null),
      userFeedback: clone(input.userFeedback || null),
      lesson: clone(input.lesson || null),
      route: clone(input.route || null),
      metrics: clone(input.metrics || null),
      requiresApproval: false,
      promotion: 'none',
      note: '当前控制器只记录 decision lineage；正式 aing feedback adapter 接入需独立登记。',
    };
    return this._record({ ...lineage, output });
  }

  createEpisode(input = {}) {
    const taskId = input.taskId || null;
    const episodeId = input.episodeId || this._stateId('episode', taskId);
    const verificationId = input.verificationId || null;
    const lineage = this._begin('episode', taskId, { ...input, episodeId, verificationId });
    const episode = {
      episodeId,
      taskId,
      actionId: input.actionId || null,
      verificationId,
      route: clone(input.route || null),
      outcome: clone(input.outcome || null),
      success: input.success === true,
      retries: Number.isFinite(Number(input.retries)) ? Number(input.retries) : 0,
      lesson: clone(input.lesson || null),
      evidence: clone(input.evidence || []),
      userFeedback: clone(input.userFeedback || null),
      metrics: clone(input.metrics || null),
      status: 'observed',
      promotion: 'none',
      formalFeedbackWritten: false,
    };
    return this._record({ ...lineage, episode });
  }

  recordFeedbackPayload(input = {}) {
    const taskId = input.taskId || null;
    const feedbackId = input.feedbackId || this._stateId('feedback', taskId);
    const episode = clone(input.episode || null);
    const verification = clone(input.verification || null);
    if (!episode || !episode.episodeId) throw new Error('recordFeedbackPayload 需要 episode.episodeId');
    if (!verification || !verification.verificationId) throw new Error('recordFeedbackPayload 需要 verification.verificationId');
    const lineage = this._begin('feedback-payload', taskId, { ...input, feedbackId, episodeId: episode.episodeId, verificationId: verification.verificationId });
    const payload = {
      feedbackId,
      taskId,
      episodeId: episode.episodeId,
      verificationId: verification.verificationId,
      actionId: input.actionId || episode.actionId || verification.actionId || null,
      result: clone(input.result || episode.outcome || null),
      verification: {
        status: verification.status,
        passedChecks: verification.passedChecks,
        failedChecks: verification.failedChecks,
        evidence: clone(verification.evidence || []),
        deviation: clone(verification.deviation || null),
      },
      lesson: clone(input.lesson || episode.lesson || null),
      route: clone(input.route || episode.route || null),
      userFeedback: clone(input.userFeedback || episode.userFeedback || null),
      metrics: clone(input.metrics || episode.metrics || null),
      source: 'agent-runtime-layer',
      status: 'prepared-read-only',
      formalProviderWrite: false,
      growthWrite: false,
      kespiWrite: false,
      knowledgeDbWrite: false,
      promotion: 'none',
    };
    return this._record({ ...lineage, payload });
  }

  checkFeedbackReadiness(input = {}) {
    const taskId = input.taskId || null;
    const gateId = input.gateId || this._stateId('feedback-gate', taskId);
    const payload = clone(input.payload || null);
    const verification = clone(input.verification || null);
    const episode = clone(input.episode || null);
    const missing = [];
    if (!payload || !payload.feedbackId) missing.push('payload.feedbackId');
    if (!payload || payload.status !== 'prepared-read-only') missing.push('payload.status=prepared-read-only');
    if (!verification || !verification.verificationId) missing.push('verification.verificationId');
    if (!['verified', 'failed', 'inconclusive'].includes(verification?.status)) missing.push('verification.status');
    if (!episode || !episode.episodeId) missing.push('episode.episodeId');
    if (!payload || payload.episodeId !== episode?.episodeId) missing.push('payload.episodeId↔episode.episodeId');
    if (!payload || payload.verificationId !== verification?.verificationId) missing.push('payload.verificationId↔verification.verificationId');
    const safetyFlags = {
      formalProviderWrite: payload?.formalProviderWrite === false,
      growthWrite: payload?.growthWrite === false,
      kespiWrite: payload?.kespiWrite === false,
      knowledgeDbWrite: payload?.knowledgeDbWrite === false,
      promotion: payload?.promotion === 'none',
    };
    Object.entries(safetyFlags).forEach(([key, passed]) => { if (!passed) missing.push(`safety.${key}`); });
    const evidenceCount = Array.isArray(verification?.evidence) ? verification.evidence.length : 0;
    const passedChecks = Number(verification?.passedChecks || 0);
    const failedChecks = Number(verification?.failedChecks || 0);
    const evidenceQuality = {
      evidenceCount,
      passedChecks,
      failedChecks,
      hasEvidence: evidenceCount > 0,
      noFailedChecks: failedChecks === 0,
      verifiedOutcome: verification?.status === 'verified',
    };
    const readyForApproval = missing.length === 0 && evidenceQuality.hasEvidence && evidenceQuality.noFailedChecks && evidenceQuality.verifiedOutcome;
    const lineage = this._begin('feedback-readiness-gate', taskId, { ...input, gateId, feedbackId: payload?.feedbackId, verificationId: verification?.verificationId, episodeId: episode?.episodeId });
    return this._record({
      ...lineage,
      gateId,
      status: readyForApproval ? 'ready-for-independent-approval' : 'not-ready',
      missing,
      evidenceQuality,
      readyForApproval,
      formalProviderWriteAllowed: false,
      executionAllowed: false,
      promotion: 'none',
      note: '通过 readiness gate 只表示可申请独立审批，不代表 provider 写入已批准。',
    });
  }

  classifyDecisionBoundary(input = {}) {
    const taskId = input.taskId || null;
    const boundaryId = input.boundaryId || this._stateId('boundary', taskId);
    const userFields = ['userDecision', 'userApproval', 'userData', 'userFeedbackRequired', 'externalCommitment', 'userVisibleResult'];
    const userReasons = userFields.filter(field => input[field] === true || (input[field] !== undefined && input[field] !== null && input[field] !== false && input[field] !== ''));
    const explicitUserInvolvement = input.involvesUser === true || userReasons.length > 0;
    const task = input.task || input.action || input.context || 'unspecified';
    const lineage = this._begin('decision-boundary', taskId, { ...input, boundaryId });
    const result = explicitUserInvolvement
      ? {
          boundaryId,
          classification: 'user-todo',
          status: '待办',
          task,
          userReasons,
          agentMayDecide: false,
          nextStep: '向用户显示待办并等待用户明确输入',
          executionAllowed: false,
          providerWriteAllowed: false,
          promotion: 'none',
        }
      : {
          boundaryId,
          classification: 'internal-runtime',
          status: 'self-determined',
          task,
          userReasons: [],
          agentMayDecide: true,
          nextStep: 'Agent 可自行确定并继续内部运行编排',
          executionAllowed: false,
          providerWriteAllowed: false,
          promotion: 'none',
        };
    return this._record({ ...lineage, boundary: result });
  }

  simulateFeedbackProviderSubmission(input = {}) {
    const taskId = input.taskId || null;
    const simulationId = input.simulationId || this._stateId('feedback-submit-sim', taskId);
    const payload = clone(input.payload || null);
    const approval = clone(input.approval || null);
    const boundary = this.classifyDecisionBoundary({
      taskId,
      task: input.task || 'feedback provider submission',
      involvesUser: input.involvesUser,
      userDecision: input.userDecision,
      userApproval: input.userApproval,
      userData: input.userData,
      userFeedbackRequired: input.userFeedbackRequired,
      externalCommitment: input.externalCommitment,
      userVisibleResult: input.userVisibleResult,
    });
    const lineage = this._begin('feedback-provider-submit-simulation', taskId, { ...input, simulationId });
    if (boundary.boundary.classification === 'user-todo') {
      return this._record({
        ...lineage,
        simulation: {
          simulationId,
          status: '待办',
          classification: 'user-todo',
          task: boundary.boundary.task,
          userReasons: boundary.boundary.userReasons,
          nextStep: boundary.boundary.nextStep,
          submitted: false,
          provider: 'aing',
          providerWriteAllowed: false,
          executionAllowed: false,
          promotion: 'none',
        },
      });
    }
    const approvedScope = Array.isArray(approval?.approvedScope) ? approval.approvedScope : [];
    const eligible = approval?.decision === 'approved-scope-only' && approval?.providerWriteEligible === true && approvedScope.includes('feedback-record');
    return this._record({
      ...lineage,
      simulation: {
        simulationId,
        status: eligible ? 'simulation-only-not-submitted' : 'not-approved',
        classification: 'internal-runtime',
        task: boundary.boundary.task,
        submitted: false,
        wouldUseProvider: 'aing',
        wouldWriteScope: eligible ? ['feedback-record'] : [],
        payloadId: payload?.feedbackId || null,
        providerWriteAllowed: false,
        executionAllowed: false,
        promotion: 'none',
      },
    });
  }

  recordFeedbackApprovalDecision(input = {}) {
    const taskId = input.taskId || null;
    const envelopeId = input.envelopeId || this._stateId('approval-envelope', taskId);
    const request = clone(input.request || null);
    const approved = input.approved === true;
    const requestedScope = Array.isArray(request?.requestedWriteScope) ? request.requestedWriteScope : [];
    const approvedScope = Array.isArray(input.approvedScope) ? [...new Set(input.approvedScope)] : [];
    const scopeMatches = approvedScope.every(item => requestedScope.includes(item)) && requestedScope.every(item => !approved || approvedScope.includes(item));
    const forbiddenScope = approvedScope.filter(item => ['knowledge.db', 'growth.active', 'kespi.promote', 'consciousness.state', '456.ingest'].includes(item));
    if (!request || request.status !== 'awaiting-independent-approval') throw new Error('recordFeedbackApprovalDecision 需要 awaiting-independent-approval 请求');
    if (approved && !scopeMatches) throw new Error('批准范围与申请范围不一致');
    if (forbiddenScope.length) throw new Error(`批准范围包含禁止项: ${forbiddenScope.join(', ')}`);
    const decision = {
      envelopeId,
      requestId: request.requestId,
      taskId,
      feedbackId: request.feedbackId,
      approver: input.approver || 'unspecified',
      approved,
      decision: approved ? 'approved-scope-only' : 'rejected',
      requestedScope,
      approvedScope,
      scopeMatches,
      reason: input.reason || null,
      decidedAt: new Date().toISOString(),
      providerWriteEligible: approved && scopeMatches && forbiddenScope.length === 0,
      providerWriteAllowed: false,
      executionAllowed: false,
      promotion: 'none',
      note: '审批决定只记录范围，不自动执行 provider 写入。',
    };
    const lineage = this._begin('feedback-approval-decision', taskId, { ...input, envelopeId, requestId: request.requestId, feedbackId: request.feedbackId });
    return this._record({ ...lineage, decision });
  }

  prepareFeedbackApprovalRequest(input = {}) {
    const taskId = input.taskId || null;
    const requestId = input.requestId || this._stateId('feedback-approval', taskId);
    const payload = clone(input.payload || null);
    const readiness = clone(input.readiness || null);
    const verification = clone(input.verification || null);
    const episode = clone(input.episode || null);
    if (!readiness || readiness.readyForApproval !== true || readiness.status !== 'ready-for-independent-approval') {
      throw new Error('prepareFeedbackApprovalRequest 需要 readiness.status=ready-for-independent-approval');
    }
    const writeScope = Array.isArray(input.writeScope) && input.writeScope.length
      ? [...new Set(input.writeScope)]
      : ['feedback-record'];
    const forbiddenScope = writeScope.filter(item => ['knowledge.db', 'growth.active', 'kespi.promote', 'consciousness.state', '456.ingest'].includes(item));
    if (forbiddenScope.length) throw new Error(`审批申请包含禁止范围: ${forbiddenScope.join(', ')}`);
    const lineage = this._begin('feedback-approval-request', taskId, { ...input, requestId, feedbackId: payload?.feedbackId, verificationId: verification?.verificationId, episodeId: episode?.episodeId });
    const request = {
      requestId,
      taskId,
      feedbackId: payload?.feedbackId || null,
      verificationId: verification?.verificationId || null,
      episodeId: episode?.episodeId || null,
      requestedWriteScope: writeScope,
      forbiddenScope,
      evidence: clone(verification?.evidence || []),
      verificationStatus: verification?.status || null,
      risk: clone(input.risk || { level: 'low', notes: ['provider write remains disabled until independent approval'] }),
      rollback: clone(input.rollback || { action: 'disable-provider-write-and-retain-read-only-payload' }),
      approvalChecklist: [
        '确认 feedbackId / verificationId / episodeId 链路一致',
        '确认 requestedWriteScope 不含禁止范围',
        '确认真实证据和 Verification 可复核',
        '确认 provider 写入不会自动晋升 candidate',
        '确认失败时保留 read-only payload 和 lineage',
      ],
      status: 'awaiting-independent-approval',
      approved: false,
      providerWriteAllowed: false,
      executionAllowed: false,
      promotion: 'none',
    };
    return this._record({ ...lineage, request });
  }

  proposeActionHypothesis(input = {}) {
    const taskId = input.taskId || null;
    const hypothesisId = input.hypothesisId || this._stateId('hypothesis', taskId);
    const lineage = this._begin('action-hypothesis', taskId, { ...input, hypothesisId });
    const hypothesis = {
      hypothesisId,
      action: clone(input.action || null),
      expectedOutcome: clone(input.expectedOutcome || null),
      evidenceBasis: clone(input.evidenceBasis || []),
      uncertainty: input.uncertainty ?? null,
      risk: input.risk ?? null,
      reversibility: input.reversibility ?? null,
      approvalRequired: input.approvalRequired !== false,
      verificationMethod: clone(input.verificationMethod || []),
      fallbackRoute: clone(input.fallbackRoute || null),
      status: 'proposal',
      promotion: 'none',
      executionAllowed: false,
    };
    this.setOperationalState(hypothesis.approvalRequired ? OPERATIONAL_STATES.WAITING_APPROVAL : OPERATIONAL_STATES.PLANNING);
    return this._record({ ...lineage, hypothesis });
  }

  decision(input = {}) {
    const taskId = input.taskId || null;
    const decisionId = input.decisionId || this._stateId('decision', taskId);
    const lineage = this._begin('decision', taskId, { ...input, decisionId });
    const approved = input.approved === true;
    const decision = {
      accepted: approved,
      status: approved ? 'approved-by-agent' : 'recommendation-only',
      decisionId,
      hypothesisId: input.hypothesisId || null,
      actionId: input.actionId || this._stateId('action', taskId),
      hypothesis: clone(input.hypothesis || null),
      action: input.action || null,
      requiresApproval: !approved,
      promotion: 'none',
      executionAllowed: false,
      note: approved
        ? 'Agent 已表达批准；DoerOne 执行仍需遵循独立执行边界。'
        : '未获 Agent 批准，不得执行。',
    };
    return this._record({ ...lineage, decision });
  }
}

module.exports = { ConsciousnessController, MODES };
