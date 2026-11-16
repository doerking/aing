'use strict';
// aing-v2 predict.js —— M3 任务 3.12 实现（SPEC-3.12 预案器）
// 输入：用户消息 + 库检索（向量 top-N）+ 候选边；输出：≤3 张有据预案卡。
// 每张卡 basis 可点回原文；冇据则 1 张 cold-start 卡（G6 诚实）。
// 只读：唔写任何表；唔碰 last_access；无物理 DELETE。
// 组件唔直连 knowledge-store：store 由调用方注入（arch-lint C5 守）。

const crypto = require('crypto');
const PLAN_MAX = 3;
const BANDS = ['high', 'mid', 'low'];
const QUOTE_MAX = 80;

function _rows(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const out = [];
  while (s.step()) out.push(s.getAsObject());
  s.free();
  return out;
}

function _scalar(db, sql, binds = []) {
  const s = db.prepare(sql);
  if (binds.length) s.bind(binds);
  const found = s.step();
  const r = found ? s.getAsObject() : null;
  s.free();
  return r;
}

function _body(entity) {
  const raw = String(entity.content == null ? '' : entity.content);
  // 真库过半会话正文是 markdown（不是 JSON）：整篇当回复，至少能出引文
  try { return JSON.parse(raw); } catch (_) { return { reply: raw.trim(), markdown: true }; }
}

function _quote(body) {
  // 引文取第一句真内容：有摘要段先取摘要，再正文首句（标题行/来源行不算引文）
  const summary = _mdSummary(body.reply);
  const t = (summary ? _firstClause(summary, QUOTE_MAX) : '')
    || _firstClause(body.reply, QUOTE_MAX) || _firstClause(body.rationale, QUOTE_MAX);
  return t || String(body.reply || body.rationale || '').trim().slice(0, QUOTE_MAX);
}

const TS_NAME = /^(会话[\s-]*)?\d{4}-\d{2}-\d{2}[T ]\d{2}[-:]\d{2}[-:]\d{2}/;

function _compactTs(text) {
  const m = String(text || '').match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2})[-:](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : null;
}

