// C20⑤ 院际面数方向性断言的负向自证五式（2026-09-17 面化）。
// 前身 .temp/face-gate-fix2.js 把当年字面量（169/171）与 verify-deploy 施工补丁冻在脚本里，
// 文本一改版就误报「门无效」——本版全部动态锚：宣称数取自 AGENTS 现文、真值取自 --print-face 行数。
// 五式：①基线绿 ②抄件虚高必红 ③合法超额（探针+加粗记号在位）必绿 ④超额但摘掉记号必红 ⑤还原复绿且字节一致。
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const PKG = path.resolve(__dirname, '..', '..');
const nl = String.fromCharCode(10);
const AG = path.join(PKG, 'AGENTS.md');
const PROBE = path.join(PKG, 'docs', 'yard-extra-probe.md');
const faceCount = () => Number(spawnSync(process.execPath, ['tools/verify-sibling-roots.js', '--print-face'], { cwd: PKG, encoding: 'utf8', timeout: 300000 }).stdout.split(/\r?\n/).filter(Boolean).length);
const runC20 = () => {
  const r = spawnSync(process.execPath, ['verify-deploy.js'], { cwd: PKG, encoding: 'utf8', timeout: 900000, env: Object.assign({}, process.env, { VD_ONLY: 'C20' }) });
  const out = String(r.stdout + r.stderr).replace(/\r/g, '');
  const i = out.split(nl).findIndex(l => /↳/.test(l));
  return { st: r.status, why: i < 0 ? '' : out.split(nl).slice(i, i + 4).map(x => x.trim()).filter(Boolean).join(' ; ') };
};
if (!fs.existsSync(AG)) { console.log('❌ 不在包根（AGENTS.md 缺失）'); process.exit(2); }
const snap = fs.readFileSync(AG);
const __restoreOnBreak = () => { try { process.emit('exit', 0); } catch (e) {} };
for (const sig of ['SIGINT','SIGTERM']) process.on(sig, () => { __restoreOnBreak(); process.exit(130); });
process.on('exit', () => { try { if (!fs.readFileSync(AG).equals(snap)) fs.writeFileSync(AG, snap); } catch (e) { } try { if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE); } catch (e) { } });
const F = faceCount();
const cur = snap.toString('utf8').replace(/\r/g, '');
const m = cur.match(/本院实测 \*\*(\d+) 个比对文件\*\*/);
if (!m) { console.log('❌ AGENTS 找不到「本院实测 **N 个比对文件**」宣称锚 → 正文改版了，本脚本须连改（零匹配是异常不是跳过）'); process.exit(2); }
const S = Number(m[1]);
console.log('基线：宣称 ' + S + ' · --print-face 实测 ' + F);
let pass = 0, fail = 0;
const chk = (name, cond, detail) => { cond ? pass++ : fail++; console.log((cond ? '✅ ' : '❌ ') + name + (detail ? '　→ ' + detail.slice(0, 108) : '')); };
// ① 基线
chk('[1] 基线正跑必须绿', runC20().st === 0, '（若这里就红，先修基线再谈负向）');
// ② 抄件虚高
fs.writeFileSync(AG, cur.replace(m[0], m[0].replace(m[1], String(F + 2))));
let t = runC20();
chk('[2] 抄件虚高 ' + (F + 2) + '>' + F + ' 必须红并点名', t.st !== 0 && /大于本院实测/.test(t.why), t.why);
fs.writeFileSync(AG, snap);
// ③ 合法超额：本院加一件未忽略档 → own=F+1 > 宣称 S；记号在位应绿
fs.writeFileSync(PROBE, '临时探针（测完即删）：制造本院面高于宣称数的合法超额情形。\n');
if (!fs.existsSync(PROBE)) { console.log('❌ 探针没写上盘，③无意义'); fail++; }
else { t = runC20(); chk('[3] 合法超额 + 加粗记号在位必须绿', t.st === 0, t.why); }
// ④ 同样超额但摘掉记号 → 必须红
fs.writeFileSync(AG, snap.toString('utf8').split('**院属档另计**').join('（此处的加粗记号被负向测试摘掉）'));
t = runC20();
chk('[4] 超额且无加粗记号必须红', t.st !== 0 && /高于|记号/.test(t.why), t.why);
// ⑤ 全还原复绿
fs.writeFileSync(AG, snap); if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE);
t = runC20();
chk('[5] 还原后复绿 + AGENTS 字节一致 + 探针已删', t.st === 0 && fs.readFileSync(AG).equals(snap) && !fs.existsSync(PROBE), t.why);
console.log('── 负向自证 ' + pass + '/' + (pass + fail) + (fail ? ' · 有 ' + fail + ' 式不过' : ' 全过'));
process.exit(fail ? 1 : 0);
