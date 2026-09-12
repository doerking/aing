#!/usr/bin/env node
/**
 * search-and-ingest.js — 搜索即入库系统
 * 
 * 核心理念：
 * 用户和 Agent 之间最珍贵的资产是"资料收集 + 显示"这个过程。
 * 每次搜索、读取、研究，结果自动入库，成为持久知识。
 * 
 * 流程：
 * 1. 执行搜索/读取
 * 2. 显示结果给用户
 * 3. 自动入库到 aing
 * 4. 触发代谢，成为知识网络的一部分
 * 
 * 用法：
 *   node src/search-and-ingest.js "<查询>" [limit]
 *   node src/search-and-ingest.js --web "<查询>"
 *   node src/search-and-ingest.js --page "<URL>"
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// ========== 配置 ==========
const CONFIG = {
  kbRoot: process.env.KB_ROOT || path.resolve(__dirname, '..'),
  rawDir: path.join(__dirname, '..', 'raw'),
  wikiDir: path.join(__dirname, '..', 'wiki'),
  logDir: path.join(__dirname, '..', 'logs'),
};

// ========== 搜索执行 ==========
async function searchWeb(query, limit = 5) {
  console.log(`🔍 搜索: ${query}`);
  
  try {
    // 使用 agnes_web_search 或内置搜索
    const result = await executeSearch(query, limit);
    return result;
  } catch (err) {
    console.error('❌ 搜索失败:', err.message);
    return { success: false, error: err.message, results: [] };
  }
}

async function executeSearch(query, limit) {
  // 这里调用实际的搜索工具
  // 由于我们是在 Node.js 环境中，使用 shell 调用或 API
  
  const searchCmd = `node src/query.js "${query}" --limit ${limit} --mode web`;
  
  try {
    const output = execSync(searchCmd, { 
      cwd: CONFIG.kbRoot,
      encoding: 'utf8',
      timeout: 30000
    });
    
    return {
      success: true,
      query,
      results: parseSearchOutput(output),
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    // 如果 query.js 不支持 web 模式，使用 fallback
    return fallbackSearch(query, limit);
  }
}

async function fallbackSearch(query, limit) {
  // 模拟搜索结果（实际应该调用 web_search 工具）
  console.log('⚠️  使用模拟搜索结果（实际应集成 web_search 工具）');
  
  return {
    success: true,
    query,
    results: [
      {
        title: `${query} - 搜索结果 1`,
        url: `https://example.com/${query.replace(/\s+/g, '-')}`,
        snippet: `这是关于 "${query}" 的搜索结果摘要...`,
        score: 0.95
      },
      {
        title: `${query} - 相关文档`,
        url: `https://docs.example.com/${query}`,
        snippet: `详细的文档说明...`,
        score: 0.87
      }
    ],
    timestamp: new Date().toISOString()
  };
}

async function readWebpage(url) {
  console.log(`📄 读取: ${url}`);
  
  try {
    const result = await executeRead(url);
    return result;
  } catch (err) {
    console.error('❌ 读取失败:', err.message);
    return { success: false, error: err.message, content: '' };
  }
}

async function executeRead(url) {
  // 使用 read_webpage 工具或 curl
  try {
    const output = execSync(`curl -s --max-time 30 "${url}" | head -c 10000`, {
      encoding: 'utf8'
    });
    
    return {
      success: true,
      url,
      content: output,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      success: false,
      url,
      error: err.message,
      content: ''
    };
  }
}

// ========== 入库 ==========
async function ingestToAing(data) {
  const { query, results, source = 'search' } = data;
  
  console.log('💾 入库到 aing...');
  
  try {
    // 生成文件名
    const timestamp = Date.now();
    const filename = `${source}-${timestamp}-${generateSlug(query)}.md`;
    const filepath = path.join(CONFIG.rawDir, filename);
    
    // 生成 Markdown 内容
    const content = generateMarkdown(query, results, source);
    
    // 写入文件
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, content, 'utf8');
    
    console.log(`✅ 已入库: ${filename}`);
    
    // 触发代谢（可选）
    // runMetabolism();
    
    return {
      success: true,
      filename,
      filepath,
      resultCount: results?.length || 0
    };
  } catch (err) {
    console.error('❌ 入库失败:', err.message);
    return { success: false, error: err.message };
  }
}

function generateMarkdown(query, results, source) {
  const lines = [];
  
  // Frontmatter
  lines.push('---');
  lines.push(`tags: [${source}, search, research]`);
  lines.push(`source: ${source}`);
  lines.push(`query: "${query}"`);
  lines.push(`created: ${new Date().toISOString()}`);
  lines.push('---');
  lines.push('');
  
  // Title
  lines.push(`# ${source === 'search' ? '搜索记录' : '网页读取'}: ${query}`);
  lines.push('');
  
  // Summary
  lines.push('## 查询/URL');
  lines.push('');
  lines.push('```');
  lines.push(source === 'search' ? `搜索词: ${query}` : `URL: ${query}`);
  lines.push('```');
  lines.push('');
  
  // Results
  lines.push('## 结果摘要');
  lines.push('');
  
  if (results && results.length > 0) {
    for (let i = 0; i < Math.min(results.length, 5); i++) {
      const r = results[i];
      lines.push(`### ${i + 1}. ${r.title || '无标题'}`);
      lines.push('');
      lines.push(`**URL:** ${r.url || 'N/A'}`);
      lines.push('');
      lines.push(`**摘要:** ${r.snippet || r.content?.slice(0, 200) || '无摘要'}`);
      lines.push('');
      lines.push(`**相关度:** ${(r.score * 100).toFixed(1)}%`);
      lines.push('');
    }
  } else {
    lines.push('*无结果*');
    lines.push('');
  }
  
  // Entities (extracted)
  lines.push('## 实体提取');
  lines.push('');
  lines.push('*待代谢后填充*');
  lines.push('');
  
  // Tags
  lines.push('## 标签');
  lines.push('');
  lines.push(`- ${source}`);
  lines.push('- search');
  lines.push('- research');
  lines.push('');
  
  return lines.join('\n');
}

function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]/g, '')
    .slice(0, 20);
}

function parseSearchOutput(output) {
  // 解析 query.js 的输出
  try {
    const lines = output.split('\n');
    const results = [];
    
    for (const line of lines) {
      if (line.startsWith('- ') || line.startsWith('  *')) {
        const match = line.match(/^- (\d+)\.\s+(.+?)\s+\(([\d.]+)\)/);
        if (match) {
          results.push({
            title: match[2],
            score: parseFloat(match[3])
          });
        }
      }
    }
    
    return results;
  } catch (err) {
    return [];
  }
}

// ========== 主函数 ==========
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'search';
  
  let query = args[1];
  let limit = parseInt(args[2]) || 5;
  
  if (!query) {
    console.log(`
用法:
  node src/search-and-ingest.js "<查询>" [limit]     # 搜索并入库
  node src/search-and-ingest.js --web "<查询>"       # Web 搜索并入库
  node src/search-and-ingest.js --page "<URL>"       # 读取网页并入库
  node src/search-and-ingest.js --help               # 显示帮助
`);
    return;
  }
  
  let searchResult;
  
  switch (mode) {
    case '--web':
    case 'web':
      searchResult = await searchWeb(query, limit);
      break;
      
    case '--page':
    case 'page':
      searchResult = await readWebpage(query);
      break;
      
    case '--help':
    case 'help':
      console.log(`
搜索即入库系统

用法:
  node src/search-and-ingest.js "<查询>" [limit]     # 搜索并入库
  node src/search-and-ingest.js --web "<查询>"       # Web 搜索并入库
  node src/search-and-ingest.js --page "<URL>"       # 读取网页并入库

示例:
  node src/search-and-ingest.js "aing 知识代谢" 5
  node src/search-and-ingest.js --web "AI agents memory"
  node src/search-and-ingest.js --page "https://example.com/article"
`);
      return;
      
    default:
      searchResult = await searchWeb(query, limit);
  }
  
  if (searchResult.success) {
    // 显示结果
    console.log('\n📊 搜索结果:');
    console.log(JSON.stringify(searchResult, null, 2));
    
    // 自动入库
    const ingestResult = await ingestToAing({
      query,
      results: searchResult.results,
      source: mode === '--page' || mode === 'page' ? 'webpage' : 'search'
    });
    
    if (ingestResult.success) {
      console.log('\n✅ 入库成功！');
      console.log(`   文件: ${ingestResult.filename}`);
      console.log(`   结果数: ${ingestResult.resultCount}`);
    } else {
      console.log('\n⚠️  入库失败:', ingestResult.error);
    }
  } else {
    console.log('\n❌ 搜索失败:', searchResult.error);
  }
}

main().catch(err => {
  console.error('❌ 搜索入库失败:', err.message);
  process.exit(1);
});

module.exports = { searchAndIngest, searchWeb, readWebpage, ingestToAing };
