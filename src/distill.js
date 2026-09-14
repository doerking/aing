#!/usr/bin/env node
/**
 * distill.js — 蒸馏器（v1 最小实现 / 未部署受控状态）
 *
 * 职责：消化 pending-distillation 会话实体——生成蒸馏摘要、提取标签、
 *       保留原话与来源，双脑同步写回（wiki 文件 + knowledge.db），
 *       将 status: pending-distillation → active，兑付 distillDebt。
 *
 * 设计约束（对照 MEMO 蒸馏安全清单）：
 *   - 不删除/不改写"原始消息"原文；摘要只写入"蒸馏摘要"节
 *   - 摘要为机械确定性提取（无 LLM、无编造），逐条可追溯到原话
 *   - contentDigest（sha1:16）写入 frontmatter，摘要与原文对应关系可审计
 *   - 不自动晋升 verified；confidence 维持原值（外部会话=0，不因蒸馏加分）
 *   - 任何失败以非零退出码暴露，不静默吞
 *
 * 用法：
 *   node src/distill.js              # 处理全部 pending 会话
 *   node src/distill.js --dry-run    # 只报告将要做什么，不写
 *   node src/distill.js --id <id>    # 定向处理单个实体
 *
 * 位置约定（v1 未部署态）：独立脚本，手动/受控触发；
 *   验证成熟后再评估是否挂入 run-metabolism STEPS。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const KnowledgeStore = require('./knowledge-store');
const growthConfig = require('./growth.config');   // 阈值唯一来源（纪律第 5 条）

const ROOT = path.resolve(__dirname, '..');

// ===== distill.js v1.1 patches (D1/D4/D5/O-1/O-2) =====
// D4: atomic lock (wx flag, finally release, stale-lock reclaim)
function acquireLock() {
  const lockPath = path.join(ROOT, 'data', 'distill.lock');
  const payload = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), command: 'distill', host: require('os').hostname() });
  try {
    fs.writeFileSync(lockPath, payload, { flag: 'wx' }); // atomic create-or-fail
    return { ok: true, release: () => { try { fs.unlinkSync(lockPath); } catch (e) {} } };
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try {
      const old = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const age = Date.now() - new Date(old.startedAt).getTime();
      let pidAlive = false;
      try { process.kill(old.pid, 0); pidAlive = true; } catch (err) { pidAlive = err.code === 'EPERM'; }
      if (age > 10 * 60 * 1000 || !pidAlive) {
        console.log('[distill] stale lock reclaimed (age=' + Math.round(age / 1000) + 's pidAlive=' + pidAlive + ')');
        fs.unlinkSync(lockPath);
        return acquireLock();
      }
      return { ok: false, holder: old };
    } catch (e2) {
      return { ok: false, holder: null, parseError: e2.message };
    }
  }
}

// D1: idempotent frontmatter upsert (never grows on re-distill)
function upsertFrontmatterLine(text, key, value) {
  const re = new RegExp('^' + key + ': .*' + String.fromCharCode(10), 'm');
  if (re.test(text)) return text.replace(re, key + ': ' + value + String.fromCharCode(10));
  return text.replace(/^(source: .*)$/m, '$1' + String.fromCharCode(10) + key + ': ' + value);
}


function sha16(obj) {
  return crypto.createHash('sha1').update(JSON.stringify(obj), 'utf8').digest('hex').slice(0, 16);
}

/**
 * 入库契约（2026-09-14 实测修正）：消费端认的消息节白名单。
 * 生产端 auto-ingest.js 早前把「## 原始消息」换成角色分区节（## 用户提问 / ## Agent 回复 /
 * ## Agent 分析 / ## 收集资料），本文件没跟着改——真实入库会话 100% 被判
 * 「no raw messages」拒蒸（影子实测 3/3 FAIL、蒸馏债永久还不上）。
 * 现两侧名单都由代码导出，门禁 C10g 静态比对「生产端 ⊆ 消费端」并做端到端实测。
 * 人工档与历史档的「## 原始消息」继续兼容。
 */
const RAW_SECTIONS = ['原始消息', '用户提问', 'Agent 回复', 'Agent 分析', '收集资料'];

