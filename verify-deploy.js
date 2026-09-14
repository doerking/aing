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

  // ── C2. 核心依赖（Harness 自维继原则：核心管道零外部依赖）──
  await check('C2 核心依赖 (sql.js / transformers)', () => {
    const missing = ['sql.js', '@xenova/transformers']
      .filter(m => { try { require.resolve(m); return false; } catch (e) { return true; } });
    if (missing.length) {
      throw new Error(`缺失: ${missing.join(', ')} → 在包根目录运行 npm install`);
    }
    return '全部可解析';
  });

  await check('C2b 可选依赖 (sharp)', () => {
    try { require.resolve('sharp'); return 'sharp 已安装（可选，非核心管道所需）'; }
    catch (e) { return 'sharp 未安装（可选依赖，不影响核心管道；仅图片处理场景缺失）'; }
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

  // ── C10. 院际一致性与写路径可用（2026-09-14 实践场混代事故复盘新增）──────
  // 事故：实践场 src 落后真源 4 个文件——distill.js 已写 distill_meta，而 knowledge-store.js 无该列迁移，
  // 真实待蒸馏实体一进 distill 即报 no such column 崩溃；同时 verify-deploy 14 项全绿、面板照发 ALL GREEN。
  // 同批暴露：绿名单视图被手改漂移、data/panel.json 读数过期仍被当现状引用、配置模板缺段让新部署即崩。
  // C10 全部只读或只写系统临时文件，不修改本包任何数据。/ read-only or temp-only; never mutates this package.
  await check('C10a 绿名单视图同步 (GREEN-LIST.md ↔ greenlist.json)', () => {
    const { render, loadGreenlist, compose } = require('./tools/gen-greenlist');
    const mdPath = path.join(PKG_DIR, 'docs', 'GREEN-LIST.md');
    if (!fs.existsSync(mdPath)) throw new Error('缺 docs/GREEN-LIST.md → node tools/gen-greenlist.js');
    const G = loadGreenlist();
    const norm = s => s.replace(/\r\n/g, '\n');
    const want = norm(compose(render(G), fs.readFileSync(mdPath, 'utf8')));   // 视图允许带合规水印，生成器透传不换行
    const have = norm(fs.readFileSync(mdPath, 'utf8'));
    if (want === have) return `视图与真源一致（green ${G.green.length} / locked ${G.locked.length}）`;
    const caps = s => s.split('\n').filter(l => /^\s*- [✅⬜]/.test(l))
      .map(l => l.replace(/^\s*- [✅⬜]\s*\**/, '').replace(/\**\s*$/, '').trim().slice(0, 18));
    const hv = caps(have), wv = caps(want);
    const phantom = hv.filter(x => !wv.includes(x));
    const omitted = wv.filter(x => !hv.includes(x));
    throw new Error('GREEN-LIST.md 与 greenlist.json 不一致（视图被手改）→ node tools/gen-greenlist.js'
      + (phantom.length ? '｜视图虚报: ' + phantom.join(' / ') : '')
      + (omitted.length ? '｜视图漏报: ' + omitted.join(' / ') : ''));
  });

  await check('C10b 意识层面板读数一致 (panel.json ↔ 库 + 新鲜度)', async () => {
    if (!store) throw new Error('C4 未通过，跳过');
    const panelPath = path.join(PKG_DIR, 'data', 'panel.json');
    if (!fs.existsSync(panelPath)) throw new Error('缺 data/panel.json → node src/metabolism-panel.js');
    const p = JSON.parse(fs.readFileSync(panelPath, 'utf8'));
    const cfg = require('./src/growth.config');
    const maxAgeH = cfg.gates && Number.isFinite(cfg.gates.panelMaxAgeHours) ? cfg.gates.panelMaxAgeHours : 6;
    const gen = Date.parse((p._meta || {}).generatedAt || '');
    if (!Number.isFinite(gen)) throw new Error('panel._meta.generatedAt 缺失或不可解析 → node src/metabolism-panel.js');
    const ageH = (Date.now() - gen) / 3.6e6;
    if (ageH > maxAgeH) throw new Error(`面板已过期 ${ageH.toFixed(1)}h > 上限 ${maxAgeH}h（阈值 growth.config.gates.panelMaxAgeHours）→ 代谢链尾步未跑，跑 node src/run-metabolism.js 或 node src/metabolism-panel.js`);
    const h = p.health || {};
    const liveEnt = store.all('SELECT COUNT(*) AS n FROM entities')[0].n;
    const liveLink = store.all('SELECT COUNT(*) AS n FROM links')[0].n;
    const drift = [];
    if (h.entity_count !== liveEnt) drift.push(`entity_count ${h.entity_count} ≠ 库内 ${liveEnt}`);
    if (h.link_count !== liveLink) drift.push(`link_count ${h.link_count} ≠ 库内 ${liveLink}`);
    if (drift.length) throw new Error('面板读数与库不符（过期面板易被当现状引用）: ' + drift.join('；') + ' → node src/metabolism-panel.js 重生成');
    return `读数一致（${liveEnt} 实体 / ${liveLink} 链接），新鲜度 ${ageH.toFixed(1)}h ≤ ${maxAgeH}h`;
  });

  await check('C10c distill 写路径可用 (混代指纹 + 临时库真写)', async () => {
    const distillSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'distill.js'), 'utf8');
    const storeSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'knowledge-store.js'), 'utf8');
    const uses = /\bdistill_meta\b/.test(distillSrc);
    if (uses && !/\bdistill_meta\b/.test(storeSrc)) {
      throw new Error('混代：distill.js 写 distill_meta，但 knowledge-store.js 无该列定义/迁移 → 真实待蒸馏实体一进 distill 即 no such column；从真源同步 knowledge-store.js（勿在本包热改）');
    }
    const cols = store ? store.all('PRAGMA table_info(entities)').map(r => r.name) : [];
    if (uses && cols.length && !cols.includes('distill_meta')) {
      throw new Error('实库 entities 缺 distill_meta 列（代码新、库旧）→ 跑任意 store.init() 触发迁移，或 node src/run-metabolism.js');
    }
    // 真写回读：跑与 distill.js 完全相同的 UPDATE，落在系统临时库，跑完即删 / same UPDATE, temp db only
    const os = require('os');
    const KnowledgeStore = require('./src/knowledge-store');
    const tmp = path.join(os.tmpdir(), `aing-c10c-${process.pid}.db`);
    fs.rmSync(tmp, { force: true });
    try {
      const s = new KnowledgeStore(tmp);
      await s.init();
      s.run('INSERT INTO entities (id, name, type, content, tags, status, confidence) VALUES (?,?,?,?,?,?,?)',
        ['c10c-probe', 'c10c-probe', 'Concept', 'probe', '[]', 'pending-distillation', 0.7]);
      const meta = JSON.stringify({ digest: 'c10c', by: 'verify-deploy.js', at: new Date().toISOString() });
      s.run("UPDATE entities SET status='active', tags=?, content=?, distill_meta=? WHERE id=?", ['[]', 'probe', meta, 'c10c-probe']);
      const back = s.all("SELECT distill_meta, status FROM entities WHERE id='c10c-probe'");
      if (!back.length) throw new Error('临时库探针丢失（写后读为空）');
      if (back[0].distill_meta !== meta) throw new Error('distill_meta 写回读不一致 → 蒸馏债无法兑付');
      if (back[0].status !== 'active') throw new Error('status 未从 pending-distillation 翻转为 active');
      s.close();
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    return `列在位（${cols.length || '?'} 列）+ 临时库真写回读一致`;
  });

  await check('C10d 配置模板同构 (example ↔ 运行配置 + 代码引用段)', () => {
    const exPath = path.join(PKG_DIR, 'growth.config.example.js');
    const rtPath = path.join(PKG_DIR, 'src', 'growth.config.js');
    if (!fs.existsSync(exPath)) throw new Error('缺 growth.config.example.js → 新部署无模板可复制');
    if (!fs.existsSync(rtPath)) throw new Error('缺 src/growth.config.js → cp growth.config.example.js src/growth.config.js');
    const ex = require(path.resolve(exPath));
    const rt = require(path.resolve(rtPath));
    // (1) 代码里引用的配置段必须模板里都有：缺段曾让新部署包 npm run tripath 直接 TypeError
    const srcDir = path.join(PKG_DIR, 'src');
    const refs = new Map();
    for (const f of fs.readdirSync(srcDir).filter(f => f.endsWith('.js') && !/^growth\.config\./.test(f))) {
      const t = fs.readFileSync(path.join(srcDir, f), 'utf8');
      const ids = new Set([...t.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]\.\/growth\.config['"]\)/g)].map(m => m[1]));
      for (const id of ids) for (const m of t.matchAll(new RegExp('\\b' + id + '\\.([A-Za-z_]\\w*)', 'g'))) {
        const seen = refs.get(m[1]) || [];
        if (!seen.includes(f)) refs.set(m[1], [...seen, f]);
      }
    }
    const missing = [...refs.keys()].filter(k => !(k in ex)).sort();
    if (missing.length) throw new Error('模板缺段（按模板新部署即崩）: '
      + missing.map(k => `${k}←${(refs.get(k) || []).join(',')}`).join('；') + ' → 同步进 growth.config.example.js');
    // (2) 模板与运行配置键值同构一致 / structural + value equality
    if (JSON.stringify(rt) !== JSON.stringify(ex)) {
      const keys = new Set([...Object.keys(rt), ...Object.keys(ex)]);
      const diff = [...keys].filter(k => JSON.stringify(rt[k]) !== JSON.stringify(ex[k]));
      throw new Error('模板与运行配置漂移，段: ' + (diff.join('/') || '嵌套差异') + ' → 两处同步（模板为运行配置的同构镜像）');
    }
    return `${refs.size} 个被引用配置段齐备（${[...refs.keys()].sort().join(',')}），模板与运行配置一致`;
  });

  await check('C10e 库内引用完整性（孤儿行零残留）', async () => {
    if (!store) throw new Error('C4 未通过，跳过');
    // 本包连接上 PRAGMA foreign_keys 为关闭（sql.js 默认），DELETE 不级联清子表：
    // 探针/测试实体删除后会在子表留下孤儿行，污染 KESPI 均分、孤岛率与元认知 selfCheck 读数。
    // 2026-09-13 实测残留 7 行（selftest-probe / sensitivity-probe / poison-probe 身后件）。
    const childCols = [
      ['entity_embeddings', 'entity_id'],
      ['entity_metadata', 'entity_id'],
      ['type_index', 'entity_id'],
      ['kespi_history', 'entity_id'],
      ['error_log', 'entity_id'],
      ['links', 'source_id'],
      ['links', 'target_id']
    ];
    const found = [];
    for (const [tbl, col] of childCols) {
      let rows;
      try {
        rows = store.all(`SELECT ${col} AS k FROM ${tbl} WHERE ${col} IS NOT NULL AND ${col} NOT IN (SELECT id FROM entities) GROUP BY ${col}`);
      } catch (e) { continue; }   // 表不存在（新库尚未建表）→ 视为零残留
      if (rows && rows.length) found.push(`${tbl}.${col} ${rows.length} 个悬空键（${rows.slice(0, 3).map(r => r.k).join(', ')}${rows.length > 3 ? ' …' : ''}）`);
    }
    if (found.length) {
      throw new Error('孤儿行残留：' + found.join('；')
        + ` → 清理前先备份 knowledge.db，再执行 DELETE FROM <表> WHERE <键> NOT IN (SELECT id FROM entities)；根治是在 knowledge-store.init() 开启 PRAGMA foreign_keys=1（源码侧）`);
    }
    const fk = store.all('PRAGMA foreign_keys');
    return `零悬空引用（7 类子表/链接端点已核，FK=${fk && fk.length ? fk[0].foreign_keys : '?'}）`;
  });

  await check('C10f 已砍组件防复活（多租户 tenant）', () => {
    // 2026-09-14 用户决定砍掉多租户组件：旧实现只给会话键拼 `tenant::` 前缀，共库共表，
    // 不构成任何数据隔离，却把「租户隔离」撑成对外能力声明（README/手册/绿名单都曾这么写）。
    // 砍除后必须由门禁守住——否则死代码会从任何一院的复制粘贴里复活。
    // 扫描面 = 代码 + 对外声称面；历史决策文档（DESIGN-*/releases/*/Engineering/* 与 raw/wiki 语料）
    // 属决策史与用户知识内容，不改写也不计入违规（本包纪律：评审文档是历史，不当现状引用）。
    const CODE = /* gate-self */[/x-tenant-id/i, /\btenant\b\s*[=:]/, /\$\{\s*tenant\s*\}/, /tenant::/, /['"]tenant['"]/i, /\.tenant\b/];
    const CLAIM = /* gate-self *//租户|[Tt]enant/;
    const EXEMPT = /(已砍除|砍除|砍掉|防复活|死代码|无多租户|单用户|removed|不再|禁止|历史|决策史|~~)/i;
    const hits = [];
    const scan = (rel, patterns) => {
      const abs = path.join(PKG_DIR, rel);
      if (!fs.existsSync(abs)) return;
      fs.readFileSync(abs, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (/gate-self/.test(line)) return; // 门禁自身的模式定义行豁免（否则模式表自匹配）        if (!patterns.some(re => re.test(line))) return;
        if (EXEMPT.test(line)) return;                 // 显式标注"已砍除"的说明行放行
        if (!patterns.some(re => re.test(line))) return; // 未命中模式的行不记
        hits.push(`${rel}:${i + 1} ${line.trim().slice(0, 56)}`);
      });
    };
    for (const f of fs.readdirSync(path.join(PKG_DIR, 'src')).filter(f => f.endsWith('.js'))) scan('src/' + f, CODE);
    for (const f of ['verify-deploy.js', 'tools/self-test.js']) scan(f, CODE);
    for (const f of ['README.md', 'AGENTS.md', 'docs/GREEN-LIST.md', 'docs/module-handbook.md', 'docs/DEPLOY-PLAYBOOK.md', 'docs/AGENT-ONBOARDING.md']) scan(f, [CLAIM]);
    if (hits.length) {
      throw new Error('多租户残留 ' + hits.length + ' 处（组件已于 2026-09-14 砍除，本包定位单用户）: '
        + hits.slice(0, 3).join(' ｜ ') + (hits.length > 3 ? ` …另 ${hits.length - 3} 处` : '')
        + ' → 删除 tenant 代码与对外声称；确需保留说明必须在同行标注「已砍除」');
    }
    return 'tenant 零残留（代码 + 5 个声称面已扫，历史决策文档按纪律豁免）';
  });

  // ── 报告 ─────────────────────────────────────────────────────
  console.log('\n═══ aing 部署验收报告 / Deployment Acceptance Report ═══');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '  ' + r.detail : '\n     ↳ ' + r.detail}`);
  }
  const failed = results.filter(r => !r.ok);
  if (failed.length === 0) {
    console.log('\n🟢 ALL GREEN —— 部署验收通过（deploy verified）');
    // 验收登记自动化：data/last-verify.json 曾由验收 agent 手抄，长期残留旧 hash 与旧项数，
    // 而面板 health.gates 直接引用它（纪律第 6 条：状态单一来源）→ 全绿时由脚本自写。
    try {
      const { spawnSync } = require('child_process');
      const g = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: PKG_DIR, encoding: 'utf8' });
      const hash = (g && g.status === 0 && String(g.stdout || '').trim()) ? String(g.stdout).trim() : 'n/a';
      const maxC = Math.max(...results.map(r => { const mm = String(r.name).match(/^C(\d+)/); return mm ? Number(mm[1]) : 0; }));
      const reg = {
        result: `C0-C${maxC} ALL GREEN`,
        date: new Date().toISOString().slice(0, 10),
        hash,
        checks: results.length,
        note: '由 verify-deploy.js 全绿时自动登记；面板 health.gates 以此为据。'
      };
      fs.mkdirSync(path.join(PKG_DIR, 'data'), { recursive: true });
      fs.writeFileSync(path.join(PKG_DIR, 'data', 'last-verify.json'), JSON.stringify(reg, null, 2) + '\n', 'utf8');
      console.log(`📝 验收登记已刷新 data/last-verify.json（${reg.result} @${reg.hash}，${reg.checks} 项 / registry refreshed）`);
    } catch (e) {
      console.log('⚠️  验收登记写入失败（不影响全绿结论）:', e && e.message);
    }
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
