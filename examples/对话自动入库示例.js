#!/usr/bin/env node
/**
 * 对话自动入库示例
 * 
 * 演示如何将 Agent 对话自动入库到 aing 知识库
 */

const { AgentAutoIngest } = require('../src/agent-auto-ingest');
const { 对话监听器 } = require('../src/对话自动入库');

// ========== 示例 1: 基本使用 ==========
console.log('=== 示例 1: 基本入库 ===\n');

const ingest = new AgentAutoIngest({
  agentId: 'hermes',
  minMessageLength: 10,
  batchIntervalMs: 2000,
});

// 模拟对话
const 对话 = [
  { role: 'user', content: '今天天气怎么样？' },
  { role: 'assistant', content: '根据最新气象数据，今天晴天，气温 25-30 度，适合户外活动。' },
  { role: 'user', content: '有什么推荐的活动吗？' },
  { role: 'assistant', content: '推荐去公园散步、骑自行车或者野餐。[[公园]] 是一个好选择，天气晴好，空气清新。' },
];

console.log('📝 模拟对话入库：');
for (const 消息 of 对话) {
  const 结果 = ingest.入库(消息);
  console.log(`   ${消息.role}: ${消息.content.slice(0, 30)}...`);
}

console.log('\n📊 会话统计：');
console.log(JSON.stringify(ingest.获取统计(), null, 2));

// ========== 示例 2: 持续监听模式 ==========
console.log('\n=== 示例 2: 持续监听模式 ===\n');

const 监听器 = new 对话监听器();
监听器.开始监听('demo-agent');

// 模拟对话流（实际应从 Agent 事件流获取）
setInterval(() => {
  const 模拟消息 = {
    sessionId: 'demo-session',
    role: 'user',
    content: `这是第 ${Date.now()} 轮对话测试消息，用于验证自动入库功能是否正常工作。`,
  };
  
  监听器.处理消息(JSON.stringify(模拟消息));
}, 3000);

console.log('📡 监听器已启动，每 3 秒发送一条测试消息');
console.log('按 Ctrl+C 停止监听');

// 优雅退出
process.on('SIGINT', () => {
  监听器.停止();
  console.log('\n🛑 已停止监听');
  process.exit(0);
});
