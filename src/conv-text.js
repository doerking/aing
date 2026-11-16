'use strict';
// aing-v2 conv-text.js —— 会话正文读法（SPEC-3.11 修订 A / SPEC-3.12 修订 B）
// 真库会话正文两种形态：JSON（{topic, reply, rationale, at}）与 markdown（「# 会话-<时间戳>」+「## 蒸馏摘要」）。
// 本件只管「怎么读出一句人话」，不管谁筛谁排——判据留在调用方。纯函数、无 IO、无库依赖。

const NL = String.fromCharCode(10);
const TS_NAME = /^(会话[\s-]*)?\d{4}-\d{2}-\d{2}[T ]\d{2}[-:]\d{2}[-:]\d{2}/;

/** 正文解析：JSON 失败即整篇当回复（真库过半会话是 markdown） */
function parseBody(entity) {
  const raw = String((entity && entity.content) == null ? '' : entity.content);
  try { return JSON.parse(raw); } catch (_) { return { reply: raw.trim(), markdown: true }; }
}

/** 截断不切在词中间：优先退到空格/标点/连字符；未闭合括号一律退到括号前 */
function clip(text, n) {
  const t = String(text == null ? '' : text).trim();
  if (t.length <= n) return t;
  const head = t.slice(0, n);
  const cut = Math.max(head.lastIndexOf(' '), head.lastIndexOf('　'), head.lastIndexOf('，'),
    head.lastIndexOf('、'), head.lastIndexOf('；'), head.lastIndexOf('：'),
    head.lastIndexOf('-'), head.lastIndexOf('/'));
  let out = cut >= Math.max(4, n - 10) ? head.slice(0, cut).trim() : head;
  for (const [open, close] of [['（', '）'], ['(', ')']]) {
    const o = out.lastIndexOf(open);
    if (o >= 4 && out.indexOf(close, o) === -1) out = out.slice(0, o).trim();
  }
  // 收尾不留悬空破折号/标点（「引擎——」这类半句尾巴）
  const tail = out.replace(/[—–\-、，,：:；;\s]+$/, '').trim();
  return tail || out;
}

/** 第一句真内容：跳过标题行/时间戳行/结构词行/出处行/id 行，剥提炼标签 */
function firstClause(text, n = 24) {
  for (const raw of String(text || '').split(NL)) {
    const heading = /^\s*#{1,6}\s*/.test(raw);
    let t = raw.replace(/^[\s#>\-*•\d.、)（(]+/, '').trim();
    // 提炼标签可能叠几层：【沙漏理解摘要 w1】①本质 → 循环剥净
    while (/^(【[^】]{0,24}】|[①-⑩])\s*/.test(t)) t = t.replace(/^(【[^】]{0,24}】|[①-⑩])\s*/, '').trim();
    if (!t || TS_NAME.test(t)) continue;
    // 退化值（上游 stringify 事故）与上一句的尾巴片段，都不当内容
    if (/^\[object |^(undefined|null|NaN)$/.test(t)) continue;
    if (/^[」』）)\]]|^→/.test(t)) continue;
    // 结构标题行（## 蒸馏摘要 / ## 来源 / ## 内容）：短、无标点、整行只有标签
    if (heading && t.length <= 8 && !/[。！？；，,;.!?：:]/.test(t)) continue;
    if (/^(来源|原|论|操作|结论|会话|内容)\s*$/.test(t)) continue;
    if (/^(原始资料|来源|会话|内容|标题)\s*[:：]/.test(t)) continue;
    if (/session-[0-9a-f]{8,}/i.test(t)) continue;
    // 不切 ASCII 句点：版本号 v0.3 / 域名会被切残
    const cut = t.split(/[。！？；，,;!?]/)[0].trim();
    if (cut) return clip(cut, n);
  }
  return '';
}

/** markdown 摘要段首条（旧库真实形状：「## 蒸馏摘要」下第一条要点） */
function mdSummary(text) {
  const lines = String(text || '').split(NL);
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s*(蒸馏摘要|摘要|结论|核心要点)/.test(lines[i].trim())) {
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        const t = lines[j].replace(/^[\s#>\-*•]+/, '').trim();
        if (t) return t;
      }
    }
  }
  return '';
}

/** 压缩时间戳：只留到分钟，够认人 */
function compactTs(text) {
  const m = String(text || '').match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2})[-:](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : null;
}

/** 话题取法：真 topic > 摘要段首条 > 非时间戳 name > 正文首句 > 压缩时间 > 未命名 */
function readableTopic(name, body) {
  const topic = String((body && body.topic) || '').trim();
  if (topic) return topic;
  const summary = mdSummary(body && body.reply);
  if (summary) {
    const sc = firstClause(summary, 24);
    if (sc) return sc;
  }
  const nm = String(name || '').trim();
  if (nm && !TS_NAME.test(nm)) return nm;
  const clause = firstClause(body && body.reply);
  if (clause) return clause;
  const ts = compactTs(nm);
  return ts ? '会话 ' + ts : '未命名话题';
}

module.exports = { parseBody, firstClause, mdSummary, readableTopic, clip, compactTs, TS_NAME };
