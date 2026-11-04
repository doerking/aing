/**
 * link-filename.js — 边档文件名的唯一净化口径（C1/C2/C3 双口径收敛）
 *
 * 背景（2026-11-05 修单）：compile.js / pollinate.js / sync-links-to-fs.js 三处各自拼
 * `${sourceId}__${targetId}.md`，但净化口径不一（pollinate 用原始 id 无净化、sync 洗字符
 * 不洗长度、compile 的 generateEntityId 无长度上限）→ 同一对实体两种文件名，读写互相看不见，
 * 且深路径长实体 id 撞 255 字节单段墙 → Windows 下 writeFileSync 抛 ENAMETOOLONG。
 *
 * 本模块是唯一真源：所有边档名必须经 linkFilename() 生成，保证三处同源。
 */

/**
 * 单段净化：洗 Windows 非法字符（含下划线，与 sync-links-to-fs 旧口径一致），再截断。
 * 长度上限 120 字符：单段不超过 120，两段 + `__` 整体 ≤ 241（远小于 255 字节墙；
 * 中文实体 id 也安全，JS 截断按 UTF-16 code unit，中文每字 2 单位 → 120 单位 ≈ 60 中文字）。
 */
const SEG_MAX = 120;
function safeSeg(id, max = SEG_MAX) {
  return String(id == null ? '' : id).replace(/[\\/:*?"<>|_]/g, '-').slice(0, max);
}

/** 由两端实体 id 生成边档文件名（A__B.md），三处组件共用，保证同名。 */
function linkFilename(sourceId, targetId) {
  return `${safeSeg(sourceId)}__${safeSeg(targetId)}.md`;
}

module.exports = { safeSeg, linkFilename, SEG_MAX };
