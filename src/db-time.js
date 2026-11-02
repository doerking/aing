#!/usr/bin/env node
/**
 * db-time.js — SQLite datetime('now') 时间串的 UTC 安全解析（共享叶子模块，纪律 5 单源）
 *
 * 病根（P2-4 第 4 轮 / 第六轮 L 全线）：SQLite `datetime('now')` 落库的是
 * 「YYYY-MM-DD HH:MM:SS」空格 UTC 串、无 Z/时区标记；JS `new Date()` 对非 ISO
 * 空格形式按**本地**时区解析（本机 +08:00 偏 8 小时），实体被误判成比实际
 * 「更新」——KG 时效分档、KM ≤24h 阈值、缺口「N 天未更新」全部虚增。
 *
 * 修法（P2-4 已修 query.js recency 面，本模块把同形病根收成单源）：空格→T + 补 Z，
 * 显式按 UTC 解析；已带 Z/±HH:MM 的 ISO 原样解析。调用方一律 `importDbTime` 取函数，
 * 唔许各自 inline 复制（同 K 面「同形病根要全仓扫、唔系修一处」教训）。
 */

/**
 * 把 SQLite 时间串解析成 epoch ms；无时区空格串按 UTC，带 Z/±HH:MM 的 ISO 原样。
 * @param {string|number|null|undefined} raw
 * @returns {number} epoch 毫秒；无法解析返 NaN
 */
function parseDbTime(raw) {
  if (raw == null) return NaN;
  let s = String(raw);
  // 仅对「YYYY-MM-DD HH:MM:SS」无时区空格形式补 Z（末尾可跟亚秒位）；带 Z/±HH:MM 原样
  if (/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\d*$/.test(s) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  }
  return new Date(s).getTime();
}

module.exports = { parseDbTime };
