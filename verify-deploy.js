#!/usr/bin/env node
/**
 * verify-deploy.js — aing 一键部署全绿验收器
 *
 * 部署完成后必跑本脚本：全部通过则输出 ALL GREEN 报告（exit 0）；
 * 任何一项失败则逐项给出修复指引（exit 1）。
 * 约定：没有 ALL GREEN 报告，= 部署未完成，禁止宣布部署成功。
 *
 * 用法：
 *   node verify-deploy.js            # 标准验收（只读，不改任何数据）
 *   npm run verify                   # 同上
 */

const fs = require('fs');
const path = require('path');

const PKG_DIR = path.resolve(__dirname);
const results = [];

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(detail => {
      results.push({ name, ok: true, detail: detail || '' });
    })
    .catch(err => {
      results.push({ name, ok: false, detail: (err && err.message) || String(err) });
    });
}

async function main() {
  // ── C1. Node.js ──────────────────────────────────────────────
  await check('C1 Node.js 运行时', () => {
    const ver = process.version;
    const minor = parseInt(ver.slice(1).split('.')[0], 10);
    if (minor < 18) throw new Error(`Node ${ver} 过旧，需 >= 18`);
    return ver;
  });

  // ── C2. 三件依赖 ─────────────────────────────────────────────
  await check('C2 依赖三件套 (sql.js / transformers / sharp)', () => {
    const missing = ['sql.js', '@xenova/transformers', 'sharp']
      .filter(m => { try { require.resolve(m); return false; } catch (e) { return true; } });
    if (missing.length) {
      throw new Error(`缺失: ${missing.join(', ')} → 在包根目录运行 npm install`);
    }
    return '全部可解析';
  });

  // ── C3. 知识源 ───────────────────────────────────────────────
  await check('C3 raw/ 知识源', () => {
    const rawDir = path.join(PKG_DIR, 'raw');
    const n = fs.existsSync(rawDir)
      ? fs.readdirSync(rawDir).filter(f => f.endsWith('.md')).length
      : 0;
    if (n === 0) throw new Error('raw/ 没有 .md 文件 → 放入至少一篇知识文档');
    return `${n} 篇文档`;
  });

  // ── C4. 数据库与索引 ─────────────────────────────────────────
  let store;
  await check('C4 数据库完整性与向量索引', async () => {
    const KnowledgeStore = require('./src/knowledge-store');
    store = new KnowledgeStore();
    await store.init();
    const entities = store.getEntities({ status: 'active' });
    if (entities.length === 0) throw new Error('数据库 0 实体 → 运行 node src/run-metabolism.js');
    const dims = store.all('SELECT dimension, COUNT(*) AS n FROM entity_embeddings GROUP BY dimension');
    const dimStr = dims.map(d => `${d.n}×${d.dimension}维`).join(' + ');
    return `${entities.length} 实体（向量: ${dimStr}）`;
  });

  // ── C5. 语义组件 ─────────────────────────────────────────────
  await check('C5 本地语义模型 (384 维离线)', () => {
    const sv = require('./src/semantic-vector');
    if (!sv.isAvailable()) {
      throw new Error('模型或依赖未就绪 → 运行 powershell -File setup-vectors.ps1');
    }
    return `模型 ${sv.MODEL_NAME} 已就位`;
  });

  // ── C6. 语义检索冒烟 ─────────────────────────────────────────
  await check('C6 语义检索冒烟', async () => {
    if (!store) throw new Error('C4 未通过，跳过');
    const VectorSearch = require('./src/vector-search');
    const vs = new VectorSearch(store);
    await vs.enableSemantic();
    const hits = await vs.semanticSearch('知识库如何自我修复', 3);
    if (!hits.length) throw new Error('语义搜索零命中 → 运行 node src/index-vectors.js --semantic --reindex');
    return `top1 = ${hits[0].name} (${hits[0].score.toFixed(3)})`;
  });

  // ── 报告 ─────────────────────────────────────────────────────
  console.log('\n═══ aing 部署验收报告 / Deployment Acceptance Report ═══');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '  ' + r.detail : '\n     ↳ ' + r.detail}`);
  }
  const failed = results.filter(r => !r.ok);
  if (failed.length === 0) {
    console.log('\n🟢 ALL GREEN —— 部署验收通过（deploy verified）');
    process.exit(0);
  } else {
    console.log(`\n🔴 ${failed.length} check(s) failed —— 部署未完成 / deployment NOT complete，按上方 ↳ 指引修复后重跑 / fix per hints above and re-run`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ 验收器自身异常:', err);
  process.exit(1);
});
