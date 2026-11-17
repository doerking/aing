'use strict';
// M1 任务 1.12 failing test —— 锁 SPEC-1.12 五维契约（2026-11-18 修订 A）
// 五维：KQ 质量 / KA 活跃 / KD 催化率 / KC 时序相干 / KR 续航；KG/KM/KB 退役写 NULL。
// 口径：缺数据落中性 0.5，不编造；失败轮不计入 KC/KR。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kespi-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }
let kespiStep, store;
try { kespiStep = require('../src/kespi.js').kespiStep; store = require('../src/knowledge-store.js'); if (typeof kespiStep !== 'function') throw new Error('kespiStep 未导出'); }
catch (e) { console.error('❌ 红（正确的红）—— src/kespi.js 未实现 SPEC-1.12'); console.error('   ' + e.message.split('\n')[0]); process.exit(1); }
const rows = (sql) => { const s = store._getDb().prepare(sql); const out = []; while (s.step()) out.push(s.getAsObject()); s.free(); return out; };

(async () => {
  await store.init(path.join(yard, 'knowledge.db'));
  const db = store._getDb();
  const ins = (id, content, opts = {}) => {
    store.insertEntity({ id, name: id, type: opts.type || 'Concept', content,
      tags: opts.tags || '["t:7"]', status: 'active', confidence: opts.confidence == null ? 0.6 : opts.confidence });
    if (opts.lastAccess) db.run('UPDATE entities SET last_access = ? WHERE id = ?', [opts.lastAccess, id]);
  };
  const card = (body) => `# x\n\n## 来源\n- 原始资料：x\n\n## 内容\n${body}\n\n## 关系\n- [[y]]\n\n## KESPI 状态\n\n\`\`\`json\n{}\n\`\`\``;

  // KQ：同正文、不同壳 → 去壳后一致；长壳短正文 < 短壳长正文
  ins('kq-shell-long', card('短正文'), { tags: '[]', confidence: 0.6 });
  ins('kq-body-long', '这是一段足够长的正文内容，用来验证去壳后的长度口径是否生效。'.repeat(3), { tags: '[]', confidence: 0.6 });
  // KA
  ins('ka-hot', '热实体正文', { lastAccess: new Date(Date.now() - 2 * 86400000).toISOString().replace('T', ' ').slice(0, 19) });
  ins('ka-cold', '冷实体正文');
  // KD：出向 3 条强边 → 1；只有入向强边 → 0
  ins('kd-out', '催化实体正文');
  ins('kd-in', '被引实体正文');
  // KC/KR 样本
  ins('kr-2of3', '续航实体正文');
  ins('kc-both', '相干母件正文');
  ins('kc-child', '相干子件正文');
  ins('kc-half', '半相干母件正文');
  ins('kc-child2', '半相干子件正文');
  ins('retired', '退役实体');
  db.run("UPDATE entities SET invalid_at='2026-01-01 00:00:00' WHERE id='retired'");

  // 强边：kd-out 出向 3 条（strength 8）；kd-in 只有入向
  for (const [s, t] of [['kd-out', 'kd-in'], ['kd-out', 'ka-hot'], ['kd-out', 'ka-cold']]) {
    store.insertLink({ source_id: s, target_id: t, relation: 'hydrogen-bond', confidence: 0.9, strength: 8 });
  }
  // 派生边：kc-both → kc-child；kc-half → kc-child2
  store.insertLink({ source_id: 'kc-both', target_id: 'kc-child', relation: 'derived', confidence: 0.9, strength: 5 });
  store.insertLink({ source_id: 'kc-half', target_id: 'kc-child2', relation: 'derived', confidence: 0.9, strength: 5 });

  // 轮次：c1/c2/c3 executed、cf failed
  for (const [id, st] of [['c1', 'executed'], ['c2', 'executed'], ['c3', 'executed'], ['cf', 'failed']]) {
    db.run(`INSERT INTO meko_cycles (id, cycle_type, executed_at, status) VALUES ('${id}', 'test:round1', CURRENT_TIMESTAMP, '${st}')`);
  }
  const er = (cid, eid) => db.run('INSERT INTO entity_rounds (entity_id, cycle_id, alive, recorded_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)', [eid, cid]);
  // kr-2of3：c1/c2 在场，c3 缺席 → 2/3；失败轮 cf 的在场行不计
  er('c1', 'kr-2of3'); er('c2', 'kr-2of3'); er('cf', 'kr-2of3');
  // kc-both + kc-child：c1/c2 同世 → 1
  er('c1', 'kc-both'); er('c2', 'kc-both'); er('c1', 'kc-child'); er('c2', 'kc-child');
  // kc-half + kc-child2：只有 c1 同世 → 0.5
  er('c1', 'kc-half'); er('c2', 'kc-half'); er('c1', 'kc-child2');
  // 让 c3 也成为「有账的轮」（只记一个无关实体），验证 window 口径
  er('c3', 'ka-hot');

  await kespiStep(store, {});
  const row = (id) => rows(`SELECT * FROM kespi_scores WHERE entity_id='${id}'`)[0];

  const rp = row('ka-hot');
  ac('AC-1 五维落表（KG/KM/KB 为 NULL）+ overall=五维均值',
    !!rp && ['kq', 'ka', 'kd', 'kc', 'kr'].every(k => typeof rp[k] === 'number') &&
    rp.kg === null && rp.km === null && rp.kb === null &&
    Math.abs(rp.overall - (rp.kq + rp.ka + rp.kd + rp.kc + rp.kr) / 5) < 1e-3,
    JSON.stringify(rp));

  ac('AC-2 退役不评', !row('retired'));

  const kqShell = Number(row('kq-shell-long').kq);
  const kqBody = Number(row('kq-body-long').kq);
  ac('AC-3 KQ 去壳正文口径（短正文长壳 < 长正文短壳）', kqShell < kqBody, JSON.stringify({ kqShell, kqBody }));

  const kaHot = Number(row('ka-hot').ka);
  const kaCold = Number(row('ka-cold').ka);
  ac('AC-4 KA 活跃（近 7 天=1，无访问=0.2）', kaHot === 1 && Math.abs(kaCold - 0.2) < 1e-9, JSON.stringify({ kaHot, kaCold }));

  const kdOut = Number(row('kd-out').kd);
  const kdIn = Number(row('kd-in').kd);
  ac('AC-5 KD 催化率只认出向强边（3 条→1；仅入向→0）', kdOut === 1 && kdIn === 0, JSON.stringify({ kdOut, kdIn }));

  const kcBoth = Number(row('kc-both').kc);
  const kcHalf = Number(row('kc-half').kc);
  const kcNone = Number(row('ka-hot').kc);
  ac('AC-6 KC 时序相干（3 轮中同世 2 轮=2/3 / 1 轮=1/3 / 无派生件=0.5）',
    Math.abs(kcBoth - 2 / 3) < 1e-3 && Math.abs(kcHalf - 1 / 3) < 1e-3 && Math.abs(kcNone - 0.5) < 1e-9,
    JSON.stringify({ kcBoth, kcHalf, kcNone }));

  const kr = Number(row('kr-2of3').kr);
  const krNone = Number(row('ka-hot').kr);
  ac('AC-7 KR 续航（3 个有账轮在场 2 轮=2/3；仅末轮=1/3；失败轮不计）',
    Math.abs(kr - 2 / 3) < 1e-3 && Math.abs(krNone - 1 / 3) < 1e-3, JSON.stringify({ kr, krNone }));

  const before = JSON.parse(JSON.stringify(rows('SELECT * FROM kespi_scores ORDER BY entity_id')));
  await kespiStep(store, {});
  const after = JSON.parse(JSON.stringify(rows('SELECT * FROM kespi_scores ORDER BY entity_id')));
  const la = rows("SELECT last_access FROM entities WHERE id='ka-hot'")[0].last_access;
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'kespi.js'), 'utf8');
  ac('AC-8 幂等（同日）+ 铁律（不写 last_access、无物理删）',
    after.length === before.length && after.every((x, i) => Math.abs(x.overall - before[i].overall) < 1e-9) &&
    la && !/DELETE\s+FROM/i.test(src),
    JSON.stringify({ n: after.length, la }));

  console.log(`\n----- 1.12 pass=${pass} fail=${fail} -----`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
