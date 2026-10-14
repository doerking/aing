#!/usr/bin/env node
/**
 * trigger-log.js — 芥子 CRUD 触发日志（p9 设计稿 B1 轻量落地，2026-10-15）
 *
 * 口径：贴 aing 现行「双脑（wiki 文件 + DB）+ 芥子文件态」架构——
 * 芥子不进 SQLite（C10e 的 7 类子表面不动），触发痕迹落追加式 JSONL。
 * 字段对齐 wiki/patch-9-jiezi-crud-trigger-log.md 设计稿：
 *   trigger_type（BEFORE/AFTER/CRON/MANUAL）/ trigger_name / status /
 *   execution_time_ms / related_entity_id / input_data / output_data
 *
 * 纯增量、零成本：require 失败静默不阻断（同 metabolism-log.js 面），
 * 不新增门禁项、不动 C19 计数与 C10e 子表面。
 *
 * 用法：
 *   const { logTrigger } = require('./trigger-log.js');
 *   logTrigger({ type:'CRON', name:'compress_to_seed', related:'<entity-id>', status:'SUCCESS' });
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'metabolism-trigger-log.jsonl');
const VALID_TYPES = new Set(['BEFORE', 'AFTER', 'CRON', 'MANUAL']);

/**
 * 追加一条触发日志。所有可选字段缺省安全；任何异常静默（返回 false），
 * 绝不向调用方抛错、绝不阻断代谢主循环。
 * @param {object} e
 * @param {string} e.type   BEFORE|AFTER|CRON|MANUAL（缺省按 MANUAL，但写 face 上标注 unknown）
 * @param {string} e.name   触发节点名（compress_to_seed / recycle_seed / prune_entity / sprout_link / pollinate_link …）
 * @param {string} [e.related]  关联实体 / 芥子 id
 * @param {string} [e.status]   SUCCESS|FAILED|SKIPPED（缺省 SUCCESS）
 * @param {number} [e.ms]       执行耗时（毫秒）
 * @param {object} [e.input]    入参快照（浅序列化）
 * @param {object} [e.output]   出参快照（浅序列化）
 * @returns {boolean} 是否成功落档
 */
function logTrigger(e = {}) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const rec = {
      ts: new Date().toISOString(),
      type: VALID_TYPES.has(e.type) ? e.type : 'MANUAL',
      name: String(e.name || 'unknown'),
      status: e.status || 'SUCCESS',
      related: e.related ? String(e.related) : null,
      ms: typeof e.ms === 'number' ? Math.round(e.ms) : null,
      input: e.input === undefined ? null : e.input,
      output: e.output === undefined ? null : e.output,
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(rec) + '\n', 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

/** 读回（诊断面；文件缺失 / 损坏返回 []，不抛）。 */
function readTriggers() {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    return fs.readFileSync(LOG_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l); } catch (_) { return null; }
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * CLI 读回口：node src/trigger-log.js [--tail N]
 * 打印最近 N 条（缺省 20）触发记录；文件缺失时打印空账说明并 exit 0。
 * 与 readTriggers() 同一读口径，文档面（README/AGENTS）教的就是这条命令。
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const tailIdx = args.indexOf('--tail');
  const n = tailIdx >= 0 ? Math.max(1, parseInt(args[tailIdx + 1], 10) || 20) : 20;
  const recs = readTriggers();
  if (recs.length === 0) {
    console.log('trigger-log: 暂无记录（' + LOG_FILE + ' 不存在或为空）');
  } else {
    console.log('trigger-log: 共 ' + recs.length + ' 条，最近 ' + Math.min(n, recs.length) + ' 条（' + LOG_FILE + '）');
    for (const r of recs.slice(-n)) {
      console.log('  ' + r.ts + ' ' + r.type + '/' + r.name + ' status=' + r.status + (r.related ? ' related=' + r.related : ''));
    }
  }
}

module.exports = { logTrigger, readTriggers, LOG_FILE };
