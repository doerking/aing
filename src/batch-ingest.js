#!/usr/bin/env node
/**
 * batch-ingest.js — 批量导入历史对话到 aing
 * 
 * 用法：
 *   node src/batch-ingest.js <session-file>          # 导入单个会话文件
 *   node src/batch-ingest.js --dir <dir>             # 导入目录下所有 .json 会话文件
 *   node src/batch-ingest.js --stdin                 # 从标准输入读取 JSON
 *   node src/batch-ingest.js --help                  # 显示帮助
 */

const fs = require('fs');
const path = require('path');
const { SessionStore } = require('./auto-ingest');
const { HermesAingAdapter } = require('./hermes-aing-adapter');
const { ConsciousnessKernel } = require('./consciousness-kernel');

const CONFIG = {
  kbRoot: process.env.KB_ROOT || path.resolve(__dirname, '..'),
  minMessageLength: 20,
};

function log(msg, data = '') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${msg}${data ? ' ' + data : ''}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    dir: null,
    stdin: false,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
      case '-f':
        options.file = args[++i];
        break;
      case '--dir':
      case '-d':
        options.dir = args[++i];
        break;
      case '--stdin':
      case '-s':
        options.stdin = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (!args[i].startsWith('-') && !options.file) {
          options.file = args[i];
        }
    }
  }
  
  return options;
}

function printHelp() {
  console.log(`
批量导入历史对话到 aing

用法：
  node src/batch-ingest.js <session-file>    导入单个会话文件（JSON 格式）
  node src/batch-ingest.js --dir <dir>       导入目录下所有 .json 会话文件
  node src/batch-ingest.js --stdin           从标准输入读取 JSON
  node src/batch-ingest.js --help            显示此帮助

会话文件格式：
  {
    "sessionId": "user-session-1",
    "agentId": "hermes",
    "messages": [
      {"role": "user", "content": "你好"},
      {"role": "assistant", "content": "你好！有什么可以帮你的？"}
    ],
    "metadata": {
      "createdAt": "2026-09-08T10:00:00Z",
      "tags": ["greeting", "help"]
    }
  }
`);
}

async function ingestSession(adapter, kernel, sessionData) {
  const { sessionId, agentId = 'batch-import', messages = [], metadata = {} } = sessionData;
  
  if (!sessionId || !Array.isArray(messages) || messages.length === 0) {
    return { success: false, error: '会话数据无效：需要 sessionId 和 messages 数组' };
  }
  
  // 过滤短消息
  const validMessages = messages.filter(m => 
    m && m.content && m.content.length >= CONFIG.minMessageLength
  );
  
  if (validMessages.length === 0) {
    return { success: false, error: '没有有效消息（全部短于 ' + CONFIG.minMessageLength + ' 字符）' };
  }
  
  // 入库
  const ingestResult = await adapter.ingestSession({
    sessionId,
    agentId,
    messages: validMessages,
    completed: true
  });
  
  // 注册意识事件
  kernel.ingest({
    source: 'batch-ingest',
    channel: 'generic',
    signalType: 'imported',
    target: sessionId,
    intensity: 0.6,
    confidence: 0.9,
    evidence: { messageCount: validMessages.length, sessionId },
    suggestedAction: 'observe'
  });
  
  return {
    success: true,
    sessionId,
    messageCount: validMessages.length,
    ingestResult
  };
}

async function processFile(adapter, kernel, filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const sessionData = JSON.parse(content);
    
    log('导入文件:', path.basename(filePath));
    const result = await ingestSession(adapter, kernel, sessionData);
    
    if (result.success) {
      log('✅ 成功', `会话 ${result.sessionId}，${result.messageCount} 条消息`);
    } else {
      log('⚠️  失败', result.error);
    }
    
    return result;
  } catch (err) {
    log('❌ 错误', `${path.basename(filePath)}: ${err.message}`);
    return { success: false, error: err.message, file: filePath };
  }
}

async function processDirectory(adapter, kernel, dirPath) {
  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(dirPath, f));
  
  log(`扫描目录: ${dirPath}，找到 ${files.length} 个会话文件`);
  
  const results = [];
  for (const file of files) {
    const result = await processFile(adapter, kernel, file);
    results.push(result);
  }
  
  return results;
}

async function processStdin(adapter, kernel) {
  return new Promise((resolve, reject) => {
    let data = '';
    
    process.stdin.on('data', chunk => {
      data += chunk.toString();
    });
    
    process.stdin.on('end', async () => {
      try {
        const sessionData = JSON.parse(data);
        const result = await ingestSession(adapter, kernel, sessionData);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
    
    process.stdin.on('error', reject);
  });
}

async function main() {
  const options = parseArgs();
  
  if (options.help) {
    printHelp();
    return;
  }
  
  log('🚀 批量导入工具启动');
  log('知识库路径:', CONFIG.kbRoot);
  
  // 初始化组件
  const adapter = new HermesAingAdapter({ kbRoot: CONFIG.kbRoot });
  const kernel = new ConsciousnessKernel({ baseDir: CONFIG.kbRoot });
  let results = [];
  
  try {
    if (options.stdin) {
      log('从标准输入读取...');
      const result = await processStdin(adapter, kernel);
      results = [result];
    } else if (options.dir) {
      log('批量导入模式:', options.dir);
      results = await processDirectory(adapter, kernel, options.dir);
    } else if (options.file) {
      log('单文件导入模式:', options.file);
      const result = await processFile(adapter, kernel, options.file);
      results = [result];
    } else {
      log('❌ 未指定输入源，使用 --help 查看用法');
      printHelp();
      return;
    }
    
    // 统计
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const totalMessages = results.reduce((sum, r) => sum + (r.messageCount || 0), 0);
    
    log('');
    log('═══════════════════════════════════════');
    log('📊 导入统计');
    log('═══════════════════════════════════════');
    log(`成功: ${successCount} 个会话`);
    log(`失败: ${failCount} 个会话`);
    log(`总消息: ${totalMessages} 条`);
    log('═══════════════════════════════════════');
    
    // 触发代谢
    if (successCount > 0) {
      log('');
      log('💡 建议运行代谢流水线:');
      log('   node src/run-metabolism.js');
      log('   node src/index-vectors.js --semantic --reindex');
    }
    
  } catch (err) {
    log('❌ 导入失败:', err.message);
    process.exit(1);
  }
}

main();
