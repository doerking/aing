// 全仓「文档命令」清点 v2（干净版）：抽取 → 静态可执行性 → 只读类真跑
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const files = ['AGENTS.md', 'README.md', 'docs'];
const mdFiles = [];
for (const f of files) {
  const abs = path.join(ROOT, f);
  if (!fs.existsSync(abs)) continue;
  if (fs.statSync(abs).isFile()) { mdFiles.push(f); continue; }
  (function w(d, pre) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = pre ? pre + '/' + e.name : e.name;
      if (e.isDirectory()) w(path.join(d, e.name), r);
      else if (/\.(md|json)$/i.test(e.name)) mdFiles.push(r);
    }
  })(abs, f);
}
console.log('  清点面：' + mdFiles.length + ' 个文档（AGENTS/README + docs/** ）');

const cmds = [];
for (const f of mdFiles) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r/g, '').split('\n');
  lines.forEach((l, i) => {
    const cand = [];
    for (const m of l.matchAll(/`([^`\n]{5,200})`/g)) cand.push(m[1]);
    for (const m of l.matchAll(/^\s*(?:\d+[.)]\s*|[-*]\s*)?((?:npm run |node |python |powershell |cd |PYTHONPATH=|VD_ONLY=)[^\n]{0,190})$/g)) cand.push(m[1]);
    for (let c of cand) {
      c = c.trim();
      const looks = /^(npm run |node |python |powershell |cd |PYTHONPATH=|VD_ONLY=)/.test(c) || /(src|tools|scripts|training|simulation)\/[\w.\-/]+\.(js|py|ps1)/.test(c);
      if (!looks) continue;
      if (/\$\{|<.*>|…|\.\.\./.test(c) && !/python -c/.test(c)) { /* 模板命令仍需查引用路径 */ }
      const kind = /python|PYTHONPATH/.test(c) ? 'python' : /powershell/i.test(c) ? 'powershell' : /npm run /.test(c) ? 'npm-run' : /^node | node /.test(c) ? 'node' : 'other';
      const refs = (c.match(/(?:src|tools|docs|scripts|training|simulation|assets|demo)\/[\w.\-\/]+\.(?:js|py|ps1|json|md)/g) || []);
      cmds.push({ f, n: i + 1, c: c.slice(0, 150), kind, refs });
    }
  });
}
const dedup = new Map();
cmds.forEach(x => { if (!dedup.has(x.f + '|' + x.n + '|' + x.c)) dedup.set(x.f + '|' + x.n + '|' + x.c, x); });
const list = [...dedup.values()];
const byKind = {}; list.forEach(x => byKind[x.kind] = (byKind[x.kind] || 0) + 1);
console.log('  抽出 ' + list.length + ' 条命令（分类 ' + JSON.stringify(byKind) + '）');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = new Set(Object.keys(pkg.scripts || {}));
const pathBad = new Set(), npmBad = new Set(), pyLoc = new Set();
for (const x of list) {
  for (const r of x.refs) if (!fs.existsSync(path.join(ROOT, r))) pathBad.add(x.f + ':' + x.n + ' → ' + r + '   「' + x.c.slice(0, 50) + '」');
  for (const m of x.c.matchAll(/npm run ([\w:-]+)/g)) if (!scripts.has(m[1])) npmBad.add(x.f + ':' + x.n + ' → npm run ' + m[1] + ' 不在 package.json scripts');
  // python 命令必须自带执行位置（外部检出依赖）
  if (x.kind === 'python' && !/cd |检出|checkout|SkillOpt 根|在 .*跑/.test(x.c) && !/cd .*&&/.test(x.c)) {
    // 允许同行/同格说明位置：整行里有「在…跑」也算
    const line = fs.readFileSync(path.join(ROOT, x.f), 'utf8').replace(/\r/g, '').split('\n')[x.n - 1];
    if (!/检出|在 .*跑|SkillOpt 根|外部/.test(line)) pyLoc.add(x.f + ':' + x.n + ' → 无执行位置说明   「' + x.c.slice(0, 60) + '」');
  }
}
console.log('\n── ① 文档引用的包内路径不存在（lsp-server 类）：' + pathBad.size + ' 条');
[...pathBad].slice(0, 12).forEach(s => console.log('    ✗ ' + s.slice(0, 122)));
console.log('── ② `npm run X` 名字不存在：' + npmBad.size + ' 条');
[...npmBad].slice(0, 8).forEach(s => console.log('    ✗ ' + s.slice(0, 122)));
console.log('── ③ python 命令未自带执行位置（skillopt 类）：' + pyLoc.size + ' 条');
[...pyLoc].slice(0, 8).forEach(s => console.log('    ⚠ ' + s.slice(0, 122)));

console.log('\n── ④ 只读类命令真跑（改动类不在这里跑）');
const SAFE = /^(node (src\/memo\.js (--summary|--peek|--todos|)|src\/neural\.js status|tools\/gate-counts\.js|tools\/verify-sibling-roots\.js --print-face)|npm run gate-counts|node --check)/;
const safe = list.filter(x => SAFE.test(x.c));
let ok = 0, bad = 0;
for (const x of safe) {
  const args = x.c.replace(/^npm run \S+/, 'skip').replace(/^node\s+/, '').split(/\s+/).filter(Boolean);
  if (x.c.startsWith('npm run ')) { console.log('  ⏭ ' + x.c + '（npm run 由下一条 npm 直跑代替）'); continue; }
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 90000 });
  const good = r.status === 0;
  ok += good ? 1 : 0; bad += good ? 0 : 1;
  console.log('  ' + (good ? '✅' : '❌') + ' ' + x.c.slice(0, 56).padEnd(58) + ' ' + x.f + ':' + x.n + (good ? '' : '  ' + String(r.stderr).split('\n')[0].slice(0, 56)));
}
console.log('  只读真跑：成功 ' + ok + ' / 失败 ' + bad);
console.log('\n── ⑤ 需要外部依赖/改动院子故**不跑**的命令条数（这些只能靠静态与"执行位置"规则钉）：' + (list.length - safe.length));
