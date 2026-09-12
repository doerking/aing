#!/usr/bin/env node
/**
 * session-ingest.js — 会话完整入库脚本
 * 
 * 功能：
 * 1. 入库用户消息 + Agent 分析/答复
 * 2. 提取实体、关系、标签
 * 3. 编译成 wiki/ 格式
 * 4. 触发生长脑代谢
 * 
 * 用法：
 *   echo '<JSON>' | node src/session-ingest.js
 *   node src/session-ingest.js --file session.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ========== 配置 ==========
const CONFIG = {
  kbRoot: process.env.KB_ROOT || path.resolve(__dirname, '..'),
  rawDir: path.join(__dirname, '..', 'raw'),
  wikiDir: path.join(__dirname, '..', 'wiki'),
  logDir: path.join(__dirname, '..', 'logs'),
  minMessageLength: 20,
  maxMessagesPerBatch: 10,
  batchIntervalMs: 5000,
};

// ========== 会话存储 ==========
class SessionStore {
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
    } catch (e) { /* 账本损坏则从空开始 */ }
  }

  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        messages: [],
        entities: new Set(),
        tags: new Set(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
    return this.sessions.get(sessionId);
  }

  addMessage(sessionId, message) {
    const session = this.getSession(sessionId);
    session.messages.push({
      id: Date.now(),
      role: message.role || 'user',
      content: message.content || message.text || message.message || '',
      timestamp: new Date().toISOString()
    });
    session.updatedAt = Date.now();
    
    // 检查是否满足入库条件
    if (session.messages.length >= CONFIG.maxMessagesPerBatch) {
      this.ingestSession(sessionId);
    }
  }

  ingestSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.messages.length === 0) return null;
    
    // 生成内容指纹
    const content = session.messages.map(m => m.content).join('\n');
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    
    // 去重检查
    if (this.ingestedHashes.has(hash)) {
      console.log(`⏭️  内容已存在（指纹: ${hash}），跳过入库`);
      return null;
    }
    
    // 提取实体和标签
    const { entities, tags } = this.extractEntitiesAndTags(content);
    session.entities = new Set(entities);
    session.tags = new Set(tags);
    
    // 生成 Markdown 内容
    const markdown = this.generateMarkdown(session, hash);
    
    // 写入文件
    const filename = `session-${new Date().toISOString().slice(0, 16).replace(/[:.]/g, '-')}-${hash}.md`;
    const filepath = path.join(CONFIG.rawDir, filename);
    
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, markdown, 'utf8');
    
    // 记录指纹
    this.ingestedHashes.add(hash);
    this.saveDedupFile();
    
    console.log(`✅ 会话入库: ${filename}`);
    console.log(`   消息数: ${session.messages.length}`);
    console.log(`   实体: ${entities.length}`);
    console.log(`   标签: ${tags.join(', ')}`);
    
    return { filename, filepath, hash, entities, tags };
  }

  extractEntitiesAndTags(content) {
    const entities = [];
    const tags = new Set();
    
    // 提取 [tag:xxx] 标签
    const tagMatches = content.matchAll(/\[tag:(\w+)\]/g);
    for (const match of tagMatches) {
      tags.add(match[1]);
    }
    
    // 提取 ## 标题作为实体
    const headingMatches = content.matchAll(/^##\s+(.+)$/gm);
    for (const match of headingMatches) {
      entities.push(match[1].trim());
    }
    
    // 提取 **加粗** 作为实体
    const boldMatches = content.matchAll(/\*\*(.+?)\*\*/g);
    for (const match of boldMatches) {
      entities.push(match[1].trim());
    }
    
    // 提取 #单标签
    const hashTagMatches = content.matchAll(/#(\w+)/g);
    for (const match of hashTagMatches) {
      tags.add(match[1]);
    }
    
    return { entities, tags: [...tags] };
  }

  generateMarkdown(session, hash) {
    const lines = [];
    
    // Frontmatter
    lines.push('---');
    lines.push(`name: 会话-${session.createdAt.toISOString()}`);
    lines.push('type: Conversation');
    lines.push(`tags: [${[...session.tags].join(', ')}]`);
    lines.push('status: active');
    lines.push('confidence: 0.9');
    lines.push('source: hermes-session');
    lines.push('sourceType: conversation');
    lines.push('distillationStatus: pending');
    lines.push(`created: "${session.createdAt.toISOString()}"`);
    lines.push(`messageCount: ${session.messages.length}`);
    lines.push('---');
    lines.push('');
    
    // Title
    lines.push(`# 会话-${session.createdAt.toISOString().slice(0, 10)}`);
    lines.push('');
    
    // 蒸馏摘要
    lines.push('## 蒸馏摘要');
    lines.push('');
    lines.push('待 Agent 蒸馏');
    lines.push('');
    
    // 消息记录
    lines.push('## 消息记录');
    lines.push('');
    
    for (const msg of session.messages) {
      const role = msg.role === 'user' ? '👤 用户' : '🤖 Agent';
      lines.push(`### ${role}`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    }
    
    // 实体提取
    lines.push('## 提取实体');
    lines.push('');
    for (const entity of [...session.entities].slice(0, 10)) {
      lines.push(`- ${entity}`);
    }
    lines.push('');
    
    // 标签
    lines.push('## 标签');
    lines.push('');
    for (const tag of [...session.tags]) {
      lines.push(`[tag:${tag}]`);
    }
    lines.push('');
    
    return lines.join('\n');
  }

  saveDedupFile() {
    const dir = path.dirname(this.dedupFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.dedupFile, JSON.stringify([...this.ingestedHashes]), 'utf8');
  }
}

// ========== CLI 入口 ==========
function main() {
  const args = process.argv.slice(2);
  const store = new SessionStore();
  
  if (args[0] === '--file' && args[1]) {
    // 从文件读取
    const content = fs.readFileSync(args[1], 'utf8');
    const session = JSON.parse(content);
    store.addMessage(session.sessionId || 'default', {
      role: session.role || 'user',
      content: session.content || session.text || session.message || ''
    });
    store.ingestSession(session.sessionId || 'default');
  } else {
    // 从标准输入读取
    let buffer = '';
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n').filter(l => l.trim());
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          const sessionId = message.sessionId || 'default';
          store.addMessage(sessionId, message);
          store.ingestSession(sessionId);
        } catch (e) {
          // 纯文本
          store.addMessage('default', { role: 'user', content: line });
        }
      }
    });
    
    process.stdin.on('end', () => {
      console.log(`\n✅ 入库完成。`);
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = { SessionStore };
