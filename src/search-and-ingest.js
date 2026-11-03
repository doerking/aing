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
const { execFileSync } = require('child_process');

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
  
  // 安全修复（Mimosa 命令注入）：execSync shell 拼接 → execFileSync 参数数组，query/limit 独立参数直传
    try {
      const output = execFileSync('node', ['src/query.js', '--', String(query), '--limit', String(limit), '--mode', 'web'], {
        cwd: CONFIG.kbRoot,
        encoding: 'utf8',
        timeout: 30000
      });
    const parsed = parseSearchOutput(output);
    // W11 (2026-11-03)：query.js 没有 --mode web 面（只做本地库检索，输出解析不出 web 条目）。
    // 解析为空 = 无真搜索源。旧实现把这种空壳 / 伪造结果入库 raw/，污染代谢链；
    // 现统一落 fallbackSearch 的「拒伪造」处理（success=false，不入 raw/，exit 非零）。
    if (parsed.length === 0) {
      return fallbackSearch(query, limit);
    }
    return {
      success: true,
      query,
      results: parsed,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    // 如果 query.js 不支持 web 模式 / 调用失败，使用 fallback（拒伪造）
    return fallbackSearch(query, limit);
  }
}

async function fallbackSearch(query, limit) {
  // W11 (2026-11-03)：未接真 web 搜索源。旧实现返回 success=true + 伪造 example.com 结果，
  // main() 会把伪 URL 写入 raw/，污染代谢链（伪结果被 compile 蒸馏成实体）。
  // 现统一报 success=false：只打印说明，绝不入库；--page 面（curl 真读）不受影响。
  // 接真源须由宿主注入 web_search 工具，不在此文件内伪造。
  console.log('⚠️  未接真搜索源：拒绝伪造结果入库（请提供真实 web_search 源后使用 --web 面；--page 面仍可正常读取入库）');
  
  return {
    success: false,
    query,
    results: [],
    simulated: true,
    error: '未接真搜索源',
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
    // 安全修复：shell 管道(curl|head) → execFileSync 参数数组，10KB 截断 JS 侧 slice 等价
      const output = execFileSync('curl', ['-s', '--max-time', '30', '--', url], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
      }).slice(0, 10000);
    
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
      process.exitCode = 1;
    }
  } else {
    // W11 (2026-11-03)：失败面（含「未接真搜索源」拒伪造）须退出非零，唔静默成功
    console.log('\n❌ 搜索失败:', searchResult.error);
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('❌ 搜索入库失败:', err.message);
  process.exit(1);
});

// 既有隐性缺陷（W11 验收面）：原导出引用了从未定义的 searchAndIngest，CLI load 尾必崩。
// 全仓零 require（在库/宿主侧组件），仅修导出名单——只留真实存在的函数，不动逻辑。
module.exports = { searchWeb, readWebpage, ingestToAing };
