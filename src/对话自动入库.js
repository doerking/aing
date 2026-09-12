#!/usr/bin/env node
/**
 * 对话自动入库脚本
 * 
 * 功能：监听对话事件，自动将每轮对话入库到 aing 知识库
 * 
 * 使用方式：
 *   node src/对话自动入库.js --agent <agent-id>
 *   node src/对话自动入库.js --agent hermes --listen
 * 
 * 环境变量：
 *   KB_ROOT - 知识库根目录（默认当前目录）
 *   AGENT_ID - 代理 ID
 *   INGEST_INTERVAL_MS - 入库间隔（毫秒，默认 5000）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ========== 配置 ==========
const CONFIG = {
  kbRoot: process.env.KB_ROOT || path.resolve(__dirname, '..'),
  rawDir: 'raw',
  logDir: 'logs',
  minMessageLength: 20,
  maxMessagesPerBatch: 10,
  batchIntervalMs: parseInt(process.env.INGEST_INTERVAL_MS || '5000', 10),
  autoCompile: true,
};

// ========== 会话存储 ==========
class 对话存储 {
  constructor() {
    this.sessions = new Map();
    this.lastIngestTime = Date.now();
    this.dedupFile = path.join(CONFIG.kbRoot, 'data', 'ingest-hashes.json');
    this.ingestedHashes = new Set();
    
    try {
      if (fs.existsSync(this.dedupFile)) {
        for (const h of JSON.parse(fs.readFileSync(this.dedupFile, 'utf8'))) {
          this.ingestedHashes.add(h);
        }
      }
    } catch (e) {
      console.log('⚠️ 去重账本损坏，从空开始');
    }
  }

  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        messages: [],
        entities: new Set(),
        tags: new Set(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    return this.sessions.get(sessionId);
  }

  addMessage(sessionId, message) {
    const session = this.getSession(sessionId);
    session.messages.push({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      role: message.role || 'user',
      content: message.content || '',
      length: (message.content || '').length,
    });
    session.updatedAt = Date.now();
    
    // 提取实体和标签
    this.提取实体(message.content, session);
    
    // 检查是否需要入库
    this.检查并入库(sessionId);
  }

  提取实体(content, session) {
    const patterns = [
      { regex: /# ([\w-]+)/g, type: 'tag' },
      { regex: /\[\[([^\]]+)\]\]/g, type: 'entity' },
      { regex: /\*\*([^\*]+)\*\*/g, type: 'entity' },
    ];
    
    for (const pattern of patterns) {
      const matches = content.match(pattern.regex);
      if (matches) {
        for (const match of matches) {
          const entity = match.replace(pattern.regex, '$1').trim();
          if (pattern.type === 'tag') {
            session.tags.add(entity);
          } else {
            session.entities.add(entity);
          }
        }
      }
    }
  }

  检查并入库(sessionId) {
    const session = this.getSession(sessionId);
    const now = Date.now();
    
    const 触发条件 = session.messages.length >= CONFIG.maxMessagesPerBatch 
      || (now - this.lastIngestTime) >= CONFIG.batchIntervalMs;
    
    if (触发条件 && session.messages.length > 0) {
      this.入库会话(sessionId);
      this.lastIngestTime = now;
    }
  }

  入库会话(sessionId) {
    const session = this.getSession(sessionId);
    const bodyText = session.messages.map(m => m.content).join('\n\n');
    
    if (bodyText.length < CONFIG.minMessageLength) {
      return;
    }
    
    // 内容指纹去重
    const 批次哈希 = crypto.createHash('sha1').update(bodyText, 'utf8').digest('hex');
    if (this.ingestedHashes.has(批次哈希)) {
      session.messages = [];
      console.log(`⏭️  跳过重复入库 (${sessionId})`);
      return;
    }
    
    // 生成文件名
    const 安全会话ID = String(sessionId).replace(/[^a-zA-Z0-9\-_\u4e00-\u9fff]/g, '-');
    const 时间戳 = new Date().toISOString().replace(/[:.]/g, '-');
    const 文件名 = `${安全会话ID}-${时间戳}.md`;
    
    // 生成 Markdown
    const 标签列表 = [...new Set([...session.tags])]
      .map(tag => String(tag).trim())
      .filter(Boolean)
      .slice(0, 20);
    
    const 内容 = `---
name: ${文件名.replace('.md', '')}
type: Conversation
tags:
${标签列表.map(tag => `  - ${tag}`).join('\n')}
status: active
confidence: 0.9
source: ${sessionId}
sourceType: conversation
distillationStatus: pending
created: ${new Date().toISOString()}
messageCount: ${session.messages.length}
---

# ${文件名.replace('.md', '')}

## 原始消息
${bodyText}

## 提取实体
${[...session.entities].slice(0, 10).map(e => `- [[${e}]]`).join('\n') || '待 Agent 蒸馏'}

## 标签
${标签列表.join(', ') || '无'}

${标签列表.map(tag => `[tag:${tag}]`).join(' ')}
`;
    
    // 写入 raw/
    const 原始路径 = path.join(CONFIG.kbRoot, CONFIG.rawDir, 文件名);
    fs.mkdirSync(path.dirname(原始路径), { recursive: true });
    fs.writeFileSync(原始路径, 内容, 'utf-8');
    
    // 更新去重账本
    session.messages = [];
    this.ingestedHashes.add(批次哈希);
    try {
      const 账本目录 = path.dirname(this.dedupFile);
      if (!fs.existsSync(账本目录)) {
        fs.mkdirSync(账本目录, { recursive: true });
      }
      fs.writeFileSync(this.dedupFile, JSON.stringify([...this.ingestedHashes].slice(-5000)), 'utf-8');
    } catch (e) {
      console.log('⚠️ 去重账本写入失败');
    }
    
    console.log(`✅ 入库完成: ${文件名}`);
    
    // 触发编译（可选）
    if (CONFIG.autoCompile) {
      this.触发编译(原始路径);
    }
  }

  触发编译(rawPath) {
    const { execSync } = require('child_process');
    try {
      execSync(`node "${path.join(CONFIG.kbRoot, 'src', 'compile.js')}"`, {
        cwd: CONFIG.kbRoot,
        stdio: 'ignore',
        timeout: 30000,
      });
      console.log('🔧 编译完成');
    } catch (e) {
      console.log('⚠️ 编译失败，跳过');
    }
  }
}

