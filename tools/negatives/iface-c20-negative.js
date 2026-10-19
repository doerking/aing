// C20「外部接口登记表 + 正本接线节」子检查的负向自证（六式，含探针 opt-in 绿式）。
// 手法同 c20-negative3.js：快照正本 → 逐式注入 → 断言（红得对/绿得住）→ 还原 → 基线复绿 → 门数不变。
// 关键约束：本脚本**只改正本档 docs/DEPLOY-PLAYBOOK.md**，绝不动 verify-deploy.js 源码
// （改验收器自己 = 给自己判绿，纪律 8）。外部接口登记表的真源在 verify-deploy.js C20 段。
const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');
const PKG = path.resolve(__dirname, '..', '..');
const PLAY = path.join(PKG, 'docs', 'DEPLOY-PLAYBOOK.md');
const nl = String.fromCharCode(10);
const runC20 = (extraEnv) => {
  const r = spawnSync(process.execPath, ['verify-deploy.js'], {
    cwd: PKG, encoding: 'utf8', env: { ...process.env, VD_ONLY: 'C20', ...(extraEnv || {}) }, timeout: 900000,
  });
  return { code: r.status, out: String(r.stdout + r.stderr).replace(/\r/g, '') };
};
const snap = {};
const keep = p => { snap[p] = fs.readFileSync(p); };
const restore = p => { fs.writeFileSync(p, snap[p]); };
const cur = () => fs.readFileSync(PLAY, 'utf8').replace(/\r/g, '');
keep(PLAY);
// 崩溃/中断兜底（同 c20-negative3：还原正本）
const __restoreOnBreak = () => { try { if (!Buffer.compare(fs.readFileSync(PLAY), snap[PLAY])) fs.writeFileSync(PLAY, snap[PLAY]); } catch (e) { } process.emit('exit', 0); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { __restoreOnBreak(); process.exit(130); });
process.on('exit', () => { try { if (!Buffer.compare(fs.readFileSync(PLAY), snap[PLAY])) fs.writeFileSync(PLAY, snap[PLAY]); } catch (e) { } });

const cases = [
  { name: '① 基线绿：正本 3 节 ↔ 表 3 条自洽', inject: () => true, verify: () => true, want: '外部接口 3 个', green: true },
  { name: '② 空头：删正本 m4-proof 节（表有正本无 → 接线缺失）',
    inject: () => { let L = cur().split(nl); const i = L.findIndex(l => /^###\s*接口[:：]\s*m4-proof/.test(l)); if (i < 0) throw new Error('锚没找到'); let j = i + 1; while (j < L.length && !/^#{2,3}\s/.test(L[j])) j++; L.splice(i, j - i); fs.writeFileSync(PLAY, L.join(nl)); },
    verify: () => !/^###\s*接口[:：]\s*m4-proof/m.test(cur()), want: 'm4-proof', green: false },
  { name: '③ 缺格：deploy-config 节删掉「怎么接」行（只留标题/半格）',
    inject: () => { let L = cur().split(nl); const i = L.findIndex(l => /^###\s*接口[:：]\s*deploy-config/.test(l)); if (i < 0) throw new Error('锚没找到'); let k = -1; for (let a = i + 1; a < L.length; a++) { if (/^###\s*接口/.test(L[a])) break; if (/\*\*怎么接\*\*/.test(L[a])) { k = a; break; } } if (k < 0) throw new Error('怎么接行没找到'); L.splice(k, 1); fs.writeFileSync(PLAY, L.join(nl)); },
    verify: () => { const idx = cur().indexOf('### 接口: deploy-config'); const e = cur().indexOf('\n### 接口:', idx + 10); const seg = cur().slice(idx, e > idx ? e : cur().length); return !/怎么接/.test(seg); }, want: '怎么接', green: false },
  { name: '④ 陈接口：正本加未登记的 ### 接口: ghost-x（正本有表里无）',
    inject: () => { fs.writeFileSync(PLAY, cur() + nl + '### 接口: ghost-x' + nl + '- 怎么接：x' + nl + '- 缺席语义：x' + nl); },
    verify: () => /###\s*接口[:：]\s*ghost-x/.test(cur()), want: 'ghost-x', green: false },
  { name: '⑤ 未登记的死引用照旧红（加一行 tools/lsp-server.js 无标记）',
    inject: () => { fs.writeFileSync(PLAY, cur() + nl + '（探针：证据见 tools/lsp-server.js）' + nl); },
    verify: () => /tools\/lsp-server\.js/.test(cur()), want: 'lsp-server', green: false },
  { name: '⑥ skillopt 探针开（VD_SKILLOPT_PROBE=1）仍绿、只报状态（接不接不影响门禁）',
    inject: () => true, verify: () => true, want: 'skillopt 探针', green: true, probe: true },
];
let pass = 0, fail = 0;
for (const c of cases) {
  let injOk;
  try { injOk = c.inject(); } catch (e) { console.log('  ✗ ' + c.name + ' → 注入本身失败: ' + e.message); fail++; restore(PLAY); continue; }
  if (injOk === false) { console.log('  ✗ ' + c.name + ' → 注入未生效（此判无意义）'); fail++; restore(PLAY); continue; }
  const r = c.green ? runC20(c.probe ? { VD_SKILLOPT_PROBE: '1' } : undefined) : runC20();
  const ok = c.green ? (r.code === 0 && r.out.includes(c.want)) : (r.code !== 0 && r.out.includes(c.want));
  console.log('  ' + (ok ? '✅ 判得对' : '❌ 没判对') + ' ｜ ' + c.name + '（退出码 ' + (r.code === 0 ? 0 : r.code) + '）');
  if (ok) pass++;
  else { fail++; console.log('     ↳ 期望「' + (c.green ? '绿' : '红') + ' 且点名 ' + c.want + '」，实际片段: ' + r.out.split(nl).filter(l => /接口|死链|缺|lsp|skillopt|探针/.test(l)).map(x => x.trim().slice(0, 110)).slice(-3).join(' ⧸ ')); }
  restore(PLAY);
}
// ⑦ 还原校验 + 门数不变
console.log('── 还原校验: 正本与注入前逐字节一致 ' + (Buffer.compare(fs.readFileSync(PLAY), snap[PLAY]) === 0 ? '✓' : '✗'));
const base = runC20();
console.log('── 还原后基线: ' + (base.code === 0 ? '✅ C20 复绿' : '🔴 还原后仍红（还原不彻底！）'));
const g = spawnSync(process.execPath, ['tools/gate-counts.js', '--print'], { cwd: PKG, encoding: 'utf8', timeout: 120000 });
console.log('── 门数: ' + (String(g.stdout).trim().replace(/\n/g, ' ') || '(gate-counts 未跑出)'));
console.log('   负向自证 ' + pass + '/' + (pass + fail) + (fail ? ' · 有 ' + fail + ' 式不过' : ' 全过'));
