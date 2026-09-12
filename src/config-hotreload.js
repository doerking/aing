#!/usr/bin/env node
/**
 * config-hotreload.js — 配置热重载模块（P2 #007）
 * 
 * 功能：监听 growth.config.js 变更并自动重载，不中断服务
 */

const fs = require('fs');
const path = require('path');

class ConfigHotReload {
  constructor(configPath) {
    this.configPath = path.resolve(configPath);
    this.cache = null;
    this.subscribers = new Set();
    this.watchers = new Map();
    
    // 初始化加载
    this._load();
    
    // 启动监听
    this._watch();
    
    console.log('✅ 配置热重载已启动: ' + this.configPath);
  }
  
  /**
   * 重新加载配置（清除 require 缓存后重新导入）
   */
  _load() {
    try {
      const resolved = require.resolve(this.configPath);
      if (require.cache[resolved]) {
        delete require.cache[resolved];
      }
      this.cache = require(this.configPath);
      console.log('✅ 配置已加载/重载: ' + this.configPath);
      return true;
    } catch (e) {
      console.error('❌ 配置加载失败:', e.message);
      return false;
    }
  }
  
  /**
   * 启动文件监听
   */
  _watch() {
    try {
      const watcher = fs.watch(this.configPath, { persistent: true }, (eventType, filename) => {
        if (eventType === 'change' || eventType === 'rename') {
          console.log(`📝 检测到配置变更: ${filename}`);
          if (this._load()) {
            this._notifySubscribers();
          }
        }
      });
      this.watchers.set(this.configPath, watcher);
      console.log('✅ 配置监听已启动');
    } catch (e) {
      console.warn('⚠️ 配置监听启动失败:', e.message);
    }
  }
  
  /**
   * 获取当前配置
   */
  get() {
    return this.cache;
  }
  
  /**
   * 注册订阅者
   */
  onChange(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  
  /**
   * 通知所有订阅者
   */
  _notifySubscribers() {
    for (const callback of this.subscribers) {
      try {
        callback(this.cache);
      } catch (e) {
        console.error('⚠️ 订阅者回调失败:', e.message);
      }
    }
  }
  
  /**
   * 关闭监听
   */
  close() {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    console.log('✅ 配置热重载已关闭');
  }
}

// 导出单例
const configPath = path.join(__dirname, 'growth.config.js');
const configHotReload = new ConfigHotReload(configPath);

module.exports = { ConfigHotReload, configHotReload };
