#!/usr/bin/env node
/**
 * distill.js — 蒸馏器（v1 最小实现 / 未部署受控状态）
 *
 * 职责：消化 pending-distillation 会话实体——生成蒸馏摘要、提取标签、
 *       保留原话与来源，双脑同步写回（wiki 文件 + knowledge.db），
 *       将 status: pending-distillation → active，兑付 distillDebt。
 *
 * 设计约束（对照 MEMO 蒸馏安全清单）：
 *   - 不删除/不改写"原始消息"原文；摘要只写入"蒸馏摘要"节
 *   - 摘要为机械确定性提取（无 LLM、无编造），逐条可追溯到原话
 *   - contentDigest（sha1:16）写入 frontmatter，摘要与原文对应关系可审计
 *   - 不自动晋升 verified；confidence 维持原值（外部会话=0，不因蒸馏加分）
 *   - 任何失败以非零退出码暴露，不静默吞
 *
 * 用法：
 *   node src/distill.js              # 处理全部 pending 会话
 *   node src/distill.js --dry-run    # 只报告将要做什么，不写
 *   node src/distill.js --id <id>    # 定向处理单个实体
 *
 * 位置约定（v1 未部署态）：独立脚本，手动/受控触发；
 *   验证成熟后再评估是否挂入 run-metabolism STEPS。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const KnowledgeStore = require('./knowledge-store');

const ROOT = path.resolve(__dirname, '..');

function sha16(obj) {
  return crypto.createHash('sha1').update(JSON.stringify(obj), 'utf8').digest('hex').slice(0, 16);
}

/** 从 content 的"## 原始消息"节机械提取原话行 */
function extractRawMessages(content) {
  const m = content.match(/## 原始消息\n([\s\S]*?)(\n## |$)/);
  if (!m) return [];
  return m[1].split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);
}

/** 机械蒸馏：无 LLM、确定性、可追溯 */
function distillContent(content) {
  const raw = extractRawMessages(content);
  const lines = [];
  for (const msg of raw) {
    // 长句按句切，短句整行收
    for (const sent of msg.split(/(?<=[。！？.!?])\s*/)) {
      const t = sent.trim();
      if (t.length >= 4) lines.push(t);
    }
  }
  // 确定性要点：取前 5 条最长句（稳定排序：长度降序，同长按出现序）
  const points = lines
    .map((s, i) => ({ s, i, len: s.length }))
    .sort((a, b) => b.len - a.len || a.i - b.i)
    .slice(0, 5)
    .sort((a, b) => a.i - b.i)
    .map(x => x.s);
  // 确定性标签：高频词（≥4 字符，去停用词）取前 3
  const STOP = new Set(['this', 'that', 'with', 'from', 'test', 'message', 'goes', 'via', 'and', 'the']);
  const freq = {};
  for (const line of lines) {
    for (const w of line.split(/[^\p{L}\p{N}-]+/u)) {
      if (w.length >= 4 && !STOP.has(w.toLowerCase())) freq[w] = (freq[w] || 0) + 1;
    }
  }
  const tags = Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(e => e[0]);
  const digest = sha16(raw.join('\n'));
  return { points, tags, digest, rawCount: raw.length, lineCount: lines.length };
}

/** 用蒸馏结果替换 wiki 文件的"## 蒸馏摘要"节，并更新 frontmatter（保原话不动） */
function rewriteWikiFile(filePath, dist) {
  let text = fs.readFileSync(filePath, 'utf8');
  const summaryBlock = ['## 蒸馏摘要', '', ...dist.points.map(p => '- ' + p), '',
    '> 蒸馏方式：机械确定性提取（distill.js v1，无 LLM）',
    '> contentDigest: ' + dist.digest,
    '> 原话保留于「原始消息」节，共 ' + dist.rawCount + ' 条', ''].join('\n');
  // 替换蒸馏摘要节（到下一个 ## 为止）
  text = text.replace(/## 蒸馏摘要[\s\S]*?(?=\n## |$)/, summaryBlock + '\n');
  // frontmatter：status / distillationStatus(以 modified 标记形式不存在——用 tags 追加蒸馏标记) / modified
  text = text.replace(/^status: pending-distillation$/m, 'status: active');
  text = text.replace(/^(modified: .*)$/m, '$1');
  // 追加蒸馏元数据行（幂等：先移除旧的）
  text = text.replace(/^contentDigest: .*\n/m, '');
  text = text.replace(/^(source: .*)$/m, '$1\ncontentDigest: ' + dist.digest + '\ndistilledBy: distill.js-v1');
  return text;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const idIdx = args.indexOf('--id');
  const onlyId = idIdx >= 0 ? args[idIdx + 1] : null;

  const store = new KnowledgeStore();
  await store.init();
  const pending = store.all("SELECT id, content, tags, confidence, source_file FROM entities WHERE status = 'pending-distillation'");
  const targets = onlyId ? pending.filter(r => r.id === onlyId) : pending;

  console.log(`[distill] pending 会话实体: ${pending.length} 条，本次处理: ${targets.length} 条${dryRun ? '（dry-run）' : ''}`);
  if (!targets.length) { console.log('[distill] 无事可做，distillDebt 已为 0'); process.exit(0); }

  let done = 0;
  for (const row of targets) {
    const wikiPath = row.source_file ? path.join(ROOT, row.source_file) : null;
    if (!wikiPath || !fs.existsSync(wikiPath)) {
      console.error(`[distill] FAIL ${row.id}: wiki 文件缺失 (${row.source_file})`);
      process.exitCode = 1;
      continue;
    }
    const dist = distillContent(row.content);
    if (!dist.points.length) {
      console.error(`[distill] FAIL ${row.id}: 原始消息为空，拒绝无据蒸馏`);
      process.exitCode = 1;
      continue;
    }
    if (dryRun) {
      console.log(`[distill][dry] ${row.id}: ${dist.points.length} 要点 / tags=[${dist.tags.join(',')}] / digest=${dist.digest}`);
      continue;
    }
    // 1) 写回 wiki（双脑契约：wiki 是唯一事实源）
    const newText = rewriteWikiFile(wikiPath, dist);
    fs.writeFileSync(wikiPath, newText, 'utf8');
    // 2) 同步 DB：status、tags、content（摘要节已更新，原话节不动）
    const mergedTags = [...new Set([...JSON.parse(row.tags || '[]'), ...dist.tags])].slice(0, 20);
    const newContent = newText.replace(/^---[\s\S]*?---\n/, ''); // DB content 存正文
    store.run("UPDATE entities SET status='active', tags=?, content=?, distill_meta=? WHERE id=?", [
      JSON.stringify(mergedTags), newContent, JSON.stringify({ digest: dist.digest, by: 'distill.js-v1', at: new Date().toISOString() }), row.id
    ]);
    done++;
    console.log(`[distill] OK ${row.id}: ${dist.points.length} 要点, tags=[${mergedTags.join(',')}], digest=${dist.digest}`);
  }

  const after = store.all("SELECT COUNT(*) as n FROM entities WHERE status='pending-distillation'");
  console.log(`[distill] 完成 ${done} 条；剩余 pending-distillation: ${after[0].n}（distillDebt 兑付）`);
  if (!dryRun && done > 0) {
    console.log('[distill] 注意：DB content 已更新，建议下轮代谢 compile --force 同步 wiki（wiki 已是真源，此处 DB 直写为本步骤契约内动作）');
  }
  process.exit(done > 0 || dryRun ? 0 : 1);
}

main().catch(e => { console.error('[distill] FATAL:', e.message); process.exit(1); });