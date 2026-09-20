// C10d 缺键负向自证（2026-09-17 面化，取自 .temp/c10d-final.js 之①；②③属当时施工件不入面）
// 行为：删掉运行配置里一个「模板也有」的标量键 → C10d 必须咬住并点名叶子路径；随后字节还原。
// 规矩同全组：先断言注入真的生效再判门禁；键找不到=异常（exit 2），不当通过。
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const PKG = path.resolve(__dirname, '..', '..');
const nl = String.fromCharCode(10);
const RP = path.join(PKG, 'src', 'growth.config.js');
const KEY = 'dedupeWindowSeconds'; // 双院运行配置与模板共有的 distill 段标量键（2026-09-17 实测在位）
if (!fs.existsSync(RP)) { console.log('❌ 无运行配置（先走 C0：cp growth.config.example.js src/growth.config.js）'); process.exit(2); }
const orig = fs.readFileSync(RP);
const L = orig.toString('utf8').replace(/\r/g, '').split(nl);
const i = L.findIndex(l => new RegExp('^\\s+' + KEY + ':').test(l));
if (i < 0) { console.log('❌ 运行配置里没有 ' + KEY + ' 键 → 注入锚失效，本判无意义，改脚本连这里一起修'); process.exit(2); }
process.on('exit', () => { try { if (!fs.readFileSync(RP).equals(orig)) fs.writeFileSync(RP, orig); } catch (e) { } });
L.splice(i, 1);
fs.writeFileSync(RP, L.join(nl));
const took = !new RegExp('^\\s+' + KEY + ':', 'm').test(fs.readFileSync(RP, 'utf8'));
const chk = spawnSync(process.execPath, ['--check', RP], { encoding: 'utf8' });
console.log('   注入生效: ' + (took ? '✓ 已从盘上删掉' : '🔴 没删掉，本判无效') + ' · 注入后语法 ' + (chk.status === 0 ? '✓' : '✗'));
const r = spawnSync(process.execPath, ['verify-deploy.js'], { cwd: PKG, encoding: 'utf8', timeout: 900000, env: Object.assign({}, process.env, { VD_ONLY: 'C10d' }) });
const hint = (String(r.stdout).replace(/\r/g, '').match(/模板与运行配置漂移[^\n]{0,150}/) || [''])[0];
const bit = r.status !== 0 && !!hint;
console.log('   C10d: ' + (bit ? '✅ 咬住并点名 → ' + hint.slice(0, 108) : '❌ 缺键被放过或没点名（退出码 ' + r.status + '）'));
fs.writeFileSync(RP, orig);
console.log('   还原字节一致: ' + (fs.readFileSync(RP).equals(orig) ? '✓' : '✗'));
process.exit(bit ? 0 : 1);
