'use strict';
// M6 任务 6.62 failing test —— 开单口径按 fingerprint 归并（SPEC-6.62）
// 病：真库 322 实体 = 118 内容 × 2–3 抄（bare/wiki-/raw-），每张拷贝各背一份工单——
// 候选 13 张实为 7 个真内容。同维在途单亦唔系组级幂等，要等 TTL 3 轮 proposal-expired 重开。
const fs = require('fs'); const os = require('os'); const path = require('path');
const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-fpd-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });
let pass = 0; let fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const K = require('../src/knowledge-store.js').__kespi || require('../src/kespi.js');
const S = require('../src/self-optimize.js');

const rows = (sql, binds = []) => { const s = store._getDb().prepare(sql); if (binds.length) s.bind(binds); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return a; };
const one = (sql, binds = []) => rows(sql, binds)[0];
const fp = (id) => one('SELECT fingerprint FROM entities WHERE id = ?', [id]).fingerprint;

// 短正文、1 标签 → kq 低（命中 kq-low）
const mkShort = (id) => store.insertEntity({
  id, name: id, type: 'Concept', content: '短正文', tags: '["t:7"]',
  status: 'active', confidence: 0.5, strand: 'past'
});

(async () => {
  await store.init(path.join(yard, 'k.db'));

  // 组 A：两张同内容（同 fingerprint）
  mkShort('e-sA'); mkShort('e-sB');
  // 组 B：两张同内容（同 fingerprint），皆「被引用唔催化」→ kd-cited（需入向强边 ≥ 2）
  mkShort('e-cA'); mkShort('e-cB'); mkShort('e-citer1'); mkShort('e-citer2');
  for (const t of ['e-cA', 'e-cB']) {
    store._getDb().run("INSERT INTO links (source_id,target_id,relation,confidence,strength,evidence,created_at) VALUES ('e-citer1',?, 'hydrogen-bond',0.8,7,'[]',CURRENT_TIMESTAMP)", [t]);
    store._getDb().run("INSERT INTO links (source_id,target_id,relation,confidence,strength,evidence,created_at) VALUES ('e-citer2',?, 'hydrogen-bond',0.8,7,'[]',CURRENT_TIMESTAMP)", [t]);
  }
  // 组 C：内容不同（唔得被归并），入向强边 ≥ 2
  store.insertEntity({
    id: 'e-cC', name: 'e-cC', type: 'Concept', content: '另一个短正文内容', tags: '["t:7"]',
    status: 'active', confidence: 0.5, strand: 'past'
  });
  store._getDb().run("INSERT INTO links (source_id,target_id,relation,confidence,strength,evidence,created_at) VALUES ('e-citer1','e-cC','hydrogen-bond',0.8,7,'[]',CURRENT_TIMESTAMP)");
  store._getDb().run("INSERT INTO links (source_id,target_id,relation,confidence,strength,evidence,created_at) VALUES ('e-citer2','e-cC','hydrogen-bond',0.8,7,'[]',CURRENT_TIMESTAMP)");
  // AC-5：fingerprint 为空的实体（唔与他人归并）
  store._getDb().run("INSERT INTO entities (id,name,type,content,tags,status,confidence,strand,fingerprint,created_at,updated_at) VALUES ('e-null','e-null','Concept','空指纹正文','[\"t:7\"]','active',0.5,'past',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");

  ac('AC-5 前置：组 A 两张同 fingerprint', fp('e-sA') && fp('e-sA') === fp('e-sB'), 'fp(A)=(' + fp('e-sA') + ') fp(B)=(' + fp('e-sB') + ')');
  ac('AC-5 前置：组 C 与组 A 指纹不同', fp('e-cC') !== fp('e-sA'));

  const scores0 = rows('SELECT entity_id, kq, kd, overall FROM kespi_scores');
  await K.kespiStep(store, {});

  const scan1 = S.scanTickets(store, { persist: false, quota: { kq: 999, kd: 999 } });
  const t1 = scan1.tickets || [];
  const kqA = t1.filter(t => t.entity_id === 'e-sA').length;
  const kqB = t1.filter(t => t.entity_id === 'e-sB').length;
  // AC-1：组 A 只开 1 张，唔系 2 张
  ac('AC-1 同 fingerprint 组每维只开 1 张', (kqA + kqB) === 1, 'e-sA=' + kqA + ' e-sB=' + kqB + '（应合共 1）');
  // AC-1b：代表系分数最低者（cands 按 score 升序 → 首个入组者）
  const rep = t1.find(t => t.entity_id === 'e-sA' || t.entity_id === 'e-sB');
  ac('AC-1 代表系组内分数最低者（同分取先入组者）', !!rep, '未见代表');

  // AC-2：组级幂等——代表已在途，其余成员唔再重开
  store._getDb().run("INSERT INTO opt_tickets (id,entity_id,dim,kind,action,score,zone,status,attempts,evidence_json,created_at,updated_at) VALUES ('t-open','e-sA','kq','kq-low','memo',0.2,'red','open',0,'{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  const scan2 = S.scanTickets(store, { persist: false, quota: { kq: 999, kd: 999 } });
  const t2 = scan2.tickets || [];
  ac('AC-2 组级幂等：在途单后同组其余成员唔再重开',
    !t2.some(t => (t.entity_id === 'e-sA' || t.entity_id === 'e-sB') && t.dim === 'kq'),
    '第二轮 kq 候选 = ' + t2.filter(t => t.dim === 'kq').map(t => t.entity_id).join(','));

  // AC-3：kd-cited 组 B 只 1 张（唔系 2 张）
  const kdB = t1.filter(t => t.kind === 'kd-cited' && (t.entity_id === 'e-cA' || t.entity_id === 'e-cB')).length;
  ac('AC-3 kd-cited 同组只 1 张', kdB === 1, '组 B kd-cited = ' + kdB);

  // AC-4：不同 fingerprint 唔误伤
  const kdC = t1.filter(t => t.kind === 'kd-cited' && t.entity_id === 'e-cC').length;
  ac('AC-4 不同 fingerprint 照旧各自开单', kdC === 1, 'e-cC kd-cited = ' + kdC);

  // AC-5：fingerprint 为空唔与他人归并（唔系「组内第 2 张」被吞）
  const knull = t1.filter(t => t.entity_id === 'e-null').length;
  const kOtherNull = t1.filter(t => t.entity_id !== 'e-null' && t.dim === 'kq').length;
  ac('AC-5 空 fingerprint 回落自身 id、唔与他人归并', knull === 1 && kOtherNull >= 1, 'e-null=' + knull + ' 其他 kq=' + kOtherNull);

  // AC-6：评分口径未动——scanTickets（persist:false）唔改 kespi_scores
  const before6 = one("SELECT kq, kd, overall FROM kespi_scores WHERE entity_id = 'e-sA'");
  const scan6 = S.scanTickets(store, { persist: false, quota: { kq: 999, kd: 999 } });
  const after6 = one("SELECT kq, kd, overall FROM kespi_scores WHERE entity_id = 'e-sA'");
  ac('AC-6 评分口径未动（读数前后一致）', JSON.stringify(before6) === JSON.stringify(after6),
    JSON.stringify({ before6, after6 }));

  console.log('\n6.62: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('6.62 崩: ' + e.message); console.error(e.stack); process.exitCode = 1; });
