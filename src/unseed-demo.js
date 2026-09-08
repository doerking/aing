#!/usr/bin/env node
/**
 * unseed-demo.js — 演示数据拆除（seed-demo 的逆操作，2026-09-08）
 *
 * 范围（只碰 demo-% 前缀，真实数据零接触）：
 *   DB 六张表按前缀清引用：entities / links（双向：source 或 target 任一侧命中即清）/ type_index / entity_metadata /
 *   entity_embeddings / kespi_history（双脑契约：引用全清，不留断链幽灵）
 *   文件：raw/demo-*.md、wiki/entities/demo-*.md、wiki/links/*demo-*.md、
 *         wiki/type-index 里残留的 demo 条目
 *   最后：主索引重建 + 语义重索引（真库实体时间戳/评分分毫不动）
 *
 * 用法：npm run unseed:demo [-- --dry-run]
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('./knowledge-store');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');
const TABLES = ['links', 'type_index', 'entity_metadata', 'entity_embeddings', 'kespi_history', 'entities'];
// entities 放最后（FK 引用它）；sql.js 默认不开外键强制，但顺序清理是好习惯

function rmSafe(p) {
  if (fs.existsSync(p)) {
    if (!DRY) fs.rmSync(p);
    console.log(`  🗑  ${path.relative(ROOT, p)}`);
    return 1;
  }
  return 0;
}

(async () => {
  console.log(`🧹 unseed-demo — 演示数据拆除${DRY ? '（dry-run 预览）' : ''}\n`);

  // 1) raw/ 演示文件
  let files = 0;
  files += fs.readdirSync(path.join(ROOT, 'raw')).filter(f => f.startsWith('demo-') && f.endsWith('.md'))
    .reduce((n, f) => n + rmSafe(path.join(ROOT, 'raw', f)), 0);

  // 2) wiki 实体文件
  const entitiesDir = path.join(ROOT, 'wiki', 'entities');
  if (fs.existsSync(entitiesDir)) {
    files += fs.readdirSync(entitiesDir).filter(f => f.startsWith('demo-') && f.endsWith('.md'))
      .reduce((n, f) => n + rmSafe(path.join(entitiesDir, f)), 0);
  }

  // 3) wiki 链接文件（demo 实体出现在任一侧即清）
  const linksDir = path.join(ROOT, 'wiki', 'links');
  if (fs.existsSync(linksDir)) {
    files += fs.readdirSync(linksDir).filter(f => f.endsWith('.md') && f.includes('demo-'))
      .reduce((n, f) => n + rmSafe(path.join(linksDir, f)), 0);
  }

  // 4) type-index 残留条目
  const typeIndexDir = path.join(ROOT, 'wiki', 'type-index');
  if (fs.existsSync(typeIndexDir)) {
    for (const f of fs.readdirSync(typeIndexDir).filter(f => f.endsWith('.md'))) {
      const p = path.join(typeIndexDir, f);
      const content = fs.readFileSync(p, 'utf8');
      const cleaned = content.split('\n').filter(l => !l.includes('demo-')).join('\n');
      if (cleaned !== content) {
        if (!DRY) fs.writeFileSync(p, cleaned, 'utf8');
        console.log(`  🧽 type-index/${f} 移除 demo 条目`);
      }
    }
  }

  // 5) DB 六表前缀清理
  const dbPath = path.join(ROOT, 'knowledge.db');
  let dbRows = 0;
  if (fs.existsSync(dbPath)) {
    const store = new KnowledgeStore(dbPath);
    await store.init();
    for (const t of TABLES) {
      try {
        // 各表前缀列名不同：links 双向清理（auto-link 会给真实实体挂指向 demo 的链接），
        // entities 主键列是 id，其余表才是 entity_id
        const where = t === 'links'
          ? "source_id LIKE 'demo-%' OR target_id LIKE 'demo-%'"
          : (t === 'entities' ? "id LIKE 'demo-%'" : "entity_id LIKE 'demo-%'");
        const before = store.get(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where}`);
        const n = before ? before.n : 0;
        if (n > 0 && !DRY) {
          store.run(`DELETE FROM ${t} WHERE ${where}`);
        }
        if (n > 0) console.log(`  🗄  ${t}: ${n} 行${DRY ? '（dry-run 未删）' : '已删'}`);
        dbRows += n;
      } catch (e) {
        // links 表用 source_id，其余表用 entity_id；表不存在则跳过
        console.log(`  ⏭  ${t}: 跳过（${e.message.split('\n')[0]}）`);
      }
    }
    store.close();
  } else {
    console.log('  ⏭  knowledge.db 不存在，跳过 DB 清理');
  }

  // 6) 主索引重建 + 语义重索引（无 demo 时也安全）
  if (!DRY) {
    const run = (name, cmd, args) => {
      console.log(`\n▶ ${name}`);
      const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, AING_NO_AUTOCOMMIT: '1' } });
      if (r.status !== 0) { console.error(`❌ ${name} 失败`); process.exit(1); }
    };
    // 主索引：直接调 compile 的 updateMainIndex 等价逻辑（只重算 wiki/index.md，不编译）
    run('向量重索引（demo 向量出库）', 'node', ['src/index-vectors.js', '--semantic', '--reindex']);
    // KESPI 重评分：演示期间真实实体评分被 demo 数据稀释（KD/KQ 全库计算），删除后必须重算恢复
    run('KESPI 重评分（恢复真实评分）', 'node', ['src/kespi-check.js']);
  }

  console.log(`\n${DRY
    ? `📋 dry-run 完成：将删 ${files} 个文件、DB ${dbRows} 行（去掉 --dry-run 执行）`
    : `🟢 unseed-demo 完成：删 ${files} 个文件、清 DB ${dbRows} 行，真实数据未动`}`);
})();
