#!/usr/bin/env node
/**
 * sync-links-to-fs.js — 双脑同步：把 DB 链接镜像落盘到 wiki/links/
 *
 * 背景（2026-09-02 反向同步修复，修双脑脱节 bug）：
 *   auto-link.js 只 INSERT 进 DB，全 src 无人写 wiki/links/index.md，
 *   而 neural-guide-chain.js / consciousness-layer.js 曾从该文件读邻居
 *   → 邻居永远为空，DB 与文件系统两个世界。
 *   B1（2026-11-05）：读端已改吃 DB 活读（db-live-reader.js），index.md 降级为**纯人读投影**
 *   （可落后、可重建、仅供人看），不再是机器判据。本脚本仍写它，但写失败不再阻断全量。
 *
 * 双格式落盘（边文件给人读/工具消费，index.md 作人读汇总）：
 *   1. wiki/links/<src>__<tgt>.md   — 边文件（含 [[A]] [[B]] 内容边）
 *   2. wiki/links/index.md          — 汇总索引（- [[A]] ↔ [[B]] 行格式，纯投影）
 *
 * 使用：
 *   node src/sync-links-to-fs.js           # 全量同步
 *   node src/sync-links-to-fs.js --dry-run # 只显示不落盘
 */

const KnowledgeStore = require('./knowledge-store');
const fs = require('fs');
const path = require('path');
const { linkFilename, safeSeg } = require('./link-filename.js'); // C2/C3：边档名唯一净化口径 + 长度上限

// B2（2026-11-05 修单）：锚定包根（与 pollinate.js 的 __dirname 一致），不再 process.cwd()。
// 旧法换目录跑 → 两组件读写不同位置（C18 同款 process.cwd() 病），边档落到启动目录而非包内 wiki/links。
const root = path.resolve(__dirname, '..');
const linksDir = path.join(root, 'wiki', 'links');

async function main() {
  // 2026-09-17 F3：代谢持库时拒写；子步（link-sync）凭 AING_METABOLISM_CHILD 豁免
  if (require('./metabolism-lock.js').metabolismBusy()) {
    console.log(require('./metabolism-lock.js').refuseLine('sync-links-to-fs'));
    process.exit(3);
  }
  const dryRun = process.argv.includes('--dry-run');

  const store = new KnowledgeStore();
  await store.init();

  const links = store.all('SELECT source_id, target_id, relation, confidence, created_at FROM links');
  console.log(`📦 发现 ${links.length} 个 DB 链接${dryRun ? ' [DRY RUN]' : ''}\n`);

  if (!dryRun && !fs.existsSync(linksDir)) {
    fs.mkdirSync(linksDir, { recursive: true });
  }

  // ---- 1. 边文件 A__B.md ----
  // B3（2026-11-05 修单）：单条边写包 try/catch（失败计数、继续），index.md 不再被单条
  // 超长边名卡死（旧法无 catch：一条 ENAMETOOLONG 抛出 → 全量冻结、index 永远轮不到写）。
  let edgesWritten = 0;
  let edgeFailed = 0;
  for (const link of links) {
    const [src, tgt] = [String(link.source_id), String(link.target_id)];
    if (src === tgt) continue; // 自链接不落盘
    const sSrc = safeSeg(src);
    const sTgt = safeSeg(tgt);
    const filename = linkFilename(src, tgt);
    const filepath = path.join(linksDir, filename);

    const created = link.created_at || new Date().toISOString();
    const confidence = typeof link.confidence === 'number' ? link.confidence : 0.5;
    const content = `---
source: ${sSrc}
target: ${sTgt}
relation: ${link.relation || 'related'}
confidence: ${confidence}
created: ${created}
synced_from_db: true
---

# Link: ${sSrc} ↔ ${sTgt}

- **Source**: [[${sSrc}]]
- **Target**: [[${sTgt}]]
- **Type**: ${link.relation || 'related'}
- **Confidence**: ${confidence.toFixed(2)}
- **Created**: ${created}
- **Synced**: DB→文件系统双脑同步
`;

    if (!dryRun) {
      try {
        if (fs.existsSync(filepath)) {
          const existing = fs.readFileSync(filepath, 'utf8');
          if (existing.includes(`source: ${sSrc}`)) continue; // 内容一致跳过
        }
        fs.writeFileSync(filepath, content, 'utf8');
      } catch (e) {
        edgeFailed++;
        console.warn(`⚠️ 边写失败，跳过（其余边与 index 继续）/ edge write failed, continuing: ${filename} — ${e.message}`);
        continue;
      }
    }
    edgesWritten++;
  }

  // ---- 2. 汇总索引 index.md（纯人读投影，可落后/可重建；机器判据走 DB）----
  // 行格式: - [[A]] ↔ [[B]] （无序对去重）
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
> 纯人读投影（可落后、可重建）；机器判据一律走 DB（db-live-reader.js）。

共 ${indexLines.length} 条链接（${new Date().toISOString()}）

${indexLines.join('\n')}
`;

  if (!dryRun) {
    // B3：index.md 在循环后写，但边写已包 catch，此处必达（不再被单条边卡死）
    try {
      fs.writeFileSync(path.join(linksDir, 'index.md'), indexContent, 'utf8');
    } catch (e) {
      console.warn(`⚠️ index.md 写失败 / index write failed: ${e.message}`);
    }
  }

  console.log(`✅ 边文件: ${edgesWritten}/${links.length} → wiki/links/*.md${edgeFailed ? `（${edgeFailed} 条写失败已跳过）` : ''}`);
  console.log(`✅ 索引:   ${indexLines.length} 条 → wiki/links/index.md${dryRun ? ' [DRY RUN 未落盘]' : ''}`);

  store.close();
}

main().catch(err => {
  console.error('❌ 同步失败:', err.message);
  process.exit(1);
});
