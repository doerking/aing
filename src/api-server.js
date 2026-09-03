#!/usr/bin/env node
/**
 * api-server.js — 知识库 HTTP API 服务（零依赖）
 *
 * 功能：
 * 1. 只读查询端点：实体列表 / 实体详情 / 语义检索
 * 2. 写入端点：会话消息入库（复用 auto-ingest 批处理链）
 * 3. 认证：设置 AING_API_KEY 后，除 /health 外全部要求 Bearer 认证
 * 4. 多租户：写入端点按 X-Tenant-ID 隔离会话（无该头时默认 tenant=default）
 * 5. 输入防护：实体 ID 白名单字符校验（阻断路径穿越）、请求体 1MB 上限
 *
 * 用法：
 *   node src/api-server.js
 *
 * 环境变量：
 *   AING_API_PORT   监听端口，默认 3789
 *   AING_API_KEY    认证密钥（未设置则仅监听 127.0.0.1，只读本机开放）
 *
 * 端点：
 *   GET  /health                        健康检查（公开）
 *   GET  /api/entities                  实体列表
 *   GET  /api/entity/<id>               实体详情 + 最新 KESPI
 *   GET  /api/query?q=<词>&limit=<N>    语义/关键词检索
 *   POST /api/ingest                    会话消息入库 {sessionId, role, content}
 */

const http = require('http');
const KnowledgeStore = require('./knowledge-store');
const VectorSearch = require('./vector-search');
const { SessionStore } = require('./auto-ingest');

const PORT = parseInt(process.env.AING_API_PORT, 10) || 3789;
const API_KEY = process.env.AING_API_KEY || null;
const BODY_LIMIT = 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9\-_\u4e00-\u9fff]+$/; // 实体 ID 白名单，天然阻断 ../ 穿越

const sessions = new SessionStore();
let store = null;
let vectorSearch = null;

function json(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function authorized(req) {
  if (!API_KEY) return true; // 未设密钥 = 本机信任模式
  const header = req.headers['authorization'] || '';
  return header === `Bearer ${API_KEY}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new Error('请求体超过 1MB 上限'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname.replace(/\/+$/, '') || '/';

  // 健康检查：永远公开
  if (p === '/health') {
    return json(res, 200, { status: 'ok', mode: API_KEY ? 'auth' : 'local-trust', uptime: process.uptime() });
  }

  // 其余端点统一认证
  if (!authorized(req)) {
    return json(res, 401, { error: '未认证：需要 Authorization: Bearer <AING_API_KEY>' });
  }

  // 实体列表
  if (p === '/api/entities' && req.method === 'GET') {
    const entities = store.getEntities().map(e => ({
      id: e.id, name: e.name, type: e.type, updated_at: e.updated_at
    }));
    return json(res, 200, { count: entities.length, entities });
  }

  // 实体详情
  const entityMatch = p.match(/^\/api\/entity\/([^/]+)$/);
  if (entityMatch && req.method === 'GET') {
    const id = decodeURIComponent(entityMatch[1]);
    if (!ID_PATTERN.test(id)) {
      return json(res, 400, { error: '非法实体 ID' });
    }
    const entity = store.getEntity(id);
    if (!entity) return json(res, 404, { error: `实体不存在: ${id}` });
    let kespi = null;
    try { kespi = store.getLatestKespi(id); } catch (e) { /* 无记录 */ }
    return json(res, 200, { entity, latestKespi: kespi });
  }

  // 检索
  if (p === '/api/query' && req.method === 'GET') {
    const q = url.searchParams.get('q');
    if (!q) return json(res, 400, { error: '缺少查询词 ?q=' });
    const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 8, 50);
    const hits = await vectorSearch.semanticSearch(q, limit);
    return json(res, 200, {
      query: q,
      mode: vectorSearch.mode,
      results: hits.map(e => ({ id: e.id, name: e.name, type: e.type, score: e.score }))
    });
  }

  // 会话消息入库（写入路径，按租户隔离会话）
  if (p === '/api/ingest' && req.method === 'POST') {
    const tenant = String(req.headers['x-tenant-id'] || 'default').replace(/[^a-zA-Z0-9\-_]/g, '-');
    const body = await readBody(req);
    if (!body.sessionId || !body.content) {
      return json(res, 400, { error: '需要 {sessionId, content} 字段' });
    }
    sessions.addMessage(`${tenant}::${String(body.sessionId)}`, {
      role: String(body.role || 'user'),
      content: String(body.content)
    });
    return json(res, 200, { accepted: true, tenant });
  }

  return json(res, 404, { error: `未知端点: ${req.method} ${p}` });
}

async function main() {
  store = new KnowledgeStore();
  await store.init();
  vectorSearch = new VectorSearch(store);
  await vectorSearch.init();
  try {
    await vectorSearch.enableSemantic();
    console.log('🔎 检索模式: 语义 (384 维本地模型)');
  } catch (e) {
    console.log('🔎 检索模式: hash (64 维；语义模型未就绪)');
  }

  const host = API_KEY ? '0.0.0.0' : '127.0.0.1';
  const server = http.createServer((req, res) => {
    handle(req, res).catch(e => json(res, 500, { error: e.message }));
  });

  // 定期冲洗会话批（auto-ingest 的轮询仅在其自身为主模块时启动，
  // API server 挂载 SessionStore 后必须自备冲洗循环，否则消息滞留内存永不出库）
  setInterval(() => {
    for (const [sid, session] of sessions.sessions) {
      if (session.messages.length > 0) sessions.checkAndIngest(sid);
    }
  }, 10000);

  server.listen(PORT, host, () => {
    console.log('🌐 aing API 服务启动');
    console.log(`   监听: http://${host}:${PORT}`);
    console.log(`   认证: ${API_KEY ? 'Bearer (AING_API_KEY 已设置)' : '本机信任模式（未设 AING_API_KEY，仅监听 127.0.0.1）'}`);
    console.log(`   端点: /health /api/entities /api/entity/<id> /api/query /api/ingest`);
  });
}

main().catch(e => {
  console.error('API 服务启动失败:', e.message);
  process.exit(1);
});
