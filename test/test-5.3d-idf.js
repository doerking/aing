'use strict';
// M5 任务 5.3d failing test —— 词面 IDF 通道（SPEC-6.3 修订 A）
// 目的：稀有词的词面命中应比常见词更值钱；全覆盖查询仍得 1，不推翻既有 6.3 口径。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-idf-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const R = require('../src/retrieval.js');
const rowsOf = (db, sql) => { const s = db.prepare(sql); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const OFF = { kespi: 0, recency: 0 };

(async () => {
  const DB = path.join(yard, 'k.db');
  await store.init(DB);
  const put = (id, name, content = '') => store.insertEntity({ id, name, type: 'Concept', content, tags: '["t"]' });
  // SPEC-7.1 §4.1：表头不入键，词面吃正文 —— 关键词一律写进 content
  put('rare', '表头甲', '鲸落深潜');
  put('c1', '表头乙', '日志归档一'); put('c2', '表头丙', '日志归档二'); put('c3', '表头丁', '日志归档三');
  put('c4', '表头戊', '日志归档四'); put('c5', '表头己', '日志归档五');
  const db = store._getDb();
  const N = rowsOf(db, 'SELECT COUNT(*) AS n FROM entities')[0].n;

  // AC-1 导出与 IDF 公式：平滑、恒 ≥1、稀有 > 常见
  const has = typeof R.idfOf === 'function' && typeof R.keywordScoreIdf === 'function';
  const iRare = has ? R.idfOf(1, N) : NaN;
  const iCommon = has ? R.idfOf(5, N) : NaN;
  ac('AC-1 IDF 导出与公式', has && iRare > iCommon && iCommon >= 1 && Number.isFinite(iRare),
    JSON.stringify({ has, iRare, iCommon }));

  // AC-2 稀有词加权：各命中一个词，稀有者分更高（旧口径两者都是 0.5）
  const df = { '鲸落': 1, '日志': 5 };
  const sRare = has ? R.keywordScoreIdf({ id: 'rare', name: '表头甲', type: 'Concept', content: '鲸落深潜', tags: '["t"]' }, '鲸落 日志', df, N) : NaN;
  const sCommon = has ? R.keywordScoreIdf({ id: 'c1', name: '表头乙', type: 'Concept', content: '日志归档一', tags: '["t"]' }, '鲸落 日志', df, N) : NaN;
  ac('AC-2 稀有词加权', has && sRare > sCommon && sRare <= 1 && sCommon > 0,
    JSON.stringify({ sRare, sCommon }));

  // AC-3 检索接线：lexical-only 排序时稀有命中排前
  const r = await R.search(store, '鲸落 日志', { weights: { vector: 0, lexical: 1, name: 0 }, rerank: OFF, k: 3 });
  const top = r.candidates[0] && r.candidates[0].id;
  ac('AC-3 检索接线', top === 'rare' && r.candidates[0].channels.lexical > (r.candidates[1] ? r.candidates[1].channels.lexical : 0),
    JSON.stringify(r.candidates.map((c) => [c.id, c.channels.lexical])));

  // AC-4 全覆盖仍为 1（不破坏 6.3 既有口径）
  const full = await R.search(store, '鲸落深潜', { weights: { vector: 0, lexical: 1, name: 0 }, rerank: OFF, k: 1 });
  ac('AC-4 全覆盖得 1', full.candidates[0] && full.candidates[0].channels.lexical === 1,
    JSON.stringify(full.candidates.map((c) => [c.id, c.channels.lexical])));

  // AC-5 空/无命中不崩、得 0
  const empty = await R.search(store, '，。 ', { weights: { vector: 0, lexical: 1, name: 0 }, rerank: OFF, k: 3 });
  const miss = await R.search(store, '量子纠缠', { weights: { vector: 0, lexical: 1, name: 0 }, rerank: OFF, k: 3 });
  ac('AC-5 空/无命中', empty.candidates.length === 0 && miss.candidates.length === 0,
    JSON.stringify({ empty: empty.candidates.length, miss: miss.candidates.length }));

  // AC-6 只读：跑完实体字段逐字段不变
  const snap = () => JSON.stringify(rowsOf(db, 'SELECT id,name,content,last_access,status,invalid_at FROM entities ORDER BY id'));
  const before = snap();
  await R.search(store, '鲸落', { rerank: OFF });
  ac('AC-6 只读', before === snap(), '实体字段被检索改写');

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
