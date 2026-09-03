#!/usr/bin/env node
/**
 * sync-links-to-fs.js — 双脑同步：把 DB 链接镜像落盘到 wiki/links/
 *
 * 背景（2026-09-02 反向同步自 EvoX 修复，修双脑脱节 bug）：
 *   auto-link.js 只 INSERT 进 DB，全 src 无人写 wiki/links/index.md，
 *   而 neural-guide-chain.js / consciousness-layer.js 共 5 处从该文件读邻居
 *   → 邻居永远为空，DB 与文件系统两个世界。
 *
 * 双格式落盘（让两端 parser 都吃到）：
 *   1. wiki/links/<src>__<tgt>.md   — 边文件（含 [[A]] [[B]] 内容边）
 *   2. wiki/links/index.md          — 汇总索引（- [[A]] ↔ [[B]] 行格式）
 *
 * 使用：
 *   node src/sync-links-to-fs.js           # 全量同步
 *   node src/sync-links-to-fs.js --dry-run # 只显示不落盘
 */

const KnowledgeStore = require('./knowledge-store');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const linksDir = path.join(root, 'wiki', 'links');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const store = new KnowledgeStore();
  await store.init();

  const links = store.all('SELECT source_id, target_id, relation, confidence, created_at FROM links');
  console.log(`📦 发现 ${links.length} 个 DB 链接${dryRun ? ' [DRY RUN]' : ''}\n`);

  if (!dryRun && !fs.existsSync(linksDir)) {
    fs.mkdirSync(linksDir, { recursive: true });
  }

  // ---- 1. 边文件 A__B.md ----
  let edgesWritten = 0;
  for (const link of links) {
    const [src, tgt] = [String(link.source_id), String(link.target_id)];
    if (src === tgt) continue; // 自链接不落盘
    const safeSrc = src.replace(/[\\/:*?"<>|_]/g, '-');
    const safeTgt = tgt.replace(/[\\/:*?"<>|_]/g, '-');
    const filename = `${safeSrc}__${safeTgt}.md`;
    const filepath = path.join(linksDir, filename);

    const created = link.created_at || new Date().toISOString();
    const confidence = typeof link.confidence === 'number' ? link.confidence : 0.5;
    const content = `---
source: ${safeSrc}
target: ${safeTgt}
relation: ${link.relation || 'related'}
confidence: ${confidence}
created: ${created}
synced_from_db: true
---

# Link: ${safeSrc} ↔ ${safeTgt}

- **Source**: [[${safeSrc}]]
- **Target**: [[${safeTgt}]]
- **Type**: ${link.relation || 'related'}
- **Confidence**: ${confidence.toFixed(2)}
- **Created**: ${created}
- **Synced**: DB→文件系统双脑同步
`;

    if (!dryRun) {
      if (fs.existsSync(filepath)) {
        const existing = fs.readFileSync(filepath, 'utf8');
        if (existing.includes(`source: ${safeSrc}`)) continue; // 内容一致跳过
      }
      fs.writeFileSync(filepath, content, 'utf8');
    }
    edgesWritten++;
  }

  // ---- 2. 汇总索引 index.md ----
  // 行格式: - [[A]] ↔ [[B]] （无序对去重；guide-chain._getNeighbors 逐行
  // 提取含 2+ 个 [[链接]] 的行，consciousness-layer 统计 [[X]] 出现次数）
  const seen = new Set();
  const indexLines = [];
  for (const link of links) {
    const a = String(link.source_id);
    const b = String(link.target_id);
    if (a === b) continue;
    const key = [a, b].sort().join('||');
    if (seen.has(key)) continue;
    seen.add(key);
    indexLines.push(`- [[${a}]] ↔ [[${b}]]`);
  }

  const indexContent = `# Links Index（DB 自动同步，勿手改）

> 由 src/sync-links-to-fs.js 从 knowledge.db 链接表镜像生成。
> 每代谢一轮同步一轮，保证双脑（DB ↔ 文件系统）一致。

共 ${indexLines.length} 条链接（${new Date().toISOString()}）

${indexLines.join('\n')}
`;

  if (!dryRun) {
    fs.writeFileSync(path.join(linksDir, 'index.md'), indexContent, 'utf8');
  }

  console.log(`✅ 边文件: ${edgesWritten}/${links.length} → wiki/links/*.md`);
  console.log(`✅ 索引:   ${indexLines.length} 条 → wiki/links/index.md${dryRun ? ' [DRY RUN 未落盘]' : ''}`);

  store.close();
}

main().catch(err => {
  console.error('❌ 同步失败:', err.message);
  process.exit(1);
});