function escRe(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** 从档正文机械提取原话行：按节白名单取，引用行（> 时间戳/来源）不算原话 */
function extractRawMessages(text) {
  // 行尾无关 / EOL-agnostic：本仓库 core.autocrlf=true，wiki/raw 检出后常为 CRLF。
  // 旧写法只匹配 \n，会把带原始消息的会话误判为「no raw messages」而拒蒸，
  // 且错误信息把排障方向带偏到「探针残留」。实测：CRLF 探针在旧正则下 fail。
  const body = String(text || '');
  const out = [];
  for (const sec of RAW_SECTIONS) {
    const re = new RegExp('##\\s*' + escRe(sec) + '\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s|$)');
    const m = body.match(re);
    if (!m) continue;
    for (const rawLine of m[1].split(/\r?\n+/)) {
      const line = rawLine.trim();
      if (!line || line === '...' || line === '…' || line.startsWith('>') || line.startsWith('（')) continue;  // compile 的 500 字截断标记不算原话
      out.push(line);
    }
  }
  return out;
}

/**
 * 找回原话全文：entities.content 是 compile 生成的摘要视图（正文被截到 500 字符），
 * 长会话的原话只有入库档里才完整。先按实体 id 与「## 来源」行在 raw/ 下递归定位，
 * 找不到才退回 content（旧实现只吃截断视图，等于拿残缺证据做"确定性蒸馏"）。
 */
function resolveEntitySourceText(row) {
  const candidates = [];
  if (row && row.id) candidates.push(String(row.id) + '.md');
  const m = String((row && row.content) || '').match(/原始资料[：:]\s*(\S+?)(?:\.md)?\s*$/m);
  if (m) candidates.push(m[1] + '.md');
  for (const want of candidates) {
    const stack = [path.join(ROOT, 'raw')];
    while (stack.length) {
      const dir = stack.pop();
      let items;
      try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
      for (const it of items) {
        const full = path.join(dir, it.name);
        if (it.isDirectory()) { stack.push(full); continue; }
        if (it.name === want) {
          try { return fs.readFileSync(full, 'utf8'); } catch (e) { return null; }
        }
      }
    }
  }
  return null;
}

/** 机械蒸馏：无 LLM、确定性、可追溯 */
function distillContent(content, sourceText) {
  const raw = extractRawMessages(sourceText || content);
  const lines = [];
  for (const msg of raw) {
    // 长句按句切，短句整行收
    for (const sent of msg.split(/(?<=[。！？.!?])\s*/)) {
      const t = sent.trim();
      if (t.length >= 4) lines.push(t);
    }
  }
  // 确定性要点：取前 5 条最长句（稳定排序：长度降序，同长按出现序）
  const points = lines
    .map((s, i) => ({ s, i, len: s.length }))
    .sort((a, b) => b.len - a.len || a.i - b.i)
    .slice(0, 5)
    .sort((a, b) => a.i - b.i)
    .map(x => x.s);
  // 确定性标签：高频关键词（去停用词），形状 + 频次双重过滤
  // 缺陷修复（2026-09-14 影子实测）：旧写法以 /[^\p{L}\p{N}-]+/ 切词后只看长度，
  // 中文无空格→整段从句成为一个超长 token 并被当成「高频词」追参加 entities.tags，
  // 污染标签命名空间、虚高自动建链置信、拖累 KA 评分（纪律 #7 类目容量）。
  // 中文分词未接→本步只收拉丁字母关键词，并要求词频达 config.distill.tagMinFreq。
  const DC = growthConfig.distill || {};
  const minFreq = Number.isFinite(DC.tagMinFreq) ? DC.tagMinFreq : 2;
  const maxCount = Number.isFinite(DC.tagMaxCount) ? DC.tagMaxCount : 3;
  const maxLen = Number.isFinite(DC.tagMaxLen) ? DC.tagMaxLen : 24;
  const { isTraceToken } = require('./ingest-scrub'); // 出处/手段词不成标签（标签是加载单位，纪律 7）
  const TAG_SHAPE = new RegExp('^[A-Za-z][A-Za-z0-9-]{3,' + Math.max(4, maxLen - 1) + '}$');
  const STOP = new Set(['this', 'that', 'with', 'from', 'test', 'message', 'goes', 'via', 'and', 'the']);
  const freq = {};
  for (const line of lines) {
    for (const w of line.split(/[^\p{L}\p{N}-]+/u)) {
      if (TAG_SHAPE.test(w) && !STOP.has(w.toLowerCase()) && !isTraceToken(w)) freq[w] = (freq[w] || 0) + 1;
    }
  }
  const tags = Object.entries(freq)
    .filter(([, n]) => n >= minFreq)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxCount).map(e => e[0]);
  const digest = sha16(raw.join('\n'));
  return { points, tags, digest, rawCount: raw.length, lineCount: lines.length };
}

