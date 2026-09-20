#!/usr/bin/env node
/**
 * src/neural.js — 意识层写端 CLI（agent 可直接动手的控制面）/ consciousness control surface
 *
 * 为什么要有这个文件（2026-09-14 W2）：意识层的读端已有 `src/memo.js`，但写端散在三处、
 * 没有一条 agent 能直接敲的通道：
 *   - `kernel.ingest()` 只有代谢内部与 HTTP `/api/consciousness/event` 在用；
 *   - `kernel.inhibit()` 历史上**全仓零调用点** → agent 想临时封住一个误报源无从下手；
 *   - `controller.verify()` / `controller.record()`（不依赖外部 adapter 的那两条）既无 CLI 也无路由
 *     → decision lineage 的「校验」「入账」两环只有宿主代码能写，人无法补记。
 * 本文件把这些面收成一条命令，且**只做转发**：判据、阈值、默认值一律留在 kernel /
 * ConsciousnessEvent / controller 自己那处（纪律 5），本文件不出现任何数值阈值（小时→毫秒的换算除外）。
 *
 * 用法 / Usage:
 *   node src/neural.js status                                   只读：kernel.status() + 在效抑制清单
 *   node src/neural.js event '<json | [json...] | 一段文本>'     投递意识事件（kernel.ingest，会落盘）
 *   node src/neural.js inhibit <target> [--reason r] [--hours N] 抑制目标（唯一清除路径 = 到期）
 *   node src/neural.js assess '<json | [json...] | 一段文本>'    评估：controller.assess → kernel.ingest + 记谱系
 *   node src/neural.js deliberate [low|medium|high|critical]     协商维护（需本院 knowledge.db，缺库如实报错）
 *   node src/neural.js verify '{"checks":[{"name":"x","passed":true}],"observedOutcome":"..."}'
 *   node src/neural.js record  '{"result":"...","lesson":"...","route":["compile"]}'
 *
 * 全局可选：--kb <院子目录>（把意识层与 lineage 指到别处，门禁探针用）
 *          --json（恒为 JSON，此旗为显式声明）| --logs（把模块日志留在 stdout）
 * stdout 只放结果（JSON），模块日志走 stderr —— 与 src/memo.js 同口径。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const USAGE = [
  '用法 / Usage:',
  "  node src/neural.js status",
  "  node src/neural.js event '<json | [json...] | 一段文本>'",
  "  node src/neural.js inhibit <target> [--reason <r>] [--hours <N>]",
  "  node src/neural.js assess '<json | [json...] | 一段文本>'",
  "  node src/neural.js deliberate [low|medium|high|critical]",
  '  node src/neural.js verify  \'{"checks":[{"name":"x","passed":true}],"observedOutcome":"..."}\'',
  '  node src/neural.js record  \'{"result":"...","lesson":"...","route":["compile"]}\'',
  '全局可选：--kb <院子目录> | --json | --logs',
].join('\n');

function parseArgs(argv) {
  const opts = { kb: null, json: false, logs: false, help: false, reason: 'agent-manual', hours: null, pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--kb') { opts.kb = argv[++i] || null; continue; }
    if (a === '--reason') { opts.reason = argv[++i] || opts.reason; continue; }
    if (a === '--hours') { opts.hours = argv[++i]; continue; }
    if (a === '--json') { opts.json = true; continue; }
    if (a === '--logs') { opts.logs = true; continue; }
    if (a === '--help' || a === '-h') { opts.help = true; continue; }
    opts.pos.push(a);
  }
  opts.command = opts.pos[0] || 'status';
  opts.payload = opts.pos.slice(1).join(' ');
  return opts;
}

/**
 * payload → 一批事件对象。JSON 优先；非 JSON 的整段文本作为一条 generic 事件的证据正文。
 * 关键：**不填 intensity / confidence**——默认值归 ConsciousnessEvent 一处（纪律 5），本文件不写数。
 */
