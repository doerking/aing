#!/usr/bin/env node
/**
 * config-runtime.js — 运行时配置加载器
 *
 * 每次调用都会检查 growth.config.js 的 mtime；文件发生变化时清除
 * require cache 并重新加载，使长流程在下一个步骤读取到新配置。
 * 只读热重载：不修改配置、不自动写回、不绕过门禁。
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'growth.config.js');
let cachedConfig = null;
let cachedMtimeMs = 0;
let revision = 0;

function loadGrowthConfig() {
  const stat = fs.statSync(CONFIG_PATH);
  if (!cachedConfig || stat.mtimeMs !== cachedMtimeMs) {
    delete require.cache[require.resolve('./growth.config')];
    cachedConfig = require('./growth.config');
    cachedMtimeMs = stat.mtimeMs;
    revision += 1;
  }
  return cachedConfig;
}

function getConfigState() {
  const config = loadGrowthConfig();
  return {
    path: CONFIG_PATH,
    mtimeMs: cachedMtimeMs,
    revision,
    config
  };
}

if (require.main === module) {
  try {
    const first = getConfigState();
    const second = getConfigState();
    console.log(JSON.stringify({
      path: first.path,
      revision: second.revision,
      stableWithoutChange: first.revision === second.revision,
      kespi: second.config.kespi
    }, null, 2));
  } catch (err) {
    console.error(`❌ 配置加载失败: ${err.message}`);
    process.exitCode = 1;
  }
}

/**
 * 意识层离散旋钮的唯一读取口（纪律 5 补账，2026-09-14）。/ single reader for consciousness knobs
 *
 * 历史欠账：熔断用的那个轮数曾在**四处各自写死**——consciousness-kernel.js 拿
 * `stagnationCount` 与硬编码的 3 比、growth-director.js:150 与 :235、memo.js:71 各自再写一遍。
 * 四个脑子各判各的，改一处就脉节：改 kernel 则 director 仍按旧阀选路，改 memo
 * 则仪表台与熔断不同口径。
 *
 * 现在：权威值在 `src/growth.config.js` 的 `consciousness` 段；下面的 FALLBACK **只在没有配
 * 置文件时兜底**（未部署院、门禁假院、cp 之前的时候），不得在其它文件再现写数。
 * 为何住在这个叶子模块：避免读者为了一个数去 require 整个 kernel（带出 GrowthDocs /
 * MetacognitionLayer 等一串依赖与副作用）。/ lives in this leaf module so readers don't
 * have to require the whole kernel just to ask one number.
 */
const CONSCIOUSNESS_FALLBACK = Object.freeze({
  stagnationBreakerCycles: 3,
  inhibitDefaultHours: 1,
  dedupeWindowSeconds: 300,
  maxRetainedEvents: 200,
  archiveObservedMinAgeHours: 48,
  archiveObservedAttentionFloor: 0.45,
});

function getConsciousnessConfig(fallback = CONSCIOUSNESS_FALLBACK) {
  let cfg = null;
  try { cfg = loadGrowthConfig(); } catch (e) { cfg = null; }   // 未部署院：statSync 会抛 ENOENT，退回 fallback
  const raw = (cfg && typeof cfg === 'object' && cfg.consciousness) || {};
  const out = {};
  for (const key of Object.keys(fallback)) {
    const v = Number(raw[key]);
    // 非有限数 / 非正数一律视为未配置：防止有人把 0 当「关闭」，却把熔断变成永不熔断
    out[key] = Number.isFinite(v) && v > 0 ? v : Number(fallback[key]);
  }
  return out;
}

function consciousnessTuning() {
  return getConsciousnessConfig(CONSCIOUSNESS_FALLBACK);
}

