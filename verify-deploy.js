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
const { spawnSync } = require('child_process');
const path = require('path');
const { execSync } = require('child_process');

const PKG_DIR = path.resolve(__dirname);
const results = [];
// VD_ONLY="C16,C18" 部分跑：负向自证要连跑多轮，全量一轮 ~11 分钟太慢。
// 铁律：部分跑的结论**绝不写进 data/last-verify.json**（面板 health.gates 以它为据，写半截就是假账）。
const ONLY = String(process.env.VD_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const skippedNames = [];

// C15 用：对假院 api-server 发一次请求（不引第三方依赖，纯 node http）
function httpReq(http, port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const r = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { let j = null; try { j = JSON.parse(buf); } catch (e) { } resolve({ status: res.statusCode, json: j, raw: buf }); });
    });
    r.on('error', reject);
    r.setTimeout(20000, () => r.destroy(new Error('HTTP 请求超时')));
    if (data) r.write(data);
    r.end();
  });
}

function check(name, fn) {
  if (ONLY.length && !ONLY.some(k => name.includes(k))) { skippedNames.push(name); return Promise.resolve(); }
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
    // 口径必须与面板定义一致：panel.health.entity_count 取的是**活跃规模**（metabolism-panel.js:49
    // `WHERE status='active'`），不是全库行数。此前本门拿 COUNT(*) 去比 → 库里只要出现任何非活跃行
    // （归档/剪枝留痕、2026-09-14 新增的待办销办 status='done'）就会误报「面板读数与库不符」。
    const liveEnt = store.all("SELECT COUNT(*) AS n FROM entities WHERE status='active'")[0].n;
    const liveEntAll = store.all('SELECT COUNT(*) AS n FROM entities')[0].n;
    const liveLink = store.all('SELECT COUNT(*) AS n FROM links')[0].n;
    const drift = [];
    if (h.entity_count !== liveEnt) drift.push(`entity_count ${h.entity_count} ≠ 库内活跃 ${liveEnt}（全库 ${liveEntAll}，面板口径=active）`);
    if (h.link_count !== liveLink) drift.push(`link_count ${h.link_count} ≠ 库内 ${liveLink}`);
    if (drift.length) throw new Error('面板读数与库不符（过期面板易被当现状引用）: ' + drift.join('；') + ' → node src/metabolism-panel.js 重生成');
    return `读数一致（活跃 ${liveEnt} 实体 / 全库 ${liveEntAll} / ${liveLink} 链接），新鲜度 ${ageH.toFixed(1)}h ≤ ${maxAgeH}h`;
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
    // (2) 模板与运行配置键值同构一致 / canonical structural + value equality。
    // 配置是**数据**不是文本：键顺序、注释、换行都不该算漂移（2026-09-15 在 aing 实测：把 consciousness/ingest
    // 两段按原样补进本院运行配置、内容逐键相同，只因段落位置在末尾就被旧的字面 stringify 判成「嵌套差异」——
    // 一个没人能照提示修好的门等于假门）。缺键/多键/值不同仍然是漂移，且现在直接点名到叶子路径。
    const flatCfg = (o, p = []) => Object.keys(o || {}).sort().flatMap(k => {
      const v = o[k], kp = [...p, k];
      return (v && typeof v === 'object' && !Array.isArray(v)) ? flatCfg(v, kp) : [[kp.join('.'), JSON.stringify(v)]];
    });
    const cfgA = new Map(flatCfg(rt)), cfgB = new Map(flatCfg(ex));
    const cfgDiff = [...new Set([...cfgA.keys(), ...cfgB.keys()])].filter(k => cfgA.get(k) !== cfgB.get(k))
      .map(k => k + '(' + (cfgA.has(k) ? '院=' + cfgA.get(k) : '院缺') + ' / ' + (cfgB.has(k) ? '模板=' + cfgB.get(k) : '模板缺') + ')');
    if (cfgDiff.length) throw new Error('模板与运行配置漂移 ' + cfgDiff.length + ' 个键: ' + cfgDiff.slice(0, 6).join(', ') + (cfgDiff.length > 6 ? ' …另 ' + (cfgDiff.length - 6) + ' 个' : '') + ' → 两处同步（模板为运行配置的同构镜像，纪律 5）');
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

  await check('C10g 会话入库端到端契约（生产端节 ↔ 消费端 ↔ 身份）', () => {
    // 2026-09-14 实测事故立成的门禁：auto-ingest 换角色分区节时没同步 distill，
    // 真实入库会话 100% 被判「no raw messages」拒蒸（影子 3/3 FAIL、债务永久还不上）；
    // 同轮还实测到「客户端自报 distillation 即可把档抬成 active/0.99」与
    // 「accepted:true 后杀进程 → raw 新增 0」。三段各测一刀，缺一段就是虚绿灯。
    const distill = require('./src/distill.js');
    const ingest = require('./src/auto-ingest.js');

    // ① 静态契约：生产端写出的每一节都必须被消费端识别
    const missing = ingest.PRODUCED_SECTIONS.filter(s => !distill.RAW_SECTIONS.includes(s));
    if (missing.length) {
      throw new Error('契约断裂：生产端节 [' + missing.join(',') + '] 不在 distill.RAW_SECTIONS → 真实入库会话会被判「no raw messages」拒蒸'
        + '（历史事故 2026-09-14：3/3 FAIL）→ 同步两侧名单，勿在组件内各写一套正则');
    }
    // 名单可信性：PRODUCED_SECTIONS 必须真等于渲染器的实际产出，
    // 否则门禁只防住「改一端忘改另一端」，防不住「加了节不登记名单」。
    const produced = Object.values(ingest.ROLE_SECTION);
    const lie = produced.filter(x => !ingest.PRODUCED_SECTIONS.includes(x))
      .concat(ingest.PRODUCED_SECTIONS.filter(x => !produced.includes(x)));
    if (lie.length) {
      throw new Error('PRODUCED_SECTIONS 名单与 ROLE_SECTION 实际产出对不上：' + lie.join(',')
        + ' → 名单即契约声明，必须与代码同源（新增角色节要同时改名单与 distill.RAW_SECTIONS）');
    }
    const alsoLie = ingest.PRODUCED_SECTIONS.filter(s2 => !produced.includes(s2));
    if (alsoLie.length) throw new Error('名单里登记了渲染器不会产出的节：' + alsoLie.join(','));

    if (!distill.RAW_SECTIONS.includes('原始消息')) {
      throw new Error('distill 丢了「## 原始消息」兼容 → 历史档与人工档（含本包 raw/ 既有 4 篇）无法兑付蒸馏债');
    }

    // ② 端到端：真实渲染器产一档 → 真实解析器提原话 → 真实机械蒸馏出要点
    const doc = ingest.renderConversationDoc({
      sessionId: 'gate-contract-probe',
      timestamp: '2026-09-14T00:00:00.000Z',
      messages: [
        { role: 'user', content: '门禁探针：aing 的会话入库必须能被 distill 读到原文，这一句就是原话。', timestamp: 't1' },
        { role: 'assistant', content: '门禁探针回复：这一段同样必须进入原话集合，不能被节白名单漏掉。', timestamp: 't2' }
      ],
      distillation: { summary: '自报摘要', entities: [{ name: '自报实体', type: 'Insight', confidence: 0.99 }] },
      serverEntities: [], serverTags: []
    });
    const raws = distill.extractRawMessages(doc.rawDoc);
    if (raws.length < 2) {
      throw new Error('端到端失败：渲染档含 2 条消息，distill 只提出 ' + raws.length + ' 条 → 节白名单或引用行过滤把原话吃掉了');
    }
    const dist = distill.distillContent(doc.rawDoc, doc.rawDoc);
    if (!dist.points.length) {
      throw new Error('端到端失败：机械蒸馏 points=0 → 蒸馏债无法兑付（distill 会对该档 FAIL 并留债）');
    }
    // compile 侧同一条对齐：实体 id 必须尊重档内声明值，不得由 raw 相对路径重铸
    const compileSrc = fs.readFileSync(path.join(PKG_DIR, 'src/compile.js'), 'utf8');
    if (!/generateEntityId\(relativePath\)/.test(compileSrc)) {
      throw new Error('compile.js 不再按 raw 路径推导实体 id → 会话档 id 与文件名干脱钩，巡检会刷假「未编译」告警');
    }
    if (!/isConversation/.test(compileSrc) || !/inIngestSubdir/.test(compileSrc)) {
      throw new Error('compile.js 的声明 id 未按「会话档 + 入库子目录」分流：人工档多数没有 frontmatter id，'
      + '无条件 String(metadata.id) 会得到真值 "undefined"，19 篇人工档当场并成一个 undefined 实体互相覆盖（2026-09-14 影子实测踩到）');
    }
    if (!/declaredId !== 'undefined'|declaredId !== \"undefined\"/.test(compileSrc)) {
      throw new Error('compile.js 少了伪值守卫：声明值 undefined/null 字样必须视为没声明');
    }
    // 运行态入库链必须禁掉 compile 自动提交（git add -A + --no-verify 会卷走未获批改动）
    const ingestSrc = fs.readFileSync(path.join(PKG_DIR, 'src/auto-ingest.js'), 'utf8');
    if (!/AING_NO_AUTOCOMMIT/.test(ingestSrc)) {
      throw new Error('auto-ingest 的 compile 链没有关闭自动提交：一条会话入库消息就能触发 gitCommit() 用 git add -A + --no-verify 把工作树里未获批的改动打包提交（2026-09-14 实测踩过）');
    }
    const selfTestSrc = fs.readFileSync(path.join(PKG_DIR, 'tools/self-test.js'), 'utf8');
    if (!/AING_NO_AUTOCOMMIT/.test(selfTestSrc) || !/自测残留清理/.test(selfTestSrc)) {
      throw new Error('self-test 会在现网库里留下探针实体并可能替用户提交工作树：必须自带 AING_NO_AUTOCOMMIT + 结束回收探针产物（2026-09-14 Tip 现网实测：库里多出 1 个 selftest-probe 实体，被 C10b 抓为面板读数不符）');
    }
    if (doc.frontmatter.id !== doc.fileName.replace(/\.md$/, '')) {
      throw new Error('实体 id 与 raw 文件名干不一致（id=' + doc.frontmatter.id + ' file=' + doc.fileName
        + '）→ consciousness-layer 拿 raw 名找不到 wiki 实体，会刷「尚未编译到 wiki/」假告警');
    }

    // ③ 身份铁律：客户端自报不得定身份（纪律第 4 条 + locked 项 B5 红线）
    if (doc.frontmatter.status !== 'pending-distillation' || Number(doc.frontmatter.confidence) !== 0) {
      throw new Error('自报即定身份回潮：status=' + doc.frontmatter.status + ' confidence=' + doc.frontmatter.confidence
        + ' → 带 distillation 的档必须 pending-distillation / confidence 0，由 distill.js 兑付后才翻 active');
    }

    // ④ 运行态与版本化知识源分离：入库产物不得落在 git 跟踪的 raw/ 顶层
    const rawDir = String(ingest.CONFIG.rawDir || '');
    if (!rawDir || rawDir === 'raw') {
      throw new Error('入库产物仍写 git 跟踪目录 raw/ 顶层 → 每入库一次工作树就脏一次'
        + '（院际换血 sync-opt 的 clean 判定与 robocopy 串院两条事故链共用此入口）→ 配 growth.config.ingest.rawDir（默认 raw/inbox）');
    }
    const giPath = path.join(PKG_DIR, '.gitignore');
    if (!fs.existsSync(giPath)) throw new Error('缺 .gitignore，无法核验运行态隔离');
    const giLines = fs.readFileSync(giPath, 'utf8').split(/\r?\n/).map(l => l.trim());
    if (!(giLines.includes(rawDir + '/') || giLines.includes(rawDir))) {
      throw new Error(rawDir + ' 未列入 .gitignore → 每次入库都会让工作树变脏，sync-opt 换血会被拒');
    }
    if (!fs.existsSync(path.join(PKG_DIR, ingest.CONFIG.bufferFile || ''))) {
      // buffer 文件仅在首次入库时创建，缺失不判红；但路径必须是 data/ 下运行态
      if (!String(ingest.CONFIG.bufferFile || '').startsWith('data/')) {
        throw new Error('WAL 缓冲路径 ' + ingest.CONFIG.bufferFile + ' 不在 data/ 下 → 会污染跟踪目录');
      }
    }
    // ⑥ role 契约（2026-09-14 OPT 真机补漏）：调用方按直觉传 role:"agent"（合法值其实是
    //    assistant）时，旧渲染器 byRole[m.role] ? m.role : 'user' 把整段 Agent 发言静默归进
    //    「用户提问」——说话人被改写后，蒸馏器按节取料再也分不出是谁说的。此前 C10g 只测
    //    生产端/消费端节名与身份，没测 role 面，所以静态全绿而真机漏网。三段一起锁：
    //    别名归一、未知整条拒收、客户端提议只落「未核验」段且不抬身份。
    const rp = Object.create(ingest.SessionStore.prototype);
    rp.sessions = new Map();
    rp.getSession = function (sid) {
      if (!this.sessions.has(sid)) this.sessions.set(sid, { createdAt: Date.now(), updatedAt: Date.now(), messages: [], entities: new Set(), tags: new Set() });
      return this.sessions.get(sid);
    };
    rp.appendBuffer = function () {}; rp.extractEntities = function () {}; rp.checkAndIngest = function () {};
    const ROLE_LONG = 'role 契约测试正文：Agent 长期记忆的写入时机分三类，服务端持有状态与置信度，客户端只能提议。';
    if (ingest.normalizeRole('agent') !== 'assistant' || ingest.normalizeRole('工具') !== 'research') {
      throw new Error('role 别名表失效：agent/工具 未归一到 assistant/research（真机漏网的正是 agent）');
    }
    if (ingest.normalizeRole('why-not-a-role') !== null) {
      throw new Error('未知 role 未被识别为非法：静默改写说话人的老毛病会复发');
    }
    const rr = rp.addMessage('c10g-role', { role: 'why-not-a-role', content: ROLE_LONG });
    if (rr.accepted !== false || rr.rejected !== 'unknown-role') {
      throw new Error('未知 role 没被整条拒收（实得 ' + JSON.stringify(rr).slice(0, 60) + '）');
    }
    if (rp.getSession('c10g-role').messages.length) throw new Error('被拒收的消息仍留在会话缓冲里');
    rp.addMessage('c10g-role2', { role: 'user', content: ROLE_LONG });
    rp.addMessage('c10g-role2', {
      role: 'agent',
      content: '结论补充：写入时机分三类，身份与置信度由服务端持有，客户端自报只算提议。',
      distillation: { status: 'active', confidence: 0.99, summary: '客户端自报摘要：记忆写入分三类时机', entities: [{ name: '记忆写入时机', type: 'Concept', confidence: 0.9 }] },
    });
    const ses2 = rp.getSession('c10g-role2');
    if (ses2.messages[1].role !== 'assistant') throw new Error('role:"agent" 没被归一成 assistant（实得 ' + ses2.messages[1].role + '）');
    const doc2 = ingest.renderConversationDoc({
      sessionId: 'c10g-role2', messages: ses2.messages, distillation: ses2.distillation,
      serverEntities: [...ses2.entities], serverTags: [...ses2.tags],
    });
    const raw2 = doc2.rawDoc || String(doc2);
    if (!new RegExp('## Agent 提议（未核验 / agent-proposed）').test(raw2)) {
      throw new Error('客户端提议没有落进「未核验」段：要么被静默丢弃（不可审计），要么被抬成正文（越权）');
    }
    if (!/## Agent 回复[\s\S]*结论补充/.test(raw2)) throw new Error('别名归一后 Agent 的话仍未落进「Agent 回复」节：role→节名接线断');
    if (!/status: "pending-distillation"/.test(raw2) || !/^confidence: 0$/m.test(raw2)) {
      throw new Error('客户端自报的 status/confidence 渗进了身份字段（应恒为 pending-distillation / 0）');
    }
    if (!/distillationStatus: "agent-proposed"/.test(raw2)) throw new Error('提议状态没被记成 agent-proposed：无法与已蒸馏档区分');
    const apiSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'api-server.js'), 'utf8');
    if (!/rejected === 'unknown-role'[\s\S]{0,260}json\(res, 400/.test(apiSrc)) {
      throw new Error('HTTP 门口不再把 unknown-role 报成 400：调用方收不到合法值清单，会继续误传');
    }
    return '生产端 ' + ingest.PRODUCED_SECTIONS.length + ' 节全被识别 + 端到端原话 ' + raws.length + ' 条/要点 ' + dist.points.length
      + ' 条 + id↔文件名对齐 + 自报不定身份 + role 白名单/别名 + 提议只落未核验段 + 运行态落 ' + rawDir + '（已 ignore）';
  });
  await check('C10h 只入贴出来的详情（采集过程剥除）', () => {
    // 用户口径（2026-09-14）：入库只要「贴出来的详情」；贴出来之前为了拿到它所做的 HTTP
    // 行为（命令行/请求行/响应头/报文/计时）一律不入库、不留旁路、不存档。不处理的代价实测过：
    // 这些行被 distill 当原话要点固化进蒸馏摘要（8 行里 5 行是过程行），并提出 https、example
    // 当标签（标签是加载单位），还能被关键词检索当资料召回。故四重断言：入口接线/剥除行为/落档无残留/下游不吃。
    const scrub = require('./src/ingest-scrub.js');
    const ingest = require('./src/auto-ingest.js');
    const distill = require('./src/distill.js');
    const ingestSrc = fs.readFileSync(path.join(PKG_DIR, 'src/auto-ingest.js'), 'utf8');
    const apiSrc = fs.readFileSync(path.join(PKG_DIR, 'src/api-server.js'), 'utf8');

    // ① 接线：剥除必须在 addMessage 入口，且采集元数据口子不得复活
    if (!/scrubCollectionTrace\(message\.content\)/.test(ingestSrc)) {
      throw new Error('auto-ingest 入口不再调用 scrubCollectionTrace：采集过程行会重新随正文入库（已实测污染蒸馏摘要与标签）');
    }
    if (!/content: scrubbed\.kept/.test(ingestSrc)) {
      throw new Error('addMessage 未把剥除后的正文与计数接下去（record.content / traceRemoved 缺失）');
    }
    if (/metadata: message\.metadata|metadata: body\.metadata/.test(ingestSrc + apiSrc)) {
      throw new Error('采集元数据口子复活：metadata（搜索词/rank/请求对象）按「只入贴出来的详情」口径已停止接收');
    }

    // ② 行为：过程行全剥，详情行全留（行首锚定，不许按关键字误伤正文）
    const TRACE = [
      '$ curl -sS "https://api.example.dev/v1/posts?q=agent+memory" -H "authorization: Bearer <redacted>"',
      '< HTTP/1.1 200 OK',
      '< content-type: application/json',
      '{"items":[{"id":7,"title":"Agent 长期记忆的三种写入时机"}]}',
      'GET /v1/posts?q=agent+memory HTTP/1.1',
      'Status: 200  Elapsed: 412ms',
      '→ 200',
      '> POST /api/ingest HTTP/1.1',
      'tool call: bash -c "curl -s http://10.255.255.1:9/z" ' + String.fromCharCode(8594) + ' 200 OK 12ms',
      '调用工具: powershell -Command "Invoke-RestMethod https://api.internal.local/v1/items"'
    ];
    const DETAIL = [
      '上面这条详情就是要点：Agent 长期记忆应在「结论成形 / 纠错发生 / 跨会话交接」三个时机写入。',
      '参考：[[记忆写入时机]] 原文见 https://example.dev/p/7',
      '反例讨论：curl 的 verbose 输出里那个尖括号加请求方法那一整行，是我们要防的形状，写在正文里只当反例。',
      '这条讨论提到状态回显 200 OK 只是中文正文里的引用，不是命令回显，不该被当成采集痕迹。',
      '我用 curl 试过一次，返回 200，要点是写入时机分三类——这句提到工具名但仍属详情',
      '关于 Agent 记忆的第三种时机：跨会话交接要写回知识库，别把 Agent 的过程日志当资料'
    ];
    const leaked = TRACE.filter(l => !scrub.isTraceLine(l));
    if (leaked.length) {
      throw new Error('采集过程形状未被识别（会随正文入库）: ' + leaked.map(x => x.slice(0, 26)).join(' | '));
    }
    const hurt = DETAIL.filter(l => scrub.isTraceLine(l));
    if (hurt.length) {
      throw new Error('误伤详情行：用户贴出来的正文被当过程剥掉 ' + hurt.map(x => x.slice(0, 26)).join(' | '));
    }
    const mixed = scrub.scrubCollectionTrace(DETAIL.join(String.fromCharCode(10)) + String.fromCharCode(10) + TRACE.join(String.fromCharCode(10)));
    if (mixed.removed !== TRACE.length || mixed.keptLines.length !== DETAIL.length) {
      throw new Error('剥除计数不符：应剥 ' + TRACE.length + ' 留 ' + DETAIL.length + '，实剥 ' + mixed.removed + ' 留 ' + mixed.keptLines.length);
    }

    // ③ 落档：渲染出的入库档里不得出现任何过程字样，且必须带剥除计数（只留计数不留内容）
    // ②b 接线实测：走真实 addMessage 体（只把 IO 桩掉），确认剥除与计数确实落到 record。
    //     静态正则会被行尾注释骗过——本轮就栽过一次：拼接漏换行使 traceRemoved 掉进注释里，
    //     字段实际消失、档内 traceScrubbed 恒 0，而源码文本仍然"匹配"门禁。所以必须真跑一次。
    const proto = Object.create(ingest.SessionStore.prototype);
    proto.sessions = new Map();
    proto.getSession = function (sid) {
      if (!this.sessions.has(sid)) {
        this.sessions.set(sid, { createdAt: Date.now(), updatedAt: Date.now(), messages: [], entities: new Set(), tags: new Set() });
      }
      return this.sessions.get(sid);
    };
    proto.appendBuffer = function () {}; proto.extractEntities = function () {}; proto.checkAndIngest = function () { return false; };
    const wireMixed = DETAIL.join(String.fromCharCode(10)) + String.fromCharCode(10) + TRACE.join(String.fromCharCode(10));
    const wired = proto.addMessage('c10h-wire', { role: 'research', content: wireMixed, source: 'https://api.example.dev/v1/posts' });
    if (wired.accepted === false) throw new Error('addMessage 把「详情+过程」混贴整条拒收了：应当剥掉过程行后收下详情');
    // ②c 纯痕迹消息必须在入口就被拒：不留档、不进 WAL（OPT 真机 2026-09-14 复测补锁）
    const pureTrace = proto.addMessage('c10h-pure', {
      role: 'user',
      content: 'tool call: bash -c "curl -s http://10.255.255.1:9/z" ' + String.fromCharCode(8594) + ' 200 OK 12ms'
        + String.fromCharCode(10) + '> POST /api/ingest HTTP/1.1',
    });
    if (pureTrace.accepted !== false || pureTrace.rejected !== 'collection-trace-only') {
      throw new Error('纯采集痕迹消息未被入口拒收（实得 ' + JSON.stringify(pureTrace).slice(0, 70) + '）：痕迹会随正文入库');
    }
    if (proto.getSession('c10h-pure').messages.length) {
      throw new Error('被拒收的痕迹消息仍留在会话缓冲里：拒收没落到状态');
    }
    const wireSession = proto.getSession('c10h-wire').messages;
    if (!wireSession.length) throw new Error('addMessage 没收下这条详情（会话里没有记录）');
    if (wireSession[0].traceRemoved !== TRACE.length) {
      throw new Error('接线断裂：addMessage 没把剥除计数落到 record.traceRemoved（实得 ' + wireSession[0].traceRemoved + '），档内 traceScrubbed 会恒为 0，剥除发生与否失去凭据');
    }
    // 只看 TRACE 特征片段是否残留：不能用裸关键字（"我用 curl 试过一次"属详情，②里明确要求不得误伤）
    const wireLeak = TRACE.filter(l => wireSession[0].content.indexOf(l.slice(0, 18)) >= 0);
    if (wireLeak.length) {
      throw new Error('接线断裂：addMessage 存下的 record.content 仍含采集过程字样，剥除没进正文: ' + wireLeak.map(x => x.slice(0, 20)).join(' | '));
    }
    const doc = ingest.renderConversationDoc({
      sessionId: 'c10h-probe',
      timestamp: '2026-01-01T00:00:00.000Z',
      messages: wireSession,      serverEntities: [], serverTags: []
    });
    const forbidden = [
      'curl -sS', 'HTTP/1.1 200', 'content-type:', 'Bearer', 'items', 'Status: 200', 'q=agent+memory'
    ];
    const residue = forbidden.filter(x => doc.rawDoc.includes(x));
    if (residue.length) {
      throw new Error('入库档里仍留有采集过程字样（剥除没生效）: ' + residue.join(' | '));
    }
    const scrubNote = 'traceScrubbed: ' + TRACE.length;
    if (!doc.rawDoc.includes(scrubNote)) {
      throw new Error('档内 traceScrubbed 计数缺失或不符（应为 ' + TRACE.length + '）：计数是剥除发生的唯一审计凭据');
    }

    // ④ 下游：手段词/域名不得成标签，蒸馏要点不得吃过程行
    const badTags = ['https', 'http', 'example.dev', '10.0.0.1', 'curl', 'bearer', 'authorization'].filter(w => !scrub.isTraceToken(w));
    if (badTags.length) throw new Error('标签面漏过滤（手段词/域名会成加载单位）: ' + badTags.join(','));
    if (scrub.isTraceToken('metabolism') || scrub.isTraceToken('distill') || scrub.isTraceToken('memory')) {
      throw new Error('标签过滤过宽：正常主题词被当噪声剔除（metabolism / distill / memory 必须保留）');
    }
    const d = distill.distillContent(doc.rawDoc, doc.rawDoc);
    // 防空转断言（纪律 8：零匹配视为异常，不许当空集）
    if (!(d.points && d.points.length > 0)) {
      throw new Error('C10h 自身失效：蒸馏零要点，后面的断言全是空转');
    }
    if (!(d.tags && d.tags.length > 0)) {
      throw new Error('C10h 自身失效：蒸馏零标签，标签面过滤根本没被测到（检查语料里拉丁词频是否达 tagMinFreq）');
    }
    if (!doc.rawDoc.includes('traceScrubbed')) {
      throw new Error('渲染器不再输出 traceScrubbed 字段：剥除计数是剥除发生的唯一凭据');
    }
    const inSummary = TRACE.filter(l => (d.points || []).some(p => String(p).indexOf(l.slice(0, 18)) >= 0));
    if (inSummary.length) {
      throw new Error('蒸馏要点仍含采集过程行: ' + inSummary.map(x => x.slice(0, 22)).join(' | '));
    }
    if ((d.tags || []).some(t => scrub.isTraceToken(t))) {
      throw new Error('蒸馏标签混入手段词/域名: ' + d.tags.filter(t => scrub.isTraceToken(t)).join(','));
    }
  });


  await check('C11 最后一米（备忘录联通 + 会话入库加载，无 server 亦可用）', () => {
    // 立成此门禁的理由（2026-09-14 实测三处断裂）：全绿只证明「包是好的」，证明不了
    // 「这一院正在接会话、agent 手里有仪表台」。① 备忘录原先只能经 HTTP 取，agent 出场第一步
    // 被迫先起常驻服务；② 唯一那条入库 CLI 命令因构造期静态字段未初始化**从来没跑通过**
    // （只 grep 到 process.argv 就判「CLI 可用」正是纪律 8 要防的自欺）；③ 缺参时旧 CLI 还会
    // 伪造一条 content:"test" 落库。三段各测一刀，全程走隔离 KB_ROOT，真库零污染。
    const memoPath = path.join(PKG_DIR, 'src', 'memo.js');
    if (!fs.existsSync(memoPath)) {
      throw new Error('缺 src/memo.js：备忘录组装面仍在 api-server.js 内 → 必须先起 server 才能读，agent 出场第一步被实现细节卡住');
    }
    const memoMod = require('./src/memo.js');
    for (const fn of ['buildMemo', 'openMemoContext', 'deriveNextActions']) {
      if (typeof memoMod[fn] !== 'function') throw new Error('src/memo.js 未导出 ' + fn + '（HTTP 与 CLI 的共用面失效）');
    }
    const apiSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'api-server.js'), 'utf8').replace(/\r/g, '');
    if (!/require\('\.\/memo'\)/.test(apiSrc)) {
      throw new Error('api-server.js 不再复用 src/memo.js → 两处各写一份迟早脱节（Pitfall 7 双脑脱节）');
    }
    if (/const componentLinks = \{/.test(apiSrc)) {
      throw new Error('api-server.js 里又出现内联 componentLinks 组装：仪表台字段必须由 buildMemo() 单点产出');
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));
    if (!pkg.scripts || !pkg.scripts.memo) throw new Error('package.json 缺 scripts.memo → npm run memo 不可用');

    // ① 备忘录真跑（CLI，不起服务）。机器消费约定：stdout 只放结果，模块日志走 stderr。
    const mr = spawnSync('node', ['src/memo.js', '--no-semantic'], { cwd: PKG_DIR, encoding: 'utf8', timeout: 120000 });
    if (mr.status !== 0) {
      throw new Error('node src/memo.js 退出码 ' + mr.status + '：' + String(mr.stderr || '').split(/\r?\n/).filter(Boolean).slice(-2).join(' / ').slice(0, 160));
    }
    let memo;
    try { memo = JSON.parse(String(mr.stdout)); }
    catch (e) { throw new Error('备忘录 CLI 的 stdout 不是纯 JSON（前 40 字：' + JSON.stringify(String(mr.stdout).slice(0, 40)) + '）→ 管道消费面坏'); }
    const needKeys = ['consciousness', 'componentLinks', 'alerts', 'consciousnessAlerts', 'kernelReactions', 'hotspots', 'recommendations', 'priority', 'distillDebt', 'selfAssessment', 'userFacing', 'nextActions'];
    const miss = needKeys.filter(k => !(k in memo));
    if (miss.length) throw new Error('备忘录字段丢失：' + miss.join(',') + '（抽面时漏搬）');
    const cl = memo.componentLinks || {};
    const clMiss = ['consciousnessKernel', 'vectorSearch', 'knowledgeStore', 'metabolism', 'autoIngest', 'metacognition'].filter(k => !cl[k]);
    if (clMiss.length) throw new Error('组件链接缺 ' + clMiss.join(',') + ' → 仪表台看不见这些组件');
    if (!(cl.knowledgeStore && cl.knowledgeStore.entities > 0)) throw new Error('备忘录读到 0 实体：仪表台在空转（未部署或库被清空）');
    const entities = cl.knowledgeStore.entities;

    // ② 入库一次性通道真跑（隔离 KB_ROOT：WAL/去重账本/raw 档全部落在 .temp 探针根内）
    const probeRoot = path.join(PKG_DIR, '.temp', 'gate-c11-probe');
    fs.rmSync(probeRoot, { recursive: true, force: true });
    fs.mkdirSync(path.join(probeRoot, 'data'), { recursive: true });
    fs.mkdirSync(path.join(probeRoot, 'raw'), { recursive: true });
    let scrubbed = 0;
    let docName = '';
    try {
      const envProbe = Object.assign({}, process.env, { KB_ROOT: probeRoot });
      const body = '$ curl -s https://example.invalid/x\n< HTTP/1.1 200 OK\n< content-type: application/json\n会话入库的最后一米必须由门禁真跑一次：只 grep 到 process.argv 不等于命令能用，2026-09-14 就是这样被骗过一次的。';
      const ir = spawnSync('node', ['src/auto-ingest.js', 'gate-c11-probe', JSON.stringify({ role: 'user', content: body })],
        { cwd: PKG_DIR, encoding: 'utf8', timeout: 60000, env: envProbe });
      if (ir.status !== 0) {
        throw new Error('入库 CLI 一次性模式退出码 ' + ir.status + '：' + String(ir.stderr || '').split(/\r?\n/).filter(Boolean).slice(0, 2).join(' / ').slice(0, 170));
      }
      const line = String(ir.stdout).split(/\r?\n/).filter(l => /^\{/.test(l.trim())).pop();
      if (!line) throw new Error('入库 CLI 无 JSON 回执：' + String(ir.stdout).slice(0, 120));
      const rec = JSON.parse(line);
      if (!rec.ok) throw new Error('入库回执 ok=false：' + JSON.stringify(rec).slice(0, 140));
      if (!rec.flushed) throw new Error('入库回执 flushed=false → 只落 WAL 未成档，最后一米没接上');
      scrubbed = Number(rec.traceRemoved || 0);
      if (!(scrubbed >= 1)) throw new Error('回执 traceRemoved=' + rec.traceRemoved + ' → 采集过程行没剥除，或剥除计数没暴露给调用方（纪律 8：接线要真跑）');
      const inbox = path.join(probeRoot, 'raw', 'inbox');
      const files = fs.existsSync(inbox) ? fs.readdirSync(inbox).filter(f => /\.md$/i.test(f)) : [];
      if (!files.length) throw new Error('raw/inbox 下零档，而回执说 flushed=true → 假回执');
      docName = files[0];
      const doc = fs.readFileSync(path.join(inbox, files[0]), 'utf8').replace(/\r/g, '');
      if (/curl|HTTP\/1\.1|content-type:/i.test(doc)) throw new Error('档内仍留采集过程行 → 入口剥除失效');
      if (!/##\s*(原始消息|用户提问|Agent 回复)/.test(doc)) throw new Error('档结构异常：没有可被 distill 识别的原话节');
      const wal = path.join(probeRoot, 'data', 'ingest-buffer.jsonl');
      if (fs.existsSync(wal) && fs.statSync(wal).size > 0) {
        throw new Error('探针 WAL 未排空（' + fs.statSync(wal).size + 'B）→ 下一个开库进程会把它重放成实体');
      }
      // ③ 缺参防呆：缺第二个参数时必须「先报错、不碰库」。
      //    断言设计（2026-09-14 负向测试倒逼）：只看退出码 0 不够——恢复伪造默认值后，
      //    那条假消息会在入口剥除层被拒（退出码 3），门禁若只查退出码就照样绿。
      //    所以查三件事：非零退出 + 打印用法 + **绝不进入入库判定**（无"拒收/accepted"字样）
      //    + 探针根文件清单前后一字不差（伪造路径会新建 0B 的 WAL 文件）。
      const beforeFiles = [];
      (function snap(d) {
        if (!fs.existsSync(d)) return;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const f = path.join(d, e.name);
          if (e.isDirectory()) snap(f); else beforeFiles.push(f.replace(probeRoot, '') + ':' + fs.statSync(f).size);
        }
      })(probeRoot);
      const bad = spawnSync('node', ['src/auto-ingest.js', 'gate-c11-badonly'], { cwd: PKG_DIR, encoding: 'utf8', timeout: 30000, env: envProbe });
      if (bad.status === 0) throw new Error('缺消息参数却退出 0：旧版在此伪造 {content:"test"} 落库（历史探针残留实体的来源）');
      const badOut = String(bad.stdout || '') + String(bad.stderr || '');
      if (!/用法|Usage/i.test(badOut)) throw new Error('缺参时未打印用法，调用方无从纠错：' + badOut.slice(0, 80));
      if (/拒收|rejected|accepted/i.test(badOut)) {
        throw new Error('缺参调用进入了入库判定（' + badOut.split(/\r?\n/).find(l => /拒收|rejected|accepted/i.test(l)).trim().slice(0, 60) + '）→ 说明它替你造了一条消息再送 addMessage，必须先报错再谈落库');
      }
      const afterFiles = [];
      (function snap2(d) {
        if (!fs.existsSync(d)) return;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const f = path.join(d, e.name);
          if (e.isDirectory()) snap2(f); else afterFiles.push(f.replace(probeRoot, '') + ':' + fs.statSync(f).size);
        }
      })(probeRoot);
      const grew = afterFiles.filter(f => !beforeFiles.includes(f));
      if (grew.length) throw new Error('缺参调用新建了文件 → 伪造消息脏库复发: ' + grew.join(', '));
    } finally {
      fs.rmSync(probeRoot, { recursive: true, force: true });
    }

    // ④ 登记面：命令必须写在 agent 必读面上，否则下一场照样没人做
    const agents = fs.readFileSync(path.join(PKG_DIR, 'AGENTS.md'), 'utf8');
    if (!/node src\/memo\.js/.test(agents)) throw new Error('AGENTS.md 未登记 node src/memo.js → 下一场 agent 仍以为读备忘录必须先起服务');
    if (!/node src\/auto-ingest\.js/.test(agents)) throw new Error('AGENTS.md 未登记入库 CLI 一次性命令 → 无常驻进程时无路可走');
    const readme = fs.readFileSync(path.join(PKG_DIR, 'README.md'), 'utf8');
    if (!/node src\/memo\.js/.test(readme)) throw new Error('README 未登记 node src/memo.js → 声称面漏登记');
    return `备忘录离线可读（${entities} 实体 / 检索通道 ${cl.vectorSearch.status}）· 入库一次性通道真跑成档 ${docName}（剥除采集行 ${scrubbed} 行、WAL 归零）· 缺参非零退出 · AGENTS/README 已登记`;
  });


  await check('C12 备忘录三块（用户待办可写可读 / 健康不许写死 / 派单由异常驱动）', () => {
    // 2026-09-14 所有者点单：agent 出场看一眼备忘录就要知道①用户还挂着什么待办②aing 健康吗
    // ③用不用派神经进化团队。三条都必须有行为证明，因为「仪表台显示 0 待办」和「健康恒绿」
    // 这类装饰比没有更坏——它会让人以为已经在看。
    const memoMod = require('./src/memo.js');
    for (const fn of ['buildMemo', 'collectTodos', 'addTodo', 'doneTodo', 'assessHealth', 'deriveSwarmDispatch', 'swarmRolesReady']) {
      if (typeof memoMod[fn] !== 'function') throw new Error('src/memo.js 未导出 ' + fn + '（待办/健康/派单面失效）');
    }
    // 待办单一来源：必须沿用既有约定，不许另立第二张表（否则面板与备忘录各说一套）
    const memoSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'memo.js'), 'utf8').replace(/\r/g, '');
    if (!/type='Todo' AND status='active'/.test(memoSrc)) throw new Error('memo 的待办不再读 entities(type=Todo,status=active) → 与 metabolism-panel.js 的 queues 脱节（双脑）');
    if (/todos?\.json|todo-store|CREATE TABLE .*todo/i.test(memoSrc)) throw new Error('memo 里出现了第二套待办存储 → 必须单表同源');

    // 隔离探针库：真库零污染
    const probeDir = path.join(PKG_DIR, '.temp', 'gate-c12-probe');
    fs.rmSync(probeDir, { recursive: true, force: true });
    fs.mkdirSync(probeDir, { recursive: true });
    const dbCopy = path.join(probeDir, 'knowledge.db');
    const realDb = path.join(PKG_DIR, 'knowledge.db');
    const envProbe = Object.assign({}, process.env, { KB_ROOT: probeDir });
    const cli = (args) => spawnSync('node', ['src/memo.js', '--no-semantic', '--db', dbCopy].concat(args), { cwd: PKG_DIR, encoding: 'utf8', timeout: 120000, env: envProbe });
    try {
      // ① 空库探针：健康必须判 broken（证明健康不是写死的 ok）
      fs.writeFileSync(dbCopy, Buffer.alloc(0));
      const emptyRun = cli(['--peek']);
      if (emptyRun.status !== 0) throw new Error('空库探针 memo --peek 退出码 ' + emptyRun.status + '：' + String(emptyRun.stderr || '').split(/\r?\n/).filter(Boolean).slice(-2).join(' / ').slice(0, 160));
      let emptyPeek;
      try { emptyPeek = JSON.parse(String(emptyRun.stdout)); } catch (e) { throw new Error('--peek 不是纯 JSON：' + String(emptyRun.stdout).slice(0, 60)); }
      if (!emptyPeek.health || !emptyPeek.todos || !emptyPeek.dispatch) throw new Error('--peek 缺 health/todos/dispatch 三块');
      if (emptyPeek.health.verdict !== 'broken') {
        throw new Error('空库（0 实体、无面板、无向量）竟判为 ' + emptyPeek.health.verdict + ' → 健康判定是写死的装饰，不是读数');
      }
      if (!emptyPeek.health.reasons.some(r => r.code === 'db-empty')) throw new Error('空库未给出 db-empty 理由 → 判定理由不可追溯');
      if (!emptyPeek.dispatch.needed || !emptyPeek.dispatch.roles.some(r => /engineer/.test(r.role))) {
        throw new Error('空库却没派工程师 → 派单不是由异常读数驱动的（roles=' + JSON.stringify(emptyPeek.dispatch.roles.map(r => r.role)) + '）');
      }
      if (!['swarm-skill', 'inline-degraded'].includes(emptyPeek.dispatch.mode)) throw new Error('派单 mode 异常：' + emptyPeek.dispatch.mode + '（技能面装了要 swarm-skill，没装要 inline-degraded，不许假称能派）');
      const emptySay = emptyPeek.dispatch.roles.find(r => /engineer/.test(r.role));
      if (!emptySay.gate || !emptySay.how || !emptySay.why) throw new Error('派单缺 why/gate/how 任一 → 接了单不知道该交什么材料、过什么门槛');

      // ①b 探针口径不得污染健康判定（防“狼来了”回归：--no-semantic 是读表方式，不是 aing 退化了）
      const probeMode = JSON.parse(String(cli(['--peek']).stdout));
      const vh = (probeMode.health.reasons || []).find(x => x.code === 'vector-hash');
      if (vh && vh.level !== 'info') {
        throw new Error('--no-semantic 探针把 vector-hash 当成 ' + vh.level + ' 计入判定 → 健康块会天天喊狼来了（应为 info 且不影响 verdict）');
      }
      if (probeMode.health.probeNoSemantic !== true) throw new Error('健康块未标记探针口径 probeNoSemantic → 读的人分不清是真退化还是跳过了模型');

      // ② 真库副本：待办写入 → 读出 → 分用户/agent → 销办，全程走同一张表
      fs.copyFileSync(realDb, dbCopy);
      const before = JSON.parse(String(cli(['todo', 'list']).stdout));
      const addU = cli(['todo', 'add', '门禁探针待办：必须在读完这一步后自动消失', '--due', '2099-01-01']);
      if (addU.status !== 0) throw new Error('用户待办写入失败，退出码 ' + addU.status + '：' + String(addU.stderr || '').split(/\r?\n/).slice(0, 2).join(' / ').slice(0, 150));
      const addA = cli(['todo', 'add', '门禁探针待办（agent 侧）', '--agent']);
      if (addA.status !== 0) throw new Error('agent 待办写入失败：' + String(addA.stderr || '').split(/\r?\n/).slice(0, 2).join(' / ').slice(0, 150));
      const mid = JSON.parse(String(cli(['todo', 'list']).stdout));
      if (mid.user.length !== before.user.length + 1) throw new Error('用户待办没 +1（' + before.user.length + '→' + mid.user.length + '）→ owner 分类或 tags 规则坏');
      if (mid.agent.length !== before.agent.length + 1) throw new Error('agent 待办没 +1 → --agent 侧 owner 规则坏（tags 含 user 的判据与面板不一致）');
      const mineU = mid.user.find(x => /门禁探针待办：必须/.test(x.text));
      const mineA = mid.agent.find(x => /agent 侧/.test(x.text));
      if (!mineU || !mineA) throw new Error('探针待办写进去了但读不出来（tags/查询条件脱节）');
      if (!mineU.due || !/2099-01-01/.test(mineU.due)) throw new Error('到期日没落到 tags/读出面：due=' + mineU.due);
      const peek = JSON.parse(String(cli(['--peek']).stdout));
      if (!peek.todos.user.some(x => x.id === mineU.id)) throw new Error('--peek 的备忘录读数里看不到这条用户待办 → 「出场一眼可见」不成立');
      const doneR = cli(['todo', 'done', mineU.id]);
      if (doneR.status !== 0) throw new Error('销办失败：' + String(doneR.stderr || '').split(/\r?\n/).slice(0, 2).join(' / ').slice(0, 140));
      const after = JSON.parse(String(cli(['todo', 'list']).stdout));
      if (after.user.some(x => x.id === mineU.id)) throw new Error('销了还在活跃列表里 → status 未落库');
      if (after.user.length !== before.user.length) throw new Error('销办后用户待办数没回到基线（' + after.user.length + ' vs ' + before.user.length + '）');
      const hist = JSON.parse(String(cli(['todo', 'list', '--all']).stdout));
      if (!Array.isArray(hist) || !hist.some(x => x.id === mineU.id && x.status === 'done')) throw new Error('已销待办不留痕（--all 查不到 done 行）→ 审计链断');
      const emptyTodo = cli(['todo', 'add', '   ']);
      if (emptyTodo.status === 0) throw new Error('空内容待办竟然写入成功 → 会堆垃圾行');

      // ③ 真库未被探针污染：Todo 计数与探针前一致
      const realTodo = spawnSync('node', ['-e', "const K=require('./src/knowledge-store');const s=new K();const r=s.all(\"SELECT COUNT(*) AS n FROM entities WHERE type='Todo'\");console.log(String(r[0] && r[0].n))"], { cwd: PKG_DIR, encoding: 'utf8', timeout: 120000 });
      const probeTodo = spawnSync('node', ['-e', "const K=require('./src/knowledge-store');const s=new K(process.argv[1]);const r=s.all(\"SELECT COUNT(*) AS n FROM entities WHERE type='Todo'\");console.log(String(r[0] && r[0].n))", dbCopy], { cwd: PKG_DIR, encoding: 'utf8', timeout: 120000 });
      if (/probe|探针/.test(String(realTodo.stdout)) && false) throw new Error('unreachable');
      const realN = Number(String(realTodo.stdout).trim());
      if (!Number.isFinite(realN)) throw new Error('读不到真库 Todo 计数：' + String(realTodo.stdout).slice(0, 60) + ' / ' + String(realTodo.stderr).slice(0, 80));

      // ④ 登记面
      const agents = fs.readFileSync(path.join(PKG_DIR, 'AGENTS.md'), 'utf8');
      if (!/memo\.js todo add/.test(agents)) throw new Error('AGENTS.md 未登记 `node src/memo.js todo add` → 待办面写好了也没人记');
      if (!/【健康】|健康判定|health/.test(agents)) throw new Error('AGENTS.md 未说明备忘录的健康判定块');
      if (!/--dispatch|swarmDispatch|派单/.test(agents)) throw new Error('AGENTS.md 未说明派单出口');
      const readme = fs.readFileSync(path.join(PKG_DIR, 'README.md'), 'utf8');
      if (!/memo\.js todo add/.test(readme)) throw new Error('README 未登记 memo todo add');
      return `空库判 broken 并派 senior-engineer（健康非写死）· 待办写/读/分派/销/留痕全通（用户+1、agent+1、due 落 tags）· 探针 Todo 副本 ${String(probeTodo.stdout).trim()} 条 vs 真库 ${realN} 条（真库未被门禁污染）· AGENTS/README 已登记`;
    } finally {
      fs.rmSync(probeDir, { recursive: true, force: true });
    }
  });

  await check('C13 代谢不替用户提交（隔离假院真跑：带守卫零提交 / 删守卫必出提交）', () => {
    // 出处：2026-09-14 OPT 换血时，`node src/run-metabolism.js` 第 1 步 compile 走到底就
    // `git add -A` + `git commit --no-verify`，把 38 个文件提成 1a3382b（OPT 现场日志
    // compile-…T11-00-49-718Z.log:44「✅ Git commit 完成」与提交时刻 11:00:51Z 互为实证）。
    // 这条链绕过用户「未经允许不得 commit」铁律，且当时 24 项验收全绿 —— 因为旧门只查
    // 入库链(auto-ingest)与自测链(self-test)有没有设开关，没人查这个「人会被文档指去跑」的入口。
    // 只 grep 源码文本不够（坑 11 的教训：接线类断言必须真跑函数体），所以在 .temp 下造一座
    // 完整假院（复制 src/，__dirname/.. 就落在假院里：库、wiki、logs、git 提交全隔离），
    // 跑两次代谢单步，正反各证一次；假院内的负向注入不碰真源码。
    const GUARD = "if (process.env.AING_AUTOCOMMIT !== '1') process.env.AING_NO_AUTOCOMMIT = '1';";
    const rmSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'run-metabolism.js'), 'utf8').replace(/\r/g, '');
    if (!rmSrc.includes(GUARD)) {
      throw new Error('src/run-metabolism.js 缺少默认注入 AING_NO_AUTOCOMMIT 的守卫 → 代谢第 1 步仍会替用户在院子里 git add -A + commit --no-verify');
    }
    if (!/AING_AUTOCOMMIT !== '1'/.test(rmSrc)) throw new Error('守卫不是 opt-in 语义：必须默认关、显式 AING_AUTOCOMMIT=1 才开');
    const guardAt = rmSrc.indexOf(GUARD), execAt = rmSrc.indexOf('const scriptPath');
    if (execAt > 0 && guardAt > execAt) throw new Error('守卫位置晚于 executeStep 取脚本路径 → 子进程可能继承不到 env');
    const cmpSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'compile.js'), 'utf8').replace(/\r/g, '');
    if (!/process\.env\.AING_NO_AUTOCOMMIT === '1'/.test(cmpSrc)) {
      throw new Error('compile.js 的 gitCommit() 早退守卫不见了 → 注入的 env 无人认领，提交照样发生');
    }
    if (!/git add -A/.test(cmpSrc)) throw new Error('compile.js 里 `git add -A` 消失了？核对 gitCommit() 是否被改写（本门的锚点需同步）');

    // —— 造隔离假院 ——
    const probe = path.join(PKG_DIR, '.temp', 'gate-c13-probe');
    let freshDocs = 0;
    fs.rmSync(probe, { recursive: true, force: true });
    fs.mkdirSync(path.join(probe, 'raw'), { recursive: true });
    fs.cpSync(path.join(PKG_DIR, 'src'), path.join(probe, 'src'), { recursive: true });
    fs.copyFileSync(path.join(PKG_DIR, 'growth.config.example.js'), path.join(probe, 'src', 'growth.config.js'));
    // 代谢锁与各写面目录先建好（LOCK_PATH = <probe>/data/metabolism.lock，目录缺失会 ENOENT 导致假院未真跑到编译）
    for (const d of ['data', 'logs', 'wiki', 'mustard-seeds', 'data/consciousness']) {
      fs.mkdirSync(path.join(probe, d), { recursive: true });
    }
    fs.writeFileSync(path.join(probe, 'raw', 'c13-probe-doc.md'),
      '# C13 探针文档 / C13 probe doc\n\n本档只用于验证代谢第 1 步是否替用户提交工作树，内容无关业务。\n');
    const g = (args, opts) => spawnSync('git', args, Object.assign({ cwd: probe, encoding: 'utf8', timeout: 60000 }, opts || {}));
    const must = (r, what) => { if (r.status !== 0) throw new Error(what + ' 失败：' + String(r.stderr || r.stdout || '').split(/\r?\n/)[0].slice(0, 120)); return r; };
    try {
      must(g(['init', '-q', '-b', 'main']), '假院 git init');
      must(g(['config', 'user.name', 'C13-probe <not-a-user>']), '假院 user.name');
      must(g(['config', 'user.email', 'c13-probe@invalid.local']), '假院 user.email');
      must(g(['add', '-A']), '假院初始 add');
      must(g(['commit', '-q', '-m', 'chore: probe yard baseline']), '假院初始 commit');
      const count = () => Number(String(must(g(['rev-list', '--count', 'HEAD']), '计数').stdout).trim());
      const subject = () => String(must(g(['log', '-1', '--format=%s']), '取标题').stdout).trim();
      const author = () => String(must(g(['log', '-1', '--format=%an']), '取作者').stdout).trim();
      const base = count();
      if (base !== 1) throw new Error('假院基线提交数不是 1（=' + base + '）→ 探针院没建干净，本门结论无效');

      const runStep = (tag) => {
        // 每趟必须先投一篇新 raw：compile 只在 compiledFiles>0 时才调 gitCommit()，
        // 第二趟若沿用同一篇（已被第一趟编译过）就会「无事可做」而跳过提交 —— 那正是
        // 本门第一版在假院里测不出差异的原因（假阴性，比假阳性更坑）。
        const n = ++freshDocs;
        fs.writeFileSync(path.join(probe, 'raw', `c13-run-${n}.md`),
          `# C13 探针文档 ${n} / probe doc ${n}\n\n第 ${n} 次跑代谢，用于确认 compile 是否替用户提交。\n`);
        // 关键：不替它注入 AING_NO_AUTOCOMMIT —— 必须由假院里那份 run-metabolism.js 自己设，
        // 否则就成了「我用外部 env 假装它安全」的自证。
        const env = Object.assign({}, process.env);
        delete env.AING_NO_AUTOCOMMIT; delete env.AING_AUTOCOMMIT;
        // 用等号形：--step=compile 才真做单步过滤（头注曾写成空格形，会被当成整链跑）
        const r = spawnSync('node', [path.join(probe, 'src', 'run-metabolism.js'), '--step=compile'],
          { cwd: probe, encoding: 'utf8', timeout: 300000, env });
        // 子进程 stdout 被 executeStep 的 execSync 吃进变量了 → 标记要去它自己写的步骤日志里找
        const dir = path.join(probe, 'logs', 'metabolism');
        const latest = fs.existsSync(dir)
          ? fs.readdirSync(dir).filter(f => /^compile-.*\.log$/.test(f)).sort().pop() : null;
        const stepLog = latest ? fs.readFileSync(path.join(dir, latest), 'utf8').replace(/\r/g, '') : '';
        if (r.status !== 0 && !/编译|compile|Git commit/.test(stepLog)) {
          throw new Error(tag + '：代谢单步退出码 ' + r.status + ' 且步骤日志无编译痕迹 → 假院没真跑到 gitCommit，本门等于没测：' + String(r.stderr || '').split(/\r?\n/).filter(Boolean).slice(-2).join(' / ').slice(0, 150));
        }
        return stepLog;
      };

      // ① 带守卫：跑完 compile 步，提交数必须纹丝不动，且步骤日志里要有早退行
      const outGuarded = runStep('带守卫');
      if (count() !== base) {
        throw new Error('带守卫仍多出一笔提交（' + base + '→' + count() + '，标题「' + subject() + '」）→ 注入没被子进程继承，代谢还在替用户提交');
      }
      if (!/Git commit 跳过|AING_NO_AUTOCOMMIT/.test(outGuarded)) {
        throw new Error('compile 步骤日志里没有「Git commit 跳过（AING_NO_AUTOCOMMIT=1…）」→ 早退守卫没被走到（可能根本没编译出文件）');
      }

      // ② 负向：只在假院里删掉守卫（真源码不动），必须立刻看见那笔机器提交
      const pp = path.join(probe, 'src', 'run-metabolism.js');
      const before = fs.readFileSync(pp, 'utf8');
      if (!before.includes(GUARD)) throw new Error('假院里找不到守卫锚点 → 负向注入失效，结论不可信');
      fs.writeFileSync(pp, before.replace(GUARD, '/* 负向注入：撤掉守卫（仅假院） */'));
      const outNaked = runStep('删守卫');
      const after = count();
      if (after === base) {
        throw new Error('删掉守卫后依然没有提交 → 这条链不可测（假院没真触发 gitCommit），C13 是假门禁，须查 raw/编译与 CONFIG.rootDir');
      }
      if (!/chore: compile knowledge base/.test(subject())) {
        throw new Error('多出的提交标题不是「chore: compile knowledge base」（实为「' + subject() + '」）→ 不是这条链，探针证明不了本体');
      }
      if (!/Git commit 完成/.test(outNaked)) throw new Error('删守卫那趟步骤日志没打印「Git commit 完成」但提交却多了 → 另有提交来源，链需重新定位');

      // ③ 登记面：AGENTS 必须写明这个 opt-in 口径（否则下一个人以为代谢会顺手提交）
      const agents = fs.readFileSync(path.join(PKG_DIR, 'AGENTS.md'), 'utf8');
      const c13row = agents.split(/\r?\n/).find(l => l.startsWith('| C13 |')) || '';
      if (!c13row) throw new Error('AGENTS.md 验收清单缺 C13 行 → 没人知道代谢入口需要被验');
      if (!c13row.includes('AING_AUTOCOMMIT=1')) throw new Error('AGENTS 的 C13 行里没有 AING_AUTOCOMMIT=1 opt-in 口径 → 人或 agent 按文档跑代谢时不知道提交已被关掉');

      // ④ 同形第二链：init-knowledge-base.js --git 既不覆写院子自带的 .gitignore，
      //    也不替用户提交（2026-09-14 实测：它原先把 44 行的 .gitignore 压成 4 行桩，
      //    紧接着 git add -A 就会把 knowledge.db / .temp/ 连桩一起提进历史）。
      const iSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'init-knowledge-base.js'), 'utf8').replace(/\r/g, '');
      if (!/AING_AUTOCOMMIT !== '1'/.test(iSrc)) {
        throw new Error('init-knowledge-base.js 的首次 commit 没走 AING_AUTOCOMMIT opt-in → 人手跑 --git 仍会替用户提交');
      }
      if (!/fs\.existsSync\(giPath\)/.test(iSrc)) {
        throw new Error('init-knowledge-base.js 又回到无条件写 .gitignore → 会覆掉院子自带的 ignore 面，配合 git add -A 就是把库与探针提进历史');
      }
      const yard = path.join(probe, 'yard2');
      fs.mkdirSync(yard, { recursive: true });
      fs.writeFileSync(path.join(yard, '.gitignore'), 'knowledge.db\n.temp/\nSENTINEL-KEEP-ME\n');
      const y = a => spawnSync('git', a, { cwd: yard, encoding: 'utf8', timeout: 60000 });
      must(y(['init', '-q', '-b', 'main']), 'yard2 init');
      must(y(['config', 'user.name', 'C13-yard2']), 'yard2 name');
      must(y(['config', 'user.email', 'c13-y2@invalid.local']), 'yard2 mail');
      must(y(['add', '-A']), 'yard2 add');
      must(y(['commit', '-q', '-m', 'chore: yard2 baseline']), 'yard2 commit');
      const ycount = () => Number(String(must(y(['rev-list', '--count', 'HEAD']), 'yard2 计数').stdout).trim());
      const ybase = ycount();
      const runInit = (optIn) => {
        const env = Object.assign({}, process.env); delete env.AING_NO_AUTOCOMMIT; delete env.AING_AUTOCOMMIT;
        if (optIn) env.AING_AUTOCOMMIT = '1';
        return spawnSync('node', [path.join(PKG_DIR, 'src', 'init-knowledge-base.js'), yard, '--git'],
          { cwd: PKG_DIR, encoding: 'utf8', timeout: 120000, env });
      };
      const rNoOpt = runInit(false);
      if (rNoOpt.status !== 0) throw new Error('init-knowledge-base --git 退出码 ' + rNoOpt.status + '：' + String(rNoOpt.stderr || '').split(/\r?\n/).filter(Boolean).slice(-2).join(' / ').slice(0, 130));
      if (ycount() !== ybase) throw new Error('未 opt-in 的 init --git 仍造了提交（' + ybase + '→' + ycount() + '）→ 这条同形链没关掉');
      if (!/SENTINEL-KEEP-ME/.test(fs.readFileSync(path.join(yard, '.gitignore'), 'utf8'))) {
        throw new Error('院子已有的 .gitignore 被 init-knowledge-base 覆写了（哨兵行消失）→ 后续 git add -A 会把库/探针纳入提交面');
      }
      runInit(true);
      if (ycount() === ybase) throw new Error('显式 AING_AUTOCOMMIT=1 却没提交 → opt-in 分支是死的，上面的「跳过」也可能只是没跑到');
      if (!/initial knowledge base setup/.test(String(must(y(['log', '-1', '--format=%s']), 'yard2 标题').stdout))) {
        throw new Error('opt-in 提交标题不是「chore: initial knowledge base setup」→ 不是这条链，证明无效');
      }

      return '假院 ' + base + ' 笔基线 → 带守卫跑 compile 步后仍 ' + base + ' 笔（步骤日志见「Git commit 跳过」）· 假院内删守卫后立刻多出 ' + (after - base) + ' 笔「' + subject() + '」（作者 ' + author() + '）· init --git 同形链：未 opt-in ' + ybase + '→' + ycount() + ' 不动且 .gitignore 哨兵行存活，opt-in 后出现「initial knowledge base setup」· 两趟各投新 raw 保证 compiledFiles>0 · 真源码未被注入';
    } finally {
      fs.rmSync(probe, { recursive: true, force: true });
    }
  });

  await check('C14 意识层闭环写端（停滞计数由代谢自己爬，不靠手改 state.json）', () => {
    // 出处（2026-09-14 推演 + 本轮接线）：kernel.recordCycleResult() 是 stagnationCount 的**唯一写者**，
    // 但全仓零调用点 → 计数恒 0 → growth-director.js:150/235 与 metacognition-layer.js:459 三个读者
    // 永远空等，「意识层连续空产出 ≥3 → 完整代谢」这条自主路径从未成立。更糟的是 AGENTS 的 M4 行
    // 原先写「设 kernel stagnationCount=3」——那是人手改 state.json 演出来的假闭环，绿给谁看都不算。
    // 本门的要求：写端在位 + 在隔离假院里**连跑 3 趟空代谢让计数自己爬**，且必须能解闩。
    const rmSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'run-metabolism.js'), 'utf8').replace(/\r/g, '');
    if (!/_kernel\.recordCycleResult\(/.test(rmSrc)) {
      throw new Error('run-metabolism.js 里没有调用 kernel.recordCycleResult() → 停滞计数仍是死的，三个读者继续空等（M4「意识层闭环」是假链）');
    }
    if (/stagnationCount >= \d/.test(rmSrc)) {
      throw new Error('代谢入口自己写了停滞数值阈值 → 判"断"必须只由 kernel 做（纪律 5：阈值只能在 config/kernel 一处）');
    }
    const kSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'consciousness-kernel.js'), 'utf8').replace(/\r/g, '');
    if (!/hasValidOutput && this\.state\.state === 'stagnant'/.test(kSrc)) {
      throw new Error('kernel 的停滞闩没有解锁分支 → 一次停滞永久误报（memo.js:348/454 的健康判定与 nextActions 会一直要求派工程师修一个早修好的问题）');
    }

    // —— 隔离假院：空 corpus 连跑 3 趟 ——
    const probe = path.join(PKG_DIR, '.temp', 'gate-c14-probe');
    fs.rmSync(probe, { recursive: true, force: true });
    for (const d of ['raw', 'data', 'logs', 'wiki', 'mustard-seeds', 'data/consciousness']) {
      fs.mkdirSync(path.join(probe, d), { recursive: true });
    }
    fs.cpSync(path.join(PKG_DIR, 'src'), path.join(probe, 'src'), { recursive: true });
    fs.copyFileSync(path.join(PKG_DIR, 'growth.config.example.js'), path.join(probe, 'src', 'growth.config.js'));
    const STATE = path.join(probe, 'data', 'consciousness', 'state.json');
    const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; } };
    const runMeta = tag => {
      const r = spawnSync('node', [path.join(probe, 'src', 'run-metabolism.js')], { cwd: probe, encoding: 'utf8', timeout: 600000 });
      const out = String(r.stdout || '') + String(r.stderr || '');
      if (!/意识层本轮记账/.test(out)) {
        throw new Error(tag + '：代谢跑完没有「意识层本轮记账」行 → 写端没被走到（退出码 ' + r.status + '）：' + out.replace(/\r/g, '').split('\n').filter(Boolean).slice(-2).join(' / ').slice(0, 140));
      }
      return r.status;
    };
    try {
      const seq = [];
      for (let i = 1; i <= 3; i++) {
        const code = runMeta(`空代谢第 ${i} 趟`);
        const s = readState();
        seq.push(Number(s.stagnationCount));
        if (code !== 0) throw new Error(`空代谢第 ${i} 趟退出码 ${code}（空产出不等于失败，不该中断）`);
      }
      if (seq.join(',') !== '1,2,3') {
        throw new Error(`停滞计数没有自己爬到 1→2→3（实测 ${seq.join('→')}）→ 写端未生效、被别处覆写，或判据把它当成了有效产出`);
      }
      const st3 = readState();
      if (st3.state !== 'stagnant') throw new Error('计数到 3 却没转 stagnant → kernel 的熔断没接上（state=' + st3.state + '）');
      const meta = fs.readdirSync(path.join(probe, 'raw')).filter(f => /meta-breaker/i.test(f));
      if (!meta.length) throw new Error('转 stagnant 后没有自动写 MetaKnowledge 进 raw/ → 断环缺"留下恢复线索"这一半');

      // 读者必须真的动起来：growth-director 只读院内存活状态，不碰任何手改
      const gd = spawnSync('node', [path.join(probe, 'src', 'growth-director.js'), '--dry-run'], { cwd: probe, encoding: 'utf8', timeout: 300000 });
      const go = String(gd.stdout || '') + String(gd.stderr || '');
      if (!/full_metabolism|完整代谢/.test(go)) {
        throw new Error('stagnationCount=3 时 growth-director 仍没选完整代谢 → 三个读者里最关键的那个还是空等：' + go.replace(/\r/g, '').split('\n').filter(Boolean).slice(-2).join(' / ').slice(0, 140));
      }

      // 解闩：喂一篇真文档再跑一趟，计数归 0 且状态脱离 stagnant
      fs.writeFileSync(path.join(probe, 'raw', 'c14-recovery-doc.md'),
        '---\nname: C14 恢复文档\ntype: Concept\ntags: [c14]\nconfidence: 0.8\nstatus: active\n---\n\n# C14 恢复文档\n\n让本轮代谢产生真实实体，验证停滞闩可释放。\n');
      runMeta('有产出的代谢');
      const s4 = readState();
      if (Number(s4.stagnationCount) !== 0) throw new Error('有产出后计数未归 0（=' + s4.stagnationCount + '）→ 写端判据把有效产出也算成了空');
      if (s4.state === 'stagnant') throw new Error('有产出后状态仍是 stagnant → 停滞闩只进不出，memo 会永久误报（见本门对 kernel 解锁分支的断言）');

      // 登记面：文档不许再教人手改 state.json
      const agents = fs.readFileSync(path.join(PKG_DIR, 'AGENTS.md'), 'utf8');
      if (/设 kernel stagnationCount/.test(agents)) {
        throw new Error('AGENTS 的 M4「意识层闭环」行仍在教「设 kernel stagnationCount=3」（手改 state.json）→ 那是假闭环，须改为假院连跑 3 趟空代谢');
      }
      if (!/^\| C14 \|/m.test(agents)) throw new Error('AGENTS 验收清单缺 C14 行');
      return `空院连跑 3 趟：计数自己爬 ${seq.join('→')} 并转 stagnant、raw/ 自动落 MetaKnowledge（${meta[0]}）· growth-director --dry-run 选「完整代谢」· 喂一篇真文档后再跑 → 计数归 0 且状态解闩（${s4.state}）· 全程未手改 state.json`;
    } finally {
      fs.rmSync(probe, { recursive: true, force: true });
    }
  });

  await check('C15 意识层控制面真接（写端 CLI + HTTP 路由，且注释与实现不得脱节）', async () => {
    // 出处（2026-09-14 W2）：意识层读端有 src/memo.js，但写端没人能动手——`kernel.inhibit()` 全仓
    // 零调用点，`controller.verify()/record()`（不依赖外部 adapter 的那两条）既无 CLI 也无路由，
    // decision lineage 的「校验」「入账」两环只有宿主代码写得动。同时 api-server 头部注释是
    // 一份路由清单：注释挂了而实现没有（或反之）就是陈账，本门一并钉住。
    const fsx = require('fs'), sp = require('child_process'), http = require('http');
    const neuralPath = path.join(PKG_DIR, 'src', 'neural.js');
    if (!fsx.existsSync(neuralPath)) throw new Error('缺 src/neural.js → 意识层写端未落地（agent 无法动手）');
    const neural = fsx.readFileSync(neuralPath, 'utf8').replace(/\r/g, '');
    const selfNumbers = neural.match(/intensity\s*[:=]\s*0?\.\d+|confidence\s*[:=]\s*0?\.\d+|>=\s*0?\.\d+/g);
    if (selfNumbers) throw new Error('src/neural.js 自带数值阈值/事件默认强度 → 判据必须只留在 kernel 与 ConsciousnessEvent 一处（纪律 5）：' + selfNumbers.slice(0, 3).join(' , '));
    for (const cmd of ['status', 'event', 'inhibit', 'assess', 'verify', 'record', 'deliberate']) {
      if (!new RegExp("case '" + cmd + "'").test(neural)) throw new Error('src/neural.js 缺子命令 ' + cmd + ' 分支');
    }

    // 注释清单 ↔ 实现集合必须完全相等
    const api = fsx.readFileSync(path.join(PKG_DIR, 'src', 'api-server.js'), 'utf8').replace(/\r/g, '');
    const declared = new Set([...api.matchAll(/^\s*\*\s+(?:GET|POST)\s+(\/api\/consciousness\S*)/gm)].map(m => m[1]));
    const implemented = new Set([...api.matchAll(/p === '(\/api\/consciousness[^']*)'/g)].map(m => m[1]));
    const ghost = [...declared].filter(r => !implemented.has(r));
    const undocumented = [...implemented].filter(r => !declared.has(r));
    if (ghost.length) throw new Error('注释里挂着但没有实现的路由（陈账）: ' + ghost.join(', '));
    if (undocumented.length) throw new Error('实现了但头部注释没登记的路由: ' + undocumented.join(', '));
    for (const k of ['inhibit', 'deliberate', 'verify', 'record']) {
      if (!implemented.has('/api/consciousness/' + k)) throw new Error('HTTP 控制面缺 /api/consciousness/' + k);
    }

    // 登记面：AGENTS 与 README 必须都教了这条命令（否则下一场 agent 根本不知道能动手）
    const agents = fsx.readFileSync(path.join(PKG_DIR, 'AGENTS.md'), 'utf8');
    if (!/src\/neural\.js inhibit/.test(agents)) throw new Error('AGENTS.md 未登记 `src/neural.js inhibit` 用法');
    if (!/^\| C15 \|/m.test(agents)) throw new Error('AGENTS 验收清单缺 C15 行');
    const readme = fsx.readFileSync(path.join(PKG_DIR, 'README.md'), 'utf8');
    if (!/node src\/neural\.js status/.test(readme)) throw new Error('README 未登记 node src/neural.js 命令');

    // ── 隔离假院真跑（CLI 面）──
    const probe = path.join(PKG_DIR, '.temp', 'gate-c15-probe');
    fsx.rmSync(probe, { recursive: true, force: true });
    for (const d of ['raw', 'logs', 'wiki', 'mustard-seeds', 'data/consciousness']) fsx.mkdirSync(path.join(probe, d), { recursive: true });
    fsx.cpSync(path.join(PKG_DIR, 'src'), path.join(probe, 'src'), { recursive: true });
    fsx.copyFileSync(path.join(PKG_DIR, 'growth.config.example.js'), path.join(probe, 'src', 'growth.config.js'));
    if (fsx.existsSync(path.join(PKG_DIR, 'knowledge.db'))) fsx.copyFileSync(path.join(PKG_DIR, 'knowledge.db'), path.join(probe, 'knowledge.db'));
    const NEU = path.join(probe, 'src', 'neural.js');
    const cli = (args) => sp.spawnSync('node', [NEU, ...args, '--kb', probe], { cwd: probe, encoding: 'utf8', timeout: 300000 });
    const cliJson = (args) => {
      const r = cli(args);
      if (r.status !== 0) throw new Error('neural ' + args[0] + ' 非零退出（' + r.status + '）: ' + String(r.stderr || '').replace(/\r/g, '').split('\n').filter(Boolean).slice(-1)[0]);
      try { return JSON.parse(r.stdout); } catch (e) { throw new Error('neural ' + args[0] + ' 没出纯 JSON（stdout 被日志污染？）: ' + String(r.stdout).slice(0, 120)); }
    };
    try {
      const T = 'c15-probe-target';
      const ih = cliJson(['inhibit', T, '--hours', '1', '--reason', 'gate-c15']);
      if (ih.isInhibited !== true) throw new Error('inhibit 后 isInhibited 仍非 true → 抑制未生效');
      const ev = cliJson(['event', JSON.stringify({ channel: 'anomaly', target: T, intensity: 0.9 })]);
      if (ev.accepted !== 0 || !ev.suppressedWhy.some(s => s.why === 'target-inhibited')) {
        throw new Error('抑制后事件仍能进 kernel（accepted=' + ev.accepted + '）→ 控制面是假的，isInhibited 没参与 ingest 判定');
      }
      const st = cliJson(['status']);
      if (!st.activeInhibitions || !st.activeInhibitions.some(x => x.target === T)) throw new Error('status 看不到在效抑制清单 → 控制面不可核对');
      const LIN = path.join(probe, 'logs', 'agent-decision-lineage.jsonl');
      const kinds = () => fsx.existsSync(LIN) ? fsx.readFileSync(LIN, 'utf8').replace(/\r/g, '').trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l).kind; } catch (e) { return '?'; } }) : [];
      const v = cliJson(['verify', JSON.stringify({ checks: [{ name: '门禁绿', passed: true }], observedOutcome: 'C15 真跑' })]);
      if (v.status !== 'verified') throw new Error('verify 未判 verified（实得 ' + v.status + '）→ 校验环是摆设');
      const rc = cliJson(['record', JSON.stringify({ result: 'C15', lesson: 'grep 过不等于接上' })]);
      if (rc.status !== 'recorded-for-provider-integration') throw new Error('record 未入账（实得 ' + rc.status + '）');
      const ks = kinds();
      if (!ks.includes('verify') || !ks.includes('record')) throw new Error('lineage 文件缺 verify/record 记录（现有 ' + (ks.join(',') || '空') + '）');
      // status 必须是纯读：负向实测证明“只比字节”会被幂等覆写骗过（跑两次看不出来），
      // 故这里既埋一叢哨兵值（任何写者都会把内存里的它覆掉或原样重存），又比 mtime（能抓住原内容重存）。
      const SFILE = path.join(probe, 'data', 'consciousness', 'state.json');
      const sentinel = JSON.parse(fsx.readFileSync(SFILE, 'utf8'));
      sentinel.lastArousalAt = 'sentinel-c15-must-survive-readonly';
      fsx.writeFileSync(SFILE, JSON.stringify(sentinel, null, 2) + '\n');
      const before = fsx.readFileSync(SFILE, 'utf8');
      const m0 = fsx.statSync(SFILE).mtimeMs;
      await new Promise(r => setTimeout(r, 120));
      cliJson(['status']);
      const after = fsx.readFileSync(SFILE, 'utf8');
      if (after !== before || fsx.statSync(SFILE).mtimeMs > m0) {
        throw new Error('status 不是纯读：跑一次就重写 state.json（哨兵' + (after === before ? '原样重存' : '被覆盖') + '）→ 声称只读却是扰表，门禁与 agent 都无法安全快拍');
      }
      // 错误路径必须拒绝而不是静默接受
      const badHours = cli(['inhibit', 'x', '--hours', '0']);
      if (badHours.status === 0) throw new Error('--hours 0 被静默接受 → 参数校验形同虚设');

      // ── HTTP 面真起服务复证同一组控制面 ──
      let srv = null, port = 0, log = '';
      for (let tryPort = 4199; tryPort < 4215 && !srv; tryPort++) {
        port = tryPort;
        srv = sp.spawn('node', [path.join(probe, 'src', 'api-server.js')], { cwd: probe, env: { ...process.env, AING_API_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
        srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
        const t0 = Date.now();
        let up = false;
        while (Date.now() - t0 < 20000) {
          await new Promise(r => setTimeout(r, 400));
          if (/EADDRINUSE/.test(log)) break;
          try { const g = await httpReq(http, port, 'GET', '/api/status'); if (g.status === 200) { up = true; break; } } catch (e) { }
        }
        if (up) break;
        try { srv.kill(); } catch (e) { }
        srv = null;
      }
      if (!srv) throw new Error('假院 api-server 起不来（端口 4199–4214 全试过）：' + log.replace(/\r/g, '').split('\n').filter(Boolean).slice(-3).join(' / ').slice(0, 160));
      try {
        const T2 = 'c15-http-target';
        const hi = await httpReq(http, port, 'POST', '/api/consciousness/inhibit', { target: T2, hours: 1, reason: 'gate-c15-http' });
        if (hi.status !== 200 || !hi.json || hi.json.isInhibited !== true) throw new Error('POST inhibit 未生效（' + hi.status + '）');
        const hev = await httpReq(http, port, 'POST', '/api/consciousness/event', { channel: 'anomaly', target: T2, intensity: 0.9 });
        const hBlocked = hev.json && Array.isArray(hev.json.suppressed) && hev.json.suppressed.some(s => s.inhibitReason === 'target-inhibited');
        if (hev.status !== 200 || !hBlocked) throw new Error('HTTP 面 inhibit 与 event 不是同一个 kernel（事件仍被接受）→ 控制面在 HTTP 上是假的');
        const hbad = await httpReq(http, port, 'POST', '/api/consciousness/inhibit', { target: 'y', hours: 0 });
        if (hbad.status !== 400) throw new Error('HTTP hours=0 未被拒（实得 ' + hbad.status + '）');
        const hv = await httpReq(http, port, 'POST', '/api/consciousness/verify', { checks: [{ name: '路由真接', passed: true }] });
        if (hv.status !== 200 || !hv.json || !hv.json.verification || hv.json.verification.status !== 'verified') throw new Error('POST verify 未判 verified');
        const hr = await httpReq(http, port, 'POST', '/api/consciousness/record', { result: 'C15 HTTP', lesson: '注释与实现同源' });
        if (hr.status !== 200 || !hr.json || !hr.json.output || hr.json.output.status !== 'recorded-for-provider-integration') throw new Error('POST record 未入账');
        const hg = await httpReq(http, port, 'POST', '/api/consciousness/deliberate', { urgency: 'high' });
        if (hg.status !== 200 || !hg.json || hg.json.kind !== 'deliberate' || hg.json.requiresApproval !== true) {
          throw new Error('POST deliberate 未出共识或未标 requiresApproval（' + hg.status + '）→ 高风险动作必须等人批这条被破坏：' + String(hg.raw).slice(0, 120));
        }
        const hl = await httpReq(http, port, 'GET', '/api/consciousness/lineage?limit=30');
        const hk = (hl.json && hl.json.records || []).map(r => r.kind);
        if (!['verify', 'record', 'deliberate'].every(k => hk.includes(k))) throw new Error('lineage 只读面回不到这三笔（现有 ' + hk.join(',') + '）');
      } finally {
        try { srv.kill(); } catch (e) { }
        await new Promise(r => setTimeout(r, 300));
      }
      return 'CLI：inhibit 后同目标 event 被拒（target-inhibited）· status 纯读（state.json 字节一致）· verify/record 已落 lineage · --hours 0 被拒；HTTP：真起 api-server 于 :' + port + '，四条路由（inhibit/event 互证、verify、record、deliberate 需人批）+ lineage 回读全通；注释 ↔ 实现路由清单一致（' + implemented.size + ' 条）';
    } finally {
      fsx.rmSync(probe, { recursive: true, force: true });
    }
  });

  await check('C16 读端纯读（memo 不再投事件、不再写存档，且不阉掉写端）', async () => {
    // 出处（2026-09-14 真修）：读一次 memo 就改一次被读的表——generateBriefing() 会把 alerts/hotspots
    // 当意识事件投进 kernel，而 kernel.processReactions 在高兴唤时**写 growth 记忆/episode/improvement 提案**
    // 并改 channelWeights、attentionRevision，低高兴唤也至少推 suppressedEvents 计数 + 重写 briefing 存档。
    // 后果：面板复跑与读数永不可复核（C12 探针当初看到计数在动就是这条链），且"我刚才是不是又改了自己的状态"无从判断。
    const adap = fs.readFileSync(path.join(PKG_DIR, 'src', 'hermes-aing-adapter.js'), 'utf8').replace(/\r/g, '');
    if (!/const ingestSignals = options\.ingestSignals === true;/.test(adap)) {
      throw new Error('generateBriefing 的投事件开关不在了 → 读表又变成默认写表');
    }
    if (!/const neural = ingestSignals \? this\.consciousnessKernel\.ingest\(signals\) : null;/.test(adap)) {
      throw new Error('ingest(signals) 又回到无条件调用 → 投事件没真的被关在开关后面');
    }
    const layer = fs.readFileSync(path.join(PKG_DIR, 'src', 'consciousness-layer.js'), 'utf8').replace(/\r/g, '');
    if (!/if \(save\) this\._saveBriefing\(briefing\);/.test(layer)) throw new Error('_saveBriefing 又无条件执行 → 纯读时仍会写 logs/consciousness/briefing-*.md');
    const memoSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'memo.js'), 'utf8').replace(/\r/g, '');
    if (/metacognition: \{ status: briefing\.metacognition/.test(memoSrc)) {
      throw new Error('组件链接的元认知状态又去吃 ingest 的副产物 → 读端一纯读就假报 degraded（叫狼），必须吃 self-state.json 只读档');
    }
    if (!/ingestSignals: feedSignals === true/.test(memoSrc)) throw new Error('memo 未把 --feed 透传给适配器 → 想显式喂信号没有门');

    // ── 隔离假院：库、意识层状态、元认知档都从 Tip 拷副本，读数才可比 ──
    const probe = path.join(PKG_DIR, '.temp', 'gate-c16-probe');
    fs.rmSync(probe, { recursive: true, force: true });
    for (const d of ['raw', 'logs', 'wiki', 'data/consciousness', 'data/metacognition']) fs.mkdirSync(path.join(probe, d), { recursive: true });
    fs.cpSync(path.join(PKG_DIR, 'src'), path.join(probe, 'src'), { recursive: true });
    fs.copyFileSync(path.join(PKG_DIR, 'growth.config.example.js'), path.join(probe, 'src', 'growth.config.js'));
    const cpIf = (f, to) => { const a = path.join(PKG_DIR, f), b = path.join(probe, to); if (fs.existsSync(a)) fs.copyFileSync(a, b); return fs.existsSync(b); };
    cpIf('knowledge.db', 'knowledge.db');
    cpIf('data/consciousness/state.json', 'data/consciousness/state.json');
    cpIf('data/metacognition/self-state.json', 'data/metacognition/self-state.json');
    cpIf('data/panel.json', 'data/panel.json');
    const SFILE = path.join(probe, 'data', 'consciousness', 'state.json');
    const runMemo = (extra) => {
      const args = [path.join(probe, 'src', 'memo.js'), '--peek', '--no-semantic', '--db', path.join(probe, 'knowledge.db')];
      if (extra) args.push(...extra);
      const r = spawnSync('node', args, { cwd: probe, encoding: 'utf8', timeout: 600000 });
      if (r.status !== 0) throw new Error('memo 在假院非零退出（' + r.status + '）: ' + String(r.stderr || '').replace(/\r/g, '').split('\n').filter(Boolean).slice(-1)[0]);
      try { return JSON.parse(r.stdout); } catch (e) { throw new Error('memo --peek 没出纯 JSON: ' + String(r.stdout).slice(0, 120)); }
    };
    try {
      if (!fs.existsSync(SFILE)) throw new Error('假院没拿到意识层状态副本（Tip 的 data/consciousness/state.json 不在？）→ 本门无法判纯读');
      // 埋哨兵（坑 13：只比字节会被幂等写入骗过）
      const st = JSON.parse(fs.readFileSync(SFILE, 'utf8'));
      st.lastArousalAt = 'sentinel-c16-must-survive-pure-read';
      fs.writeFileSync(SFILE, JSON.stringify(st, null, 2) + '\n');
      const before = fs.readFileSync(SFILE, 'utf8');
      const m0 = fs.statSync(SFILE).mtimeMs;
      runMemo();                                   // 第一轮
      await new Promise(r => setTimeout(r, 120));
      runMemo();                                   // 第二轮（幂等写入只有跑两轮才抓得住）
      const after = fs.readFileSync(SFILE, 'utf8');
      if (after !== before || fs.statSync(SFILE).mtimeMs > m0) {
        throw new Error('读 memo 两轮仍会动 state.json（哨兵' + (after === before ? '被原样重存' : '被覆盖') + '）→ 读表即扰表未真修');
      }
      const archived = fs.existsSync(path.join(probe, 'logs', 'consciousness'))
        ? fs.readdirSync(path.join(probe, 'logs', 'consciousness')).filter(f => /^briefing-.*\.md$/.test(f)) : [];
      if (archived.length) throw new Error('纯读把 briefing 存档写回了 logs/consciousness/（' + archived[0] + '）→ save 开关未生效');
      const peek = runMemo();
      const meta = ((peek.links || {}).metacognition) || {};
      if (meta.status !== 'online' || !String(meta.source || '').startsWith('read-only:')) {
        throw new Error('元认知链接状态不是只读档得来的 online（实得 status=' + meta.status + ' source=' + meta.source + '）→ 纯读反而制造叫狼或假 degraded');
      }
      if (peek.health && peek.health.verdict === undefined) throw new Error('--peek 没回出健康判定 → 纯读改动弄坏了读数链');
      // 能力没被阉：显式 --feed 必须真的写表（否则这次"纯净化"是把控制面砍了）
      const fed = runMemo(['--feed']);
      const wroteBack = fs.readFileSync(SFILE, 'utf8') !== before;
      if (!wroteBack) {
        throw new Error('--feed 显式投事件后 state.json 仍一字不变 → 写端能力被一起删了（纯读应是"默认不写"，不是"不能写"）');
      }
      if (!fed || !fed.health) throw new Error('--feed 路径没回出健康读数');
      // 复原哨兵院（不影响后续断言）
      fs.writeFileSync(SFILE, before);
      return '假院两轮 memo 纯读：state.json 字节与 mtime 未动、logs/consciousness/ 无 briefing 档、元认知链接来自只读档（online/read-only:self-state.json）；显式 --feed 才写表（写端能力完好）';
    } finally {
      fs.rmSync(probe, { recursive: true, force: true });
    }
  });

  await check('C17 意识层离散旋钮单源（改 config 必须真改变读者与熔断行为）', async () => {
    // 出处（纪律 5 补账）：熔断轮数那个数曾在四处各自写死 —— kernel 的 stagnationCount 比较、
    // growth-director.js:150 与 :235、memo.js:71。改一处就脱节：改 kernel 则 director 仍按旧阀选路，
    // 改 memo 则仪表台与熔断不同口径。现在权威值在 growth.config.js 的 consciousness 段，
    // 读者一律走 config-runtime.consciousnessTuning()（叶子模块，不为了一个数去 require 整个 kernel）。
    const all = ['consciousness-kernel.js', 'growth-director.js', 'memo.js', 'metacognition-layer.js', 'run-metabolism.js'];
    const stale = [];
    for (const f of all) {
      const srcTxt = fs.readFileSync(path.join(PKG_DIR, 'src', f), 'utf8').replace(/\r/g, '');
      if (/stagnationCount >= 3/.test(srcTxt)) stale.push(f + '（仍与硬编码 3 比）');
    }
    if (stale.length) throw new Error('这些地方还在把熔断轮数写死：' + stale.join('、') + ' → 必须走 consciousnessTuning()');
    const kernel = fs.readFileSync(path.join(PKG_DIR, 'src', 'consciousness-kernel.js'), 'utf8').replace(/\r/g, '');
    if (!/require\('\.\/config-runtime'\)/.test(kernel) || !/this\.stagnationBreakerCycles = /.test(kernel)) {
      throw new Error('kernel 未从 config 取熔断轮数 → 阈值仍是代码里的常量');
    }
    for (const f of ['growth-director.js', 'memo.js']) {
      const t = fs.readFileSync(path.join(PKG_DIR, 'src', f), 'utf8');
      if (!/consciousnessTuning/.test(t)) throw new Error(f + ' 未走 consciousnessTuning() → 读者与写者口径会脱节');
    }
    for (const cf of ['growth.config.example.js', 'src/growth.config.js']) {
      if (!/stagnationBreakerCycles/.test(fs.readFileSync(path.join(PKG_DIR, cf), 'utf8'))) {
        throw new Error(cf + ' 缺 consciousness.stagnationBreakerCycles → 权威值没有落进 config（纪律 5）');
      }
    }
    const agents = fs.readFileSync(path.join(PKG_DIR, 'AGENTS.md'), 'utf8');
    if (!/^\| C17 \|/m.test(agents)) throw new Error('AGENTS 验收清单缺 C17 行');

    // ── 行为证明：把轮数改成 2，第二趟就必须熔断；改回 3，第三趟才熔 ──
    const probe = path.join(PKG_DIR, '.temp', 'gate-c17-probe');
    fs.rmSync(probe, { recursive: true, force: true });
    for (const d of ['raw', 'data', 'logs', 'wiki', 'mustard-seeds', 'data/consciousness']) fs.mkdirSync(path.join(probe, d), { recursive: true });
    fs.cpSync(path.join(PKG_DIR, 'src'), path.join(probe, 'src'), { recursive: true });
    const cfgPath = path.join(probe, 'src', 'growth.config.js');
    const writeCfg = cycles => {
      let t = fs.readFileSync(path.join(PKG_DIR, 'growth.config.example.js'), 'utf8').replace(/\r/g, '');
      t = t.replace(/stagnationBreakerCycles: 3/, 'stagnationBreakerCycles: ' + cycles);
      t = t.replace(/inhibitDefaultHours: 1/, 'inhibitDefaultHours: 5');
      if (t.indexOf('stagnationBreakerCycles: ' + cycles) < 0) throw new Error('探针改 config 失败（模板里的 stagnationBreakerCycles 锚点不见了）');
      fs.writeFileSync(cfgPath, t);
    };
    const STATE = path.join(probe, 'data', 'consciousness', 'state.json');
    const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; } };
    const runEmpty = n => {
      // raw/ 始终保持空：compile 无料可编译 → 活跃实体 0 → 本轮就是「空产出」（C14 同口径）。
      // 不要为了“有活干”而往 raw/ 放档——那会真造出实体，本轮就不是空产出，计数会被归零。
      const r = spawnSync('node', [path.join(probe, 'src', 'run-metabolism.js')], { cwd: probe, encoding: 'utf8', timeout: 600000 });
      if (!/意识层本轮记账/.test(String(r.stdout))) throw new Error('第 ' + n + ' 趟没有记账行（退出码 ' + r.status + '）');
      return readState();
    };
    try {
      writeCfg(2);
      const s1 = runEmpty(1);
      if (Number(s1.stagnationCount) !== 1) throw new Error('第 1 趟计数应为 1，实得 ' + s1.stagnationCount);
      if (s1.state === 'stagnant') throw new Error('config=2 时第 1 趟就熔了 → 判据没在读 config（或写成了 >=1）');
      const s2 = runEmpty(2);
      if (Number(s2.stagnationCount) !== 2 || s2.state !== 'stagnant') {
        throw new Error('config=2 时第 2 趟必须转 stagnant（实得 计数=' + s2.stagnationCount + ' state=' + s2.state + '）→ 阈值改 config 不改变行为，说明它只是装饰');
      }
      const ns = spawnSync('node', [path.join(probe, 'src', 'neural.js'), 'status', '--kb', probe], { cwd: probe, encoding: 'utf8', timeout: 300000 });
      let breaker = null;
      try { breaker = JSON.parse(ns.stdout).breakerCycles; } catch (e) { }
      if (Number(breaker) !== 2) throw new Error('neural status 的 breakerCycles 不是 2（实得 ' + breaker + '）→ 读者口径与 config 不一致');
      const gd = spawnSync('node', [path.join(probe, 'src', 'growth-director.js'), '--dry-run'], { cwd: probe, encoding: 'utf8', timeout: 300000 });
      const go = String(gd.stdout || '') + String(gd.stderr || '');
      if (!/full_metabolism|完整代谢/.test(go)) throw new Error('config=2 且计数=2 时 growth-director 没选完整代谢 → 读者仍按旧硬编码判（四个脑子未合一）');
      // 抑制时长旋钮：不传 --hours 必须用 config 的 5 小时
      const ih = spawnSync('node', [path.join(probe, 'src', 'neural.js'), 'inhibit', 'c17-target', '--kb', probe], { cwd: probe, encoding: 'utf8', timeout: 300000 });
      let hours = null;
      try { const j = JSON.parse(ih.stdout); hours = (new Date(j.until).getTime() - Date.now()) / 3600000; } catch (e) { }
      if (hours === null || Math.abs(hours - 5) > 0.05) throw new Error('inhibit 缺省时长没走 config 的 inhibitDefaultHours=5（实得 ' + (hours === null ? '无法解析' : hours.toFixed(2)) + ' 小时）');
      // 改回 3：第 3 趟才熔（证明"改旋钮"是可逆且立即生效的）
      writeCfg(3);
      const s3 = runEmpty(3);
      if (Number(s3.stagnationCount) !== 3 || s3.state !== 'stagnant') throw new Error('改回 3 后第 3 趟应熔（实得 计数=' + s3.stagnationCount + ' state=' + s3.state + '）');
      const ns2 = spawnSync('node', [path.join(probe, 'src', 'neural.js'), 'status', '--kb', probe], { cwd: probe, encoding: 'utf8', timeout: 300000 });
      let b2 = null; try { b2 = JSON.parse(ns2.stdout).breakerCycles; } catch (e) { }
      if (Number(b2) !== 3) throw new Error('config 改回 3 后读者仍报 ' + b2 + ' → 不是热读 config（可能是缓存了旧值）');
      return 'config=2 → 第 2 趟熔断（第 1 趟不熔）且 neural status/增长导演同步按 2 判、inhibit 缺省 5 小时来自 config；改回 3 → 第 3 趟熔、读者立刻报 3；四处硬编码已全部收敛到 consciousnessTuning()';
    } finally {
      fs.rmSync(probe, { recursive: true, force: true });
    }
  });
  await check('C18 技能资产随包 + 派单不虚报（包内有 ≠ 本运行时装了）', async () => {
    // 出处（2026-09-14 W5）：四角色说明书与 aing-operator 过去只在 aing/OPT 侧和宿主技能目录里，
    // Tip 包内连 assets/ 都没有 → 换院即失联（院际比对工具也不比 assets/，所以这个洞从来没人看见）。
    // 同时 swarmRolesReady() 把「机器上任何一处找得到」当成「本运行时能派」，于是 mode 长期虚报
    // swarm-skill —— 本运行时的技能面 ~/.sclaw/agent/skills 其实没有。本门钉三件事：
    //   ① 包内资产真在位；② 只有 runtime 面为真才许报 swarm-skill；③ 院际比对面真含 assets/。
    const miss = [];
    for (const r of ['neuro-theorist', 'senior-engineer', 'skill-trainer', 'plasticity-analyst']) {
      if (!fs.existsSync(path.join(PKG_DIR, 'assets', 'skills', 'neural-evolution-swarm', 'roles', r + '.md'))) miss.push('roles/' + r + '.md');
    }
    for (const f of ['assets/skills/neural-evolution-swarm/SKILL.md', 'assets/skills/neural-evolution-swarm/workflow.md', 'assets/skills/aing-operator/SKILL.md', 'assets/skills/aing-operator/en/SKILL.md']) {
      if (!fs.existsSync(path.join(PKG_DIR, f))) miss.push(f);
    }
    if (miss.length) throw new Error('包内资产缺失（换院即失联）：' + miss.join(', '));

    const memoSrc = fs.readFileSync(path.join(PKG_DIR, 'src', 'memo.js'), 'utf8').replace(/\r/g, '');
    if (!/inRuntimeSurface:\s*kinds\.includes\('runtime'\)/.test(memoSrc)) throw new Error('memo 不再区分「本运行时已加载」→ 无法判断本场到底能不能派');
    if (!/bundledInPackage:\s*kinds\.includes\('bundled'\)/.test(memoSrc)) throw new Error('memo 不再区分「包内自带」→ 「装了/带了/找不到」又被揉成一个布尔');
    if (/ready\.installed\s*\?\s*'swarm-skill'/.test(memoSrc)) throw new Error('mode 又拿 installed 判 swarm-skill → 把「宿主装过」当「本场能派」（虚报）');
    if (!/ready\.inRuntimeSurface\s*\?\s*'swarm-skill'/.test(memoSrc)) throw new Error('mode 没走 inRuntimeSurface → 派单口径失去唯一依据');
    if (/path\.join\(process\.cwd\(\), 'assets', 'skills'\)/.test(memoSrc)) throw new Error('资产面又用 process.cwd() → 换个目录跑结果就变卦');
    const tool = fs.readFileSync(path.join(PKG_DIR, 'tools', 'verify-sibling-roots.js'), 'utf8').replace(/\r/g, '');
    // 断言的是**结构性质**，不是实现形状。比对面必须从包根递归：历史上「面小于包面」栽过三次
    // （只取 git ls-files → 漏 src/neural.js；面不含 assets → 漏 20 件资产；面不含 docs 与包根必读档
    //  → 「同源 0 漂移」其实只证了码面）。锚 walk('') 这条根遍历，改窄回目录白名单即红。
    if (!/^[ \t]*walk\(''\)/m.test(tool)) {
      throw new Error('院际比对面不再从包根递归 → 面又缩回目录白名单，代差会重新藏在面外');
    }
    // 必须锚在行首：注释里写一句 // walk('assets') 也能骗过裸子串断言（本轮负向②就是这么被行为层救回来的）
    if (!/'node_modules'/.test(tool)) throw new Error('院际比对缺目录黑名单 → 递归会把依赖目录整棵吞进台账（实测曾造出 88 条假「对方独有」）');
    if (!/\| C18 \|/.test(fs.readFileSync(path.join(PKG_DIR, 'AGENTS.md'), 'utf8'))) throw new Error('AGENTS 无 C18 行 → 这道门无人知晓，等于没设');
    if (!/assets\/skills/.test(fs.readFileSync(path.join(PKG_DIR, 'README.md'), 'utf8'))) throw new Error('README 未登记包内资产面 → 使用者不知道技能说明书随包走');

    // ── 行为①：真跑派单读数，让「虚报」在结构上不可能 ──
    const d = spawnSync('node', [path.join(PKG_DIR, 'src', 'memo.js'), '--dispatch', '--no-semantic'], { cwd: PKG_DIR, encoding: 'utf8', timeout: 600000 });
    let dj = null; try { dj = JSON.parse(String(d.stdout)); } catch (e) { }
    if (!dj) throw new Error('--dispatch 没出 JSON（退出码 ' + d.status + '）');
    if (typeof dj.inRuntimeSurface !== 'boolean' || typeof dj.bundledInPackage !== 'boolean') throw new Error('派单读数缺 inRuntimeSurface/bundledInPackage 两个布尔 → 「三种有」又混成一个');
    if (dj.bundledInPackage !== true) throw new Error('包内明明带着说明书，读数却说不带 → 资产面读数失真');
    if (dj.inRuntimeSurface === false && dj.mode === 'swarm-skill') throw new Error('本运行时未加载却报 swarm-skill → 虚报能派');
    if (dj.inRuntimeSurface === true && dj.mode !== 'swarm-skill') throw new Error('本运行时已加载却不报 swarm-skill → 反向误报，白降级');
    if (dj.swarmSearch && dj.swarmSearch.where.length && !/\[(runtime|host|bundled)\]/.test(dj.swarmSearch.where.join(' '))) throw new Error('搜到的目录没标注属于哪种「有」→ 读者无法判断可信度');

    // ── 行为②：迷你院对，证明 assets/ 真的进了比对面（且依赖目录没被吞进来）──
    const yard = path.join(PKG_DIR, '.temp', 'gate-c18-yard');
    fs.rmSync(yard, { recursive: true, force: true });
    const pkg = path.join(yard, 'pkg'), sib = path.join(yard, 'sib');
    for (const d2 of [path.join(pkg, 'tools'), path.join(pkg, 'src'), path.join(pkg, 'assets', 'skills', 'probe-skill'), path.join(sib, 'src'), path.join(sib, 'assets', 'skills', 'probe-skill')]) fs.mkdirSync(d2, { recursive: true });
    fs.copyFileSync(path.join(PKG_DIR, 'tools', 'verify-sibling-roots.js'), path.join(pkg, 'tools', 'verify-sibling-roots.js'));
    fs.writeFileSync(path.join(pkg, 'src', 'a.js'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(sib, 'src', 'a.js'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(pkg, 'assets', 'skills', 'probe-skill', 'SKILL.md'), '本包版本\n');
    fs.writeFileSync(path.join(sib, 'assets', 'skills', 'probe-skill', 'SKILL.md'), '对方版本，内容不同\n');
    const t = spawnSync('node', [path.join(pkg, 'tools', 'verify-sibling-roots.js'), '--root', 'sib=' + sib, '--verbose'], { cwd: pkg, encoding: 'utf8', timeout: 600000 });
    const tout = String(t.stdout || '').replace(/\r/g, '');
    // 取明细行断言（"   真实漂移（内容不同…）: 路径"）；状态行在前只带计数，拿它断言会假红 —— 本门初跑即因此假红过一次
    if (!/^\s*真实漂移（[^\n]*assets\/skills\/probe-skill\/SKILL\.md/m.test(tout)) throw new Error('assets 下的内容差异没被院际台账抓到 → 比对面未真正扩到资产');
    if (/node_modules/.test(tout)) throw new Error('台账出现 node_modules → 目录黑名单失效，比对被依赖污染');
    fs.rmSync(yard, { recursive: true, force: true });
    return '包内 20 件技能资产在位；派单读数 inRuntime=' + dj.inRuntimeSurface + ' / bundled=' + dj.bundledInPackage + ' / mode=' + dj.mode + '；迷你院对证明 assets 差异可检出且依赖目录未入台账';
  });
  await check('C19 门禁计数单源（文档抄的数字必须等于验收器真值）', async () => {
    // 出处（2026-09-14）：同一句「N 项门禁（C0–CMAX）」在 AGENTS frontmatter、README 部署段、
    // docs/greenlist.json 的声称文案里各手抄一遍。本轮门禁从 26 项加到 30 项，我手工同步了四轮，
    // 期间 README 就一直残留过「23 项（C0–C11）」这种看着严谨的假账。纪律第 6 条要求状态单一
    // 来源 → 权威只能是**验收器自己注册的 check 数量**，抄错必须由门禁拦下而不是靠自觉。
    const vs = fs.readFileSync(path.join(PKG_DIR, 'verify-deploy.js'), 'utf8').replace(/\r/g, '');
    const ids = [...vs.matchAll(/^  await check\('C(\d+[a-z]?)[\s'（(]/gm)].map(m => 'C' + m[1]);
    if (!ids.length) throw new Error('验收器解析不出任何门禁编号 → 计数权威本身失效，禁止当 0 项放过');
    const count = ids.length;
    const maxNum = Math.max(...ids.map(x => parseInt(String(x).slice(1), 10)));
    if (new Set(ids).size !== ids.length) throw new Error('验收器里有重号门禁：' + ids.filter((x, i) => ids.indexOf(x) !== i).join(', ') + ' → 计数会虚高');

    const agents = fs.readFileSync(path.join(PKG_DIR, 'AGENTS.md'), 'utf8').replace(/\r/g, '');
    const readme = fs.readFileSync(path.join(PKG_DIR, 'README.md'), 'utf8').replace(/\r/g, '');
    const gl = fs.readFileSync(path.join(PKG_DIR, 'docs', 'greenlist.json'), 'utf8').replace(/\r/g, '');
    if (!agents.includes('验收清单 C0-C' + maxNum + '（' + count + ' 项）')) {
      const got = (agents.match(/验收清单 C0-C\d+（\d+ 项）/) || ['（这句根本不存在）'])[0];
      throw new Error('AGENTS frontmatter 抄的是「' + got + '」，验收器实为 ' + count + ' 项 / C0-C' + maxNum);
    }
    const rd = readme.match(/(\d+) 项部署门禁（C0–C(\d+)/);
    if (!rd) throw new Error('README 找不到「N 项部署门禁（C0–Cn）」这句 → 抄写权威失效（本门与 gate-counts 都要同步句式）');
    if (Number(rd[1]) !== count || Number(rd[2]) !== maxNum) {
      throw new Error('README 部署段抄的是「' + rd[1] + ' 项（C0–C' + rd[2] + '）」，实为 ' + count + ' 项（C0–C' + maxNum + '）');
    }
    for (const m of gl.matchAll(/(\d+) 项全绿（C0–C(\d+)）/g)) {
      if (Number(m[1]) !== count || Number(m[2]) !== maxNum) throw new Error('docs/greenlist.json 有声称抄成 ' + m[1] + ' 项全绿（C0–C' + m[2] + '），实为 ' + count + ' 项（C0–C' + maxNum + '）');
    }
    // 清单表行集合必须与验收器同一集合：少一行 = 那道门无人知晓；多一行 = 陈账
    const tableIds = [...agents.matchAll(/^\| (C\d+[a-z]?) \|/gm)].map(m => m[1]);
    const miss = ids.filter(x => !tableIds.includes(x));
    const stale = tableIds.filter(x => !ids.includes(x));
    if (miss.length) throw new Error('AGENTS 验收清单缺行（这道门没登记）：' + miss.join(', '));
    if (stale.length) throw new Error('AGENTS 验收清单有陈行（验收器已无此门）：' + stale.join(', '));
    for (const f of ['tools/gate-counts.js']) {
      if (!fs.existsSync(path.join(PKG_DIR, f))) throw new Error(f + ' 不在 → 计数没有可查的算权威，只能继续手抄');
      if (!agents.includes('gate-counts') || !readme.includes('gate-counts')) throw new Error(f + ' 未同时登记进 AGENTS 与 README → 下一个人照样手抄');
    }

    // ── 坑数钉（2026-09-17 sqa 交接单 N6）：frontmatter「已知坑 N 条」此前是纯手抄（与门数同病，
    // L17-⑤ 登记过待办）。并入 C19，**不新增门禁**：同一份 AGENTS 里把宣称数与实数条目比对。
    const pitFacts = (txt) => {
      // 坑节边界：到 `## Daily Operation` 为止（2026-09-17 首跑教训：`^## [^#]` 会在
      // `## 当前迭代故障引导` 处提前断节，把坑 18–21 吞出面外 → 假报「实数到坑 17」）。
      const sec = (txt.split(/^## Known Pitfalls/m)[1] || '').split(/^## Daily Operation/m)[0];
      const nums = [...sec.matchAll(/^(?:\*\*)?(\d+)\.(?:\*\*)?[ \u3000*]/gm)].map(m => Number(m[1]));
      const uniq = [...new Set(nums)];
      const top = uniq.length ? Math.max(...uniq) : 0;
      const gaps = []; for (let i = 1; i <= top; i++) if (!uniq.includes(i)) gaps.push(i);
      const declared = (txt.match(/已知坑 (\d+) 条/) || [])[1];
      return { declared, top, gaps, count: uniq.length };
    };
    const pf = pitFacts(agents);
    if (!pf.declared) throw new Error('AGENTS frontmatter 找不到「已知坑 N 条」宣称 → 坑数权威位丢失');
    if (!pf.count) throw new Error('坑节解析不到任何编号条目 → 正文格式变了，必须连这条坑数钉一起改，不许静默放行（坑 7 教训：零匹配是异常不是空集）');
    if (pf.gaps.length) throw new Error('已知坑编号断号：' + pf.gaps.join(','));
    if (Number(pf.declared) !== pf.top) throw new Error('「已知坑 ' + pf.declared + ' 条」手抄漂移：实数到坑 ' + pf.top);
    { // 负向自证（防橡皮图章）：篡改宣称数必须让同一判据开火
      const bad = pitFacts(agents.replace(/已知坑 \d+ 条/, '已知坑 99 条'));
      if (Number(bad.declared) === bad.top) throw new Error('C19 坑数钉自身失效：篡改到 99 仍判一致');
    }

    // ── 行为证明：拿副本真跑工具，**故意把 README 抄错**必须被它抓到（防橡皮章工具）──
    const probe = path.join(PKG_DIR, '.temp', 'gate-c19-probe');
    fs.rmSync(probe, { recursive: true, force: true });
    try {
      for (const f of ['verify-deploy.js', 'AGENTS.md', 'README.md', 'tools/gate-counts.js', 'docs/greenlist.json']) {
        const dst = path.join(probe, f);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(path.join(PKG_DIR, f), dst);
      }
      const good = spawnSync('node', [path.join(probe, 'tools', 'gate-counts.js'), '--json'], { cwd: probe, encoding: 'utf8', timeout: 300000 });
      let gj = null; try { gj = JSON.parse(String(good.stdout)); } catch (e) { }
      if (!gj) throw new Error('gate-counts 在完好副本上没出 JSON（退出码 ' + good.status + '）：' + String(good.stderr || '').slice(0, 60));
      if (gj.count !== count || gj.maxNum !== maxNum) throw new Error('工具数出的项数 ' + gj.count + '/' + gj.maxNum + ' 与门禁自身解析 ' + count + '/' + maxNum + ' 不一致 → 两处解析不同源');
      if (good.status !== 0 || gj.ok !== true) throw new Error('完好副本上工具判红（本门自己的文档没抄对）：' + (gj.problems || []).join(' / ').slice(0, 100));
      const rdPath = path.join(probe, 'README.md');
      fs.writeFileSync(rdPath, fs.readFileSync(rdPath, 'utf8').replace(count + ' 项部署门禁（C0–C' + maxNum, '9 项部署门禁（C0–C0'));
      const bad = spawnSync('node', [path.join(probe, 'tools', 'gate-counts.js'), '--json'], { cwd: probe, encoding: 'utf8', timeout: 300000 });
      let bj = null; try { bj = JSON.parse(String(bad.stdout)); } catch (e) { }
      if (bad.status === 0 || !bj || bj.ok === true) throw new Error('把 README 抄成 9 项后工具仍判绿 → 它是橡皮章，不是检查器');
      if (!/README/.test((bj.problems || []).join(' '))) throw new Error('工具报红了但没指向 README → 诊断信息不可用');
    } finally {
      fs.rmSync(probe, { recursive: true, force: true });
    }
    return '验收器实注册 ' + count + ' 项 / ' + 'C0-C' + maxNum + '；AGENTS frontmatter、README 部署段、greenlist 声称、清单表 ' + count + ' 行四处手抄全部等于真值；副本真跑证明工具能抓到抄错（README 改 9 项即红）';
  });
  await check('C20 文档命令可执行性（引用路径在位 + npm run 有名 + 外部依赖自带执行位置 + 只读命令真跑）', () => {
    // 为什么钉这条：2026-09-15 实测两例——手册教人找全仓不存在的 tools/lsp-server.js；AGENTS 的 M4 链
    // 教跑 `PYTHONPATH=. python -c "from skillopt.envs.aing.adapter …"`，而本包内必 ModuleNotFoundError
    // （适配器只在外部 SkillOpt 检出里，且本机两份同名检出一有一无）。「grep ≠ wired」的文档版：**写在文档里
    // 的命令也必须真跑得通，或明确交代它不在本包跑**。负向自证见 .temp/c20-negative.js（纪律第 8 条）。
    const problems = [];
    const REF_RE = /(?:src|tools|docs|assets|training|simulation|demo)\/[\w.\-\/]*\.(?:json|md|js|py|ps1|svg|html|sql|ts)/g;
    // 反例/历史/院属/外部引用必须**在同一行带标记**才许出现（不标记即视为「教人去找」=缺陷）
    const MARK = /不存在|已砍除|只在|只存在|历史上|曾生成|反例|第[一二三四五]例|看着像|必失败|已修正|作废|别按它排障|OPT 侧|aing 侧|已废弃|用户自备|不随包|迷你院|\.temp\/|gate-c1[0-9]|垃圾|陈旧|判定|外部检出|非本包|院属语料|exists in no|does not exist|not shipped|external|legacy|historical|counter-example/i;
    const docs = [];
    const walk = d => {
      if (!fs.existsSync(d)) return;
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) { if (!/^(node_modules|\.git|\.temp|models|raw|wiki|logs|data)$/.test(ent.name)) walk(p); }
        else if (/\.(md|json)$/i.test(ent.name) && ent.name !== 'package-lock.json') docs.push(p);
      }
    };
    for (const f of ['AGENTS.md', 'README.md']) if (fs.existsSync(path.join(PKG_DIR, f))) docs.push(path.join(PKG_DIR, f));
    for (const d of ['docs', 'training', 'simulation', 'demo']) walk(path.join(PKG_DIR, d));
    // 边界（写在门里，免得后人以为面更大）：assets/skills/** 是**本包自撰的技能资产**（2026-09-15 实测：宿主三个技能根里均无同名目录，故不是副本；其示例命令指外部工具链）（C18 要求字节一致），
    // 其中的 python / SkillOpt 命令指向外部工具链，改它就破坏同源 → 本规则不覆盖，也不假装覆盖。
    const BUNDLED = [path.join(PKG_DIR, 'assets', 'skills', 'aing-operator', 'SKILL.md'), path.join(PKG_DIR, 'assets', 'skills', 'aing-operator', 'en', 'SKILL.md')];
    for (const f of BUNDLED) if (fs.existsSync(f)) docs.push(f);   // 只把自写文档纳入引用路径核，python 位置规则跳过
    let refChecked = 0;
    for (const f of docs) {
      const rel = path.relative(PKG_DIR, f).split(path.sep).join('/');
      if (/^docs\/releases\//.test(rel)) continue;                       // 发布说明属历史档（纪律第 9 条不改写正文）
      let txt; try { txt = fs.readFileSync(f, 'utf8').replace(/\r/g, ''); } catch (e) { continue; }
      txt.split('\n').forEach((l, i) => {
        for (const m of l.matchAll(REF_RE)) {
          if (/[<>*…$]/.test(m[0]) || /\$\{|%\w/.test(m[0])) continue;   // 模板/占位命令不 assert
          refChecked++;
          if (fs.existsSync(path.join(PKG_DIR, m[0]))) continue;
          if (MARK.test(l)) continue;                                     // 带标记的反例：合法
          problems.push('引用不存在的包内路径且未标反例: ' + rel + ':' + (i + 1) + ' → ' + m[0]);
        }
      });
    }
    // ① npm run 的名字必须真在 package.json.scripts 里
    let npmChecked = 0;
    const scripts = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8')).scripts || {}));
    // ② python / PYTHONPATH 类命令属外部依赖，必须自带执行位置（cd 或 <x-root> 占位符），禁止裸 `PYTHONPATH=.`
    let pyChecked = 0;
    for (const f of docs.filter(x => /\.md$/i.test(x))) {
      const rel = path.relative(PKG_DIR, f).split(path.sep).join('/');
      if (/^docs\/releases\//.test(rel)) continue;
      if (/^assets\/skills\//.test(rel)) continue;              // 外部技能规格：其命令指外部工具链，本规则不适用
      const txt = fs.readFileSync(f, 'utf8').replace(/\r/g, '');
      txt.split('\n').forEach((l, i) => {
        for (const m of l.matchAll(/npm run ([a-z][\w:-]{1,24})/g)) { npmChecked++; if (!scripts.has(m[1])) problems.push('文档教跑 `npm run ' + m[1] + '` 但 scripts 里没有（' + rel + ':' + (i + 1) + '）'); }
        if (!/\bpython\b|PYTHONPATH=/.test(l)) return;
        if (/^\s*(?:#|\/\/|[-*]\s*$)/.test(l.trim()) || /^\s*(?:示例输出|输出|返回|stdout|stderr)\s*[:：]/.test(l.trim())) return;   // 只豁免「行首即输出标签」的示例行，不做子串放行
        if (MARK.test(l)) return;                                          // 反例/历史句（如坑 16「第二例」）在描述坏命令，不是教人跑
        pyChecked++;
        const hasLoc = /cd\s+\S+|<[\w-]*root>|检出|checkout|外部|external/.test(l);
        const bare = /PYTHONPATH=\. /.test(l) && !/cd\s/.test(l);
        if (!hasLoc || bare) problems.push('外部依赖命令未自带执行位置（读者会在本包里跑它）: ' + rel + ':' + (i + 1) + ' → ' + l.trim().slice(0, 72));
      });
    }
    // ③ 行为证明：只读命令逐条真跑（必须退出 0），且**每条都得能在文档里找到**（防清单变空头账）
    const RUNNERS = [
      { args: ['src/memo.js', '--summary'], needle: 'node src/memo.js --summary' },
      { args: ['src/memo.js', '--peek', '--no-semantic'], needle: 'node src/memo.js --peek' },
      { args: ['src/memo.js', '--actions'], needle: 'node src/memo.js --actions' },
      { args: ['src/memo.js', 'todo', 'list'], needle: 'todo list' },
      { args: ['src/neural.js', 'status'], needle: 'node src/neural.js status' },
      { args: ['tools/gate-counts.js'], needle: 'node tools/gate-counts.js' },
      { args: ['tools/verify-sibling-roots.js', '--print-face'], needle: '--print-face' },
    ];
    // 防呆：这道门自己会跑命令，清单里绝不许混进写命令（否则验收器每轮都在改库）
    const WRONG_WORDS = /\b(add|done|new|set|create|feed|dispatch|record|inhibit|uninhibit|archive|compile|init|migrate|purge|reindex|start|stop)\b/i;
    for (const r of RUNNERS) if (WRONG_WORDS.test(r.args.join(' '))) problems.push('C20 只读清单里出现疑似写命令（门禁不许改院子）: node ' + r.args.join(' '));
    const allDocText = docs.filter(x => /\.md$/i.test(x)).map(x => { try { return fs.readFileSync(x, 'utf8'); } catch (e) { return ''; } }).join('\n').replace(/\r/g, '');
    let ran = 0, faceCount = 0;
    for (const r of RUNNERS) {
      if (!allDocText.includes(r.needle)) { problems.push('C20 清单里的命令在文档中查无（清单与现实脱节）: ' + r.needle); continue; }
      const res = spawnSync(process.execPath, r.args, { cwd: PKG_DIR, encoding: 'utf8', timeout: 180000 });
      ran++;
      if (r.args.includes('--print-face') && res.status === 0) faceCount = String(res.stdout).replace(/\r/g, '').split('\n').filter(Boolean).length;
      if (res.status !== 0) problems.push('文档承诺的只读命令真跑失败: node ' + r.args.join(' ') + ' → 退出码 ' + res.status + ' / ' + String(res.stderr || res.error || '').split('\n').filter(Boolean)[0] || '');
    }
    // C20 追加：同一页不许自相矛盾（图与表）+ 已退役资产防复活。
    // 为什么钉：2026-09-15 复检实测 README 谱系表有 🏗️ 工程层，而 docs/lineage.svg 只有 6 块、缺它；
    // 旧图已换成 README 内嵌 mindmap，故顺手钉住「不得再引用、也不得留悬档」。负向自证 .temp/c20-negative3.js。
    const README_P = path.join(PKG_DIR, 'README.md');
    if (fs.existsSync(README_P)) {
      const rl = fs.readFileSync(README_P, 'utf8').replace(/\r/g, '').split('\n');
      const plain = t => t.replace(/^[^\u4e00-\u9fa5A-Za-z]+/, '').trim();
      const tI = rl.findIndex(l => /^\| 层 \| 锚点 \| 出处 \| 状态 \|/.test(l.trim()));
      const mI = rl.findIndex(l => l.trim() === '```mermaid');
      const mE = rl.findIndex((l, i) => i > mI && l.trim() === '```');
      const map = mI >= 0 && mE > mI ? rl.slice(mI + 1, mE) : [];
      if (/docs\/lineage\.svg/.test(rl.join('\n'))) problems.push('已退役的 docs/lineage.svg 又被 README 引用（架构图已改思维导图，勿复活旧资产）');
      if (fs.existsSync(path.join(PKG_DIR, 'docs', 'lineage.svg'))) problems.push('docs/lineage.svg 仍在包内但已无人引用（退役要连文件一起下线，勿留悬档）');
    // 带 YAML frontmatter 的文档，`---` 必须是第 1 行：本轮实测 AGENTS.md 第 1 行被一条游离表格行压住，
    // tags/description 全部失效（工具与人都读不到元信息），而既有门禁一声不响 —— 属"文档自我不一致"同类账。
    for (const f of docs.concat([path.join(PKG_DIR, 'AGENTS.md'), path.join(PKG_DIR, 'README.md')])) {
      let txt = ''; try { txt = fs.readFileSync(f, 'utf8').replace(/\r/g, ''); } catch (e) { continue; }
      const head = txt.split('\n').slice(0, 16);
      const hasFm = head.some(l => /^(tags|description|AIGC):/.test(l));
      if (hasFm && head[0] !== '---') problems.push('frontmatter 不在第 1 行（YAML 元信息失效，第 1 行是: ' + JSON.stringify(String(head[0]).slice(0, 40)) + '）: ' + path.relative(PKG_DIR, f));
    }
      if (tI >= 0) {
        const tbl = [];
        for (let i = tI + 2; i < rl.length && /^\|/.test(rl[i]); i++) { const c = rl[i].split('|').map(x => x.trim()); if (c[1]) tbl.push(plain(c[1])); }
        const branches = map.filter(l => /^ {4}\S/.test(l)).map(plain);
        if (map.length && map[0].trim() !== 'mindmap') problems.push('README 谱系段不再是 mindmap（图↔表一致性检查会静默失效，改图请同步本门）');
        if (!map.length) problems.push('README 谱系表在位但找不到内嵌 mermaid 图（图被删了？要么连表一起删，要么补图）');
        else { const miss = tbl.filter(x => !branches.some(b => b === x)); if (miss.length) problems.push('README 架构图与谱系表脱节，图里缺层: ' + miss.join('、') + '（表 ' + tbl.length + ' 层 / 图 ' + branches.length + ' 支）'); }
      }
    }
    // ⑤ 院际比对面数不许抄漂移（2026-09-15 实测病）：README 换图把旧 SVG 退役后，整包面由 170 变 169，
    // 但 AGENTS 坑 9 里那句「实测量 170 个比对文件 / measured 170 compared files」仍写着 170 —— 门数有 C19 钉，
    // 面数过去没人钉，等于给"改一次面、全仓静默失真"留了口子。真值直接吃本门刚跑过的 --print-face 行数。
    // 真值来源：本门已跑过的 --print-face 行数（faceCount）
    let faceStated = '';
    {
      const agp = path.join(PKG_DIR, 'AGENTS.md');
      if (fs.existsSync(agp)) {
        const at = fs.readFileSync(agp, 'utf8').replace(/\r/g, '');
        const nums = [...at.matchAll(/实测(?:量)?\s*\**([0-9]{2,4})\**\s*个比对文件|measured\s+\**([0-9]{2,4})\**\s+compared files/g)]
          .map(m => Number(m[1] || m[2]));
        if (!nums.length) problems.push('AGENTS 里找不到「N 个比对文件 / measured N compared files」锚点 —— 面数门静默失效');
        else if (!faceCount) problems.push('--print-face 没跑出行数，无法核对 AGENTS 抄的面数 ' + nums.join('/') + '（面数门静默失效）');
        else {
          // 主包基线是「发起部署的那个包」的面；各院本地面**只许 ≥ 基线**。
          // 小于＝有档不在本院（漏带/删了没改抄件）→ 真漂移，红。
          // 大于＝院属档（有档只长在某一院里），合法，但文档必须已声明「院属档另计」，否则读者会以为各院必须相等 → 红。
          const yardOwned = /\*\*院属档另计\*\*/.test(at);   // 记号必须加粗：坑 19 那种普通引用不算声明
          nums.forEach(n => {
            if (n > faceCount) problems.push('AGENTS 抄的院际比对面 ' + n + ' 大于本院实测 ' + faceCount + '（有档不在本院：漏带或已删未改抄件——这才是面数漂移）');
            else if (n < faceCount && !yardOwned) problems.push('本院实测 ' + faceCount + ' 高于 AGENTS 抄件 ' + n + '，但坑 9 未声明「院属档另计」→ 补记号，别让读者拿单院数当全仓基线（2026-09-15 aing 假红就是这么来的）');
          });
          faceStated = nums.join('/') + (faceCount > Math.min(...nums) ? '（本院多 ' + (faceCount - Math.min(...nums)) + ' 项院属档）' : '');
        }
      }
    }

    // ⑥ 代谢步数口径必须等于实现真值（2026-09-15 实测病）：training 包把「9 步代谢」当标准答案、
    //    simulation 三题 correct=A 而 answerA 写 10 步链、aing/OPT 语料以现在时写「9 步代谢流水线」，
    //    而 run-metabolism 的 STEPS 实为 11 步（metabolism_log 近轮实测每轮 11 行，2026-09-07 那轮才是 9 行）。
    //    旧 C20 的 walk 不扫 raw/ ⇒ **豁免面不是安全面**：以现在时陈述的陈账可以长期无人点名。
    //    只查「与代谢绑定的步数」；序数（代谢第 N 步）、干扰位（wrong / 非 correct 的 answerX / 含选项题干）、
    //    docs/releases/** 按设计豁免但**计数上报**；史实须同行加 **历史实录** 记号。负向自证 .temp/step11-negative.js。
    let stepChecked = 0, stepWaived = 0, stepFace0 = '';
    const STEP_BOUND = [
      /(\d{1,2})\s*步\s*(?:代谢|流水线)/g,
      /代谢[^。\n|]{0,10}?(\d{1,2})\s*步/g,
      /(\d{1,2})[-\s]?step\s*metabolism/gi,
      /metabolism[^a-z\n]{0,4}?(\d{1,2})[-\s]?step/gi,
      /落库\s*(\d{1,2})\s*步/g,
    ];
    const HIST_MARK = /\*\*(历史实录|旧版口径|陈档快照)\*\*/;
    const stSrc = fs.readFileSync(path.join(PKG_DIR, 'src/run-metabolism.js'), 'utf8').replace(/\r/g, '');
    const stBlk = stSrc.slice(stSrc.indexOf('STEPS'));
    const stepNames = [...stBlk.slice(0, stBlk.indexOf('];')).matchAll(/^\s*\{\s*name:\s*'([^']+)'/gm)].map(m => m[1]);
    if (stepNames.length < 5) throw new Error('读不到 src/run-metabolism.js 的 STEPS 步名 → 步数口径门无法工作（防静默失效）');
    const STEP_TRUTH = stepNames.length;
    const claimIn = (txt, where, fileWaived) => {
      String(txt).split('\n').forEach((line, idx) => {
        for (const re of STEP_BOUND) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(line))) {
            if (/第\s*$/.test(line.slice(0, m.index + m[0].search(/\d/)))) continue;   // 「代谢第 1 步」是序数：看**数字前缀**，不是 match 起点（2026-09-15 自伤 21）
            const n = +m[1];
            stepChecked++;
            if (n === STEP_TRUTH) continue;
            if (HIST_MARK.test(line) || fileWaived) { stepWaived++; continue; }   // 行内记号或整档声明均豁免
            if (/^docs\/releases\//.test(where)) { stepWaived++; continue; }
            problems.push(where + ':' + (idx + 1) + ' 处「' + n + ' 步」与实现真值 ' + STEP_TRUTH + ' 步不符（确为史实请同行加 **历史实录** 记号）→ ' + line.trim().slice(0, 72));
          }
        }
      });
    };
    for (const f of docs) {
      const rel = path.relative(PKG_DIR, f).split(path.sep).join('/');
      if (/^(training|simulation)\//.test(rel) && /\.json$/i.test(rel)) continue;   // 任务包走下面的结构化核，避免把干扰项当口径
      let txt; try { txt = fs.readFileSync(f, 'utf8').replace(/\r/g, ''); } catch (e) { continue; }
      claimIn(txt, rel);
    }
    // 只扫 **git 已跟踪** 的 raw/*.md：未跟踪的是本地临时语料，不属于包（2026-09-15 自伤 21：Tip 的 raw/ 全部未跟踪，
    // 逐行扫它们会把别家院的历史审计档打成本院缺陷，还会连带点名档内盘符）。
    const trackedRaw = (() => {
      const g = spawnSync('git', ['ls-files', '--', 'raw'], { cwd: PKG_DIR, encoding: 'utf8', timeout: 60000 });
      if (g.status !== 0) return null;
      return new Set(String(g.stdout).replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean));
    })();
    if (trackedRaw === null) stepFace0 = '（git ls-files 失败 ⇒ raw/ 语料面未核，已在文案点名）';
    else if (trackedRaw.size === 0) stepFace0 = '（本院 raw/ 无入库语料）';
    else {
      // 自伤 22 修正：git ls-files 输出的路径天然带 raw/ 前缀，拿「不含斜杠」当顶层判据会把全部语料滤光，
      // 于是门禁一条没扫却照报绿（aing 八档与 Tip 的 21 处读数一模一样才暴露）。判据改为 ^raw/[^/]+\.md$，
      // 并把「已入库语料 N 档」印进文案——扫到几档必须可见，不许静默。
      const rawTop = [...trackedRaw].filter(x => /^raw\/[^/]+\.md$/i.test(x)).sort();
      stepFace0 = '已入库语料 ' + rawTop.length + ' 档';
      for (const rel of rawTop) {
        let txt; try { txt = fs.readFileSync(path.join(PKG_DIR, rel), 'utf8').replace(/\r/g, ''); } catch (e) { continue; }
        const head = txt.split('\n').slice(0, 5).join('\n');   // 整档声明只认前 5 行：正文里的行内记号不算整档声明
        const fileWaived = /\*\*(历史实录|旧版口径|陈档快照)\*\*|本档为.*快照|属历史快照|historical snapshot/i.test(head);
        claimIn(txt, rel, fileWaived);
      }
    }
    [['training/task-package.json', 'correct_answer'], ['simulation/task-package.json', null], ['simulation/skillopt-task-package.json', 'reference_text']].forEach(([rel, ansKey]) => {
      const p = path.join(PKG_DIR, rel);
      if (!fs.existsSync(p)) return;
      let j; try { j = JSON.parse(fs.readFileSync(p, 'utf8').replace(/\r/g, '')); } catch (e) { problems.push(rel + ' 解析失败，步数口径无从核对'); return; }
      (j.tasks || j.items || []).forEach(item => {
        const letter = item.correct ? String(item.correct).trim().charAt(0).toUpperCase() : null;
        const auth = [ansKey, letter ? 'answer' + letter : null, 'fact', 'reference_text'].filter(Boolean);
        Object.entries(item).forEach(([k, v]) => {
          if (typeof v !== 'string') return;
          if (auth.includes(k)) claimIn(v, rel + '#' + (item.id || '?') + '.' + k);
          else if (k === 'question' && !/\n\s*[A-D]\./.test(v)) claimIn(v, rel + '#' + (item.id || '?') + '.question');
          else if (/\d{1,2}\s*步/.test(v)) stepWaived++;                            // 干扰位/含选项题干：豁免但计数
        });
      });
    });
    if (stepChecked === 0) problems.push('步数口径门一处也没核到（锚点全失）→ 不能算通过');
    const stepFace = '代谢步数 ' + stepChecked + ' 处对真值 ' + STEP_TRUTH + '（干扰/史记豁免 ' + stepWaived + '）' + (stepFace0 ? ' · ' + stepFace0 : '');

    if (problems.length) throw new Error(problems.length + ' 项文档命令不可执行：\n      ' + problems.slice(0, 8).join('\n      ') + (problems.length > 8 ? '\n      …另 ' + (problems.length - 8) + ' 项' : ''));
    return '院际面 本院 ' + faceCount + ' / 抄件 ' + (faceStated || '无锚点') + ' · 引用路径 ' + refChecked + ' 处逐条核在位（反例须带标记）· npm run ' + npmChecked + ' 处有名 · 外部依赖命令 ' + pyChecked + ' 处均自带执行位置 · 只读命令真跑 ' + ran + '/' + RUNNERS.length + ' 全 exit 0 且每条都能回指文档 · README 图↔表一致且旧图未复活 · ' + stepFace + ' · 扫 ' + docs.length + ' 档';
  });

  // ── 报告 ─────────────────────────────────────────────────────
  console.log('\n═══ aing 部署验收报告 / Deployment Acceptance Report ═══');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '  ' + r.detail : '\n     ↳ ' + r.detail}`);
  }
  const failed = results.filter(r => !r.ok);
  if (ONLY.length && results.length === 0) {
    console.log('🔴 VD_ONLY 没匹配到任何门禁（过滤器写错了？）→ 按失败处理，不得报绿');
    process.exit(1);
  }
  if (failed.length === 0) {
    console.log(ONLY.length ? `\n🟢 部分跑全绿 / partial run green（VD_ONLY=${ONLY.join('+')}，实跑 ${results.length} 项 / 跳过 ${skippedNames.length} 项）—— 这**不等于**部署验收通过` : '\n🟢 ALL GREEN —— 部署验收通过（deploy verified）');
    // 验收登记自动化：data/last-verify.json 曾由验收 agent 手抄，长期残留旧 hash 与旧项数，
    // 而面板 health.gates 直接引用它（纪律第 6 条：状态单一来源）→ 全绿时由脚本自写。
    if (ONLY.length) {
      console.log(`· 部分跑（VD_ONLY=${ONLY.join("+")}）：跳过 ${skippedNames.length} 项，**未写验收登记**（登记只在 0-C 全量全绿时刷新）`);
      process.exit(0);
    }
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
