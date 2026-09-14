// gen-greenlist.js — 从 greenlist.json 重新生成 GREEN-LIST.md（JSON→视图单向流）
// 用法：node tools/gen-greenlist.js          # 重生成视图
//       node tools/gen-greenlist.js --check # 只校验视图是否与真源一致（verify-deploy C10a 复用，不写盘）
const fs = require('fs');
const path = require('path');

function loadGreenlist() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'greenlist.json'), 'utf8'));
}

function assertSchema(G) {
  // Schema 断言：绿灯项 cap/evidence/date 必填（缺失曾渲染出 undefined 进"唯一真源"视图，2026-09-08 教训）
  for (const [i, g] of G.green.entries()) {
    for (const k of ['cap', 'evidence', 'date']) {
      if (!g[k] || typeof g[k] !== 'string' || !g[k].trim()) {
        console.error(`❌ greenlist.json green[${i}] (id=${g.id || '?'}) 缺必填字段 "${k}" —— 先修 JSON 再生成`);
        process.exit(1);
      }
    }
  }
  for (const [i, l] of G.locked.entries()) {
    if (!l.item || !String(l.item).trim()) {
      console.error(`❌ greenlist.json locked[${i}] 缺 "item"`);
      process.exit(1);
    }
  }
}

/** 渲染视图正文（模板唯一存此处，门禁与生成共用）/ single template for both generate and gate */
function render(G = loadGreenlist()) {
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
  lines.push('4. 本文件由脚本生成，禁止手改；门禁 C10a 会比较视图与 JSON，不一致即红。');
  lines.push('');
  return lines.join('\r\n');
}

/** 提取目标文件已有的 YAML frontmatter（含 AIGC 合规水印块）/ keep existing frontmatter */
function extractFrontmatter(text) {
  if (!text) return '';
  const re = /^---[^\u0000]*?\n---\n?/;
  const s = String(text).replace(/\r\n/g, '\n');
  const m = s.match(re);
  return m ? m[0] : '';
}

/**
 * 视图 = 原有 frontmatter + 生成正文。
 * 教训（2026-09-14）：早先版本从零写文件，重生成一次就把 docs/GREEN-LIST.md 的 AIGC 合规水印
 * frontmatter 整块剥掉——生成器不得拥有删除合规元数据的能力，只透传。
 */
function compose(body, existingText) {
  const fm = extractFrontmatter(existingText).replace(/\n/g, '\r\n');
  return fm + body;
}

function outPath() { return path.join(__dirname, '..', 'docs', 'GREEN-LIST.md'); }

if (require.main === module) {
  const G = loadGreenlist();
  assertSchema(G);
  const body = render(G);
  const existing = fs.existsSync(outPath()) ? fs.readFileSync(outPath(), 'utf8') : '';
  const final = compose(body, existing);
  if (process.argv.includes('--check')) {
    if (!existing) { console.error('❌ 缺 docs/GREEN-LIST.md → node tools/gen-greenlist.js'); process.exit(1); }
    const norm = s => s.replace(/\r\n/g, '\n');
    if (norm(existing) !== norm(final)) {
      console.error('❌ GREEN-LIST.md 与 greenlist.json 不一致（视图被手改或 JSON 改后未重生成）→ node tools/gen-greenlist.js');
      process.exit(1);
    }
    console.log('✅ GREEN-LIST.md 与真源一致 (green=' + G.green.length + ', locked=' + G.locked.length + ')');
    process.exit(0);
  }
  fs.writeFileSync(outPath(), final, 'utf8');
  console.log('✍️  GREEN-LIST.md 重新生成 (green=' + G.green.length + ', locked=' + G.locked.length + ')'
    + (extractFrontmatter(existing) ? '，frontmatter 已透传保留' : '，注意：目标文件原无 frontmatter'));
}

module.exports = { render, loadGreenlist, assertSchema, compose, extractFrontmatter };
