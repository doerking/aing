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

// P1a: Agent 蒸馏结果规范化（对话 → Agent 蒸馏 → 结构化 frontmatter → 编译）
function normalizeDistillation(input = {}) {
  const entities = Array.isArray(input.entities)
    ? input.entities
        .filter(entity => entity && typeof entity === 'object')
        .map(entity => ({
          name: String(entity.name || '').trim(),
          type: String(entity.type || 'Concept').trim(),
          tags: Array.isArray(entity.tags)
            ? entity.tags.map(tag => String(tag).trim()).filter(Boolean)
            : [],
          confidence: Number.isFinite(Number(entity.confidence))
            ? Math.max(0, Math.min(1, Number(entity.confidence)))
            : 0.7,
          evidence: String(entity.evidence || '').trim()
        }))
        .filter(entity => entity.name)
    : [];

  const tags = [
    ...(Array.isArray(input.tags) ? input.tags : []),
    ...entities.flatMap(entity => entity.tags)
  ]
    .map(tag => String(tag).trim())
    .filter(Boolean);

  return {
    summary: String(input.summary || '').trim(),
    entities,
    tags: [...new Set(tags)].slice(0, 20)
  };
}

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
    // role 扩展：user（用户提问）/ assistant（agent回复）/ analysis（agent分析）/ research（收集资料）
    // 旧调用方传 role:user/assistant 仍兼容；新增 role:analysis/research 不影响
    session.messages.push({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      role: message.role || 'user',
      content: message.content,
      length: message.content.length,
      source: message.source || null,      // 资料来源（URL/文件路径，research 专用）
      metadata: message.metadata || null    // 附加元数据（分析结果的结构化数据等）
    });
    session.updatedAt = Date.now();
    if (message.distillation) session.distillation = message.distillation;
    
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
    // 按角色分区：用户提问 / agent回复 / agent分析 / 收集资料
    const byRole = { user: [], assistant: [], analysis: [], research: [] };
    for (const m of session.messages) {
      const role = byRole[m.role] ? m.role : 'user';
      byRole[role].push(m);
    }
    // 全量内容（用于指纹去重，与旧逻辑兼容）
    const bodyText = session.messages.map(m => m.content).join('\n\n');
    
    if (bodyText.length < CONFIG.minMessageLength) {
      return; // 内容太短，跳过
    }
    
    // P1a: Agent 蒸馏结果（api-server / addMessage 传入，最新一条为准）
    const distillation = normalizeDistillation(session.distillation || {});
    const hasDistillation = distillation.entities.length > 0;

    // 内容指纹去重：同一批次内容已入库则丢弃本轮，不重复落盘
    const batchHash = crypto.createHash('sha1').update(bodyText, 'utf8').digest('hex');
    if (this.ingestedHashes.has(batchHash)) {
      session.messages = [];
      console.log(`⏭️  内容指纹命中已入库记录，跳过重复入库 (${sessionId}) / Content fingerprint matched, skipping duplicate ingest`);
      return;
    }
    
    // 生成文件名（会话 ID 由客户端自，可能含冒号/空格/路径分隔等非法字符，先净化再入文件名；
    // 否则 Windows 下写 raw/ 直接 ENOENT。旧版本的租户前缀 "default::" 已砍除，本净化保留。）
    const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9\-_\u4e00-\u9fff]/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${safeSessionId}-${timestamp}.md`;
    
    // 生成 YAML frontmatter
    const primaryEntity = distillation.entities[0];

    const frontmatter = {
      name: primaryEntity
        ? primaryEntity.name
        : `会话-${timestamp}`,

      type: primaryEntity
        ? primaryEntity.type
        : 'Conversation',

      id: primaryEntity
        ? `${safeSessionId}-${primaryEntity.name.replace(/[^\w\u4e00-\u9fff-]+/g, '-').slice(0, 80)}`
        : `${safeSessionId}-${timestamp}`,

      tags: [...new Set([
        ...Array.from(session.tags),
        ...distillation.tags
      ])].map(tag => String(tag).trim()).filter(Boolean).slice(0, 20),

      status: hasDistillation ? 'active' : 'pending-distillation',

      confidence: primaryEntity
        ? primaryEntity.confidence
        : 0.0,

      source: sessionId,
      sourceType: 'conversation',
      distillationStatus: hasDistillation ? 'completed' : 'pending',

      created: session.messages.length > 0
        ? session.messages[session.messages.length - 1].timestamp
        : new Date().toISOString(),
      messageCount: session.messages.length
    };
    
    // 生成 Markdown 内容 — 按角色分区（不混合，保留来源可追溯）
    const sections = [];

    const summarySection = distillation.summary
      ? `## 蒸馏摘要\n${distillation.summary}\n\n`
      : `## 蒸馏摘要\n待生成\n\n`;

    if (byRole.user.length) {
      sections.push('## 用户提问');
      for (const m of byRole.user) {
        sections.push(`> [${m.timestamp}] ${m.role === 'user' ? '用户' : m.role}`);
        sections.push(m.content);
        sections.push('');
      }
    }
    if (byRole.assistant.length) {
      sections.push('## Agent 回复');
      for (const m of byRole.assistant) {
        sections.push(`> [${m.timestamp}]`);
        sections.push(m.content);
        sections.push('');
      }
    }
    if (byRole.analysis.length) {
      sections.push('## Agent 分析');
      for (const m of byRole.analysis) {
        sections.push(`> [${m.timestamp}]`);
        sections.push(m.content);
        if (m.metadata) { sections.push('```json'); sections.push(typeof m.metadata === 'string' ? m.metadata : JSON.stringify(m.metadata, null, 2)); sections.push('```'); }
        sections.push('');
      }
    }
    if (byRole.research.length) {
      sections.push('## 收集资料');
      for (const m of byRole.research) {
        sections.push(`> [${m.timestamp}]${m.source ? ' 来源: ' + m.source : ''}`);
        sections.push(m.content);
        sections.push('');
      }
    }

    const bodySections = sections.join('\n');

    const content = `# ${frontmatter.name}

${summarySection}${bodySections}

## 提取实体

${distillation.entities.length > 0
  ? distillation.entities.map(entity => [
      `- [[${entity.name}]]`,
      `  - type: ${entity.type}`,
      `  - confidence: ${entity.confidence}`,
      entity.evidence ? `  - evidence: ${entity.evidence}` : ''
    ].filter(Boolean).join('\n')).join('\n')
  : '待 Agent 蒸馏'}

## 标签
${frontmatter.tags.length > 0 ? frontmatter.tags.join(', ') : '无'}

${frontmatter.tags.map(tag => `[tag:${tag}]`).join(' ')}
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
    
    console.log(`✅ 入库完成: ${fileName} / Ingest done:`);
    
    // 触发编译
    this.triggerCompile(rawPath);
  }

  triggerCompile(rawPath) {
    for (const script of CONFIG.pipelineScripts) {
      const scriptPath = path.join(CONFIG.kbRoot, script);
      if (!fs.existsSync(scriptPath)) {
        console.error(`⚠️ 跳过不存在的脚本: ${script} / Skipping missing script:`);
        continue;
      }
      try {
        execSync(`node "${scriptPath}"`, {
          cwd: CONFIG.kbRoot,
          stdio: 'inherit',
          timeout: 60000
        });
        console.log(`🔧 完成: ${script} / Done:`);
      } catch (e) {
        console.error(`⚠️ ${script} 失败: / script failed:`, e.message);
        break; // 链式步骤，前面失败就停
      }
    }
  }
}

// ========== CLI 入口 ==========
function main() {
  const store = new SessionStore();
  
  console.log('🧬 aing 自动入库服务启动 / aing auto-ingest service started');
  console.log(`📂 知识库: ${CONFIG.kbRoot} / Knowledge base:`);
  console.log(`⏱️  批处理间隔: ${CONFIG.batchIntervalMs / 1000}s / Batch interval:`);
  console.log('📡 等待消息...\n / Waiting for messages...');
  
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
