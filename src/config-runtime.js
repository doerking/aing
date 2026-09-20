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

module.exports = { CONFIG_PATH, loadGrowthConfig, getConfigState, CONSCIOUSNESS_FALLBACK, getConsciousnessConfig, consciousnessTuning };
