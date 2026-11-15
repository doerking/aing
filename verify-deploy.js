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

const failed = results.filter(r => !r.ok);
console.log('-----');
if (only) {
  console.log(`部分跑：${results.length} 项（未写验收登记）`);
} else {
  console.log(failed.length === 0 ? `✅ ${results.length} 项 ALL GREEN` : `🔴 ${failed.length}/${results.length} 项红`);
}
process.exit(failed.length ? 1 : 0);
