/* ⑥ 负向自证五例。规矩：注入后先断言"注入真的生效"，再判门禁；每档用字节快照还原。 */
const fs = require('fs');
const { spawnSync } = require('child_process');
const nl = String.fromCharCode(10);
const PKG = require('path').resolve(__dirname, '..', '..');
const P = f => require('path').join(PKG, f);
const PROBE = 'docs/step-probe-tmp.md';
const run = () => {
  const r = spawnSync(process.execPath, ['verify-deploy.js'], { cwd: PKG, encoding: 'utf8', timeout: 900000, env: Object.assign({}, process.env, { VD_ONLY: 'C20', AING_NO_AUTOCOMMIT: '1' }) });
  const out = String(r.stdout).replace(/\r/g, '');
  const green = /✅ C20/.test(out), red = /❌ C20/.test(out);
  const line = (out.split(nl).find(l => /C20 文档命令可执行性/.test(l)) || '').trim();
  const why = (out.split(nl).find(l => /步」与实现真值/.test(l)) || '').trim();
  const clause = (line.match(/代谢步数 [^·]*(·[^·]*)?/) || ['未打印'])[0];
  return { code: r.status, green, red, clause, why };
};
const snap = {}, restore = f => { fs.writeFileSync(P(f), snap[f]); };
// 崩溃兜底（2026-09-17 第7号单§6-2 承诺批）：探针档残留会把注入态留给下一位读者
const __restoreOnBreak = () => { try { process.emit('exit', 0); } catch (e) {} };
for (const sig of ['SIGINT','SIGTERM']) process.on(sig, () => { __restoreOnBreak(); process.exit(130); });
process.on('exit', () => { try { if (fs.existsSync(P(PROBE))) fs.unlinkSync(P(PROBE)); } catch (e) {} try { if (snap['training/task-package.json'] && fs.existsSync(P('training/task-package.json')) && !fs.readFileSync(P('training/task-package.json')).equals(snap['training/task-package.json'])) fs.writeFileSync(P('training/task-package.json'), snap['training/task-package.json']); } catch (e) {} });
const snapIt = f => { snap[f] = fs.readFileSync(P(f)); };

console.log('【例1】基线：现行包必须绿，且序数/干扰位不误伤');
let x = run();
console.log('   ' + (x.green ? '✓ 绿' : '🔴 红（意外）') + ' · ' + x.clause);
if (x.why) console.log('   ↳ 意外点名: ' + x.why.slice(0, 120));

console.log('【例2】在 tracked 文档里注入「共 9 步代谢」⇒ 必须红并点名档与行');
if (fs.existsSync(P(PROBE))) fs.unlinkSync(P(PROBE)); // 保险：上次残留
fs.writeFileSync(P(PROBE), '# 探针档（临时）' + nl + nl + '本管线共 9 步代谢，见 run-metabolism。' + nl);
const injected = fs.readFileSync(P(PROBE), 'utf8');
console.log('   注入生效断言: ' + (/共 9 步代谢/.test(injected) ? '✓ 已在盘上' : '🔴 没写进去，本例无效'));
x = run();
console.log('   ' + (x.red ? '✓ 红' : '🔴 绿了（门无效）') + ' · 点名句: ' + (x.why || '（未点名）').slice(0, 118));
fs.unlinkSync(P(PROBE));

console.log('【例3】同一句但同行带 **历史实录** 记号 ⇒ 必须绿（豁免不是空洞也不是必然红）');
fs.writeFileSync(P(PROBE), '# 探针档（临时）' + nl + nl + '本管线共 9 步代谢，**历史实录**（探针）。' + nl);
console.log('   注入生效断言: ' + (/9 步代谢.*\*\*历史实录\*\*/.test(fs.readFileSync(P(PROBE), 'utf8')) ? '✓' : '🔴 无效'));
x = run();
console.log('   ' + (x.green ? '✓ 绿 · ' + x.clause : '🔴 红（豁免失效）: ' + (x.why || '').slice(0, 110)));
fs.unlinkSync(P(PROBE));

console.log('【例4】把 training 包题干的 11 步改回 9 步（正解位）⇒ 必须红');
snapIt('training/task-package.json');
let tj = fs.readFileSync(P('training/task-package.json'), 'utf8');
const orig11 = '"question": "11 步代谢的正确顺序是什么？"';
if (!tj.includes(orig11)) { console.log('   🔴 找不到要改的题干，跳过本例（不当通过）'); }
else {
  fs.writeFileSync(P('training/task-package.json'), tj.split(orig11).join('"question": "9 步代谢的正确顺序是什么？"'));
  console.log('   注入生效断言: ' + (/\"question\": \"9 步代谢/.test(fs.readFileSync(P('training/task-package.json'), 'utf8')) ? '✓' : '🔴 无效'));
  x = run();
  console.log('   ' + (x.red ? '✓ 红 · ' + (x.why || '').slice(0, 118) : '🔴 绿了（答案权威位没被核）'));
  restore('training/task-package.json');
  console.log('   还原字节一致: ' + (Buffer.compare(fs.readFileSync(P('training/task-package.json')), snap['training/task-package.json']) === 0 ? '✓' : '✗'));
}

console.log('【例5】收尾：探针档消失 + 全部门禁面回到基线');
console.log('   探针档存在: ' + (fs.existsSync(P(PROBE)) ? '✗ 残留' : '✓ 已删'));
x = run();
console.log('   ' + (x.green ? '✓ 复绿 · ' + x.clause : '🔴 仍红: ' + (x.why || '').slice(0, 110)));
const gs = spawnSync(process.execPath, ['tools/gate-counts.js'], { cwd: PKG, encoding: 'utf8', timeout: 300000 });
console.log('   门禁计数（须仍 32，⑥不新增门）: ' + String(gs.stdout).replace(/\r/g, '').split(nl).filter(l => /32|C0-C20/.test(l)).slice(0, 2).join(' / '));
