'use strict';
// aing-v2 deadline.js —— SPEC-1.14 修订 H：deadline 传播（步内自检）
//
// 为什么要这个文件：外部执行器（宿主 hook）给整轮挂 timeout 后 SIGKILL。
// deadline 只在步骤之间判时，长步（KESPI 扫全库、向量重建、编译）跑到一半就被外部斩断，
// 库里留下"写了一半、没人知道"的残局。做法对齐 gRPC deadlines 的约定：
// 服务端拿到 deadline 后必须自己停止，长任务要周期性检查取消条件。
//
// 纯函数，无副作用、不持 store（arch-lint C5 依此放行）。

const DEFAULT_MARGIN_MS = 3000;   // 收口余量：留给落盘与轮末结算

/** 剩余预算（ms）；无 deadline（null/非数）视为无限。 */
function remainingMs(deadlineAt, now = Date.now()) {
  if (typeof deadlineAt !== 'number' || !Number.isFinite(deadlineAt)) return Infinity;
  return deadlineAt - now;
}

/** 预算是否已耗尽（含余量）。 */
function expired(deadlineAt, marginMs = DEFAULT_MARGIN_MS, now = Date.now()) {
  return remainingMs(deadlineAt, now) <= marginMs;
}

/**
 * 长步收口返回值：ok=false 让编排器把当轮标 failed，
 * reason 固定 'step-deadline'，并上报已处理条数，避免"做了一半被当成没做"。
 */
function stepAbort(deadlineAt, extra = {}) {
  return { ok: false, reason: 'step-deadline', deadlineAt: Number.isFinite(deadlineAt) ? deadlineAt : null, ...extra };
}

module.exports = { DEFAULT_MARGIN_MS, remainingMs, expired, stepAbort };
