// M1 任务 1.1 failing test —— 锁 SPEC-1.1 compile 编译步六条 AC
// 运行（本仓根 <repo-root>）：node test/test-1.1-compile.js
// 期望：红（require failure）→ src/compile.js 实现后转绿。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-compile-'));

process.on('exit', () => {
  try { if (fs.existsSync(yard)) fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {}
});

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, err: e.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

let compile;
try { compile = require('../src/compile.js'); }
catch (e) {
  console.error('❌ 红（正确的红）—— src/compile.js 未实现 SPEC-1.1 compile 编译步');
  console.error('   require 失败: ' + e.message.split('\n')[0]);
  process.exit(1);
}

(async () => {
  const store = require('../src/knowledge-store.js');
  const dbPath = path.join(yard, 'knowledge.db');
  await store.init(dbPath);

  const rawDir = path.join(yard, 'raw');
  fs.mkdirSync(path.join(rawDir, 'sub'), { recursive: true });

  await check('AC-1 frontmatter 解析：有/无 frontmatter 两态', () => {
    const withFm = compile.parseFrontmatter('---\nid: x\ntags: [a, b]\n---\n正文');
    assert(withFm.metadata.id === 'x', 'metadata.id 应取到 x');
    assert(Array.isArray(withFm.metadata.tags) && withFm.metadata.tags.join(',') === 'a,b', 'tags 应解析为 [a,b]');
    assert(withFm.content === '正文', 'body 应为正文');
    const noFm = compile.parseFrontmatter('# 无 frontmatter 正文');
    assert(Object.keys(noFm.metadata).length === 0, '无 frontmatter metadata 应空');
    assert(noFm.content === '# 无 frontmatter 正文', '无 frontmatter 整档应为 body');
  });

  await check('AC-2 id 锚定：声明 id 原样用；无声明按相对路径推导；同声明 id 只一行', async () => {
    // 声明 id + 子目录也尊重声明 id
    fs.writeFileSync(path.join(rawDir, 'sub', 'f1.md'), '---\nid: ent-declared\ntype: Concept\n---\nF1');
    // 无声明 id → 相对路径推导 sub/f2.md → sub-f2
    fs.writeFileSync(path.join(rawDir, 'sub', 'f2.md'), '# F2 无声明');
    // 同声明 id 的第二档 → 只入一行
    fs.writeFileSync(path.join(rawDir, 'f1b.md'), '---\nid: ent-declared\n---\nF1B 同 id');
    const stats = await compile.compile(rawDir, store);
    const row = store.getEntity('ent-declared');
    assert(row != null, '声明 id 实体应入库');
    const db = store._getDb();
    const stmt = db.prepare("SELECT COUNT(*) AS n FROM entities WHERE id = 'ent-declared'");
    stmt.step();
    assert(stmt.getAsObject().n === 1, '同声明 id 两档只入一行');
    stmt.free();
    assert(store.getEntity('sub-f2') != null, '无声明 id 应按相对路径推导 sub-f2 入库');
  });

  await check('AC-3 新实体入库列齐', async () => {
    const raw2 = path.join(yard, 'raw3');
    fs.mkdirSync(raw2, { recursive: true });
    fs.writeFileSync(path.join(raw2, 'a.md'),
      '---\nid: ent-full\ntype: Concept\nname: 全列实体\ntags: [x:9, y]\nstatus: active\nconfidence: 0.9\n---\n正文内容');
    await compile.compile(raw2, store);
    const e = store.getEntity('ent-full');
    assert(e != null, 'ent-full 应入库');
    assert(e.type === 'Concept', 'type 应为 Concept');
    assert(e.name === '全列实体', 'name 应入');
    assert(e.content === '正文内容', 'content 应为 body');
    assert(JSON.parse(e.tags).join(',') === 'x:9,y', 'tags 应存 JSON 数组');
    assert(e.status === 'active', 'status 应为 active');
    assert(e.confidence === 0.9, 'confidence 应为 0.9');
    assert(e.created_at != null && String(e.created_at).length > 0, 'created_at 应非空');
    assert(e.updated_at != null && String(e.updated_at).length > 0, 'updated_at 应非空');
    assert(e.invalid_at == null, 'invalid_at 应 NULL');
    assert(Number(e.tolaria_strength) === 5, 'tolaria_strength 应列默认 5');
    assert(e.last_access == null, 'last_access 应 NULL');
  });

  await check('AC-4 幂等 + 变更感知', async () => {
    const raw4 = path.join(yard, 'raw4');
    fs.mkdirSync(raw4, { recursive: true });
    // 预置既有实体：旧 updated_at，内容与 raw 一致 → no-op 不刷
    fs.writeFileSync(path.join(raw4, 'same.md'), '---\nid: ent-same\n---\n不变内容');
    const db = store._getDb();
    db.run(`INSERT INTO entities (id, content, status, created_at, updated_at, last_access)
            VALUES ('ent-same', '不变内容', 'active', '2020-01-01 00:00:00', '2020-01-01 00:00:00', '2021-01-01 00:00:00')`);
    // 预置内容过期实体：raw 已改 → UPDATE 刷 updated_at
    fs.writeFileSync(path.join(raw4, 'changed.md'), '---\nid: ent-changed\n---\n新内容');
    db.run(`INSERT INTO entities (id, content, status, created_at, updated_at, last_access)
            VALUES ('ent-changed', '旧内容', 'active', '2020-01-01 00:00:00', '2020-01-01 00:00:00', '2021-01-01 00:00:00')`);
    store._persist();

    const s1 = await compile.compile(raw4, store);
    assert(s1.created === 0, '既有实体第二趟应 created=0');
    assert(s1.updated === 1, '内容变了的实体应 updated=1');
    const sameRow = store.getEntity('ent-same');
    assert(String(sameRow.updated_at) === '2020-01-01 00:00:00', '内容未变 updated_at 不应刷新');
    const changedRow = store.getEntity('ent-changed');
    assert(String(changedRow.updated_at) > '2020-01-01 00:00:00', '内容变了 updated_at 应刷新');
    assert(changedRow.content === '新内容', '内容应更新为新内容');

    // 第二趟：全部 no-op
    const before = store.getEntity('ent-changed').updated_at;
    const s2 = await compile.compile(raw4, store);
    assert(s2.created === 0 && s2.updated === 0, '第二趟应全 no-op');
    const db2 = store._getDb();
    const stmt2 = db2.prepare('SELECT COUNT(*) AS n FROM entities');
    stmt2.step();
    const nAfter1 = stmt2.getAsObject().n;
    stmt2.free();
    await compile.compile(raw4, store);
    const stmt3 = store._getDb().prepare('SELECT COUNT(*) AS n FROM entities');
    stmt3.step();
    const nAfter3 = stmt3.getAsObject().n;
    stmt3.free();
    assert(nAfter1 === nAfter3, '连跑行数不变');
    assert(String(store.getEntity('ent-changed').updated_at) === String(before), 'no-op 不刷 updated_at');
  });

  await check('AC-5 compile 永不碰 last_access（含内容更新路径）', async () => {
    const raw5 = path.join(yard, 'raw5');
    fs.mkdirSync(raw5, { recursive: true });
    // 实体内容不变 → last_access 不动
    fs.writeFileSync(path.join(raw5, 'p.md'), '---\nid: ent-la\n---\nLA 正文');
    await compile.compile(raw5, store);
    const db = store._getDb();
    db.run("UPDATE entities SET last_access = '2021-06-01 00:00:00' WHERE id = 'ent-la'");
    store._persist();
    await compile.compile(raw5, store);
    assert(String(store.getEntity('ent-la').last_access) === '2021-06-01 00:00:00', 'no-op 路径 last_access 应不变');
    // 实体内容更新 → last_access 仍不动
    fs.writeFileSync(path.join(raw5, 'p.md'), '---\nid: ent-la\n---\nLA 正文改');
    await compile.compile(raw5, store);
    assert(String(store.getEntity('ent-la').last_access) === '2021-06-01 00:00:00', '更新路径 last_access 也应不变（SPEC-0.4 AC-6 回归）');
  });

  await check('AC-6 不复活退役实体', async () => {
    const raw6 = path.join(yard, 'raw6');
    fs.mkdirSync(raw6, { recursive: true });
    fs.writeFileSync(path.join(raw6, 'r.md'), '---\nid: ent-retired\n---\n退役正文');
    const db = store._getDb();
    db.run(`INSERT INTO entities (id, content, status, created_at, updated_at, invalid_at)
            VALUES ('ent-retired', '退役正文', 'retired', '2020-01-01 00:00:00', '2020-01-01 00:00:00', '2022-01-01 00:00:00')`);
    store._persist();
    await compile.compile(raw6, store);
    const row = store.getEntity('ent-retired');
    assert(String(row.invalid_at) === '2022-01-01 00:00:00', 'compile 跑后 invalid_at 应不变（不复活）');
  });

  const passed = results.filter(r => r.pass).length;
  console.log('\n=== TEST-M1.1 compile 编译步 ===');
  results.forEach(r => console.log((r.pass ? '✅' : '❌') + ' ' + r.name + (r.err ? '  — ' + r.err : '')));
  console.log(`\n${passed}/${results.length} 绿`);
  process.exitCode = passed === results.length ? 0 : 1;
})();