/** 用蒸馏结果替换 wiki 文件的"## 蒸馏摘要"节，并更新 frontmatter（保原话不动） */
function rewriteWikiFile(filePath, dist) {
  let text = fs.readFileSync(filePath, 'utf8');
  const summaryBlock = ['## 蒸馏摘要', '', ...dist.points.map(p => '- ' + p), '',
    '> 蒸馏方式：机械确定性提取（distill.js v1，无 LLM）',
    '> contentDigest: ' + dist.digest,
    '\u003e 原话保留于本档消息节（' + RAW_SECTIONS.join('/') + '），共 ' + dist.rawCount + ' 条', ''].join('\n');
  // 替换蒸馏摘要节（到下一个 ## 为止）
  text = text.replace(/## 蒸馏摘要[\s\S]*?(?=(?:\r?\n## )|$)/, summaryBlock + '\n');
  // frontmatter：status / distillationStatus(以 modified 标记形式不存在——用 tags 追加蒸馏标记) / modified
  text = text.replace(/^status: pending-distillation$/m, 'status: active');
  text = text.replace(/^(modified: .*)$/m, '$1');
  // 追加蒸馏元数据行（幂等：先移除旧的）
  text = upsertFrontmatterLine(text, 'contentDigest', dist.digest);
  text = upsertFrontmatterLine(text, 'distilledBy', 'distill.js-v1');
  text = upsertFrontmatterLine(text, 'distilledAt', new Date().toISOString()); // O-2
  return text;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const idIdx = args.indexOf('--id');
  const onlyId = idIdx >= 0 ? args[idIdx + 1] : null;
  const mode = dryRun ? 'dry-run' : 'apply';

  // D4: atomic lock (apply only; dry-run is read-only)
  let lock = { ok: true, release: () => {} };
  if (!dryRun) {
    lock = acquireLock();
    if (!lock.ok) {
      console.log(JSON.stringify({ mode, result: 'failed', reason: 'lock-held', holder: lock.holder || lock.parseError }));
      process.exitCode = 1; return;
    }
  }

  try {
    const store = new KnowledgeStore();
    await store.init();
    const pending = store.all("SELECT id, content, tags, confidence, source_file FROM entities WHERE status = 'pending-distillation'");
    let targets = pending;
    let specifiedMissing = false;
    if (onlyId) {
      targets = pending.filter(r => r.id === onlyId);
      if (!targets.length) {
        // D5: 指定 id 不存在/不在债中 —— 明确区分，不给调度方假成功
        const exists = store.all("SELECT id, status FROM entities WHERE id = " + JSON.stringify(onlyId));
        if (!exists.length) { console.log(JSON.stringify({ mode, result: 'failed', reason: 'id-not-found', id: onlyId })); process.exitCode = 2; return; }
        console.log(JSON.stringify({ mode, result: 'clean', reason: 'id-exists-but-not-pending', id: onlyId, currentStatus: exists[0].status }));
        process.exitCode = 0; return;
      }
    }

    console.log('[distill] pending=' + pending.length + ' targets=' + targets.length + ' mode=' + mode);
    if (!targets.length) {
      console.log(JSON.stringify({ mode, result: 'clean', distillDebt: 0 }));
      process.exitCode = 0; return;
    }

    let ok = 0, fail = 0;
    for (const row of targets) {
      const wikiPath = row.source_file ? path.join(ROOT, row.source_file) : null;
      if (!wikiPath || !fs.existsSync(wikiPath)) {
        console.error('[distill] FAIL ' + row.id + ': wiki missing (' + row.source_file + ')');
        fail++; process.exitCode = 1; continue;
      }
      const dist = distillContent(row.content, resolveEntitySourceText(row));
      if (!dist.points.length) {
        console.error('[distill] FAIL ' + row.id + ': no raw messages, refuse to distill without evidence');
        fail++; process.exitCode = 1; continue;
      }
      if (dryRun) {
        console.log('[distill][dry] ' + row.id + ': ' + dist.points.length + ' points / tags=[' + dist.tags.join(',') + '] / digest=' + dist.digest);
        ok++; continue;
      }
      const newText = rewriteWikiFile(wikiPath, dist);
      fs.writeFileSync(wikiPath, newText, 'utf8');
      const mergedTags = [...new Set([...JSON.parse(row.tags || '[]'), ...dist.tags])].slice(0, 20);
      const newContent = newText.replace(/^---[\s\S]*?---[ \t]*(?:\r?\n|$)/, '');
      store.run("UPDATE entities SET status='active', tags=?, content=?, distill_meta=? WHERE id=?", [
        JSON.stringify(mergedTags), newContent, JSON.stringify({ digest: dist.digest, by: 'distill.js-v1', at: new Date().toISOString() }), row.id
      ]);
      ok++;
      console.log('[distill] OK ' + row.id + ': ' + dist.points.length + ' points, tags=[' + mergedTags.join(',') + '], digest=' + dist.digest);
    }

    const after = store.all("SELECT COUNT(*) as n FROM entities WHERE status='pending-distillation'");
    // O-1: machine-readable verdict
    const result = fail === 0 ? (ok > 0 ? 'completed' : 'clean') : (ok > 0 ? 'partial' : 'failed');
    console.log(JSON.stringify({ mode, result, ok, fail, distillDebtRemaining: after[0].n }));
    if (!dryRun && ok > 0) {
      console.log('[distill] note: wiki is source-of-truth; run compile --force next metabolism to sync DB content');
    }
    process.exitCode = fail === 0 ? 0 : (ok > 0 ? 2 : 1); return;   // 0=clean/completed, 2=partial, 1=failed
  } finally {
    lock.release();   // D4: guaranteed release
  }
}

if (require.main === module) {
  main().catch(e => { console.error('[distill] FATAL:', e.message); process.exitCode = 1; return; });
}

// 导出供门禁 C10g 复用同一份解析逻辑（不另抄一份正则，否则门禁会与实现各自漂移）
module.exports = { RAW_SECTIONS, extractRawMessages, distillContent, resolveEntitySourceText };