// gen-greenlist-md.js — 从 greenlist.json 重新生成 GREEN-LIST.md（JSON→视图单向流）
const fs = require('fs');
const path = require('path');
const G = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'greenlist.json'), 'utf8'));
const lines = [];
lines.push('# aing 绿灯清单 / Green List（自动生成，勿手改）');
lines.push('');
lines.push('> 真源：`docs/greenlist.json`（结构化）。本文件是生成视图；改动先改 JSON，再运行 `node tools/gen-greenlist.js`。');
lines.push('> Agents 渲染面板请直接读 JSON；未列出的能力一律不得对外承诺。');
lines.push('');
lines.push(`## 绿灯能力（${G.green.length} 项，截至 ${G._meta.updated}）`);
lines.push('');
for (const g of G.green) {
  lines.push(`- ✅ **${g.cap}**`);
  lines.push(`  - 证据：${g.evidence}（${g.date}）`);
}
lines.push('');
lines.push(`## 明确未解锁（${G.locked.length} 项，禁止承诺）`);
lines.push('');
for (const l of G.locked) {
  lines.push(`- ⬜ ${l.item} — ${l.note}`);
}
lines.push('');
lines.push('## 维护规则');
lines.push('');
lines.push('1. 新绿灯项：影子验证全绿 → 同步主包 → 复验 → 改 JSON（附证据）→ 重生成本文件。');
lines.push('2. 发现失效：立即把该项移入 locked，并在 DEPLOY-CHECK 记录失效原因。');
lines.push('3. 本清单是用户可见能力列表的唯一真源；README/AGENTS 的能力声明与之冲突时，以 JSON 为准。');
lines.push('');
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'GREEN-LIST.md'), lines.join('\r\n'));
console.log('✍️  GREEN-LIST.md 重新生成 (green=' + G.green.length + ', locked=' + G.locked.length + ')');
