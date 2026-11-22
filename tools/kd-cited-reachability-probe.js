'use strict';
// tools/kd-cited-reachability-probe.js —— kd-cited 提案单「回单达成率 / 闭环可达性」只读探针
//
// 缘起：2026-11-22 拍板「kd 双向口径三选项」时，选项①（维持现状）嘅最大反对理由系
//       「8 张 kd-cited 单结构上空转」。本探针回答：唔改任何口径，量到底有几多单真能过 acceptance。
// 做法：默认先把真库复制到临时 yard 再量（唔动真库）；--db 可指一个已备副本直接量。
// 口径：**每单喺独立副本上跑一轮**——verifyTickets 会累积 attempts，顺序连跑会喺后段
//       把唔喺本轮改善嘅单提前标 rejected，低估可达性（实跑踩过：4/8 verified 系顺序副作用）。
// 模拟：对每张 kd-cited 单构造「理想回单」（target = 入向强边来源，即把被引用关系镜像成出向边），
//       跑 scanTickets(persist) → dispatchTickets → applyProposalResult → promoteEdges →
//       kespiStep → verifyTickets，如实记 verdict。系「模拟可达性上限」，唔系实跑——
//       外部件愿唔愿意交回单系另一回事。
// 铁律：唔碰真库；唔改 kespi 评分口径。
//
// 用法：
//   node tools/kd-cited-reachability-probe.js             # 复制 data/knowledge.db 到临时 yard 再量
//   node tools/kd-cited-reachability-probe.js --db <副本路径>
//   node tools/kd-cited-reachability-probe.js --json
const fs = require('fs'); const os = require('os'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const REAL = path.join(ROOT, 'data', 'knowledge.db');

function parse(argv) {
  const flags = { db: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') flags.json = true;
    else if (argv[i] === '--db') { i += 1; flags.db = argv[i]; }
  }
  return flags;
}

const CAND = "('sprout-candidate','pollinate-candidate')";
const STRONG_REL = `relation NOT IN ${CAND} AND strength >= 7`;

/** 单轮：喺 dbPath（副本）上落库开票 → 逐单模拟理想回单 → 判 acceptance。 */
async function runRound(store, SO, CV, PR, FP, K, dbPath, only) {
  await store.init(dbPath);
  const db = store._getDb();
  const rows = (sql, binds = []) => { const s = db.prepare(sql); if (binds.length) s.bind(binds); const a = []; while (s.step()) a.push(s.getAsObject()); s.free(); return a; };
  const one = (sql, binds = []) => rows(sql, binds)[0] || null;

  const before = CV.measureConservation(store, {});
  // 探针开始前的历史状态：真库 opt_tickets 里呢单本来就系咩状态（区分「活单」与「僵尸单」）
  const history = {};
  for (const r of rows('SELECT entity_id, status FROM opt_tickets')) history[String(r.entity_id)] = r.status;
  const sc0 = SO.scanTickets(store, { persist: false });
  const cands = (sc0.candidates || sc0.tickets || []).filter(t => String(t.kind) === 'kd-cited');
  const ticketStatus = {};
  for (const r of rows('SELECT status, COUNT(*) AS n FROM opt_tickets GROUP BY status')) ticketStatus[r.status] = Number(r.n);

  const res = {
    gate: { verdict: before.gate.verdict, edgeGrowth: before.edge.growth, edgePruned: before.edge.pruned, band: before.band },
    totals: {
      entities: Number(one('SELECT COUNT(*) AS n FROM entities WHERE invalid_at IS NULL').n),
      links: Number(one('SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL').n),
      candEdges: Number(one(`SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL AND relation IN ${CAND}`).n),
      strongEdges: Number(one(`SELECT COUNT(*) AS n FROM links WHERE invalid_at IS NULL AND ${STRONG_REL}`).n),
      optTicketsByStatus: ticketStatus
    },
    tickets: cands.length, rows: []
  };

  SO.scanTickets(store, { persist: true });
  await SO.dispatchTickets(store, { round: 1 });
  const landed = rows("SELECT id, entity_id FROM opt_tickets WHERE kind = 'kd-cited'");
  const byEnt = new Map(landed.map(r => [String(r.entity_id), r]));

  for (const t of cands) {
    const eid = String(t.entity_id);
    const src = one('SELECT id, name, strand FROM entities WHERE id = ?', [eid]);
    const score = one('SELECT kd, overall FROM kespi_scores WHERE entity_id = ?', [eid]);
    const inStrong = Number(one(`SELECT COUNT(*) AS n FROM links WHERE target_id = ? AND invalid_at IS NULL AND ${STRONG_REL}`, [eid]).n);
    const tgt = one(`SELECT source_id, strength FROM links WHERE target_id = ? AND invalid_at IS NULL AND ${STRONG_REL} ORDER BY strength DESC LIMIT 1`, [eid]);
    res.rows.push({ entity: eid, name: src ? src.name : null, strand: src ? src.strand : null,
      kd: score ? Number(score.kd) : null, overall: score ? Number(score.overall) : null,
      inStrong, target: tgt ? tgt.source_id : null, landed: byEnt.has(eid),
      history: history[eid] || 'never-landed' });
    if (only && eid !== String(only)) continue;
    if (!byEnt.has(eid)) { res.rows[res.rows.length - 1].verdict = 'never-landed'; continue; }
    if (!tgt) { res.rows[res.rows.length - 1].verdict = 'no-target'; continue; }

    const tid = byEnt.get(eid).id;
    const r = await PR.applyProposalResult(store, tid, {
      result: {
        facts: [`被 ${tgt.source_id} 强引用`, '与来源同标签共现'],
        pointers: [`raw/inbox/${eid}.md`], sourceGrade: 'high',
        selfAssessment: '已核对目标实体存在与证据可回原文',
        edges: [{ target: tgt.source_id, evidence: [`被 ${tgt.source_id} 强引用`, '同标签共现'] }]
      }
    });
    const p = await FP.promoteEdges(store, {});
    await K.kespiStep(store, {});
    // solo 模式唔跑 verifyTickets：佢会判**全部** proposed 单，把唔喺本轮改善嘅单推到终态，
    // 污染同一 runRound 内后续嘅单（实跑踩过：前 4 轮把后 4 张推到 rejected）。
    // 改用 checkAcceptance 直接对 demand.acceptance 判，语义同 verifyTickets 嘅判定路径。
    const after = one('SELECT kd FROM kespi_scores WHERE entity_id = ?', [eid]);
    const kdafter = after ? Number(after.kd) : null;
    let verdict = null;
    if (only) {
      const dm = require(path.join(ROOT, 'src', 'ticket-demand.js')).demandFor('kd-cited');
      const now = one('SELECT kq, ka, kd, kc, kr, overall FROM kespi_scores WHERE entity_id = ?', [eid]) || {};
      verdict = require(path.join(ROOT, 'src', 'ticket-demand.js')).checkAcceptance(dm, now, {});
    } else {
      const v = await SO.verifyTickets(store, { round: 1 });
      verdict = { ok: v.verified.some(x => String(x.id) === String(tid)) };
    }
    const edge = one('SELECT relation, strength FROM links WHERE source_id = ? AND target_id = ?', [eid, tgt.source_id]);
    res.rows[res.rows.length - 1].apply = r.reason;
    res.rows[res.rows.length - 1].built = edge ? `${edge.relation}@${edge.strength}` : null;
    res.rows[res.rows.length - 1].kdAfter = kdafter;
    res.rows[res.rows.length - 1].promoted = p.promoted.length;
    res.rows[res.rows.length - 1].refused = p.refused.length;
    res.rows[res.rows.length - 1].ticket = one('SELECT status FROM opt_tickets WHERE id = ?', [tid]).status;
    res.rows[res.rows.length - 1].verified = !!verdict.ok;
    res.rows[res.rows.length - 1].acceptance = verdict.ok ? 'accepted' : 'failed';
    continue;
  }
  store._close();
  return res;
}

(async () => {
  const flags = parse(process.argv.slice(2));
  const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-kdcite-'));
  const store = require(path.join(ROOT, 'src', 'knowledge-store.js'));
  const CV = require(path.join(ROOT, 'src', 'conservation.js'));
  const SO = require(path.join(ROOT, 'src', 'self-optimize.js'));
  const PR = require(path.join(ROOT, 'src', 'proposal-result.js'));
  const FP = require(path.join(ROOT, 'src', 'field-promote.js'));
  const K = require(path.join(ROOT, 'src', 'kespi.js'));
  const base = flags.db ? path.resolve(String(flags.db)) : REAL;
  try {
    // 主轮：只拿库面与候选清单（only 传哨兵 → 唔跑 apply，避免 8 轮 verify 污染）
    const mainDb = path.join(yard, 'main.db');
    fs.copyFileSync(base, mainDb);
    const main = await runRound(store, SO, CV, PR, FP, K, mainDb, '__none__');

    // 单飞：每单喺独立副本上量，隔离 verifyTickets 累积 attempts 嘅顺序副作用
    const solo = [];
    for (const row of main.rows) {
      if (!row.landed) { solo.push({ entity: row.entity, verdict: row.verdict }); continue; }
      const cp = path.join(yard, `solo-${solo.length}.db`);
      fs.copyFileSync(base, cp);
      const one = await runRound(store, SO, CV, PR, FP, K, cp, row.entity);
      const r = (one.rows || []).find(x => String(x.entity) === String(row.entity));
      solo.push({
        entity: row.entity, target: row.target, strand: row.strand,
        apply: r ? r.apply : null, built: r ? r.built : null,
        kd: row.kd, kdAfter: r ? r.kdAfter : null,
        ticket: r ? r.ticket : null, history: row.history,
        zombie: r ? String(r.ticket) === 'rejected' && String(row.history) === 'rejected' : false,
        verified: r ? r.verified : false,
        promoted: r ? r.promoted : null, refused: r ? r.refused : null
      });
      try { fs.rmSync(cp, { force: true }); } catch (_) {}
    }
    const s = solo.reduce((a, r) => {
      if (r.kdAfter != null && r.kdAfter >= 0.3) a.passed++;
      if (r.verified) a.verified++;
      if (r.kd != null) a.n++;
      if (r.zombie) a.zombie++;
      return a;
    }, { n: 0, passed: 0, verified: 0, zombie: 0 });
    const alive = s.n - s.zombie;

    const out = {
      db: path.basename(base), solo: true,
      gate: main.gate, totals: main.totals, tickets: main.tickets,
      rows: main.rows, solo,
      summary: { total: s.n, zombie: s.zombie, alive, kdGte030: s.passed, verified: s.verified,
        reachRate: s.n ? (s.passed / s.n).toFixed(3) : 'n/a',
        aliveReachRate: alive ? (s.passed / alive).toFixed(3) : 'n/a' }
    };

    if (flags.json) { console.log(JSON.stringify(out, null, 2)); }
    else {
      const L = [];
      L.push(`真库副本：${out.db}（每单独立副本，隔离顺序副作用）`);
      L.push(`守恒闸：verdict=${out.gate.verdict}（边产 ${out.gate.edgeGrowth} / 边退 ${out.gate.edgePruned}，带 ${out.gate.band.join('-')}）`);
      const t = out.totals;
      L.push(`库面：实体 ${t.entities} / 边 ${t.links} / 候选边 ${t.candEdges} / 强边 ${t.strongEdges}`);
      L.push(`候选单：kd-cited ${out.tickets} 张`);
      L.push('—— 逐单单飞模拟（理想回单：target = 入向强边来源）——');
      for (const r of solo) {
        if (r.verdict) { L.push(`  ${String(r.entity).slice(0, 46)}：${r.verdict}`); continue; }
        const ok = r.kdAfter != null && r.kdAfter >= 0.3;
        L.push(`  ${String(r.entity).slice(0, 46)} → ${String(r.target).slice(0, 34)}：建边=${r.built || '✗'}，kd ${r.kd}→${r.kdAfter}，票=${r.ticket}，过闸=${ok ? '✅' : '✗'}${r.apply ? '，apply=' + r.apply : ''}`);
      }
      L.push(`—— 可达性上限：全部候选 ${out.summary.reachRate}（kd≥0.30 者 ${s.passed}/${s.n}，真 verified ${s.verified}）；除僵尸单外 ${out.summary.aliveReachRate}（${s.passed}/${out.summary.alive}；僵尸 ${s.zombie} 张：真库历史已 rejected，每轮重开再拒）`);
      console.log(L.join('\n'));
    }
  } finally {
    // yard 内全部系本探针建嘅副本，一律清掉
    try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {}
  }
})().catch(e => { console.error('探针异常: ' + e.message); process.exit(1); });