// W5 (2026-11-03)：channelWeights 影子调制旋钮的独立读取口。
// 为何单开：getConsciousnessConfig 只按 Number 读 + 强制 >0（防把 0 当「关闭」却熔成永不熔断），
// 而 channelShadowModulation 是**布尔**（false=影子期合法值，不能被 >0 判成未配置）、
// channelShadowClampStep 是允许 0.05 的小浮点——两者都走那个 Number 口会被误伤。
// 读法：直接取 cfg.consciousness 段的布尔/数值，缺失回缺省（modulation=false 影子、clampStep=0.05）。
// W7 (2026-11-03)：导链蜂群用户兴趣旋钮读取口（纪律 5 单源，照 consciousnessTuning 模式）。
// 权威值在 growth.config.js 的 guideChain 段（与 example 同构，C10d 校验）。代码缺失/配错退回缺省：
// userInterests 用原代码的 4 词（行为不变），userInterestDefault 0.5（原 || 0.5 常数）。
function guideChainTuning() {
  let cfg = null;
  try { cfg = loadGrowthConfig(); } catch (e) { cfg = null; } // 未部署院退回缺省（与原硬编码行为一致）
  const raw = (cfg && typeof cfg === 'object' && cfg.guideChain) || {};
  const FALLBACK_INTERESTS = Object.freeze({ 'dual-brain': 0.9, architecture: 0.8, cache: 0.7, agent: 0.6 });
  const interests = (raw.userInterests && typeof raw.userInterests === 'object' && !Array.isArray(raw.userInterests))
    ? Object.freeze({ ...raw.userInterests }) : FALLBACK_INTERESTS;
  let def = Number(raw.userInterestDefault);
  if (!Number.isFinite(def) || def < 0 || def > 1) def = 0.5; // 缺省 0.5（原代码常数），越界/缺失退回缺省
  return Object.freeze({ userInterests: interests, userInterestDefault: def });
}
function consciousnessShadowTuning() {
  let cfg = null;
  try { cfg = loadGrowthConfig(); } catch (e) { cfg = null; } // 未部署院退回缺省（影子）
  const raw = (cfg && typeof cfg === 'object' && cfg.consciousness) || {};
  let modulation = raw.channelShadowModulation;
  let clampStep = Number(raw.channelShadowClampStep);
  if (modulation !== true && modulation !== false) modulation = false; // 缺省/非布尔 → 影子
  if (!Number.isFinite(clampStep) || clampStep <= 0) clampStep = 0.05; // 缺省钳位步长 0.05（HAL 外环慢变有界）
  return Object.freeze({ channelShadowModulation: modulation, channelShadowClampStep: clampStep });
}

/**
 * 持久化 goal 多轮收敛旋钮的唯一读取口（P13，2026-11-01；纪律 5 单源，照 consciousnessTuning 模式）。
 *
 * 权威值在 `src/growth.config.js` 的 `convergence` 段（与 growth.config.example.js 同构，C10d 校验）。
 * FALLBACK 只在没有配置文件时兜底（未部署院/门禁假院），组件内不得再写死 maxRounds 或自造 blocked_code：
 * 到顶自动 block 的轮数、可路由的阻塞分类码，一律经此读取，改 config 即改行为。
 * @returns {{maxRoundsDefault:number, blockedCodes:string[]}}
 */
const CONVERGENCE_FALLBACK = Object.freeze({
  maxRoundsDefault: 5,
  blockedCodes: ['round-limit', 'manual-blocked', 'dep-waiting'],
});

function getConvergenceConfig(fallback = CONVERGENCE_FALLBACK) {
  let cfg = null;
  try { cfg = loadGrowthConfig(); } catch (e) { cfg = null; }   // 未部署院：statSync 会抛 ENOENT，退回 fallback
  const raw = (cfg && typeof cfg === 'object' && cfg.convergence) || {};
  const out = {};
  const mr = Number(raw.maxRoundsDefault);
  out.maxRoundsDefault = Number.isFinite(mr) && mr > 0 ? mr : fallback.maxRoundsDefault;
  const codes = Array.isArray(raw.blockedCodes) ? raw.blockedCodes.map(String).filter(Boolean) : [];
  out.blockedCodes = codes.length ? codes : fallback.blockedCodes.slice();
  // 到顶自动阻塞码是机器路由的稳定码，永远保留，防止 config 误删导致 round-limit 不可路由
  if (!out.blockedCodes.includes('round-limit')) out.blockedCodes.push('round-limit');
  return out;
}

function convergenceTuning() {
  return getConvergenceConfig(CONVERGENCE_FALLBACK);
}

module.exports = { CONFIG_PATH, loadGrowthConfig, getConfigState, CONSCIOUSNESS_FALLBACK, getConsciousnessConfig, consciousnessTuning, consciousnessShadowTuning, CONVERGENCE_FALLBACK, getConvergenceConfig, convergenceTuning , guideChainTuning };
