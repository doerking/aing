'use strict';
// aing-v2 capability-narrative.js —— M6 任务 6.1 实现（SPEC-6.1 能力显现入库）
// 来源：AB/capability-narrative.js（纯逻辑 1:1 移植，CJS 化）+ AB/aing-bridge.js 的数据契约。
// 口径：知识是 agent 思维的体现；入库单元 = 一次能力显现（场景→思维→手段/编排→产出→校准）。
// 与 SPEC-3.13 三源并存：产出=回复、思维≈事由分析、手段≈搜索展示与工具调用。
// 铁律：不碰 last_access / tolaria_strength / invalid_at；无物理删；store 由调用方注入。

const DEFAULTS = {
  reasoningMode: 'full',      // 'full' | 'truncated' | 'none'
  reasoningMaxChars: 8000,
  toolInputMaxChars: 600,
  toolResultMaxChars: 1200,
  subagentToolNames: ['agent', 'task', 'subagent', 'dispatch', 'spawn']
};

const SECTIONS = ['场景（触发）', '思维（能力内核）', '手段（工具执行）', '编排（子agent）', '产出', '会话级校准'];
const SUBAGENT_TOOL_NAMES = DEFAULTS.subagentToolNames.slice();
const FORMAT = 'capability-narrative-v1';
const NARRATIVE_MODES = ['semi', 'full'];

