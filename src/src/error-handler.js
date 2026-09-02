#!/usr/bin/env node
/**
 * error-handler.js — 错误码行动表
 * 
 * 定义错误处理策略，集成到代谢流水线
 * 
 * 错误码定义：
 * - 11007: 参数错误 → 修正参数，最多重试 1 次
 * - 401/403: 权限不足 → 告知用户，不重试
 * - 429: 速率限制 → 停止连续调用，不立即重试
 * - 500: 服务器错误 → 记录日志，最多重试 3 次
 * - 503: 服务不可用 → 切换节点，最多重试 5 次
 * 
 * 使用：
 *   const { ErrorHandler, ERROR_ACTIONS } = require('./error-handler');
 */

const ERROR_ACTIONS = {
  // 参数错误
  11007: {
    type: 'PARAM_ERROR',
    action: '修正参数',
    retry: 1,
    notify: true,
    log: false
  },
  
  // 认证错误
  401: {
    type: 'AUTH_ERROR',
    action: '告知用户重新登录',
    retry: 0,
    notify: true,
    log: true
  },
  
  // 权限错误
  403: {
    type: 'PERMISSION_ERROR',
    action: '告知用户权限不足',
    retry: 0,
    notify: true,
    log: true
  },
  
  // 速率限制
  429: {
    type: 'RATE_LIMIT',
    action: '等待后重试',
    retry: 0,
    notify: false,
    log: true,
    waitMs: 60000  // 等待 1 分钟
  },
  
  // 服务器内部错误
  500: {
    type: 'SERVER_ERROR',
    action: '记录日志并重试',
    retry: 3,
    notify: false,
    log: true
  },
  
  // 服务不可用
  503: {
    type: 'SERVICE_DOWN',
    action: '切换节点并重试',
    retry: 5,
    notify: true,
    log: true
  }
};

class ErrorHandler {
  constructor(store = null) {
    this.store = store;
  }

  /**
   * 获取错误处理策略
   * 未知错误码返回 null（而不是静默兑底到 500 策略）：
   * 否则 handle() 的 !action 分支永远不可达，未知错误会被默默重试 3 次
   */
  getAction(errorCode) {
    return ERROR_ACTIONS[errorCode] || null;
  }

  /**
   * 获取错误类型名（未知错误归为 UNKNOWN_ERROR，供日志用）
   */
  getErrorType(errorCode) {
    return (ERROR_ACTIONS[errorCode] || { type: 'UNKNOWN_ERROR' }).type;
  }

  /**
   * 记录错误到数据库
   */
  async logError(error) {
    if (!this.store) {
      console.error(`[错误] ${error.code} ${error.message}`);
      return;
    }

    this.store.logError({
      code: error.code,
      // 兼容调用方直接传入 type；未知错误码时 getAction 返回 null，必须走 getErrorType 兑底
      type: error.type || this.getErrorType(error.code),
      entityId: error.entityId,
      message: error.message,
      context: error.context,
      retries: error.retries || 0,
      maxRetries: error.maxRetries != null ? error.maxRetries : (ERROR_ACTIONS[error.code] || { retry: 0 }).retry
    });
  }

  /**
   * 执行错误处理策略
   */
  async handle(error, options = {}) {
    const action = this.getAction(error.code);
    
    if (!action) {
      console.error(`[未知错误] ${error.code}: ${error.message}`);
      // 未知错误也要留痕，但不走 500 策略的静默重试
      await this.logError({
        ...error,
        code: error.code,
        type: 'UNKNOWN_ERROR',
        retries: options.retries || 0
      });
      return { handled: false, action: 'UNKNOWN', shouldRetry: false, remainingRetries: 0, waitMs: 0 };
    }

    // 记录错误
    await this.logError({
      ...error,
      retries: options.retries || 0
    });

    // 通知用户
    if (action.notify && options.onNotify) {
      options.onNotify(`⚠️  ${action.type}: ${action.action}`);
    }

    // 返回处理结果
    return {
      handled: true,
      action: action.action,
      shouldRetry: action.retry > 0,
      remainingRetries: action.retry - (options.retries || 0),
      waitMs: action.waitMs || 0
    };
  }

  /**
   * 重试包装器
   */
  async withRetry(fn, options = {}) {
    const maxRetries = options.maxRetries || 3;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn({ attempt });
      } catch (error) {
        lastError = error;
        
        const action = this.getAction(error.code);
        if (!action || action.retry === 0) {
          // 不重试，直接抛出
          throw error;
        }

        if (attempt >= maxRetries) {
          // 超过最大重试次数，抛出
          break;
        }

        // 等待后重试
        const waitMs = action.waitMs || Math.pow(2, attempt) * 1000;
        console.log(`  ⏳ 等待 ${waitMs}ms 后重试 (${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }

    throw lastError;
  }

  /**
   * 批量错误处理
   */
  async batchHandle(errors, options = {}) {
    const results = [];
    
    for (const error of errors) {
      const result = await this.handle(error, options);
      results.push(result);
    }

    return results;
  }
}

module.exports = {
  ErrorHandler,
  ERROR_ACTIONS
};
