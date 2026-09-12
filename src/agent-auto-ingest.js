#!/usr/bin/env node
/**
 * Agent 对话自动入库插件
 * 
 * 功能：为 Agnes/任意 Agent 提供对话入库能力
 * 
 * 使用方式：
 *   const { AgentAutoIngest } = require('./src/agent-auto-ingest');
 *   const ingest = new AgentAutoIngest({ agentId: 'hermes' });
 *   
 *   // 入库消息
 *   ingest.入库({ role: 'user', content: '...' });
 *   
 *   // 入库完整对话
 *   ingest.入库对话([
 *     { role: 'user', content: '你好' },
 *     { role: 'assistant', content: '你好，有什么可以帮你的？' }
 *   ]);
 */

const path = require('path');
const { 对话存储 } = require('./对话自动入库');

class AgentAutoIngest {
  constructor(options = {}) {
    this.agentId = options.agentId || process.env.AGENT_ID || 'default-agent';
    this.sessionId = options.sessionId || this.生成会话ID();
    this.存储 = options.存储 || new 对话存储();
    this.config = {
      minMessageLength: options.minMessageLength || 20,
      maxMessagesPerBatch: options.maxMessagesPerBatch || 10,
      batchIntervalMs: options.batchIntervalMs || 5000,
      autoCompile: options.autoCompile !== false,
      ...options,
    };
  }

  生成会话ID() {
    return `${this.agentId}-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}`;
  }

  入库(消息) {
    if (!消息 || typeof 消息 !== 'object') {
      throw new Error('消息必须是对象');
    }
    
    const 内容 = 消息.content || 消息.text || 消息.message || '';
    if (内容.length < this.config.minMessageLength) {
      console.log(`⏭️  消息太短 (${内容.length} 字符)，跳过入库`);
      return;
    }
    
    this.存储.addMessage(this.sessionId, {
      role: 消息.role || 'user',
      content: 内容,
    });
    
    return {
      accepted: true,
      sessionId: this.sessionId,
      length: 内容.length,
    };
  }

  入库对话(消息列表) {
    if (!Array.isArray(消息列表)) {
      throw new Error('消息列表必须是数组');
    }
    
    const 结果 = [];
    for (const 消息 of 消息列表) {
      结果.push(this.入库(消息));
    }
    
    return 结果;
  }

  获取会话() {
    return this.存储.getSession(this.sessionId);
  }

  获取统计() {
    const 会话 = this.存储.sessions.get(this.sessionId);
    return {
      sessionId: this.sessionId,
      messageCount: 会话?.messages.length || 0,
      entityCount: 会话?.entities.size || 0,
      tagCount: 会话?.tags.size || 0,
      lastIngestTime: 会话?.updatedAt || null,
    };
  }
}

// ========== CLI 入口 ==========
function main() {
  const args = process.argv.slice(2);
  const agentId = args.find(a => a.startsWith('--agent='))?.split('=')[1] || process.env.AGENT_ID || 'agent';
  
  const ingest = new AgentAutoIngest({ agentId });
  
  // 读取标准输入
  let 缓冲区 = '';
  process.stdin.setEncoding('utf8');
  
  process.stdin.on('data', (chunk) => {
    缓冲区 += chunk;
    const 行 = 缓冲区.split('\n').filter(l => l.trim());
    缓冲区 = 行.pop() || '';
    
    for (const 行文本 of 行) {
      try {
        const 消息 = JSON.parse(行文本);
        const 结果 = ingest.入库(消息);
        console.log(JSON.stringify(结果, null, 2));
      } catch (e) {
        // 纯文本
        const 结果 = ingest.入库({ role: 'user', content: 行文本 });
        console.log(JSON.stringify(结果, null, 2));
      }
    }
  });
  
  process.stdin.on('end', () => {
    console.log(`✅ 入库完成。会话: ${ingest.sessionId}`);
    console.log(JSON.stringify(ingest.获取统计(), null, 2));
  });
}

if (require.main === module) {
  main();
}

module.exports = { AgentAutoIngest };
