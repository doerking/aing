'use strict';
// aing-v2 error-handler.js —— M6 任务 6.46 实现（SPEC-6.46 错误码行动表）
// 口径：错误码是既有契约（消息文本不改），本件只做**分类**与**处置动作**，不改 throw、不重命名。
// 四类：wiring（接线炸）/ fix-input（补输入）/ retryable（等一等）/ operator（人要介入）。
// 未知码不抛，返回 unknown + 通用动作。

const KLASSES = ['wiring', 'fix-input', 'retryable', 'operator'];

const ERROR_TABLE = {
  // ── retryable：暂时性冲突，等/重载后再试 ──
  'db-locked': { klass: 'retryable', action: '另一写者持锁：等它落盘，或到 AING_DB_LOCK_STALE_MS 后由本进程接管' },
  'db-stale': { klass: 'retryable', action: '库文件在加载后被外部改写：重新 init 加载最新库再写，禁止覆盖' },
  'db-write-failed': { klass: 'retryable', action: '落盘失败：查磁盘空间与写权限，稍后重试；连续失败先停写' },

  // ── fix-input：调用方补数据/改方向 ──
  'id-required': { klass: 'fix-input', action: '补 id；写面与指纹都靠它定位' },
  'not-found': { klass: 'fix-input', action: '查 id 是否存在（可能已退役改名）：先 memo/检索确认再重试' },
  'narrative-invalid': { klass: 'fix-input', action: '按 validateNarrative 补齐：mode 合法、六段齐且非空' },
  'narrative-required': { klass: 'fix-input', action: '没有会话消息不入库：先收集 messages 再 ingest' },
  'session-required': { klass: 'fix-input', action: '补 sessionId；会话入库必须可追溯' },
  'source-missing': { klass: 'fix-input', action: '补 source 字段：来源不清的料不入库' },
  'subject-required': { klass: 'fix-input', action: '补 subject（主体）：没有主体无法建边' },
  'target-required': { klass: 'fix-input', action: '补 target（目标实体）：缺目标不做动作' },
  'target-not-empty': { klass: 'fix-input', action: '目标位当前非空：先清位或换目标，不覆盖他人占用' },
  'event-type-required': { klass: 'fix-input', action: '补事件类型（九通道之一）' },
  'plan-required': { klass: 'fix-input', action: '先出计划再执行：这是两段式闸' },
  'reply-required': { klass: 'fix-input', action: '补回单：无回单不验收' },
  'revise-required': { klass: 'fix-input', action: '走修订接口（新序列号 + 旧档 invalid_at），不原地改' },
  'fidelity-violation': { klass: 'fix-input', action: '逐字保真被破坏：回原文重取，不要改写原稿层' },
  'section-contract-violation': { klass: 'fix-input', action: '六段契约不符：按 SPEC-6.1 段序列补齐' },
  'past-needs-original-time': { klass: 'fix-input', action: '过去档必须带原始时间：补 created_at 再入库' },
  'invalid-hours': { klass: 'fix-input', action: '时窗参数非法：hours 须为正数' },
  'thickness-missing': { klass: 'fix-input', action: '补厚度三件：没有厚度不派单' },
  'unknown-action': { klass: 'fix-input', action: '动作名不在登记表：查 SLOTS/ACTIONS 清单' },
  'unknown-component': { klass: 'fix-input', action: '组件名未注册：查五组件/狼位登记' },
  'unknown-knob': { klass: 'fix-input', action: '旋钮名未登记：查 SPEC-1.17 登记表' },
  'unknown-membrane': { klass: 'fix-input', action: '膜透性档位未登记：查三档（透/半透/不透）' },

  // ── wiring：调用方没接好，不是用户能处理的事 ──
  'db-adapter': { klass: 'wiring', action: '插排未接引擎：先 init 打开库再调用' },
  'swarm-no-write': { klass: 'wiring', action: '外派件越界写：外派件只出底版与校验，不得写库' },
  'wolf-no-write': { klass: 'wiring', action: '狼位越界写：观察层只读，写入归场域件' },

  // ── operator：需人拍板或查现场 ──
  'identity-rejected': { klass: 'operator', action: '写面只认授权 actor：确认调用身份，不改闸' },
  'migration-mismatch': { klass: 'operator', action: '迁移指纹不一致：停手查 data/migration-report.json，确认后再跑' },
  'batch-locked': { klass: 'operator', action: '批间需用户说继续：这是设计闸，不是故障' },
  'metabolism': { klass: 'operator', action: '代谢链步骤异常：查步骤登记与上一轮轨迹，必要时人工介入' },
  'baseline-missing': { klass: 'operator', action: '基线档缺失：先确认基线来源（test/baseline.json 等），不要空跑' },
  'gate-required': { klass: 'operator', action: '未过闸：按 gate_records 逐闸结论处理' },
  'db-over-cap': { klass: 'operator', action: '库超过容量上限：按两段式删除（退役→归档→清热）处理，勿直接删文件' }
};

// 中文/符号开头的码：按消息前缀识别（消息文本是契约，此处只做分类映射）
const PATTERNS = [
  { re: /^future→past/, code: 'future-past-edge', klass: 'fix-input', action: '产物不回写原料：派生件只可写 future 方向' },
  { re: /^写面被改/, code: 'write-face-mutated', klass: 'operator', action: '写面被外部改写：查谁动了库/文件，取证后再继续' },
  { re: /^未知单元长/, code: 'unknown-unit', klass: 'fix-input', action: '单元长未登记：查蜂群编组登记' },
  { re: /^未知观察维/, code: 'unknown-dimension', klass: 'fix-input', action: '观察维未登记：查六维清单' }
];

const GENERIC = { klass: 'unknown', action: '未登记错误码：先看原文定位调用点，再补分类到本表（结构测试会抓新码）' };

/** 取错误文本：接受 Error 实例或字符串 */
function _text(errOrString) {
  if (errOrString instanceof Error) return String(errOrString.message || errOrString);
  return String(errOrString == null ? '' : errOrString);
}

/**
 * 分类一条错误。
 * @param {Error|string} errOrString
 * @returns {{code:string, klass:string, action:string, known:boolean}}
 */
function classify(errOrString) {
  const msg = _text(errOrString).trim();
  // wiring 家族：未注入依赖（store / 编排器 / embedBatch 等）
  if (/需要\s*(?:store|编排器|注入|ticket|--message)/.test(msg) || /需要\s*\S+\s*注入/.test(msg)) {
    return { code: 'wiring', klass: 'wiring', action: '调用方未接依赖：按组件契约在编排入口注入后再调', known: true };
  }
  const m = /^([a-z][a-z0-9-]{2,})(?::|\s|$)/.exec(msg);
  if (m && ERROR_TABLE[m[1]]) {
    const e = ERROR_TABLE[m[1]];
    return { code: m[1], klass: e.klass, action: e.action, known: true };
  }
  for (const p of PATTERNS) {
    if (p.re.test(msg)) return { code: p.code, klass: p.klass, action: p.action, known: true };
  }
  return { code: (m && m[1]) || 'unknown', klass: GENERIC.klass, action: GENERIC.action, known: false };
}

module.exports = { ERROR_TABLE, KLASSES, classify };
