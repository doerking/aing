#!/usr/bin/env node
/**
 * auto-ingest.js — 会话自动入库脚本
 * 
 * 功能：
 * 1. 监听对话消息
 * 2. 提取关键信息（实体、关系、标签）
 * 3. 编译成 wiki/ 格式
 * 4. 触发生长脑代谢
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ========== 配置 ==========
const CONFIG = {
  // 默认指向部署包自身（src/auto-ingest.js 的上一级），兼容 KB_ROOT 环境变量覆盖
  kbRoot: process.env.KB_ROOT || path.resolve(__dirname, '..'),
  rawDir: 'raw',
  wikiDir: 'wiki',
  logDir: 'logs',

  // 入库触发条件
  minMessageLength: 20,      // 最小消息长度
  maxMessagesPerBatch: 5,    // 每批最多处理消息数
  batchIntervalMs: 30000,    // 批处理间隔（30秒）

  // 自动触发链：compile(raw→wiki) → import(wiki→db) → vector(语义可搜)
  pipelineScripts: ['src/compile.js', 'src/import-from-wiki.js', 'src/index-vectors.js'],
};

// ========== 会话存储 ==========
class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.lastIngestTime = Date.now();
    // 内容级去重：已入库批次指纹账本（防轮询器/重发器重复入库同一内容）
    this.dedupFile = path.join(CONFIG.kbRoot, 'data', 'ingest-hashes.json');
    this.ingestedHashes = new Set();
    try {
      if (fs.existsSync(this.dedupFile)) {
        for (const h of JSON.parse(fs.readFileSync(this.dedupFile, 'utf8'))) {
          this.ingestedHashes.add(h);
        }
      }
    } catch (e) { /* 账本损坏则从空开始，不影响入库 */ }
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
      timestamp: new Date().toISOString(),
      role: message.role,
      content: message.content,
      length: message.content.length
    });
    session.updatedAt = Date.now();
    
    // 提取实体和标签
    this.extractEntities(message.content, session);
    
    // 检查是否需要入库
    this.checkAndIngest(sessionId);
  }

  extractEntities(content, session) {
    // 简单实体提取（可替换为更智能的 NER）
    const patterns = [
      { regex: /# ([\w-]+)/g, type: 'tag' },
      { regex: /\[\[([^\]]+)\]\]/g, type: 'entity' },
      { regex: /\*\*([^\*]+)\*\*/g, type: 'entity' }
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

  checkAndIngest(sessionId) {
    const session = this.getSession(sessionId);
    const now = Date.now();
    
    // 触发条件：消息数达到阈值 或 时间间隔到达
    const shouldIngest = session.messages.length >= CONFIG.maxMessagesPerBatch 
      || (now - this.lastIngestTime) >= CONFIG.batchIntervalMs;
    
    if (shouldIngest && session.messages.length > 0) {
      this.ingestSession(sessionId);
      this.lastIngestTime = now;
    }
  }

  ingestSession(sessionId) {
    const session = this.getSession(sessionId);
    // 全量拼接本批消息（原实现只存最新一条，同批其余消息丢弃）
    const bodyText = session.messages.map(m => m.content).join('\n\n');
    
    if (bodyText.length < CONFIG.minMessageLength) {
      return; // 内容太短，跳过
    }
    
    // 内容指纹去重：同一批次内容已入库则丢弃本轮，不重复落盘
    const batchHash = crypto.createHash('sha1').update(bodyText, 'utf8').digest('hex');
    if (this.ingestedHashes.has(batchHash)) {
      session.messages = [];
      console.log(`⏭️  内容指纹命中已入库记录，跳过重复入库 (${sessionId})`);
      return;
    }
    
    // 生成文件名（会话 ID 可能带租户前缀等非法字符，先净化再入文件名）
    const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9\-_\u4e00-\u9fff]/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${safeSessionId}-${timestamp}.md`;
    
    // 生成 YAML frontmatter
    const frontmatter = {
      name: `会话-${timestamp}`,
      type: 'Conversation',
      tags: Array.from(session.tags).slice(0, 5),
      status: 'active',
      confidence: 0.85,
      source: sessionId,
      created: session.messages.length > 0
        ? session.messages[session.messages.length - 1].timestamp
        : new Date().toISOString(),
      messageCount: session.messages.length
    };
    
    // 生成 Markdown 内容
    const content = `# ${frontmatter.name}

## 原始消息
${bodyText}

## 提取实体
${Array.from(session.entities).map(e => `- [[${e}]]`).join('\n') || '无'}

## 标签
${Array.from(session.tags).join(', ') || '无'}
`;
    
    // 写入 raw/
    const rawPath = path.join(CONFIG.kbRoot, CONFIG.rawDir, fileName);
    const fmContent = `---\n${Object.entries(frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n\n${content}`;
    
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    fs.writeFileSync(rawPath, fmContent, 'utf-8');
    
    // 入库成功后清空本批消息，防止轮询器对同一会话重复入库
    session.messages = [];
    // 记录并持久化批次指纹
    this.ingestedHashes.add(batchHash);
    try {
      fs.mkdirSync(path.dirname(this.dedupFile), { recursive: true });
      fs.writeFileSync(this.dedupFile, JSON.stringify([...this.ingestedHashes].slice(-5000)), 'utf-8');
    } catch (e) { /* 账本写失败不阻断入库 */ }
    
    console.log(`✅ 入库完成: ${fileName}`);
    
    // 触发编译
    this.triggerCompile(rawPath);
  }

  triggerCompile(rawPath) {
    for (const script of CONFIG.pipelineScripts) {
      const scriptPath = path.join(CONFIG.kbRoot, script);
      if (!fs.existsSync(scriptPath)) {
        console.error(`⚠️ 跳过不存在的脚本: ${script}`);
        continue;
      }
      try {
        execSync(`node "${scriptPath}"`, {
          cwd: CONFIG.kbRoot,
          stdio: 'inherit',
          timeout: 60000
        });
        console.log(`🔧 完成: ${script}`);
      } catch (e) {
        console.error(`⚠️ ${script} 失败:`, e.message);
        break; // 链式步骤，前面失败就停
      }
    }
  }
}

// ========== CLI 入口 ==========
function main() {
  const store = new SessionStore();
  
  console.log('🧬 aing 自动入库服务启动');
  console.log(`📂 知识库: ${CONFIG.kbRoot}`);
  console.log(`⏱️  批处理间隔: ${CONFIG.batchIntervalMs / 1000}s`);
  console.log('📡 等待消息...\n');
  
  // 模拟消息输入（实际应接入消息总线）
  if (process.argv.length > 2) {
    const sessionId = process.argv[2];
    const message = process.argv[3] || '{role:"user", content:"test"}';
    
    try {
      const msg = JSON.parse(message);
      store.addMessage(sessionId, msg);
    } catch (e) {
      // 纯文本输入
      store.addMessage(sessionId, { role: 'user', content: message });
    }
  }
  
  // 保持进程运行
  setInterval(() => {
    // 定期检查未入库的会话
    for (const [sid, session] of store.sessions) {
      store.checkAndIngest(sid);
    }
  }, 10000);
}

if (require.main === module) {
  main();
}

module.exports = { SessionStore, CONFIG };
