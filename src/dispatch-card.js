'use strict';
// aing-v2 dispatch-card.js —— M3 任务 3.15（SPEC-3.15 外派派单卡）
// 定位：外派面在 memo 挂载，卡随载交付相关设定。卡是派单口的产物，不是派出动作。
// 死约束：本件不接触进程、网络、文件系统、存储（arch-lint 执行位守）；
//   判据一律取自 dispatch-swarm.js，不在卡里重算第二套。

const D = require('./dispatch-swarm.js');

const HEADS = [
  '## 一、命题与判据',
  '## 二、路径',
  '## 三、厚度',
  '## 四、底版与框架',
  '## 五、编队与波次',
  '## 六、粒子与门',
  '## 七、回报 schema'
];

const PATHS = ['单点查证', '交叉验证', '多源对比', '广扫'];
const SNAPSHOT_FIELDS = ['batch', 'units', 'closed', 'refused', 'updatedAt'];

function _lines(...xs) { return xs.filter(x => x != null).join('\n'); }

function _reading(snapshot) {
  if (snapshot === undefined || snapshot === null) {
    return { status: 'unlinked', text: '读数：未接（宿主侧快照未提供）' };
  }
  const missing = SNAPSHOT_FIELDS.filter(k => snapshot[k] == null);
  if (missing.length) return { status: 'incomplete', text: `读数：快照不完整（缺 ${missing.join(' / ')}）` };
  const units = Array.isArray(snapshot.units) ? snapshot.units : [];
  const prog = units
    .map(u => {
      const th = (u && u.thickness) || {};
      return th.required == null ? String(u && u.id || '?') : `${th.achieved == null ? 0 : th.achieved}/${th.required}`;
    })
    .join('、');
  return {
    status: 'ok',
    text: `读数：在跑 ${units.length} 粒${prog ? `（厚度 ${prog}）` : ''} · 收口 ${Number(snapshot.closed) || 0} · 拒收 ${Number(snapshot.refused) || 0} · 更新 ${snapshot.updatedAt}`
  };
}

function _head(input, problems, mode, flags, batch, reading) {
  const ticket = input.ticket ? ` · ${input.ticket}` : '';
  const out = [`# 外派派单卡${ticket}`];
  out.push('> 本卡不代派：派出归宿主运行时；包内只出卡与读数，不 spawn、不写库。');
  out.push(`> 模式：${mode.mode} ｜ 三布尔：swarmInstalled=${flags.swarmInstalled} / inRuntimeSurface=${flags.inRuntimeSurface} / bundledInPackage=${flags.bundledInPackage} ｜ 批号：${batch.id || 'b1'} ｜ ${batch.locked ? '批间待用户确认' : '同批可连派'}`);
  out.push('> ' + reading.text);
  if (problems.length) {
    out.push(`> ⛔ 不得派出：${problems.map(p => p.code + '（' + p.detail + '）').join('；')}`);
  }
  return out.join('\n');
}

