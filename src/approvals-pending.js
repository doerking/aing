#!/usr/bin/env node
/**
 * approvals-pending.js — 審批鏈持久化層（W2 審批鏈接線，2026-11-03）
 *
 * 背景：consciousness-controller.js 嘅九個審批方法（createEpisode/…/recordFeedbackApprovalDecision）
 * 全倉 0 外部調用點——「審批請求產出」與「人批 → 恢復執行」之間無持久層。本檔給審批鏈
 * 提供「持久化 → 人見 → 人批 → 恢復執行」四步裏面嘅「持久化」一步（其餘三步分派：
 * 人見 = memo 讀端注入；人批 = neural.js approve；恢復 = 執行側校驗 approval 存在且未消費）。
 *
 * 紅線（同工單 W2）：
 *   - 唔改變 providerWriteAllowed=false 既有安全邊界——本檔只存請求，唔寫任何知識庫/成長/KESPI。
 *   - state.json 嘅寫面仍然只有 kernel——本檔碰都唔碰 state.json。
 *   - 審批鏈閘在代碼唔喺提示：執行側必須經 consume() 代碼校驗 approval 存在且未消費，
 *     唔靠提示詞；重複消費同一 requestId 被拒（冪等，返回 { consumed: false, reason }）。
 *
 * 檔案：data/consciousness/approvals-pending.json（原子寫：tmp + rename，學 knowledge-store._save :203-217 範式）。
 * 結構：{ pending: [request, …], consumed: [ { requestId, decidedAt, decision, reason }, … ] }
 *   - pending：status=awaiting-independent-approval 嘅審批請求（由 controller.prepareFeedbackApprovalRequest 產出落此）。
 *   - consumed：已人批（approve/deny）留痕，唔刪行（同 doneTodo 留痕口徑），供回讀與審計。
 * 本檔係獨立 CLI：node src/approvals-pending.js --list / --consume <requestId> <approve|deny>
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'consciousness');
const PENDING_FILE = path.join(DATA_DIR, 'approvals-pending.json');
const CONSUMED_KEY = 'consumed';
const PENDING_KEY = 'pending';

function _empty() { return { [PENDING_KEY]: [], [CONSUMED_KEY]: [] }; }

/** 讀 pending 檔；缺失/損壞回空結構（唔炸到入口，同 knowledge-store 保守口徑）。 */
function loadState() {
  try {
    const raw = fs.readFileSync(PENDING_FILE, 'utf8');
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return _empty();
    return {
      [PENDING_KEY]: Array.isArray(obj[PENDING_KEY]) ? obj[PENDING_KEY] : [],
      [CONSUMED_KEY]: Array.isArray(obj[CONSUMED_KEY]) ? obj[CONSUMED_KEY] : [],
    };
  } catch (e) {
    return _empty(); // 檔案缺失或 JSON 損：按無 pending 處理
  }
}

/** 原子寫（tmp + rename，學 knowledge-store._save :208-211）。 */
function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const buf = Buffer.from(JSON.stringify(state, null, 2), 'utf8');
  const tmpPath = PENDING_FILE + '.tmp';
  fs.writeFileSync(tmpPath, buf);
  fs.renameSync(tmpPath, PENDING_FILE);
  return state;
}

/** 落一條審批請求到 pending（由 controller.prepareFeedbackApprovalRequest 調用）。冪等：同 requestId 唔重入。 */
function addPending(request) {
  if (!request || typeof request !== 'object') throw new Error('addPending 需要 request 物件');
  const st = loadState();
  const key = request.requestId;
  // 已在 pending 或已 consumed：唔重入（冪等）
  if (key && (st[PENDING_KEY].some(p => p.requestId === key) || st[CONSUMED_KEY].some(c => c.requestId === key))) {
    return { saved: false, reason: 'duplicate-or-consumed', requestId: key };
  }
  st[PENDING_KEY].push({ ...request, status: 'awaiting-independent-approval', pendingAt: new Date().toISOString() });
  saveState(st);
  return { saved: true, requestId: key, pendingCount: st[PENDING_KEY].length };
}

/** 只讀 pending 清單（memo 讀端注入用；純讀，唔落檔）。 */
function pendingList() {
  const st = loadState();
  return st[PENDING_KEY];
}

/** 只讀 pending + consumed 全量（CLI --list / 審計回讀用）。 */
function allState() {
  return loadState();
}

/**
 * 執行側恢復閘（W2 第五面，2026-11-03 補）：代碼級校驗「該審批已批准且未過期、且請求範圍被覆蓋」。
 * 唔靠提示詞——執行側必須先過呢個閘先准做嘢。冪等：同 requestId 只放行一次（second-check 後視為已用）。
 * @returns {{ consented:boolean, reason?:string, requestId?:string, entry?:object, note?:string }}
 */
