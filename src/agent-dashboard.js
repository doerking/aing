#!/usr/bin/env node
/**
 * agent-dashboard.js — aing Agent 控制面板
 * 
 * 功能：
 * 1. HTTP API 服务（RESTful 端点）
 * 2. 会话自动入库
 * 3. 语义检索
 * 4. 意识神经简报
 * 5. 维护决策
 * 6. 实时状态监控
 * 7. Agnes 组件接入
 * 
 * 用法：
 *   node src/agent-dashboard.js              # 启动面板服务
 *   node src/agent-dashboard.js --port 3789  # 指定端口
 *   node src/agent-dashboard.js --api-key secret  # 启用认证
 */

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

// 导入核心模块
const KnowledgeStore = require('./knowledge-store');
const VectorSearch = require('./vector-search');
const { SessionStore } = require('./auto-ingest');
const { ConsciousnessKernel } = require('./consciousness-kernel');
const { GrowthDirector } = require('./growth-director');
const { HermesAingAdapter } = require('./hermes-aing-adapter');
const { AgnesAingAdapter } = require('./agnes-aing-adapter');

// ========== 配置 ==========
const CONFIG = {
  port: parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || process.env.AING_API_PORT || 3789, 10),
  apiKey: process.argv.find(a => a.startsWith('--api-key='))?.split('=')[1] || process.env.AING_API_KEY || null,
  kbRoot: process.env.KB_ROOT || path.resolve(__dirname, '..'),
};

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   🎛️  aing Agent 控制面板                    ║
╠══════════════════════════════════════════════════════════════╣
║  端口：${String(CONFIG.port).padEnd(48)} ║
║  认证：${(CONFIG.apiKey ? '已启用' : '未启用（本机模式）').padEnd(42)} ║
║  知识库：${CONFIG.kbRoot.padEnd(48)} ║
╚══════════════════════════════════════════════════════════════╝
`);

// ========== 初始化核心组件 ==========
const store = new KnowledgeStore(path.join(CONFIG.kbRoot, 'knowledge.db'));
const vectorSearch = new VectorSearch(store);
const sessionStore = new SessionStore();
const consciousnessKernel = new ConsciousnessKernel({ baseDir: CONFIG.kbRoot });
const growthDirector = new GrowthDirector(path.join(CONFIG.kbRoot, 'knowledge.db'));
const aingAdapter = new HermesAingAdapter({ kbRoot: CONFIG.kbRoot });
const agnesAdapter = new AgnesAingAdapter({ 
  kbRoot: CONFIG.kbRoot,
  aingAdapter 
});

// 初始化向量检索
vectorSearch.init().catch(err => console.error('❌ 向量检索初始化失败:', err));
vectorSearch.enableSemantic().catch(err => {
  console.log('⚠️  语义模型不可用，使用 64 维哈希回退');
});

// ========== 认证中间件 ==========
function authorize(req, res) {
  if (!CONFIG.apiKey) return true;
  
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.slice(7);
  return token === CONFIG.apiKey;
}

// ========== HTTP 服务器 ==========
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  try {
    // ── 健康检查 ──
    if (pathname === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        mode: CONFIG.apiKey ? 'auth' : 'local-trust',
        agnesConnected: true,
        timestamp: new Date().toISOString()
      }));
      return;
    }
    
    // ── 认证检查 ──
    if (!authorize(req, res)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '未认证：需要 Authorization: Bearer <API_KEY>' }));
      return;
    }
    
    // ── 知识状态 ──
    if (pathname === '/api/status' && method === 'GET') {
      const stats = store.getStats();
      const metabolismLog = store.all('SELECT * FROM metabolism_log ORDER BY created_at DESC LIMIT 5');
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...stats,
        lastMetabolism: metabolismLog[0] || null,
        timestamp: new Date().toISOString()
      }));
      return;
    }
    
    // ── 实体列表 ──
    if (pathname === '/api/entities' && method === 'GET') {
      const limit = parseInt(parsedUrl.query.limit || 20, 10);
      const entities = store.getEntities({ limit });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        count: entities.length,
        entities: entities.map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          status: e.status,
          kespi: e.kespi_score,
          tags: e.tags
        }))
      }));
      return;
    }
    
    // ── 实体详情 ──
    const entityMatch = pathname.match(/^\/api\/entity\/(.+)$/);
    if (entityMatch && method === 'GET') {
      const entityId = decodeURIComponent(entityMatch[1]);
      const entity = store.getEntity(entityId);
      
      if (!entity) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '实体不存在' }));
        return;
      }
      
      const kespiHistory = store.all(
        'SELECT * FROM kespi_history WHERE entity_id = ? ORDER BY created_at DESC LIMIT 5',
        [entityId]
      );
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...entity,
        kespi_history: kespiHistory
      }));
      return;
    }
    
    // ── 语义检索 ──
    if (pathname === '/api/query' && method === 'GET') {
      const query = parsedUrl.query.q;
      const limit = parseInt(parsedUrl.query.limit || 8, 10);
      
      if (!query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '缺少查询参数 q' }));
        return;
      }
      
      const hits = await vectorSearch.semanticSearch(query, limit);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        query,
        mode: vectorSearch.mode,
        count: hits.length,
        results: hits.map(h => ({
          id: h.id,
          name: h.name,
          type: h.type,
          score: h.score,
          updated_at: h.updated_at
        }))
      }));
      return;
    }
    
    // ── 会话入库 ──
    if (pathname === '/api/ingest' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const event = JSON.parse(body);
          const result = await aingAdapter.ingestSession(event);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    
    // ── 意识简报 ──
    if (pathname === '/api/briefing' && method === 'GET') {
      const briefing = aingAdapter.generateBriefing();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        timestamp: new Date().toISOString(),
        ...briefing
      }));
      return;
    }
    
    // ── 维护决策 ──
    if (pathname === '/api/deliberate' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const event = JSON.parse(body);
          const result = await aingAdapter.deliberateMaintenance(event);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    
    // ── 生长决策 ──
    if (pathname === '/api/growth-decision' && method === 'GET') {
      await growthDirector.perceive();
      const decision = growthDirector.decide();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        timestamp: new Date().toISOString(),
        ...decision
      }));
      return;
    }
    
    // ── 元认知状态 ──
    if (pathname === '/api/metacognition' && method === 'GET') {
      const metaState = consciousnessKernel.metacognition.selfState;
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        timestamp: new Date().toISOString(),
        ...metaState
      }));
      return;
    }
    
    // ── 意识神经状态 ──
    if (pathname === '/api/consciousness' && method === 'GET') {
      const status = consciousnessKernel.status();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        timestamp: new Date().toISOString(),
        ...status
      }));
      return;
    }
    
    // ── Agnes 适配器状态 ──
    if (pathname === '/api/agnes/status' && method === 'GET') {
      const status = agnesAdapter.getStatus();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        timestamp: new Date().toISOString(),
        ...status
      }));
      return;
    }
    
    // ── Agnes 图片生成入库 ──
    if (pathname === '/api/agnes/image' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const options = JSON.parse(body);
          const result = await agnesAdapter.ingestImageGeneration(options);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    
    // ── Agnes 视频生成入库 ──
    if (pathname === '/api/agnes/video' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const options = JSON.parse(body);
          const result = await agnesAdapter.ingestVideoGeneration(options);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    
    // ── Agnes 研究入库 ──
    if (pathname === '/api/agnes/research' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const options = JSON.parse(body);
          const result = await agnesAdapter.ingestResearch(options);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    
    // ── Agnes PPT 入库 ──
    if (pathname === '/api/agnes/slide' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const options = JSON.parse(body);
          const result = await agnesAdapter.ingestSlideDeck(options);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    
    // ── Agnes 工件入库 ──
    if (pathname === '/api/agnes/artifact' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const options = JSON.parse(body);
          const result = await agnesAdapter.ingestArtifact(options);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    
    // ── Agnes 网络搜索入库 ──
    if (pathname === '/api/agnes/web' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const options = JSON.parse(body);
          const result = await agnesAdapter.ingestWebSearch(options);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    
    // ── Agnes 通用入库 ──
    if (pathname === '/api/agnes/ingest' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const options = JSON.parse(body);
          const result = await agnesAdapter.ingestContent(options);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
    
    // ── 404 ──
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '端点不存在', path: pathname }));
    
  } catch (err) {
    console.error('❌ 请求处理失败:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '内部服务器错误' }));
  }
});

// ========== 启动服务器 ==========
server.listen(CONFIG.port, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    ✅ 面板服务已启动                          ║
╠══════════════════════════════════════════════════════════════╣
║  📍 访问地址：http://localhost:${CONFIG.port}                   ║
║  🔐 认证模式：${CONFIG.apiKey ? 'Bearer Token 已启用' : '本机信任模式'}                   ║
╠══════════════════════════════════════════════════════════════╣
║  📊 API 端点：                                               ║
║    --- aing 核心 ---                                        ║
║    GET  /health              健康检查                        ║
║    GET  /api/status          知识状态                        ║
║    GET  /api/entities        实体列表                        ║
║    GET  /api/entity/<id>     实体详情                        ║
║    GET  /api/query?q=...     语义检索                        ║
║    POST /api/ingest          会话入库                        ║
║    GET  /api/briefing        意识简报                        ║
║    POST /api/deliberate      维护决策                        ║
║    GET  /api/growth-decision 生长决策                        ║
║    GET  /api/metacognition   元认知状态                      ║
║    GET  /api/consciousness   意识神经状态                    ║
║    --- Agnes 组件 ---                                       ║
║    GET  /api/agnes/status    Agnes 适配器状态                ║
║    POST /api/agnes/image     图片生成入库                    ║
║    POST /api/agnes/video     视频生成入库                    ║
║    POST /api/agnes/research  研究结果入库                    ║
║    POST /api/agnes/slide     PPT 生成入库                    ║
║    POST /api/agnes/artifact  工件入库                        ║
║    POST /api/agnes/web       网络搜索入库                    ║
║    POST /api/agnes/ingest    通用入库                        ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// ========== 优雅关闭 ==========
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭面板服务...');
  server.close(() => {
    console.log('✅ 面板服务已关闭');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n👋 正在关闭面板服务...');
  server.close(() => {
    console.log('✅ 面板服务已关闭');
    process.exit(0);
  });
});