function buildDispatchCard(input = {}, opts = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const problems = [];

  const statement = String(src.statement || '').trim();
  const criteria = String(src.criteria || '').trim();
  if (!statement || !criteria) problems.push({ code: 'statement-missing', detail: '命题或判据为空' });

  const base = src.baseline && typeof src.baseline === 'object' ? src.baseline : {};
  const baseMiss = D.BASELINE_REQUIRED.filter(k => base[k] == null || base[k] === '');
  if (baseMiss.length) problems.push({ code: 'baseline-missing', detail: '缺 ' + baseMiss.join(' / ') });

  const fw = D.checkFramework(src.framework);
  if (!fw.ok) problems.push({ code: 'framework-missing', detail: '缺 ' + fw.missing.join(' / ') });

  const th = D.checkThickness(src.thickness);
  if (!th.ok) problems.push({ code: 'thickness-missing', detail: '厚度 required 须为正数' });

  const lanes = D.checkLanes(src.lanes);
  if (!lanes.ok) problems.push({ code: 'lanes-cover-missing', detail: lanes.reason === 'unknown-class' ? '未知粒子类：' + (lanes.bad || []).join(' / ') : '缺掩护位粒子' });

  const b = src.batch && typeof src.batch === 'object' ? src.batch : {};
  const locked = !!(b.previous && b.previous !== b.id && b.continued !== true);
  if (locked) problems.push({ code: 'batch-locked', detail: `批 ${b.previous} → ${b.id} 未声明继续` });

  const flags = D.dispatchMode(src.flags || {});
  const waves = D.planWave({ units: src.units }).waves;
  const reading = _reading(opts.snapshot);

  const batch = { id: b.id || 'b1', previous: b.previous || null, continued: b.continued === true, locked };
  const lanesList = (Array.isArray(src.lanes) ? src.lanes : []).join(' / ') || '（未定）';
  const units = Number(src.units) > 0 ? Number(src.units) : 1;
  const card = _lines(
    _head(src, problems, flags, flags, batch, reading),
    '',
    '## 一、命题与判据',
    `- 命题：${statement || '（空）'}`,
    `- 判据：${criteria || '（空）'}`,
    '',
    '## 二、路径',
    `- 选定：${src.path && PATHS.includes(String(src.path)) ? src.path : `${src.path || '（未定）'}（四选一：${PATHS.join(' / ')}）`}`,
    '',
    '## 三、厚度',
    `- 要求：${src.thickness && Number(src.thickness.required) > 0 ? src.thickness.required : '（未定）'}`,
    '- 不达标照交，由派发人决定是否再派；不自动加码。',
    '',
    '## 四、底版与框架',
    '- 底版三项：语言 / 行为 / 流程（缺一拒派）。',
    '- 框架四项：背景 / 命题 / 轨迹口径 / 输出 schema（缺一不得派出，禁阉割版）。',
    '',
    '## 五、编队与波次',
    `- 单元：${units}（每单元 3 粒，共 ${units * 3} 粒）；正面不重叠：主责定方向 / 协同补料 / 校验复核。`,
    `- 波次：${waves.length ? waves.map(w => w.join('-')).join(' → ') : '（未定）'}（1 前出、2 展开，禁同刻全开）。`,
    '',
    '## 六、粒子与门',
    `- 粒子：${lanesList}（每批至少 1 粒掩护位；掩护位只抓不修、两边都报、红即回炉）。`,
    `- 轨迹口径：每点 ≤ ${D.TRACE_MAX} 条，只写事实 + 来源指针，拦结论全文。`,
    '- 来源分级：高 / 中 / 低 / 未分级（未分级归残渣）；高置信需 ≥2 个独立源，单源只当线索。',
    '- 攻果四件：事实 / 证据 / 分级 / 自评，缺一不发布。',
    '- 基线门：无基线不编队；打不过基线就砍。',
    '',
    '## 七、回报 schema',
    '```',
    '## 攻果回报',
    '- 命题：',
    `- 料（≤${D.TRACE_MAX} 条）：1. <事实> ｜ 出处 ｜ 分级`,
    '- 矛盾：【有/无】<内容>',
    '- 自评：信心 <高/中/低> ｜ 缺口 <...>',
    '- Verdict：<PASS 过门 / FAIL 未过门 + 原因>',
    '```',
    '- 违规情形：单点 >12 条 / 结论性措辞 / 单源未标线索 / 自行收敛 / 无基线派单 / 粒子改命题 / 四件不齐写 PASS。'
  );

  return {
    ok: problems.length === 0,
    card,
    problems,
    mode: flags.mode,
    flags: {
      swarmInstalled: flags.swarmInstalled,
      inRuntimeSurface: flags.inRuntimeSurface,
      bundledInPackage: flags.bundledInPackage
    },
    thickness: th.ok || (src.thickness && Number(src.thickness.required) > 0) ? { required: Number(src.thickness.required) } : null,
    waves,
    batch,
    reading: reading.text,
    readingStatus: reading.status,
    heads: HEADS.slice()
  };
}

module.exports = { buildDispatchCard, HEADS, PATHS, SNAPSHOT_FIELDS };
