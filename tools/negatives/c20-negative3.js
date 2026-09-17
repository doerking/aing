// C20 图↔表一致子检查的负向自证：三式各注入 → 断言注入生效 → 期望红且点名 → 逐档还原
const fs = require('fs'), { spawnSync } = require('child_process');
const nl = String.fromCharCode(10);
const path = require('path');
const PKG = path.resolve(__dirname, '..', '..');
const README = path.join(PKG, 'README.md'), SVG = path.join(PKG, 'docs', 'lineage.svg');
// ③式旧版从机内备份复制退役 svg——跨院不存在该路径，改为自产探针档（悬档判据只看文件在不在，内容无关）
const snap = {};
const keep = p => { snap[p] = fs.existsSync(p) ? fs.readFileSync(p) : null; };
const restore = p => { if (snap[p] === null) { if (fs.existsSync(p)) fs.unlinkSync(p); } else fs.writeFileSync(p, snap[p]); };
const runC20 = () => {
  const r = spawnSync(process.execPath, ['verify-deploy.js'], { cwd: PKG, encoding: 'utf8', env: { ...process.env, VD_ONLY: 'C20' }, timeout: 900000 });
  return { code: r.status, out: String(r.stdout + r.stderr).replace(/\r/g, '') };
};
const cases = [
  { name: '① 图里删掉「🏗️ 工程层」整支（复现报告点名的漂移）', must: '🏗️ 工程层', want: 'README 架构图与谱系表脱节，图里缺层: 工程层',
    inject: () => { let L = fs.readFileSync(README, 'utf8').replace(/\r/g, '').split(nl); const i = L.findIndex(l => /^ {4}🏗️ 工程层$/.test(l)); if (i < 0) throw new Error('注入锚没找到'); let j = i + 1; while (j < L.length && /^ {6,}\S/.test(L[j])) j++; L.splice(i, j - i); fs.writeFileSync(README, L.join(nl)); },
    verify: () => !fs.readFileSync(README, 'utf8').split(nl).some(l => /^ {4}\S.*工程层$/.test(l)) },
  { name: '② 把已退役的 docs/lineage.svg 引用塞回 README', must: 'Architecture Lineage', want: '勿复活旧资产',
    inject: () => { let L = fs.readFileSync(README, 'utf8').replace(/\r/g, '').split(nl); const i = L.findIndex(l => l.trim() === '```mermaid'); if (i < 0) throw new Error('注入锚没找到'); L.splice(i, 0, '![Architecture Lineage](docs/lineage.svg)', ''); fs.writeFileSync(README, L.join(nl)); },
    verify: () => fs.readFileSync(README, 'utf8').includes('![Architecture Lineage](docs/lineage.svg)') },
  { name: '③ 图不引用但文件留在包内（悬档）', must: '悬档', want: '勿留悬档',
    inject: () => { fs.writeFileSync(SVG, '<svg><text>负向自证探针（悬档注入用），非包内容</text></svg>' + nl); },
    verify: () => fs.existsSync(SVG) },
  { name: '④ 把 mindmap 改成 flowchart（一致性检查会静默失效 → 必须红）', must: 'flowchart', want: '不再是 mindmap',
    inject: () => { let L = fs.readFileSync(README, 'utf8').replace(/\r/g, '').split(nl); const i = L.findIndex(l => l.trim() === 'mindmap'); if (i < 0) throw new Error('注入锚没找到'); L[i] = '  flowchart TD'; fs.writeFileSync(README, L.join(nl)); },
    verify: () => fs.readFileSync(README, 'utf8').includes('flowchart TD') },
];
let pass = 0, fail = 0;
keep(README); keep(SVG);
for (const c of cases) {
  try { c.inject(); } catch (e) { console.log('  ✗ ' + c.name + ' → 注入本身失败: ' + e.message); fail++; restore(README); restore(SVG); continue; }
  const took = c.verify();
  if (!took) { console.log('  ✗ ' + c.name + ' → 注入未生效（此判无意义，不算门有效）'); fail++; restore(README); restore(SVG); continue; }
  const r = runC20();
  const hit = r.code !== 0 && r.out.includes(c.want);
  console.log('  ' + (hit ? '✅ 红得对' : '❌ 没红/红错') + ' ｜ ' + c.name + '（注入生效 ✓，退出码 ' + r.code + '）');
  if (hit) pass++; else { fail++; console.log('     ↳ 期望点名「' + c.want + '」，实际: ' + r.out.split(nl).filter(l => /C20|缺层|复活|悬档|mindmap/.test(l)).map(x => x.trim().slice(0, 130)).slice(-2).join(' ⧸ ')); }
  restore(README); restore(SVG);
}
console.log('── 还原校验: README 与注入前一致 ' + (Buffer.compare(fs.readFileSync(README), snap[README]) === 0 ? '✓' : '✗') + ' · svg 已回无 ' + (!fs.existsSync(SVG) ? '✓' : '✗'));
const base = runC20();
console.log('── 还原后基线: ' + (base.code === 0 ? '✅ C20 复绿' : '🔴 还原后仍红（还原不彻底！）'));
console.log('   负向自证 ' + pass + '/' + (pass + fail) + (fail ? ' · 有 ' + fail + ' 式不过' : ' 全过'));
