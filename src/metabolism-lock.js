/**
 * metabolism-lock.js — 「代谢是否持库」的命令面单源判定（2026-09-17 深度检查 F3 批）
 *
 * 背景：run-metabolism 自带跨进程锁（data/metabolism.lock，N1：wx 原子 + pid 判活 + 2h 陈旧回收），
 * 但 index-vectors / kespi-check / recalc-kespi / fix-kespi / import-from-wiki / sql-migrate /
 * recycle-seeds / auto-link / api-server 写端点 / memo todo 写面 都在锁外裸写库——代谢中途
 * 手敲任一条即与 11 步链抢写回（last-writer-wins，store 整体落盘互相吞）。本模块给所有写者
 * 一个统一的让位判据。
 *
 * 关键豁免：run-metabolism 在持锁后向子进程注入 AING_METABOLISM_CHILD=1（execSync 默认继承），
 * STEPS 内的 import/kespi/vector/link 等子步正是锁的持有者家属——不豁免就会出现
 * 「代谢自己把自己锁死」的原链路事故（本模块存在的最大风险，测试断言必覆盖）。
 *
 * 纪律5：无新阈值——2h 陈旧窗口与 run-metabolism 回收口径一致（复用其常量语义，不另发明）。
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {string} [kbRoot] 目标院根；默认本包根。隔离副本探针（--db / 假院）传各自根，
 *                          互不干扰。读不到/损坏按「占用」保守处理。
 * @returns {boolean} 代谢是否正在持库
 */
function metabolismBusy(kbRoot) {
  // 代谢链内子进程：锁是自家的，直接放行（原链路保证）
  if (process.env.AING_METABOLISM_CHILD === '1') return false;
  try {
    const root = kbRoot || path.join(__dirname, '..');
    const lp = path.join(root, 'data', 'metabolism.lock');
    if (!fs.existsSync(lp)) return false;
    const holder = JSON.parse(fs.readFileSync(lp, 'utf8'));
    const age = Date.now() - new Date(holder.startedAt || 0).getTime();
    if (age > 2 * 3600 * 1000) return false; // 陈旧锁不拦（由 run-metabolism 负责回收）
    let alive = true;
    if (holder.pid) {
      try { process.kill(holder.pid, 0); } catch (e) { alive = e.code !== 'EPERM'; }
    }
    return alive;
  } catch (e) {
    return true; // 锁损坏：保守视为占用，写者让位而不是赌
  }
}

/** 统一的拒写文案（CLI 出口 exit 3；HTTP 面另组 503）。 */
function refuseLine(cmd) {
  return '⏸️ 代谢持库中，' + (cmd || '本命令') + '拒写让位（等本轮 11 步跑完再来 / yield to running metabolism, retry after the cycle）';
}

module.exports = { metabolismBusy, refuseLine };
