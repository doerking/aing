'use strict';
// M3 任务 3.11d failing test —— memo 系统行超长时按段裁剪（SPEC-5.2 §2.3 修订 A）
// 现状：加长后硬切到 80 字，会把「场域动作 555」切出「场域动作 5…」这种半个数字。
// 要守：健康与向量两段必留；其余按「 / 」整段让位；不留半个字段。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-memoline-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const store = require('../src/knowledge-store.js');
const M = require('../src/memo.js');

(async () => {
  await store.init(path.join(yard, 'k.db'));
  const db = store._getDb();
  // 造一个够长的行：待退四位数 + 蒸馏债三位数 + 场域动作四位数
  for (let i = 0; i < 5000; i++) {
    db.run(`INSERT INTO entities (id, name, type, content, status, created_at, updated_at)
            VALUES (?, ?, 'Conversation', 'x', 'active', '2026-09-01 00:00:00', '2026-09-01 00:00:00')`, ['old' + i, 'old' + i]);
  }
  for (let i = 0; i < 999; i++) {
    db.run(`INSERT INTO entities (id, name, type, content, status, created_at, updated_at)
            VALUES (?, ?, 'Concept', 'x', 'pending-distillation', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, ['p' + i, 'p' + i]);
  }
  for (let i = 0; i < 12345; i++) {
    db.run(`INSERT INTO field_actions (id, action, target, created_at) VALUES (?, 'rebond', 'x', CURRENT_TIMESTAMP)`, ['fa' + i]);
  }
  const m = await M.buildMemo(store, { limit: 3 });
  const line = String(m.systemLine);

  // AC-1 不留半个字段：不以「数字+…」结尾
  ac('AC-1 不留半字段', /…$/.test(line) && !/\d…$/.test(line),
    JSON.stringify({ line, len: line.length }));

  // AC-2 健康与向量两段必留（SPEC-6.21：非 PROGRESSING 时行首多一段节拍强标识）
  const bare = line.replace(/^[▶⏸⚠] (PROGRESSING|IDLE|STUCK) \/ /, '');
  ac('AC-2 头两段必留', bare.startsWith('健康') && /向量 hash-\d+w?\d* \d+%/.test(bare),
    JSON.stringify({ line }));

  // AC-3 长度不超上限，且按段收口（每段都是完整「字段 值」）
  const body = line.replace(/ …$/, '');
  const parts = body.split(' / ');
  const segOk = parts.every((p) => /^[^\s]+\s\S/.test(p.trim()) && !/…$/.test(p.trim()));
  ac('AC-3 按段收口', line.length <= 80 && / …$/.test(line) && segOk,
    JSON.stringify({ line, len: line.length, parts }));

  // AC-4 短行原样：不硬加省略号
  const short = '健康 ok / 向量 hash-64w2 100%';
  ac('AC-4 短行原样', !/…/.test(short) && short === '健康 ok / 向量 hash-64w2 100%', short);

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
