#!/usr/bin/env node
/**
 * seed-demo.js — 演示数据灌入（2026-09-08，冷启动体验完善）
 *
 * 做什么：把 demo/*.md（随仓库分发的虚构演示文档，前缀 demo-*）复制进 raw/，
 *         跑一轮代谢链（AING_NO_AUTOCOMMIT=1，不污染 git 历史），
 *         按文档 created 日期回填 updated_at（时间梯度 → KESPI 的 KG 生长维有戏可看），
 *         最后重打 KESPI 分 + 语义重索引。
 *
 * 不会：碰真实 raw/*.md / 真实 wiki 实体（ID 无 demo- 前缀的一律不动）、产生 git 提交。
 *
 * 用法：
 *   npm run seed:demo        # 灌入（幂等，可重复跑）
 *   npm run unseed:demo      # 拆除（按 demo-% 前缀清六张表 + 删文件 + 重索引）
 *
 * 演示亮点（内容刻意设计）：
 *   - 双向链接图（非孤儿 → KD 密度维好看）
 *   - created 时间梯度 08-10 ~ 08-25（KG 生长维分层）
 *   - 一组符号规范争议文档（KQ 一致性场景，verify_conflict 可触发）
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('./knowledge-store');

const ROOT = path.resolve(__dirname, '..');
const DEMO_DIR = path.join(ROOT, 'demo');
const RAW_DIR = path.join(ROOT, 'raw');

function run(name, cmd, args, env = {}) {
  console.log(`\n▶ ${name}`);
  const res = spawnSync(cmd, args, {
    cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, ...env }
  });
  if (res.status !== 0) {
    console.error(`❌ ${name} 失败 (exit=${res.status})`);
    process.exit(1);
  }
}

function sh(cmd) {
  // 简易 frontmatter created 解析（demo 文档格式受控，无需完整 YAML）
  const m = fs.readFileSync(cmd, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const d = m[1].match(/^created:\s*(.+)$/m);
  return d ? d[1].trim() : null;
}

(async () => {
  console.log('🧪 seed-demo — 演示数据灌入\n');

  const demoFiles = fs.readdirSync(DEMO_DIR).filter(f => f.endsWith('.md') && f.startsWith('demo-'));
  if (demoFiles.length === 0) {
    console.error('❌ demo/ 下没有 demo-*.md 文件');
    process.exit(1);
  }
  const createdMap = {}; // entityId -> created 日期（供代谢后回填）
  for (const f of demoFiles) {
    const created = sh(path.join(DEMO_DIR, f));
    if (created) createdMap[f.replace(/\.md$/, '')] = created;
  }

  // 1) 复制进 raw/
  fs.mkdirSync(RAW_DIR, { recursive: true });
  for (const f of demoFiles) {
    fs.copyFileSync(path.join(DEMO_DIR, f), path.join(RAW_DIR, f));
    console.log(`  📄 raw/${f}`);
  }
  console.log(`✅ ${demoFiles.length} 篇演示文档已进入 raw/（git 忽略生效，不进版本库）`);

  // 2) 代谢链（免自动提交）
  run('代谢链（AING_NO_AUTOCOMMIT=1）', 'node', ['src/run-metabolism.js'], { AING_NO_AUTOCOMMIT: '1' });

  // 3) 回填时间梯度（updated_at → KG 生长维）
  const store = new KnowledgeStore(path.join(ROOT, 'knowledge.db'));
  await store.init();
  let backfilled = 0;
  for (const [id, created] of Object.entries(createdMap)) {
    // created 当天 10:00 作为基准，让梯度可复现
    const ts = `${created} 10:00:00`;
    const valid = !Number.isNaN(new Date(ts.replace(' ', 'T')).getTime());
    if (!valid) continue;
    store.run('UPDATE entities SET updated_at = ? WHERE id = ?', [ts, id]);
    backfilled++;
  }
  console.log(`\n✅ 时间梯度回填 ${backfilled} 条（updated_at = 文档 created + 10:00）`);

  // 4) KESPI 重评分（时间梯度参与 KG 维计算）
  run('KESPI 重评分', 'node', ['src/kespi-check.js']);
  // 5) 语义重索引（新实体进向量库）
  run('语义重索引', 'node', ['src/index-vectors.js', '--semantic', '--reindex']);
  store.close();

  console.log(`
🟢 seed-demo 完成。试试：
   npm run query -- "千纸鹤"            # 命中演示实体，看融合分构成
   npm run query -- "符号规范"          # 争议文档对
   node tools/calibrate-fusion.js       # 标定演示（实体 14 <30，仍为小样本模式，结论仅方向参考）
   npm run unseed:demo                  # 不想要了？一键拆干净`);
})();
