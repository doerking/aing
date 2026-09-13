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
const { execSync } = require('child_process');

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
  // ── C5 前置提示：models/ 模型未就位时先打招呼，避免新环境首跑看到红报错而误判部署失败 ──
  if (!fs.existsSync(path.join(PKG_DIR, 'models', 'Xenova', 'all-MiniLM-L6-v2'))) {
    console.log('ℹ️  预告: models/ 语义模型未就位，C5/C6 预期会红 —— 属正常现象，先运行: powershell -File setup-vectors.ps1 （模型约 12MB，不入库）');
  }
  // ── C1. Node.js ──────────────────────────────────────────────
  await check('C1 Node.js 运行时', () => {
    const ver = process.version;
    const minor = parseInt(ver.slice(1).split('.')[0], 10);
    if (minor < 18) throw new Error(`Node ${ver} 过旧，需 >= 18`);
    return ver;
  });

  // ── C0. 运行时配置（P0）─────────────────────────────────────
  await check('C0 growth.config.js', () => {
    const configPath = path.join(PKG_DIR, 'src', 'growth.config.js');
    if (!fs.existsSync(configPath)) {
      throw new Error('缺少 src/growth.config.js → 复制 growth.config.example.js 为 src/growth.config.js');
    }
    let config;
    try {
      config = require(configPath);
    } catch (err) {
      throw new Error('growth.config.js 无法加载: ' + err.message);
    }
    if (!config.kespi || !config.kespi.weights || !config.kespi.dimensions) {
      throw new Error('growth.config.js 缺少 kespi.weights 或 kespi.dimensions');
    }
    const wsum = Object.values(config.kespi.weights).reduce((s, v) => s + Number(v || 0), 0);
    if (Math.abs(wsum - 1) > 0.01) {
      throw new Error('kespi.weights 权重和 = ' + wsum.toFixed(3) + ' ≠ 1.0');
    }
    return configPath;
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


  // —— C7. 运行时产品断言（09-07 演练教训：面板绿 ≠ 产品绿）——
  await check('C7a kespi 生命周期一致性 (wiki computed ↔ db scored)', async () => {
    const entitiesDir = path.join(PKG_DIR, 'wiki', 'entities');
    if (!fs.existsSync(entitiesDir)) return; // 全新包未编译，跳过 / fresh package
    const computedIds = [];
    for (const f of fs.readdirSync(entitiesDir).filter(f => f.endsWith('.md'))) {
      const m = fs.readFileSync(path.join(entitiesDir, f), 'utf8').match(/kespi_status:\s*(\w+)/);
      if (m && m[1] === 'computed') computedIds.push(f.replace(/\.md$/, ''));
    }
    const dbPath = path.join(PKG_DIR, 'knowledge.db');
    if (!fs.existsSync(dbPath)) throw new Error('knowledge.db 缺失 / missing');
    const SQL = await require('sql.js')();
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const r = db.exec('SELECT DISTINCT entity_id FROM kespi_history');
    const scored = new Set(r.length ? r[0].values.map(v => v[0]) : []);
    const missing = computedIds.filter(id => !scored.has(id));
    if (missing.length) throw new Error('wiki 标记 computed 但库内无评分（静默腐坏特征）: ' + missing.slice(0, 3).join(', ') + ' → 跑 node src/kespi-check.js 修复');
    return computedIds.length + ' computed ↔ db 一致';
  });
  await check('C7b 补丁层指纹 (v1 defs present)', async () => {
    const k = fs.readFileSync(path.join(PKG_DIR, 'src', 'kespi-check.js'), 'utf8');
    if (/markEntityKespiComputed\s*\(/.test(k) && !/function\s+markEntityKespiComputed/.test(k)) throw new Error('kespi-check 调用 markEntityKespiComputed 但缺定义（v1 层缺失）');
    const g = fs.readFileSync(path.join(PKG_DIR, 'src', 'auto-ingest.js'), 'utf8');
    if (/hasDistillation/.test(g) && !/hasDistillation\s*=/.test(g)) throw new Error('auto-ingest 使用 hasDistillation 但无推导来源（v1 层缺失）');
    return 'v1 defs verified';
  });

  // ── C8. 盘符字面量扫描（2026-09-08：人工脱敏三审曾漏正斜杠变体，守门改机器）──
  await check('C8 硬编码盘符扫描 (redaction gate)', async () => {
    const tracked = execSync('git ls-files', { cwd: PKG_DIR, encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean);
    const scope = tracked.filter(f => /\.(js|json|md|ps1)$/i.test(f) && !/^raw\//.test(f));
    const driveRe = /(?<![A-Za-z])[A-Za-z]:[\\/]/;
    const hits = [];
    for (const f of scope) {
      let lines;
      try { lines = fs.readFileSync(path.join(PKG_DIR, f), 'utf8').split('\n'); } catch (e) { continue; }
      lines.forEach((l, i) => { if (driveRe.test(l)) hits.push(`${f}:${i + 1}`); });
    }
    if (hits.length) {
      throw new Error(`发现 ${hits.length} 处硬编码盘符（人工脱敏漏网风险）→ 改为语义占位符 <repo-root>/<opt-root> 等: `
        + hits.slice(0, 5).join(', ') + (hits.length > 5 ? ' ...' : ''));
    }
    return `${scope.length} 个跟踪文件零盘符字面量`;
  });

  // ── C9. 意识层契约门（卡 2 登记簿 + 卡 3 面板 schema）──
  await check('C9a 组件登记簿 ↔ STEPS 双向一致', () => {
    const regPath = path.join(PKG_DIR, 'data', 'component-registry.json');
    if (!fs.existsSync(regPath)) throw new Error('缺少 data/component-registry.json → 意识层卡 2 登记簿缺失');
    let reg;
    try { reg = JSON.parse(fs.readFileSync(regPath, 'utf8')); } catch (e) { throw new Error('component-registry.json 无法解析: ' + e.message); }
    const registrySteps = (reg.components || []).filter(c => c.role === 'pipeline-step').map(c => c.id).sort();
    const rmSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'run-metabolism.js'), 'utf8');
    const stepsSeg = rmSrc.slice(rmSrc.indexOf('const STEPS'), rmSrc.indexOf('];'));
    const steps = [...stepsSeg.matchAll(/name:\s*'([^']+)'/g)].map(m => m[1]).sort();
    if (JSON.stringify(steps) !== JSON.stringify(registrySteps)) {
      throw new Error(`双向不一致 → STEPS(${steps.length}): ${steps.join(',')} vs 登记(${registrySteps.length}): ${registrySteps.join(',')}；加步必须同步登记，登记鬼步同样红灯`);
    }
    return `${registrySteps.length} 个 pipeline-step 登记 ↔ STEPS 双向一致`;
  });

  await check('C9b greenlist-declared 引用存在', () => {
    const regPath = path.join(PKG_DIR, 'data', 'component-registry.json');
    const glPath = path.join(PKG_DIR, 'docs', 'greenlist.json');
    if (!fs.existsSync(glPath)) throw new Error('缺少 docs/greenlist.json');
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    const gl = JSON.parse(fs.readFileSync(glPath, 'utf8'));
    const greenIds = new Set((gl.green || []).map(g => g.id));
    const lockedIds = new Set((gl.locked || []).map(l => l.id));
    const refs = [];
    for (const c of reg.components || []) {
      if ((c.contracts || []).includes('greenlist-declared')) {
        for (const d of c.declarations || []) {
          const id = String(d).split('#')[1];
          if (!id) refs.push(`${c.id}: ${d}`);
          else if (!greenIds.has(id) && !lockedIds.has(id)) refs.push(`${c.id}: ${d}`);
        }
      }
    }
    if (refs.length) throw new Error('登记簿引用不存在的绿名单项: ' + refs.join('；'));
    return `${(reg.components || []).length} 组件引用校验通过`;
  });

  await check('C9c 意识层面板 schema 完整', () => {
    const panelPath = path.join(PKG_DIR, 'data', 'panel.json');
    if (!fs.existsSync(panelPath)) throw new Error('缺少 data/panel.json → 跑 node src/metabolism-panel.js（意识层卡 3 缺失）');
    let p;
    try { p = JSON.parse(fs.readFileSync(panelPath, 'utf8')); } catch (e) { throw new Error('panel.json 无法解析: ' + e.message); }
    const required = ['_meta', 'health', 'lines', 'queues', 'gaps', 'chains', 'timeline'];
    const missing = required.filter(k => !(k in p));
    if (missing.length) throw new Error('panel.json 缺块: ' + missing.join(', '));
    if (!p._meta.generatedAt) throw new Error('panel.json 缺 _meta.generatedAt（意识层未刷新）');
    return `${required.length} 块完整（fresh @${p._meta.generatedAt}）`;
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
