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

module.exports = { CONFIG_PATH, loadGrowthConfig, getConfigState };
