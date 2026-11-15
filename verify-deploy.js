'use strict';
// verify-deploy.js —— aing-v2 最小门禁骨架（C0–C3）。
// 用法（本仓根）：node verify-deploy.js          # 全量
//               VD_ONLY=C1 node verify-deploy.js # 部分跑（不写验收登记）
// 铁律：任何一项红 → exit 1；无 ALL GREEN 不宣布完成。
// 后续 C4+ 按任务级规划 3.7–3.10 逐项补，编号不复用旧院。

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = __dirname;
const only = process.env.VD_ONLY ? process.env.VD_ONLY.split(',').map(s => s.trim()) : null;
const results = [];

function gate(id, name, fn) {
  if (only && !only.includes(id)) return;
  let ok = false;
  let detail = '';
  try {
    const r = fn();
    ok = r.ok;
    detail = r.detail || '';
  } catch (e) {
    detail = e.message;
  }
  results.push({ id, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
}

function runNode(script) {
  const r = spawnSync(process.execPath, [path.join(root, script)], { encoding: 'utf8', cwd: root });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// C0 目录结构契约
gate('C0', '目录结构（src/ + test/ + package.json + spec/）', () => {
  const need = ['src', 'test', 'spec', 'package.json'];
  const missing = need.filter(p => !fs.existsSync(path.join(root, p)));
  return { ok: missing.length === 0, detail: missing.length ? '缺: ' + missing.join(',') : '4/4 在位' };
});

// C1 全库测试全绿
gate('C1', 'test/run-all.js ALL GREEN', () => {
  const r = runNode('test/run-all.js');
  const m = (r.out.match(/断言 (\d+) 绿/) || [])[1] || '?';
  return { ok: r.code === 0, detail: r.code === 0 ? `${m} 条断言全绿` : '有红档，详见 run-all 输出' };
});

// C2 test 计数不减（R4）
gate('C2', 'test count guard（只加唔减）', () => {
  const r = runNode('test/count-guard.js');
  return { ok: r.code === 0, detail: r.out.trim().split('\n')[0] };
});

// C3 数据模型契约（三表 + 三轴列 + 幂等，单档真跑）
gate('C3', 'schema 契约（单档真跑 test-1.1-dataschema.js）', () => {
  const r = runNode('test/test-1.1-dataschema.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '三表 + 三轴列 + 幂等 绿' : 'schema 断言红' };
});

// C4 文档 Tolaria 9 段（SPEC-0.6 §六）
gate('C4', '全仓 md Tolaria 9 段格式', () => {
  const r = runNode('tools/doc-tags-lint.js');
  const last = r.out.trim().split('\n').slice(-1)[0];
  return { ok: r.code === 0, detail: last };
});

// C5 组件唔直连 store（SPEC-1.15 §四）
gate('C5', 'arch-lint：组件唔直连 knowledge-store', () => {
  const r = runNode('tools/arch-lint.js');
  const last = r.out.trim().split('\n').slice(-1)[0];
  return { ok: r.code === 0, detail: last };
});

// ── 3.7：C6–C9 适配（v2 组件映射）──────────────────────────────

// C6 语义/向量检索冒烟
gate('C6', 'vector 检索冒烟（强度加权 + 词面回退）', () => {
  const r = runNode('test/test-1.8-vector.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '检索冒烟绿' : '检索断言红' };
});

// C7a KESPI 生命周期一致
gate('C7a', 'KESPI 八维读数一致', () => {
  const r = runNode('test/test-1.12-kespi.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '八维读数绿' : 'KESPI 断言红' };
});

// C7b 基因谱系指纹（演化可回滚）
gate('C7b', '基因谱系指纹（lineage 可回滚）', () => {
  const r = runNode('test/test-2.15-evolution-cycle.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '谱系可回滚绿' : '谱系断言红' };
});

// C8 硬编码盘符扫描
gate('C8', '硬编码盘符扫描（redaction gate）', () => {
  const bad = [];
  const scan = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (!['node_modules', '.git', '.temp'].includes(name)) scan(p); continue; }
      if (!name.endsWith('.js') && !name.endsWith('.md') && !name.endsWith('.json')) continue;
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      lines.forEach((l, i) => { if (/[A-Za-z]:[\\/](DPD|Users|Temp|temp)/.test(l)) bad.push(path.relative(root, p) + ':' + (i + 1)); });
    }
  };
  for (const d of ['src', 'test', 'spec', 'tools']) if (fs.existsSync(path.join(root, d))) scan(path.join(root, d));
  return { ok: bad.length === 0, detail: bad.length ? '硬编码: ' + bad.slice(0, 3).join(', ') : '零硬编码盘符' };
});

// C9a 组件登记簿 ↔ 代谢链双向一致
gate('C9a', '组件登记簿 ↔ STEPS 双向一致', () => {
  const m = require('./src/metabolism.js');
  const steps = new Set(m.DEFAULT_STEPS);
  const reg = new Set(Object.keys(m.REGISTRY));
  const missingReg = [...steps].filter(x => !reg.has(x));
  const missingStep = [...reg].filter(x => !steps.has(x));
  const broken = [];
  for (const [id, spec] of Object.entries(m.REGISTRY)) {
    let mod = null;
    try { mod = require('./src/' + spec.module.replace('./', '')); } catch (e) { broken.push(id + ':模块缺'); continue; }
    if (typeof mod[spec.fn] !== 'function') broken.push(id + ':入口缺');
  }
  const ok = !missingReg.length && !missingStep.length && !broken.length;
  return { ok, detail: ok ? `${reg.size} 步双向一致` : `登记缺:${missingReg} 链缺:${missingStep} 坏:${broken}` };
});

// C9b 文档引用存在（STATUS 中 spec 路径全在位）
gate('C9b', '文档引用存在（STATUS spec 路径全在位）', () => {
  const text = fs.readFileSync(path.join(root, 'STATUS.md'), 'utf8');
  const refs = [...text.matchAll(/spec\/(SPEC-[^\s`|]+\.md)/g)].map(m => m[1]);
  const missing = [...new Set(refs)].filter(f => !fs.existsSync(path.join(root, 'spec', f)));
  return { ok: missing.length === 0, detail: missing.length ? '缺: ' + missing.join(',') : `${new Set(refs).size} 处引用在位` };
});

// C9c 用户面 schema 完整
gate('C9c', '用户面 schema（memo 五字段 + 系统行上限）', () => {
  const m = require('./src/memo.js');
  const ok = typeof m.buildMemo === 'function' && Number.isFinite(m.SYSTEM_LINE_MAX) && m.SYSTEM_LINE_MAX <= 80;
  return { ok, detail: ok ? `buildMemo + systemLine≤${m.SYSTEM_LINE_MAX}` : 'memo 契约缺' };
});

// ── 3.8：C10a–C10i 适配 ────────────────────────────────────────

// C10a 绿名单视图同步（baseline ↔ test 文件双射）
gate('C10a', '绿名单视图同步（baseline ↔ test 双射）', () => {
  const base = JSON.parse(fs.readFileSync(path.join(root, 'test', 'baseline.json'), 'utf8'));
  const files = fs.readdirSync(path.join(root, 'test')).filter(f => /^test-.*\.js$/.test(f));
  const missingFile = Object.keys(base).filter(f => !files.includes(f));
  const missingBase = files.filter(f => !(f in base));
  const ok = !missingFile.length && !missingBase.length;
  return { ok, detail: ok ? `${files.length} 档双射` : `文件缺:${missingFile} 基线缺:${missingBase}` };
});

// C10b 面板读数一致（memo 与库同源）
gate('C10b', '面板读数一致（memo 与库同源）', () => {
  const r = runNode('test/test-3.11-memo.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '读数一致绿' : '读数断言红' };
});

// C10c distill 写路径可用
gate('C10c', 'distill 写路径可用（临时库真写）', () => {
  const r = runNode('test/test-1.5-distill.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '蒸馏真写绿' : '蒸馏断言红' };
});

// C10d 旋钮模板同构（DEFAULTS ↔ KNOB_PATHS ↔ COMPONENT_MAP）
gate('C10d', '旋钮模板同构（默认值 ↔ 路径 ↔ 组件映射）', () => {
  const c = require('./src/config-runtime.js');
  const bad = [];
  for (const p of c.KNOB_PATHS) {
    const [g, k] = p.split('.');
    if (!c.DEFAULTS[g] || !(k in c.DEFAULTS[g])) bad.push('无默认:' + p);
    if (!Object.values(c.COMPONENT_MAP).some(list => list.includes(p))) bad.push('无组件:' + p);
  }
  for (const [comp, list] of Object.entries(c.COMPONENT_MAP)) {
    for (const p of list) if (!c.KNOB_PATHS.includes(p)) bad.push(comp + ' 引用未知旋钮:' + p);
  }
  return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 3).join('; ') : `${c.KNOB_PATHS.length} 旋钮三面同构` };
});

// C10e 库内引用完整性
gate('C10e', '库内引用完整性（孤儿行零残留）', () => {
  const r = runNode('tools/db-integrity.js');
  return { ok: r.code === 0, detail: r.out.trim().split('\n').slice(-1)[0] };
});

// C10f 已砍组件防复活
gate('C10f', '已砍组件防复活', () => {
  const banned = /require\([^)]*(tenant|guardrails|meko-board|approvals-pending|neural-guide-chain|superagent)/i;
  const hits = [];
  for (const f of fs.readdirSync(path.join(root, 'src')).filter(x => x.endsWith('.js'))) {
    fs.readFileSync(path.join(root, 'src', f), 'utf8').split('\n').forEach((l, i) => { if (banned.test(l)) hits.push(f + ':' + (i + 1)); });
  }
  return { ok: hits.length === 0, detail: hits.length ? hits.join(',') : '零复活引用' };
});

// C10g 会话入库端到端契约
gate('C10g', '会话入库端到端契约（三源 ↔ 身份）', () => {
  const r = runNode('test/test-3.5-auto-ingest.js');
  const r2 = runNode('test/test-3.13-session-ingest.js');
  return { ok: r.code === 0 && r2.code === 0, detail: r.code === 0 && r2.code === 0 ? '入库契约绿' : '入库契约红' };
});

// C10h 采集过程剥除（真剥净）
gate('C10h', '采集过程剥除（痕迹零残留）', () => {
  const script = "const S=require('./src/ingest-scrub.js');const r=S.scrubCollectionTrace('引用:1\\n来源: x\\n正文[cite: 2]\\n【检索】尾');if(r.scrubbed<3)process.exit(2);if(/引用[:：]\\s*\\d|\\[cite|【检索】/.test(r.text))process.exit(3);console.log('剥除 '+r.scrubbed+' 处，零残留');";
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', cwd: root });
  return { ok: r.status === 0, detail: (r.stdout || r.stderr || '').trim().split('\n').slice(-1)[0] };
});

// C10i 写面身份闸 + 标签闸
gate('C10i', '写面身份闸 + 标签闸', () => {
  const r = runNode('test/test-3.6-api-gate.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '身份/标签双闸绿' : '写面闸红' };
});

// ── 3.9：C11–C19 适配 ─────────────────────────────────────────

// C11 最后一米（memo + 入库模块无 server 可用）
gate('C11', '最后一米（memo/入库无 server 可用）', () => {
  const a = runNode('test/test-3.11-memo.js');
  const b = runNode('test/test-3.13-session-ingest.js');
  return { ok: a.code === 0 && b.code === 0, detail: a.code === 0 && b.code === 0 ? '模块直用绿' : '模块直用红' };
});

// C12 memo 三块（以往/未闭环/模式）
gate('C12', 'memo 三块（以往/未闭环/模式）', () => {
  const r = runNode('test/test-3.11-memo.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '三块齐' : 'memo 断言红' };
});

// C13 代谢不替用户提交
gate('C13', '代谢不替用户提交（零 git 写端）', () => {
  const hits = [];
  for (const f of fs.readdirSync(path.join(root, 'src')).filter(x => x.endsWith('.js'))) {
    fs.readFileSync(path.join(root, 'src', f), 'utf8').split('\n').forEach((l, i) => {
      if (/child_process|execSync|spawnSync|git\s+(add|commit|push)/.test(l)) hits.push(f + ':' + (i + 1));
    });
  }
  return { ok: hits.length === 0, detail: hits.length ? hits.join(',') : '零提交写端' };
});

// C14 意识层闭环写端
gate('C14', '意识层闭环写端（停滞计数自爬）', () => {
  const r = runNode('test/test-3.1-consciousness-kernel.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '闭环自爬绿' : '闭环断言红' };
});

// C15 控制面真接
gate('C15', '控制面真接（CLI + HTTP 四路由）', () => {
  const r = runNode('test/test-3.2-control-plane.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '四路由绿' : '控制面红' };
});

// C16 读端纯读
gate('C16', '读端纯读（读表不扰表）', () => {
  const r = runNode('test/test-3.11-memo.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '纯读绿' : '纯读断言红' };
});

// C17 离散旋钮单源
gate('C17', '离散旋钮单源（改 config 真变行为）', () => {
  const r = runNode('test/test-3.4-config-runtime.js');
  return { ok: r.code === 0, detail: r.code === 0 ? '改即生效绿' : '旋钮断言红' };
});

// C18 随包依赖不虚报（三员编组 + 依赖声明一致）
gate('C18', '随包依赖不虚报（编组齐 + 依赖声明一致）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const deps = new Set(Object.keys(pkg.dependencies || {}));
  const used = new Set();
  for (const f of fs.readdirSync(path.join(root, 'src')).filter(x => x.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(root, 'src', f), 'utf8');
    for (const m of text.matchAll(/require\(\s*['"]([^'".][^'"]*)['"]\s*\)/g)) {
      const id = m[1].startsWith('node:') ? m[1].slice(5) : m[1].split('/')[0];
      if (!require('module').builtinModules.includes(id)) used.add(id);
    }
  }
  const undeclared = [...used].filter(u => !deps.has(u));
  const ds = require('./src/dispatch-swarm.js');
  const teamOk = typeof ds.DispatchDesk === 'function' && (ds.BASELINE_REQUIRED || []).length === 3;
  const ok = undeclared.length === 0 && teamOk;
  return { ok, detail: ok ? '依赖声明一致 + 编组三件齐' : `未声明:${undeclared} 编组:${teamOk}` };
});

// C19 门禁计数单源
gate('C19', '门禁计数单源（文档数字 = 验收器真值）', () => {
  const run = runNode('test/run-all.js');
  const fm = run.out.match(/----- (\d+) 档 \/ 断言 (\d+) 绿/);
  if (!fm) return { ok: false, detail: 'run-all 无计数行' };
  const files = Number(fm[1]); const asserts = Number(fm[2]);
  const docs = ['STATUS.md', 'AGENT.md'].map(f => ({ f, text: fs.readFileSync(path.join(root, f), 'utf8') }));
  const bad = [];
  for (const d of docs) {
    for (const m of d.text.matchAll(/(\d+) 档 \/ (\d+) 条?断言/g)) {
      if (Number(m[1]) !== files || Number(m[2]) !== asserts) bad.push(`${d.f}: ${m[1]}/${m[2]}`);
    }
  }
  const base = JSON.parse(fs.readFileSync(path.join(root, 'test', 'baseline.json'), 'utf8'));
  const sum = Object.values(base).reduce((a, b) => a + b, 0);
  if (sum !== asserts) bad.push(`baseline 合计 ${sum} ≠ ${asserts}`);
  return { ok: bad.length === 0, detail: bad.length ? bad.join('; ') : `${files} 档 / ${asserts} 条，文档与基线三处一致` };
});

// ── 3.10：C20–C21 适配 ───────────────────────────────────────

// C20 文档命令可执行性（✅ 可用行的路径/脚本真在）
gate('C20', '文档命令可执行性（引用路径/脚本在位）', () => {
  const text = fs.readFileSync(path.join(root, 'AGENT.md'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const missing = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('|') || !/✅ 可用/.test(line)) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const cmd = m[1].trim();
      if (cmd.startsWith('node ')) {
        const target = cmd.split(/\s+/)[1];
        if (target && !fs.existsSync(path.join(root, target))) missing.push(target);
      }
      if (cmd.startsWith('npm run ')) {
        const s = cmd.split(/\s+/)[2];
        if (s && !(pkg.scripts && pkg.scripts[s])) missing.push('npm script ' + s);
      }
    }
  }
  const r = runNode('src/neural.js');
  const cliOk = r.code === 0;
  return { ok: missing.length === 0 && cliOk, detail: missing.length ? '缺: ' + missing.join(',') : (cliOk ? '命令真跑绿' : 'CLI 真跑红') };
});

// C21 Tolaria 9 段（基线文档不许消失，全量重扫）
gate('C21', 'Tolaria 9 段标签面（基线文档只增不减）', () => {
  const r = runNode('tools/doc-tags-lint.js');
  const ledger = path.join(root, 'tools', 'doc-tags-baseline.json');
  if (!fs.existsSync(ledger)) return { ok: false, detail: '缺基线 tools/doc-tags-baseline.json' };
  const base = JSON.parse(fs.readFileSync(ledger, 'utf8')).files || [];
  const missing = base.filter(f => !fs.existsSync(path.join(root, f)));
  return { ok: r.code === 0 && missing.length === 0, detail: missing.length ? '文档消失: ' + missing.join(',') : (r.code === 0 ? '全绿 + 基线在位' : '标签面红') };
});

const failed = results.filter(r => !r.ok);
console.log('-----');
if (only) {
  console.log(`部分跑：${results.length} 项（未写验收登记）`);
} else {
  console.log(failed.length === 0 ? `✅ ${results.length} 项 ALL GREEN` : `🔴 ${failed.length}/${results.length} 项红`);
}
process.exit(failed.length ? 1 : 0);
