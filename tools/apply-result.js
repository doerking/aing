'use strict';
// tools/apply-result.js —— SPEC-6.56 回单落地 CLI
// 用法：node tools/apply-result.js --db <副本> --ticket <id> --result <json 文件> [--membrane semi] [--apply] [--json]
// 铁律：必须显式 --db，真库路径拒跑（exit 3）；默认干跑（只判不写）。
const fs = require('fs');
const path = require('path');

function _flag(args, name, dflt) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; }

async function main(argv) {
  const args = argv.slice(2);
  const dbPath = _flag(args, 'db', null);
  const ticketId = _flag(args, 'ticket', null);
  const resultPath = _flag(args, 'result', null);
  const membrane = _flag(args, 'membrane', 'semi');
  const real = path.join(__dirname, '..', 'data', 'knowledge.db');
  const json = args.includes('--json');
  const apply = args.includes('--apply');
  if (!dbPath || !ticketId || !resultPath) {
    console.error('用法: node tools/apply-result.js --db <副本> --ticket <id> --result <json 文件> [--membrane semi] [--apply] [--json]');
    process.exit(2);
  }
  if (path.resolve(dbPath) === path.resolve(real)) { console.error('拒在真库上跑：先复制一份到副本'); process.exit(3); }
  if (!fs.existsSync(dbPath)) { console.error('库不存在: ' + dbPath); process.exit(2); }
  if (!fs.existsSync(resultPath)) { console.error('回单文件不存在: ' + resultPath); process.exit(2); }

  let result;
  try { result = JSON.parse(fs.readFileSync(resultPath, 'utf8')); } catch (e) { console.error('回单不是合法 JSON: ' + e.message); process.exit(2); }

  const store = require('../src/knowledge-store.js');
  const P = require('../src/proposal-result.js');
  const { admit } = require('../src/ticket-gate.js');
  await store.init(dbPath);

  if (!apply) {
    // 干跑：只判不写——闸 + 长度 + 是否空转
    const db = store._getDb();
    const s = db.prepare('SELECT * FROM opt_tickets WHERE id = ?');
    s.bind([ticketId]);
    const found = s.step();
    const t = found ? s.getAsObject() : null;
    s.free();
    const verdict = admit(result, { membrane });
    const out = {
      ticket: t ? { id: t.id, kind: t.kind, action: t.action, status: t.status } : null,
      gate: verdict,
      wouldApply: !!(t && verdict.admitted && P.WRITE_BACK[t.kind] && String(result.content || '').replace(/\s+/g, '').length >= P.MIN_CONTENT_CHARS)
    };
    if (json) { console.log(JSON.stringify(out, null, 2)); return; }
    if (!t) { console.log('票不存在：' + ticketId); return; }
    console.log(`票 ${t.id}（${t.kind} / ${t.action} / ${t.status}）`);
    console.log(`闸：${verdict.admitted ? '过' : '不过 → ' + verdict.stage + ':' + (verdict.reasons || []).join('+')}`);
    console.log(out.wouldApply ? '干跑结论：可落地；加 --apply 写入' : '干跑结论：不落地（只判不写）');
    return;
  }

  const rep = P.applyProposalResult(store, ticketId, { result, membrane });
  if (json) { console.log(JSON.stringify(rep, null, 2)); if (!rep.ok) process.exitCode = 1; return; }
  if (!rep.ok) { console.log('未落地：' + rep.reason); process.exitCode = 1; return; }
  console.log(`已落地（${rep.reason}）`);
  for (const a of rep.applied) console.log(`  · ${a.field}: ${a.beforeLen} → ${a.afterLen}（${a.digest}）`);
}

main(process.argv).catch((e) => { console.error('❌ ' + e.message); process.exitCode = 1; });