// ── P1 入口成形位（SPEC-6.28）：外部件交叙事，系统只验不重写 ──────
function validateNarrative(n) {
  const reasons = [];
  if (!n || typeof n !== 'object') return { ok: false, reasons: ['no-narrative'] };
  if (!NARRATIVE_MODES.includes(n.mode)) reasons.push('bad-mode');
  if (n.mode === 'full') {
    const s = n.sections;
    if (!s || typeof s !== 'object') reasons.push('missing-section');
    else {
      for (const k of SECTIONS) {
        if (!(k in s)) reasons.push('missing-section:' + k);
        else if (String(s[k] == null ? '' : s[k]).trim() === '') reasons.push('empty-section:' + k);
      }
    }
  } else if (n.mode === 'semi') {
    const t = String(n.title || '').trim();
    const tags = Array.isArray(n.tags) ? n.tags.filter(x => String(x).trim()) : [];
    if (!t && !tags.length) reasons.push('nothing-provided');
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** 六段原样渲染（full 形态用；不做任何加工） */
function renderSections(sections) {
  return SECTIONS.map(k => `### ${k}\n${String(sections[k]).trim()}`).join('\n\n');
}

// ── block / 字段 helpers ───────────────────────────────────
function normalizeBlocks(content) {
  if (Array.isArray(content)) return content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (content && typeof content === 'object') return [content];
  return [];
}
function appendBlockText(acc, blocks) {
  return acc + blocks.filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('');
}
function safeJson(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch (_) { return String(v); }
}
function trunc(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n) + ' …[截断]' : s;
}
function pickThinking(b, cfg) {
  const think = b.thinking != null ? b.thinking : (b.text != null ? b.text : b.reasoning);
  if (!think) return '';
  if (cfg.reasoningMode === 'none') return '';
  return cfg.reasoningMode === 'truncated'
    ? String(think).slice(0, cfg.reasoningMaxChars) + ' …[截断]'
    : String(think);
}
function extractToolResult(blocks) {
  for (const b of blocks) {
    if (b.type === 'tool_result' || b.type === 'toolResult') {
      const c = b.content;
      if (typeof c === 'string') return c;
      if (Array.isArray(c)) return c.filter((x) => x && x.type === 'text').map((x) => x.text).join('\n');
      return safeJson(c);
    }
  }
  return blocks.filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('\n');
}

// ── 校准分流 ───────────────────────────────────────────────
function partitionCalibrations(calibrations, byCall = new Map(), sessionLevel = []) {
  for (const c of Array.isArray(calibrations) ? calibrations : []) {
    if (c && c.type === 'approval' && c.target && c.target.callId) byCall.set(c.target.callId, c);
    else sessionLevel.push(c);
  }
  return { byCall, sessionLevel };
}

// ── 渲染 ───────────────────────────────────────────────────
function renderTurn(t, idx) {
  const seg = [];
  if (t.scene) seg.push(`### ${SECTIONS[0]}\n${t.scene.trim()}`);
  if (t.thinking) seg.push(`### ${SECTIONS[1]}\n${t.thinking.trim()}`);
  const shou = t.tools.filter((x) => !x.isSub);
  const bian = t.tools.filter((x) => x.isSub);
  const toolLine = (label) => (x) =>
    `#### ${label} · ${x.name}\n` +
    (x.input ? `参数: ${x.input}\n` : '') +
    (x.result ? `结果: ${x.result}\n` : '') +
    (x.approval ? `**审批校准**: ${x.approval}` : '');
  if (shou.length) seg.push(`### ${SECTIONS[2]}\n${shou.map(toolLine('手段')).join('\n')}`);
  if (bian.length) seg.push(`### ${SECTIONS[3]}\n${bian.map(toolLine('编排')).join('\n')}`);
  if (t.output) seg.push(`### ${SECTIONS[4]}\n${t.output.trim()}`);
  if (!seg.length) return '';
  return `# 能力单元 ${idx}\n\n` + seg.join('\n\n');
}

function renderSessionCalibration(items) {
  const label = (c) => c.type === 'feedback' ? '反馈'
    : c.type === 'goal' ? '目标变更'
      : c.type === 'message-edit' ? '消息编辑' : String(c.type || '校准');
  const lines = items.map((c) => `- **${label(c)}**: ${c.summary == null ? '' : c.summary}`);
  return `# ${SECTIONS[5]}\n\n${lines.join('\n')}`;
}

// ── 主入口 ─────────────────────────────────────────────────
function buildCapabilityNarrative(messages, cfg = {}, calibrations = []) {
  const c = { ...DEFAULTS, ...(cfg || {}) };
  const subNames = (c.subagentToolNames || []).map((s) => String(s).toLowerCase());
  const list = Array.isArray(messages) ? messages : [];
  const turns = [];
  let cur = null;
  const stats = { bodyChars: 0, reasoningBlocks: 0, toolCalls: 0, subagentCalls: 0, turnCount: 0 };
  const newTurn = () => ({ scene: '', thinking: '', output: '', tools: [] });

  for (const m of list) {
    if (!m) continue;
    const role = m.role;
    const blocks = normalizeBlocks(m.content);

    if (role === 'user') {
      if (cur) turns.push(cur);
      cur = newTurn();
      cur.scene = appendBlockText(cur.scene, blocks);
      continue;
    }
    if (!cur) cur = newTurn();   // 防御：缺 user 开头

    if (role === 'assistant') {
      for (const b of blocks) {
        if (!b) continue;
        if (b.type === 'reasoning') {
          stats.reasoningBlocks++;
          cur.thinking += pickThinking(b, c);
        } else if (b.type === 'text') {
          cur.output += (b.text || '');
        } else if (b.type === 'tool_use' || b.type === 'toolCall') {
          stats.toolCalls++;
          const name = b.name || b.toolName || '';
          const isSub = subNames.includes(String(name).toLowerCase());
          if (isSub) stats.subagentCalls++;
          cur.tools.push({
            name, isSub,
            callId: b.id != null ? b.id : (b.callId != null ? b.callId : null),
            input: trunc(safeJson(b.input != null ? b.input : (b.args != null ? b.args : b.parameters)), c.toolInputMaxChars),
            result: null, approval: null
          });
        }
      }
    } else if (role === 'tool' || role === 'toolResult' || role === 'tool_result') {
      const resultText = extractToolResult(blocks);
      const t = cur.tools.find((x) => x.result === null);
      if (t) t.result = trunc(resultText, c.toolResultMaxChars);
    }
  }
  if (cur) turns.push(cur);
  stats.turnCount = turns.length;

  const { byCall, sessionLevel } = partitionCalibrations(calibrations);
  for (const t of turns) {
    for (const tool of t.tools) {
      const ap = tool.callId && byCall.get(tool.callId);
      if (ap) tool.approval = ap.summary;
    }
  }

  const parts = turns.map((t, i) => renderTurn(t, i + 1)).filter(Boolean);
  if (sessionLevel.length) parts.push(renderSessionCalibration(sessionLevel));
  for (const t of turns) {
    stats.bodyChars += t.scene.length + t.thinking.length + t.output.length +
      t.tools.reduce((a, x) => a + (x.input ? x.input.length : 0) + (x.result ? x.result.length : 0) + (x.approval ? x.approval.length : 0), 0);
  }
  return { markdown: parts.join('\n\n---\n\n'), stats, turns };
}

// ── SPEC-6.39：能力面观测——必填段分母的证据源 ─────────────
// 内部构建取 buildCapabilityNarrative 的 stats；外部 full 叙事取 payload.messages 实扫，
// 不信 narrative.sections 的自述——否则写作者只要声明「本单元无工具」就能缩分母。
function scanCapability(messages, cfg = {}) {
  const subNames = ((cfg && cfg.subagentToolNames) || DEFAULTS.subagentToolNames).map((s) => String(s).toLowerCase());
  let toolCalls = 0; let subagentCalls = 0;
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || m.role !== 'assistant') continue;
    for (const b of normalizeBlocks(m.content)) {
      if (!b) continue;
      if (b.type === 'tool_use' || b.type === 'toolCall') {
        toolCalls++;
        if (subNames.includes(String(b.name || b.toolName || '').toLowerCase())) subagentCalls++;
      }
    }
  }
  return { toolCalls, subagentCalls };
}