function toEvents(payload, label) {
  const text = String(payload || '').trim();
  if (!text) throw new Error(`${label} 需要事件内容（JSON 对象 / JSON 数组 / 一段文本），不接受空`);
  let parsed = null;
  if (/^[{[]/.test(text)) {
    try { parsed = JSON.parse(text); } catch (e) { throw new Error(`${label} 的 JSON 无效: ${e.message}`); }
  }
  if (parsed === null) {
    return [{ channel: 'generic', target: 'agent-note', signalType: 'observed', evidence: { note: text } }];
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (!list.length || !list[0] || typeof list[0] !== 'object') throw new Error(`${label} 的事件必须是非空对象或对象数组`);
  return list;
}

/** 在效抑制清单：kernel 把抑制记进 suppressedEvents（只有带未来 until 的那些才是「在效」）。 */
function activeInhibitions(kernel) {
  const now = Date.now();
  return (kernel.state.suppressedEvents || [])
    .filter(item => item && item.target && Number(item.until || 0) > now)
    .map(item => ({ target: item.target, reason: item.reason || null, until: new Date(Number(item.until)).toISOString() }));
}

async function run(argv) {
  const opts = parseArgs(argv);
  if (opts.help) return { usage: USAGE };
  const baseDir = opts.kb ? path.resolve(opts.kb) : path.resolve(__dirname, '..');
  if (!fs.existsSync(baseDir)) throw new Error(`--kb 指向的院子不存在: ${baseDir}`);

  const { ConsciousnessKernel } = require('./consciousness-kernel');
  const kernel = new ConsciousnessKernel({ baseDir, mode: 'coordination-only' });
  let adapter = null;
  const needAdapter = () => {
    if (!adapter) {
      const { HermesAingAdapter } = require('./hermes-aing-adapter');
      adapter = new HermesAingAdapter({ kbRoot: baseDir, consciousnessKernel: kernel });
    }
    return adapter;
  };
  const needController = () => {
    const { ConsciousnessController } = require('./consciousness-controller');
    return new ConsciousnessController({ baseDir, adapter: needAdapter(), mode: 'coordination-only' });
  };

  switch (opts.command) {
    case 'status': {
      const st = kernel.status();          // 纯读：status() 内部不 saveState
      return { ...st, activeInhibitions: activeInhibitions(kernel), baseDir };
    }
    case 'event': {
      const events = toEvents(opts.payload, 'event');
      const res = kernel.ingest(events);   // 写：activeEvents/state 变化 + saveState 落盘
      return {
        accepted: res.accepted.length,
        suppressed: res.suppressed.length,
        acceptedEvents: res.accepted.map(e => ({ channel: e.channel, target: e.target, signalType: e.signalType })),
        suppressedWhy: res.suppressed.map(s => ({ target: s.target, why: s.inhibitReason })),
        stateAfter: { state: kernel.state.state, activeEventCount: kernel.state.activeEvents.length, stagnationCount: kernel.state.stagnationCount },
        note: '已落盘 <kb>/data/consciousness/state.json —— 面板与备忘录读数会随之变化（写表必然扰表，属设计）',
      };
    }
    case 'inhibit': {
      const target = (opts.payload || '').trim();
      if (!target) throw new Error('inhibit 需要目标（实体 id / 路径 / 通道名）\n' + USAGE);
      let durationMs;
      if (opts.hours !== null) {
        const h = Number(opts.hours);
        if (!Number.isFinite(h) || h <= 0) throw new Error(`--hours 必须是正数小时，收到 "${opts.hours}"`);
        durationMs = h * 3600000;          // 仅单位换算；缺省时长归 kernel.inhibit 那处默认值
      }
      const rec = durationMs === undefined ? kernel.inhibit(target, opts.reason) : kernel.inhibit(target, opts.reason, durationMs);
      if (!kernel.isInhibited(target)) throw new Error('inhibit 写了记录但 isInhibited(target) 仍 false → 抑制没生效');
      const probe = kernel.ingest([{ channel: 'generic', target, evidence: { probe: 'post-inhibit' } }]);
      const blocked = probe.suppressed.some(s => s.target === target && s.inhibitReason === 'target-inhibited');
      if (!blocked) throw new Error('抑制后该目标仍能被 ingest → 控制面是假的（isInhibited 未参与 ingest 判定）');
      return {
        target, reason: rec.reason, until: new Date(Number(rec.until)).toISOString(),
        isInhibited: true, postInhibitIngestSuppressed: 'target-inhibited',
        note: 'kernel 没有撤销 API：到期自动失效是唯一清除路径；该记录同时计入 suppressedEvents（属设计，不是垃圾）',
      };
    }
    case 'assess': {
      const events = toEvents(opts.payload, 'assess');
      const lineage = needController().assess({ events });
      return {
        lineageId: lineage.lineageId, kind: lineage.kind, status: lineage.status,
        assessmentId: lineage.assessmentId, requiresApproval: lineage.requiresApproval,
        eventsIngested: (lineage.output && lineage.output.accepted || []).length,
        eventsSuppressed: (lineage.output && lineage.output.suppressed || []).length,
        note: 'assess 走 controller → adapter.consciousnessKernel.ingest（同一副脑子），谱系已追加 logs/agent-decision-lineage.jsonl',
      };
    }
    case 'verify': {
      let input = {};
      if (opts.payload) { try { input = JSON.parse(opts.payload); } catch (e) { throw new Error(`verify 的 JSON 无效: ${e.message}`); } }
      const lineage = needController().verify(input);
      const v = lineage.verification || {};
      return {
        lineageId: lineage.lineageId, verificationId: v.verificationId, actionId: v.actionId,
        status: v.status, passedChecks: v.passedChecks, failedChecks: v.failedChecks,
        rollbackSuggested: v.rollbackSuggested,
        note: '不依赖外部 adapter：直接落 decision lineage，可用 GET /api/consciousness/lineage 回读',
      };
    }
    case 'record': {
      let input = {};
      if (opts.payload) { try { input = JSON.parse(opts.payload); } catch (e) { throw new Error(`record 的 JSON 无效: ${e.message}`); } }
      const lineage = needController().record(input);
      return {
        lineageId: lineage.lineageId, episodeId: lineage.output.episodeId,
        status: lineage.output.status, lesson: lineage.output.lesson,
        note: lineage.output.note,
      };
    }
    case 'deliberate': {
      const urgency = (opts.payload || '').trim() || undefined;
      if (urgency && !['low', 'medium', 'high', 'critical'].includes(urgency)) {
        throw new Error(`deliberate 的 urgency 只能是 low/medium/high/critical，收到 "${urgency}"`);
      }
      const lineage = await needController().deliberate({ urgency });
      const d = lineage.output || {};
      return {
        lineageId: lineage.lineageId, status: lineage.status, requiresApproval: lineage.requiresApproval,
        urgencyLevel: d.urgencyLevel,
        deliberation: d.deliberation || null,
        signalsIngested: (d.consciousness && d.consciousness.accepted || []).length,
        note: '只返回共识、不执行高风险维护动作；requiresApproval=true 即等人批',
      };
    }
    default:
      throw new Error(`未知命令: ${opts.command}\n${USAGE}`);
  }
}

if (require.main === module) {
  const argvAll = process.argv.slice(2);
  if (!argvAll.includes('--logs')) {
    const orig = console.log;
    console.log = (...a) => process.stderr.write(a.join(' ') + '\n');
    process.on('exit', () => { console.log = orig; });
  }
  run(argvAll).then(result => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }).catch(error => {
    process.stderr.write(`❌ neural 写端失败 / control surface failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { USAGE, parseArgs, toEvents, activeInhibitions, run };
