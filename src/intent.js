'use strict';
// aing-v2 intent.js —— M6 任务 6.13 实现（SPEC-6.13 意图路由）
// 规则分类，不用模型：只在证据清楚时改权重；不清楚就落 general，维持 SPEC-6.3 修订 B 的现状。
// 优先级 lookup > recall > explain：问「边份文件放咗喺边」时，找物的诉求压过回忆。

const RULES = {
  lookup: [
    /\be-\d{8}-\d{3,4}\b/i,                 // 序列号身份（SPEC-7.1）
    /\b[a-z][a-z0-9]+(?:-[a-z0-9]+)+\b/i,    // 拉丁标识符（skillRoute / mcp-registry 一类）
    /边份|边个文件|边个档|哪个文件|哪一份|哪份|落在哪|落在边|放咗喺|放喺边|喺边度|系边度|喺边|在哪里|在哪|哪个档/,
    /which file|where is|locate/i
  ],
  recall: [
    /上次|上一次|之前|早排|嗰日|昨日|前日|今朝|曾经|讲过|提过|记得|唔记得|复盘|结果如何|结果点|搞掂未|搞掂咗|郁过|做过/,
    /last time|previously|remind me|what happened/i
  ],
  explain: [
    /是什么|什么是|点解|为什么|为何|怎么|点样|如何|原理|机制/,
    /why |how (?:do|does|to|were|did)|what is|explain/i
  ]
};

// 分流表（SPEC-6.13 §三）：未列出的项沿用缺省
const PROFILES = {
  general: { weights: {}, rerank: {} },
  lookup: { weights: { vector: 0.55, lexical: 0.1, name: 0.35 }, rerank: {} },
  recall: { weights: {}, rerank: { recency: 0.25 } },
  explain: { weights: { vector: 0.85, lexical: 0.05, name: 0.1 }, rerank: { recency: 0.05 } }
};

const ORDER = ['lookup', 'recall', 'explain'];

/** 按查询文本判意图；返回可解释的命中词 */
function classifyIntent(query) {
  const q = String(query == null ? '' : query);
  const hits = [];
  if (!q.trim()) return { intent: 'general', weights: {}, rerank: {}, hits };
  for (const intent of ORDER) {
    for (const re of RULES[intent]) {
      const m = q.match(re);
      if (m) hits.push({ intent, match: m[0] });
    }
    if (hits.some((h) => h.intent === intent)) {
      return { intent, weights: { ...PROFILES[intent].weights }, rerank: { ...PROFILES[intent].rerank }, hits };
    }
  }
  return { intent: 'general', weights: {}, rerank: {}, hits };
}

module.exports = { classifyIntent, PROFILES, RULES };
