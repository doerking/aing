#!/usr/bin/env node
/**
 * recycle-seeds.js — 芥子回炉（进化回路蓝图 evolution-loop.md 的代码实现）
 *
 * 设计哲学：知识系统没有失败，只有未发芽。
 * 压缩产出的芥子不是终点——回炉成元知识微粒，重新进入代谢。
 *
 * 两阶段（幂等）：
 *   阶段1 回炉：未消费芥子 → 微粒实体文件 wiki/entities/mz-<id>.md
 *               （类型 MetaKnowledge，正文=压缩摘要 + recycled_from 血统链）
 *               seed 标记 recycled=true，每粒最多回炉一次
 *   阶段2 入土：已回炉芥子的原实体残壳 → wiki 文件移入 pruned/archive/
 *               + DB 行清理（双脑契约：文件归档 + DB 清引用，防下轮复活）
 *
 * 使用：node src/recycle-seeds.js
 */

const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('./knowledge-store');

const CONFIG = {
  seedsIndex: path.join(__dirname, '..', 'mustard-seeds', 'compressed', 'index.json'),
  entitiesDir: path.join(__dirname, '..', 'wiki', 'entities'),
  prunedDir: path.join(__dirname, '..', 'pruned', 'archive'),
  dbFile: path.join(__dirname, '..', 'knowledge.db')
};

const stats = { seedsTotal: 0, recycled: 0, skipped: 0, husksArchived: 0 };

function loadSeeds() {
  if (!fs.existsSync(CONFIG.seedsIndex)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG.seedsIndex, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`⚠️  芥子索引解析失败: ${e.message}`);
    return [];
  }
}

function saveSeeds(seeds) {
  fs.mkdirSync(path.dirname(CONFIG.seedsIndex), { recursive: true });
  fs.writeFileSync(CONFIG.seedsIndex, JSON.stringify(seeds, null, 2), 'utf8');
}

/** 阶段1：未消费芥子 → 微粒实体文件 */
function recyclePhase(seeds) {
  for (const seed of seeds) {
    stats.seedsTotal++;
    if (seed.recycled) {
      stats.skipped++;
      continue;
    }

    const mzId = `mz-${seed.id}`;
    const mzPath = path.join(CONFIG.entitiesDir, `${mzId}.md`);
    const title = (seed.metadata && seed.metadata.title) || seed.id;

    if (!fs.existsSync(mzPath)) {
      const summary = seed.summary || seed.preserved && seed.preserved.bodyPreview || `（芥子微粒，源自 ${title}）`;
      const fm = {
        name: `回炉·${title}`,
        type: 'MetaKnowledge',
        id: mzId,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        tags: JSON.stringify(['recycled', 'meta-knowledge', seed.originalType || 'Unknown']),
        status: 'active',
        confidence: 0.8,
        source: `mustard-seed:${seed.id}`
      };
      const content = `---
${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join('\n')}
---

# ${fm.name}

## 芥子精华
${summary}

## 血统
- 回炉自：[[${seed.id}]]（${seed.originalType || 'Unknown'}）
`;

      fs.mkdirSync(CONFIG.entitiesDir, { recursive: true });
      fs.writeFileSync(mzPath, content, 'utf8');
      stats.recycled++;
    } else {
      stats.skipped++; // 已存在（幂等）
    }

    seed.recycled = true;
    seed.recycledAt = new Date().toISOString();
  }
}

/** 阶段2：已回炉芥子的原实体残壳归档（文件移 pruned/ + DB 清引用） */
async function archiveHusks(seeds) {
  const husks = seeds.filter(s => s.recycled);
  if (!husks.length) return;

  const store = new KnowledgeStore(CONFIG.dbFile);
  await store.init();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let archived = 0;

  for (const seed of husks) {
    const srcPath = path.join(CONFIG.entitiesDir, `${seed.id}.md`);
    if (!fs.existsSync(srcPath)) continue; // 已归档或不存在

    const destDir = path.join(CONFIG.prunedDir, timestamp);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(destDir, `${seed.id}.md`));
    fs.unlinkSync(srcPath);

    // DB 清引用：先子表后主行
    store.run('DELETE FROM entity_metadata WHERE entity_id = ?', [seed.id]);
    store.run('DELETE FROM entity_embeddings WHERE entity_id = ?', [seed.id]);
    store.run('DELETE FROM kespi_history WHERE entity_id = ?', [seed.id]);
    store.run('DELETE FROM links WHERE source_id = ? OR target_id = ?', [seed.id, seed.id]);
    store.run('DELETE FROM type_index WHERE entity_id = ?', [seed.id]);
    store.run('DELETE FROM entities WHERE id = ?', [seed.id]);
    archived++;
  }

  store.close();
  stats.husksArchived = archived;
}

async function main() {
  console.log('♻️  芥子回炉（进化回路）\n');

  const seeds = loadSeeds();
  if (seeds.length === 0) {
    console.log('✅ 芥子库为空，回炉闭环空闲');
    return;
  }

  recyclePhase(seeds);
  saveSeeds(seeds); // recycled 标记持久化

  await archiveHusks(seeds);

  console.log(`\n📊 回炉统计:`);
  console.log(`   芥子总数: ${stats.seedsTotal}`);
  console.log(`   本次新生微粒: ${stats.recycled}`);
  console.log(`   跳过（已回炉/已存在）: ${stats.skipped}`);
  console.log(`   残壳归档: ${stats.husksArchived}`);
  console.log(`\n✅ 回炉完成（幂等，可重复执行）`);
}

main().catch(e => {
  console.error(`❌ 回炉失败: ${e.message}`);
  process.exitCode = 1;
});