// ========== 事件监听 ==========
class 对话监听器 {
  constructor(存储) {
    this.存储 = 存储;
    this.events = [];
    this.running = false;
  }

  开始监听(agentId) {
    this.running = true;
    console.log(`📡 对话监听器启动 (agent: ${agentId})`);
    console.log(`   知识库: ${CONFIG.kbRoot}`);
    console.log(`   入库间隔: ${CONFIG.batchIntervalMs / 1000}s`);
    
    // 定期检查未入库的会话
    this.定时器 = setInterval(() => {
      this.检查未入库会话(agentId);
    }, CONFIG.batchIntervalMs);
    
    // 捕获标准输入（模拟对话流）
    this.监听标准输入();
  }

  检查未入库会话(agentId) {
    for (const [sessionId, session] of this.存储.sessions) {
      if (session.messages.length > 0) {
        this.存储.入库会话(sessionId);
      }
    }
  }

  监听标准输入() {
    process.stdin.setEncoding('utf8');
    let 缓冲区 = '';
    
    process.stdin.on('data', (chunk) => {
      缓冲区 += chunk;
      
      // 按行处理 JSON
      const 行 = 缓冲区.split('\n').filter(l => l.trim());
      缓冲区 = 行.pop() || '';
      
      for (const 行文本 of 行) {
        this.处理消息(行文本);
      }
    });
  }

  处理消息(消息文本) {
    try {
      const 消息 = JSON.parse(消息文本);
      const 会话ID = 消息.sessionId || 消息.session_id || `${消息.agentId || 'default'}-session`;
      this.存储.addMessage(会话ID, {
        role: 消息.role || 'user',
        content: 消息.content || 消息.text || 消息.message || '',
      });
    } catch (e) {
      // 纯文本消息
      const 会话ID = '对话流';
      this.存储.addMessage(会话ID, {
        role: 'user',
        content: 消息文本,
      });
    }
  }

  停止() {
    this.running = false;
    if (this.定时器) {
      clearInterval(this.定时器);
    }
    console.log('🛑 监听器已停止');
  }
}

// ========== CLI 入口 ==========
function main() {
  const args = process.argv.slice(2);
  const agentId = args.find(a => a.startsWith('--agent='))?.split('=')[1] || process.env.AGENT_ID || 'default-agent';
  const listenMode = args.includes('--listen');
  
  const 存储 = new 对话存储();
  const 监听器 = new 对话监听器(存储);
  
  if (listenMode) {
    // 监听模式：持续运行
    监听器.开始监听(agentId);
    
    process.on('SIGINT', () => {
      监听器.停止();
      process.exit(0);
    });
  } else if (args.length > 0) {
    // 单次入库模式
    const 消息内容 = args.filter(a => !a.startsWith('--')).join(' ');
    if (消息内容.length >= CONFIG.minMessageLength) {
      存储.addMessage(agentId, { role: 'user', content: 消息内容 });
    } else {
      console.log('⚠️ 消息太短，跳过入库');
    }
  } else {
    console.log('用法:');
    console.log('  node src/对话自动入库.js --listen              # 监听模式');
    console.log('  node src/对话自动入库.js --agent <id> --listen  # 指定代理 ID');
    console.log('  echo \'{...}\' | node src/对话自动入库.js --listen  # 通过管道输入');
  }
}

if (require.main === module) {
  main();
}

module.exports = { 对话存储, 对话监听器, CONFIG };
