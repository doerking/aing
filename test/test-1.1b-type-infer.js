'use strict';
// M1 任务 1.1b failing test —— compile 侧 type 推断（SPEC-1.1 修订 A）
// 原则：frontmatter 显式 type 永远优先；无显式值时只看路径结构（保守），不从正文猜。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-type-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const rowsOf = (db, sql, binds = []) => { const s = db.prepare(sql); if (binds.length) s.bind(binds); const o = []; while (s.step()) o.push(s.getAsObject()); s.free(); return o; };
const write = (rel, text) => { const p = path.join(yard, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf8'); };

(async () => {
  const raw = path.join(yard, 'raw');
  write('raw/conversations/c1.md', '---\nname: 会话一\n---\n\n对话正文。');
  write('raw/conversations/explicit.md', '---\nname: 显式稿\ntype: Paper\n---\n\n显式类型优先。');
  write('raw/todos/t1.md', '---\nname: 待办一\n---\n\n待办正文。');
  write('raw/papers/p1.md', '---\nname: 论文一\n---\n\n论文正文。');
  write('raw/meta/m1.md', '---\nname: 元知识一\n---\n\n元知识正文。');
  write('raw/insights/i1.md', '---\nname: 洞察一\n---\n\n洞察正文。');
  write('raw/misc/x1.md', '---\nname: 杂项一\n---\n\n无结构信号，保持未知。');

  const DB = path.join(yard, 'k.db');
  await store.init(DB);
  const db = store._getDb();
  const C = require('../src/compile.js');
  await C.compile(raw, store);
  const typeOf = (id) => {
    const r = rowsOf(db, 'SELECT type FROM entities WHERE id = ?', [id])[0];
    return r ? r.type : undefined;
  };

  // AC-1 显式 type 优先（路径是 conversations 也不改）
  ac('AC-1 显式 type 优先', typeOf('conversations-explicit') === 'Paper',
    JSON.stringify({ type: typeOf('conversations-explicit') }));

  // AC-2 会话/待办：路径推断到短料层
  ac('AC-2 会话与待办', typeOf('conversations-c1') === 'Conversation' && typeOf('todos-t1') === 'Todo',
    JSON.stringify({ c1: typeOf('conversations-c1'), t1: typeOf('todos-t1') }));

  // AC-3 知识层三类
  const paper = typeOf('papers-p1'), meta = typeOf('meta-m1'), insight = typeOf('insights-i1');
  ac('AC-3 论文/元知识/洞察', paper === 'Paper' && meta === 'MetaKnowledge' && insight === 'Insight',
    JSON.stringify({ paper, meta, insight }));

  // AC-4 未知不猜：无路径信号 → null（下游按知识层保底）
  ac('AC-4 未知不猜', typeOf('misc-x1') === null, JSON.stringify({ x1: typeOf('misc-x1') }));

  // AC-5 幂等：复跑全部 skipped，不刷 updated_at
  const before = rowsOf(db, 'SELECT id, type, updated_at FROM entities ORDER BY id');
  const stats = await C.compile(raw, store);
  const after = rowsOf(db, 'SELECT id, type, updated_at FROM entities ORDER BY id');
  ac('AC-5 幂等', stats.skipped === 7 && stats.created === 0 && stats.updated === 0 && JSON.stringify(before) === JSON.stringify(after),
    JSON.stringify(stats));

  // AC-6 铁律：不碰 last_access / invalid_at；源码无物理删
  const untouched = rowsOf(db, "SELECT COUNT(*) AS n FROM entities WHERE last_access IS NOT NULL OR invalid_at IS NOT NULL")[0].n;
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'compile.js'), 'utf8');
  ac('AC-6 铁律', untouched === 0 && !/DELETE\s+FROM/i.test(src), JSON.stringify({ untouched }));

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
