#!/usr/bin/env node
/**
 * eval-retrieval.js — 检索质量评分（KPI 面，独立于 verify-deploy 门禁）
 *
 * 用途：给 aing 的 384 维语义检索一张可复核的成绩单。对一组「已知 Q&A 对」
 * （query → 期望命中的实体），跑 semanticSearch，算 recall@k 与 MRR（均值倒数排名）。
 *
 * 设计原则（与 aing 纪律对齐）：
 *   - 只读：复用现有 VectorSearch + KnowledgeStore，绝不写库、不建表、不碰门禁
 *   - 默认 Q&A 集从库内 active 实体名即时生成（每实体一条自指问句），保证评分永远贴合当前真库；
 *     也可 --set <json> 传入人工标注的真实问答对做业务侧评估
 *   - 384 维语义模型缺失时自动回退 64 维哈希，成绩单会标注所用通道（不假报 semantic）
 *   - 分数必须来自真实检索（纪律 5「禁启发式代评分」）——本脚本就是那个真实数据源
 *
 * 用法：
 *   node tools/eval-retrieval.js                     # 默认：库内 active 实体自指问句，recall@5 + MRR
 *   node tools/eval-retrieval.js --set my-qa.json    # 业务标注集（[{query, expect:[id|name]}]）
 *   node tools/eval-retrieval.js --k 10              # 改 recall 截断位
 */
const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('../src/knowledge-store');
const VectorSearch = require('../src/vector-search');

async function loadSet(store, opt) {
  if (opt.set) {
    const raw = JSON.parse(fs.readFileSync(opt.set, 'utf8'));
    return raw.map(q => ({ query: q.query, expect: q.expect }));
  }
  // 默认：取 active 实体的前 N 个，各自生成一条自指问句（问句 = 实体名 + 一句通用提问）
  const ents = store.getEntities({ status: 'active' });
  const take = (opt.limit || 20);
  return ents.slice(0, take).map(e => ({
    query: `${e.name} 是什么？怎么用？`,
    expect: [e.id],
    _self: e.name,
  }));
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = { k: 5, limit: 20, set: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--k') opt.k = parseInt(argv[++i], 10) || 5;
    if (argv[i] === '--limit') opt.limit = parseInt(argv[++i], 10) || 20;
    if (argv[i] === '--set') opt.set = argv[++i];
  }

  const store = new KnowledgeStore();
  await store.init();
  const vs = new VectorSearch(store);
  await vs.init();
  let channel = 'hash-64';
  try { await vs.enableSemantic(); channel = `semantic-${vs.dimension}`; }
  catch (e) { console.log(`⚠️ 语义通道不可用，回退 64 维哈希（${e.message})`); }

  const set = await loadSet(store, opt);
  if (!set.length) { console.log('❌ Q&A 集为空（库内无 active 实体或 --set 文件空）'); process.exit(1); }

  let recallSum = 0, mrrSum = 0, hit = 0;
  process.stdout.write(`\n📊 检索质量评分（通道 ${channel} | k=${opt.k} | ${set.length} 问句）\n` +
    '─'.repeat(64) + '\n');
  for (const q of set) {
    const top = await vs.semanticSearch(q.query, opt.k);
    const ids = top.map(r => r.id);
    const expect = q.expect || [];
    const rank = expect.findIndex(id => ids.includes(id));
    const found = rank >= 0;
    recallSum += found ? 1 : 0;
    mrrSum += found ? 1 / (rank + 1) : 0;
    if (found) hit++;
    const line = `  ${found ? '✓' : '✗'} ${q._self || q.query}  → top: ${top.slice(0, 3).map(t => t.name).join(' / ') || '(空)'}`;
    console.log(line);
  }
  const n = set.length;
  const recall = recallSum / n, mrr = mrrSum / n, hr = hit / n;
  console.log('─'.repeat(64));
  console.log(`📈 recall@${opt.k} = ${(recall * 100).toFixed(1)}%   MRR = ${mrr.toFixed(3)}   命中率@${opt.k} = ${(hr * 100).toFixed(1)}%   （通道 ${channel}）`);
  // 门槛：语义通道下 recall@5 < 50% 视为检索质量告警（不阻断，仅提示，供 M4 台账/汇报引用）
  if (channel.startsWith('semantic') && recall < 0.5) {
    console.log('⚠️ 语义检索 recall 偏低（<50%@5）—— 提示：可能新库未重建向量或问句与实体表述距离大，建议 node src/index-vectors.js --semantic --reindex 后复评。');
  }
  console.log('（只读评分，未写库/未改门禁；纪律：分数来自真实检索，非启发式代评）');
}

main().catch(e => { console.error('❌ eval-retrieval 失败:', e.message); process.exit(1); });