function _firstClause(text, n = 24) {
  // 旧库会话正文常以「# 会话-<时间戳>」起头：跳过标题行/时间戳行/结构词行，取第一句真内容
  for (const raw of String(text || "").split(String.fromCharCode(10))) {
    const heading = /^\s*#{1,6}\s*/.test(raw);
    let t = raw.replace(/^[\s#>\-*•\d.、)（(]+/, '').trim();
    // 去掉【沙漏理解摘要 w1】/① 这类提炼标签，留下真内容
    t = t.replace(/^(【[^】]{0,24}】|[①-⑩])\s*/, '').trim();
    if (!t || TS_NAME.test(t)) continue;
    // 结构标题行（## 蒸馏摘要 / ## 来源 / ## 内容）：短、无标点、整行只有标签
    if (heading && t.length <= 8 && !/[。！？；，,;.!?：:]/.test(t)) continue;
    if (/^(来源|原|论|操作|结论|会话|内容)\s*$/.test(t)) continue;
    if (/^(原始资料|来源|会话|内容|标题)\s*[:：]/.test(t)) continue;
    if (/session-[0-9a-f]{8,}/i.test(t)) continue;
    const cut = t.split(/[。！？；，,;.!?]/)[0].trim();
    if (cut) return _clip(cut, n);
  }
  return '';
}

/** 截断不切在词中间：优先退到空格/标点/连字符处 */
function _clip(text, n) {
  const t = String(text == null ? "" : text).trim();
  if (t.length <= n) return t;
  const head = t.slice(0, n);
  const cut = Math.max(head.lastIndexOf(" "), head.lastIndexOf("　"), head.lastIndexOf("，"), head.lastIndexOf("、"), head.lastIndexOf("；"), head.lastIndexOf("："), head.lastIndexOf("-"), head.lastIndexOf("/"));
  let out = cut >= Math.max(4, n - 10) ? head.slice(0, cut).trim() : head;
  // 截断处若有未闭合的括号，退到括号前（「ego-browser（chassis」这类半截括号不出口）
  for (const [open, close] of [["（", "）"], ["(", ")"]]) {
    const o = out.lastIndexOf(open);
    if (o >= 4 && out.indexOf(close, o) === -1) out = out.slice(0, o).trim();
  }
  return out;
}

/** markdown 会话的摘要段首条（旧库真实形状：## 蒸馏摘要 下的第一条要点） */
function _mdSummary(text) {
  const lines = String(text || "").split(String.fromCharCode(10));
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s*(蒸馏摘要|摘要|结论|核心要点)/.test(lines[i].trim())) {
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        const t = lines[j].replace(/^[\s#>\-*•]+/, "").trim();
        if (t) return t;
      }
    }
  }
  return "";
}

/** 话题取法：真 topic > 摘要段首条 > 非时间戳的 name > 正文首句 > 压缩后的时间 > 未命名 */
function _readableTopic(name, body) {
  const topic = String((body && body.topic) || '').trim();
  if (topic) return topic;
  const nm = String(name || '').trim();
  const summary = _mdSummary(body && body.reply);
  if (summary) {
    const sc = _firstClause(summary, 24);
    if (sc) return sc;
  }
  if (nm && !TS_NAME.test(nm)) return nm;
  const clause = _firstClause(body && body.reply);
  if (clause) return clause;
  const ts = _compactTs(nm);
  return ts ? '会话 ' + ts : '未命名话题';
}

function _planId(topic, ids) {
  return 'plan-' + crypto.createHash('sha1').update(String(topic) + '|' + ids.join(',')).digest('hex').slice(0, 8);
}

function _band(items) {
  const kinds = new Set(items.map(i => i.kind));
  if (kinds.size >= 2) return 'high';
  if (items.length >= 2) return 'mid';
  return 'low';
}

// SPEC-6.10：取会话关联实体的首条蒸馏点（只读；无点返回 null，不造依据）
function _firstPoint(db, convId) {
  const others = _rows(db,
    `SELECT CASE WHEN source_id = ? THEN target_id ELSE source_id END AS other, strength
     FROM links WHERE invalid_at IS NULL AND (source_id = ? OR target_id = ?)
     ORDER BY strength DESC, other ASC LIMIT 5`, [convId, convId, convId]);
  for (const o of others) {
    const r = _scalar(db, 'SELECT points_json FROM distill_points WHERE base_id = ?', [o.other]);
    if (!r || !r.points_json) continue;
    let pts;
    try { pts = JSON.parse(r.points_json); } catch (_) { continue; }
    if (!Array.isArray(pts)) continue;
    const first = pts.map(p => String(p == null ? '' : p).trim()).find(p => p.length >= 4);
    if (first) return { id: o.other, quote: first.slice(0, QUOTE_MAX) };
  }
  return null;
}

async function predict(store, opts = {}) {
  if (!store || typeof store._getDb !== 'function') throw new Error('predict 需要 store 注入（SPEC-3.12 契约）');
  const db = store._getDb();
  const message = String(opts.message || '');
  const k = Number.isInteger(opts.k) && opts.k > 0 ? opts.k : 8;

  const coldPlan = () => ({
    id: 'plan-cold',
    hypothesis: '无以往依据：此话题库内无会话可依',
    basis: [],
    suggested: '先按常规做法推进，边做边把本轮会话入库',
    risk: '无历史可参照，建议先行确认关键假设',
    confidenceBand: 'low'
  });

  let hits = [];
  try { hits = (await require('./retrieval.js').search(store, message, { limit: k })).candidates; } catch (_) { hits = []; }

  const convHits = [];
  const seenBodies = new Set(); // 双链双胞胎（raw-conv-x / conv-x）同正文只留一条
  for (const h of hits) {
    const e = _scalar(db, 'SELECT * FROM entities WHERE id = ?', [h.id]);
    if (!e || e.type !== 'Conversation' || e.invalid_at) continue;
    const body = _body(e);
    const sig = String(body.reply || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (sig && seenBodies.has(sig)) continue;
    if (sig) seenBodies.add(sig);
    convHits.push({ id: e.id, name: e.name, body, at: body.at || String(e.created_at || ''), score: h.score });
  }
  if (!convHits.length) return { coldStart: true, plans: [coldPlan()] };

  const plans = [];
  for (const h of convHits) {
    if (plans.length >= PLAN_MAX) break;
    const basis = [{ kind: 'conversation', id: h.id, at: h.at, quote: _quote(h.body) }];

    // 第二类证据：蒸馏点（SPEC-6.10）——关联实体首条点；无点不加，不造依据
    const point = _firstPoint(db, h.id);
    if (point) basis.push({ kind: 'point', id: point.id, quote: point.quote });

    // 第三类证据：候选边连到的另一条会话
    const cands = _rows(db,
      `SELECT * FROM links WHERE invalid_at IS NULL
       AND relation IN ('sprout-candidate','pollinate-candidate')
       AND (source_id = ? OR target_id = ?)`, [h.id, h.id]);
    for (const c of cands) {
      const otherId = c.source_id === h.id ? c.target_id : c.source_id;
      const other = _scalar(db, 'SELECT * FROM entities WHERE id = ?', [otherId]);
      if (!other || other.type !== 'Conversation' || other.invalid_at) continue;
      const ob = _body(other);
      basis.push({ kind: 'sprout', id: otherId, at: ob.at || String(other.created_at || ''), quote: _quote(ob) });
      if (basis.length >= 3) break;
    }

    const topic = _readableTopic(h.name, h.body);
    const ids = basis.map(b => b.id);
    plans.push({
      id: _planId(topic, ids),
      hypothesis: (() => {
        const tail = _firstClause(h.body.reply, 40);
        const tn = String(topic || '').replace(/\s+/g, '');
        const ln = String(tail || '').replace(/\s+/g, '');
        const same = !ln || ln.startsWith(tn) || tn.startsWith(ln);
        return same ? `用户接下来大概想继续「${topic}」` : `用户接下来大概想继续「${topic}」：${tail}`;
      })(),
      basis,
      suggested: String(h.body.rationale || '沿用上轮做法，先把边界复核一次'),
      risk: '若无此需求，会多花一轮确认',
      confidenceBand: _band(basis)
    });
  }

  return { coldStart: false, plans: plans.slice(0, PLAN_MAX) };
}

module.exports = { predict, PLAN_MAX, BANDS };