// ── 入库：一条 Conversation 实体（六段 markdown + 结构化 turns）──────
async function ingestNarrative(store, payload = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('narrative 需要 store 注入（SPEC-6.1 契约）');
  const sessionId = String(payload.sessionId == null ? '' : payload.sessionId).trim();
  if (!sessionId) throw new Error('session-required');
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length) throw new Error('narrative-required: 无会话消息不入库');

  const id = 'conv-' + sessionId;
  if (typeof store.getEntity === 'function' && store.getEntity(id) != null) return { skipped: true, id };

  const calibrations = Array.isArray(payload.calibrations) ? payload.calibrations : [];
  const external = payload.narrative && typeof payload.narrative === 'object' ? payload.narrative : null;
  if (external) {
    const v = validateNarrative(external);
    if (!v.ok) throw new Error('narrative-invalid: ' + v.reasons.join('+'));
  }

  let markdown, stats, turns;
  if (external && external.mode === 'full') {
    // 寄生：六段全由外部件给，系统只渲染与校验，不重写
    markdown = renderSections(external.sections);
    turns = [];
    stats = { bodyChars: markdown.length, reasoningBlocks: 0, toolCalls: 0, subagentCalls: 0, turnCount: 0, external: true };
  } else {
    const built = buildCapabilityNarrative(messages, payload.cfg || {}, calibrations);
    markdown = built.markdown; stats = built.stats; turns = built.turns;
  }

  // SPEC-6.39：能力面（必填段分母的证据）随实体存下——内部取构建 stats，外部实扫 messages
  const observed = external ? scanCapability(messages, payload.cfg || {}) : { toolCalls: stats.toolCalls, subagentCalls: stats.subagentCalls };
  stats = Object.assign({}, stats, {
    capability: {
      toolCalls: observed.toolCalls,
      subagentCalls: observed.subagentCalls,
      calibrations: calibrations.length,
      source: external ? 'messages' : 'session'
    }
  });

  const content = JSON.stringify({
    format: FORMAT,
    topic: payload.topic || null,
    at: payload.at || new Date().toISOString(),
    trigger: payload.trigger || 'manual',
    markdown,
    turns,
    stats,
    calibrations,
    ...(external ? { narrative: { mode: external.mode, slot: 'P1', provided: true } } : {})
  });
  const tags = ['conv:9', 'src:narrative'];
  if (calibrations.length) tags.push('src:calibration');
  if (external && Array.isArray(external.tags)) {
    for (const t of external.tags) {
      const s = String(t == null ? '' : t).trim();
      if (s && !tags.includes(s)) tags.push(s);
    }
  }

  const db = store._getDb();
  // SPEC-7.1 AC-1 / SPEC-6.1 修订 A §8.3：name=序列号副本（conv-<sessionId>），title 由话题或正文首句派生
  const derivedTitle = require('./conv-text.js').readableTopic(payload.topic || null,
    { topic: payload.topic || null, reply: payload.topic || markdown });
  const extTitle = external && typeof external.title === 'string' ? external.title.trim() : '';
  const title = extTitle || derivedTitle;
  const stmt = db.prepare(
    `INSERT INTO entities (id, name, type, content, tags, status, confidence, tolaria_strength, title, created_at, updated_at)
     VALUES (?, ?, 'Conversation', ?, ?, 'active', 0.6, 5, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  );
  stmt.run([id, id, content, JSON.stringify(tags), title.slice(0, 60)]);
  stmt.free();
  store._persist();
  return { ingested: true, id, stats };
}

module.exports = {
  DEFAULTS, SECTIONS, SUBAGENT_TOOL_NAMES, FORMAT, NARRATIVE_MODES, validateNarrative, renderSections,
  buildCapabilityNarrative, renderTurn, renderSessionCalibration, partitionCalibrations,
  normalizeBlocks, appendBlockText, pickThinking, extractToolResult, safeJson, trunc, scanCapability,
  ingestNarrative
};