function hasValidConsent(requestId, opts = {}) {
  if (!requestId) return { consented: false, reason: 'missing-requestId', note: '執行側未提供 requestId，閘拒' };
  const st = loadState();
  const entry = st[CONSUMED_KEY].find(c => c.requestId === requestId);
  if (!entry) return { consented: false, requestId, reason: 'not-found', note: `無該審批記錄（未批准或已被拒），閘拒 ${requestId}` };
  if (entry.decision !== 'approved-scope-only' || !entry.providerWriteEligible) {
    return { consented: false, requestId, reason: 'not-approved', note: `審批 ${requestId} 未批准（decision=${entry.decision}），閘拒` };
  }
  const scope = Array.isArray(opts.scope) ? opts.scope : [];
  const granted = Array.isArray(entry.requestedWriteScope) ? entry.requestedWriteScope : [];
  if (scope.length && !scope.every(s => granted.includes(s))) {
    return { consented: false, requestId, reason: 'scope-exceeds', note: `執行範圍 ${scope.join(',')} 超出批准範圍 ${granted.join(',')}，閘拒` };
  }
  if (entry.usedAt) {
    return { consented: false, requestId, reason: 'already-executed', note: `審批 ${requestId} 已於 ${entry.usedAt} 執行過，閘拒（防重放）` };
  }
  return { consented: true, requestId, entry, note: `審批 ${requestId} 有效（範圍 ${granted.join(',')}）` };
}

/** 執行側標記「該批准已用」（防重放，冪等）。返回更新後 entry 或 { used:false, reason }。 */
function markExecuted(requestId) {
  const st = loadState();
  const entry = st[CONSUMED_KEY].find(c => c.requestId === requestId);
  if (!entry) return { used: false, reason: 'not-found' };
  if (entry.usedAt) return { used: false, reason: 'already-executed' };
  entry.usedAt = new Date().toISOString();
  saveState(st);
  return { used: true, requestId, entry };
}

/**
 * 人批/消費一條審批請求：由 neural.js approve <requestId> <approve|deny> 調用。
 * 校驗 approval id 存在且未消費 → 記錄裁決 → 從 pending 移除 → 落 consumed 留痕。
 * 冪等：重複消費同一 requestId 返回 { consumed:false, reason:'not-pending' }（唔炸、唔偽造）。
 * @returns {{ consumed:boolean, requestId?:string, reason?:string, decision?:string, note?:string }}
 */
function consume(requestId, decision, opts = {}) {
  const st = loadState();
  const idx = st[PENDING_KEY].findIndex(p => p.requestId === requestId);
  if (idx === -1) {
    const consumed = st[CONSUMED_KEY].find(c => c.requestId === requestId);
    return {
      consumed: false,
      requestId,
      reason: consumed ? 'already-consumed' : 'not-pending',
      note: consumed ? `該審批已於 ${consumed.decidedAt} 裁決（${consumed.decision}）；重複消費被拒（冪等）` : `pending 清單未找到 ${requestId}`,
    };
  }
  const request = st[PENDING_KEY][idx];
  const approved = decision === 'approve';
  // 裁決落 lineage 由 caller（neural.js）經 controller.recordFeedbackApprovalDecision 完成；
  // 本檔只負責「持久化狀態遷移 + 留痕」，唔自行調 controller（保持本檔無外部依賴、可單跑）。
  const consumedEntry = {
    requestId,
    feedbackId: request.feedbackId || null,
    taskId: request.taskId || null,
    requestedWriteScope: request.requestedWriteScope || [],
    decision: approved ? 'approved-scope-only' : 'rejected',
    approver: opts.approver || 'unspecified',
    reason: opts.reason || null,
    decidedAt: new Date().toISOString(),
    providerWriteEligible: approved,   // 只標「範圍內資格」；providerWriteAllowed 仍 false（紅線）
    providerWriteAllowed: false,
  };
  st[PENDING_KEY].splice(idx, 1);
  st[CONSUMED_KEY].push(consumedEntry);
  saveState(st);
  return { consumed: true, requestId, decision: approved ? 'approved-scope-only' : 'rejected', entry: consumedEntry, note: '審批已裁決並從 pending 移除（consumed 留痕不刪行）' };
}

// CLI 入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'list';
  try {
    if (cmd === 'list') {
      const st = allState();
      console.log(`審批 pending ${st[PENDING_KEY].length} 條 / consumed ${st[CONSUMED_KEY].length} 條：`);
      st[PENDING_KEY].forEach(p => console.log(`  [PENDING] ${p.requestId}  scope=${JSON.stringify(p.requestedWriteScope || [])}  於 ${p.pendingAt}`));
      st[CONSUMED_KEY].slice(-10).forEach(c => console.log(`  [CONSUMED] ${c.requestId} → ${c.decision}  於 ${c.decidedAt}`));
    } else if (cmd === 'consume') {
      const id = args[1];
      const decision = args[2] || 'approve';
      if (!['approve', 'deny'].includes(decision)) { console.error(`consume 的裁決只能是 approve/deny，收到 "${decision}"`); process.exitCode = 2; }
      else if (!id) { console.error('consume 需要 requestId：node src/approvals-pending.js consume <requestId> <approve|deny>'); process.exitCode = 2; }
      else { const r = consume(id, decision); console.log(JSON.stringify(r, null, 2)); if (!r.consumed) process.exitCode = 1; }
    } else {
      console.log('用法:\n  node src/approvals-pending.js [--list | consume <requestId> <approve|deny>]');
    }
  } catch (e) {
    console.error('approvals-pending 失敗:', e.message);
    process.exitCode = 1;
  }
}

module.exports = { addPending, pendingList, allState, consume, hasValidConsent, markExecuted, PENDING_FILE, loadState, saveState };
