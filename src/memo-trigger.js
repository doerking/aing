#!/usr/bin/env node
/**
 * memo-trigger.js — 备忘录触发监听器
 * 
 * 功能：
 * 1. 监听对话中的"备忘录"关键词
 * 2. 自动触发识态加载
 * 3. 返回当前系统状态
 * 
 * 用法：
 *   node src/memo-trigger.js '<消息内容>'    # 检查消息是否包含备忘录
 *   node src/memo-trigger.js --listen        # 持续监听 stdin
 */

const path = require('path');

// 导入备忘录系统
const { collectStatus } = require('./memo-call');

// 备忘录关键词（支持中英文）
const MEMO_KEYWORDS = [
  '备忘录',
  'memo',
  'memorandum',
  '识态',
  '状态',
  'briefing',
  'brief'
];

/**
 * 检查消息是否包含备忘录关键词
 */
function isMemoTrigger(message) {
  if (!message || typeof message !== 'string') return false;
  
  const lowerMessage = message.toLowerCase();
  return MEMO_KEYWORDS.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
}

/**
 * 生成备忘录响应
 */
async function generateMemoResponse(message) {
  const response = {
    triggered: true,
    keyword: detectKeyword(message),
    status: null,
    suggestion: null
  };
  
  try {
    // 收集当前状态
    const modules = require('./memo-call').loadModules();
    response.status = await collectStatus(modules);
    
    // 生成建议
    response.suggestion = generateSuggestion(response.status);
    
  } catch (err) {
    response.error = err.message;
  }
  
  return response;
}

/**
 * 检测触发的关键词
 */
function detectKeyword(message) {
  for (const keyword of MEMO_KEYWORDS) {
    if (message.toLowerCase().includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  return null;
}

/**
 * 生成建议
 */
function generateSuggestion(status) {
  const suggestions = [];
  
  // 基于 KESPI 分数
  if (status.knowledge.kespi < 0.7) {
    suggestions.push({
      type: 'warning',
      message: 'KESPI 分数较低，建议触发代谢流水线'
    });
  }
  
  // 基于意识状态
  if (status.consciousness.state === 'aroused') {
    suggestions.push({
      type: 'info',
      message: '意识神经处于唤醒状态，建议查看简报'
    });
  }
  
  // 基于生长决策
  if (status.growth.action !== 'observe') {
    suggestions.push({
      type: 'action',
      message: `生长决策器建议执行: ${status.growth.action}`
    });
  }
  
  // 基于风险
  if (status.risks.length > 0) {
    suggestions.push({
      type: 'risk',
      message: `检测到 ${status.risks.length} 项风险，需要关注`
    });
  }
  
  return suggestions.length > 0 ? suggestions : null;
}

/**
 * 格式化响应
 */
function formatResponse(response) {
  if (!response.triggered) {
    return null;
  }
  
  let output = `
🧠 备忘录已触发（关键词：${response.keyword}）
`;
  
  if (response.status) {
    output += `
📊 当前识态：
   知识实体：${response.status.knowledge.entities || 0}
   KESPI 均分：${(response.status.knowledge.kespi || 0).toFixed(2)}
   意识状态：${response.status.consciousness.state || 'unknown'}
   生长决策：${response.status.growth.action || 'observe'}
`;
  }
  
  if (response.suggestion) {
    output += `
💡 建议：
`;
    for (const s of response.suggestion) {
      const icon = s.type === 'warning' ? '⚠️' : s.type === 'action' ? '🚀' : '📌';
      output += `   ${icon} ${s.message}\n`;
    }
  }
  
  if (response.error) {
    output += `
❌ 错误：${response.error}
`;
  }
  
  return output;
}

// ========== CLI 入口 ==========
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--listen') {
    console.log('👂 备忘录监听器已启动（监听 stdin）...');
    console.log('输入 "备忘录" 或 "memo" 触发识态加载\n');
    
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (chunk) => {
      const message = chunk.toString().trim();
      if (isMemoTrigger(message)) {
        const response = await generateMemoResponse(message);
        console.log(formatResponse(response));
      }
    });
  } else {
    // 单次检查模式
    const message = args.join(' ');
    if (!message) {
      console.log('用法: node src/memo-trigger.js "<消息内容>"');
      console.log('      node src/memo-trigger.js --listen');
      return;
    }
    
    if (isMemoTrigger(message)) {
      const response = await generateMemoResponse(message);
      console.log(formatResponse(response));
    } else {
      console.log('未检测到备忘录关键词，跳过识态加载。');
    }
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 备忘录触发器失败:', err.message);
    process.exit(1);
  });
}

module.exports = { isMemoTrigger, generateMemoResponse, formatResponse };
