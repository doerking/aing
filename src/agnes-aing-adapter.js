#!/usr/bin/env node
/**
 * agnes-aing-adapter.js — Agnes 组件 → aing 知识代谢引擎 适配层
 *
 * 职责：
 * 1. 将 Agnes AIGC（生图/视频）、Slide、Research、Artifacts、Web Search 等组件
 *    产出物自动入库 aing，成为可代谢的知识资产
 * 2. 提供统一的事件协议（ConsciousnessEvent）将 Agnes 活动注册到意识神经
 * 3. 保持 aing 核心环零 LLM 依赖：Agnes 只是可选宿主外壳
 *
 * 用法：
 *   const { AgnesAingAdapter } = require('./src/agnes-aing-adapter');
 *   const adapter = new AgnesAingAdapter({ kbRoot: '/path/to/aing' });
 *
 *   // 图片生成后入库
 *   await adapter.ingestImageGeneration({ prompt: '...', result: { path: '...', url: '...' } });
 *
 *   // 研究完成后入库
 *   await adapter.ingestResearch({ query: '...', results: [...] });
 *
 *   // PPT 生成后入库
 *   await adapter.ingestSlideDeck({ title: '...', path: '...' });
 *
 *   // 注册意识事件
 *   adapter.registerConsciousnessEvent({ channel: 'generic', signalType: 'created', target: 'image' });
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 导入 aing 核心模块
const KnowledgeStore = require('./knowledge-store');
const VectorSearch = require('./vector-search');
const { SessionStore } = require('./auto-ingest');
const { ConsciousnessKernel } = require('./consciousness-kernel');
const { HermesAingAdapter } = require('./hermes-aing-adapter');

/**
 * Agnes 组件适配器
 */
class AgnesAingAdapter {
  constructor(options = {}) {
    this.kbRoot = options.kbRoot || process.env.KB_ROOT || path.resolve(__dirname, '..');
    this.aingAdapter = options.aingAdapter || new HermesAingAdapter({ kbRoot: this.kbRoot });
    this.sessionStore = options.sessionStore || new SessionStore();
    this.consciousnessKernel = options.consciousnessKernel || new ConsciousnessKernel({ baseDir: this.kbRoot });
    this.store = options.store || new KnowledgeStore(path.join(this.kbRoot, 'knowledge.db'));
    this.vectorSearch = options.vectorSearch || new VectorSearch(this.store);
    
    // Agnes 组件状态（懒加载）
    this.agnesComponents = null;
    
    // 元数据
    this.metadata = {
      adapterVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      supportedChannels: ['image', 'video', 'slide', 'research', 'artifact', 'web', 'generic']
    };
  }

  /**
   * 懒加载 Agnes 组件
   */
  async loadAgnesComponents() {
    if (this.agnesComponents) return this.agnesComponents;
    
    try {
      // 尝试加载 Agnes AIGC
      const agnesAigc = require('agnes_aigc');
      const agnesSlide = require('agnes_slide');
      const agnesResearch = require('agnes_research');
      const agnesArtifacts = require('agnes_artifacts');
      const agnesWebSearch = require('agnes_web_search');
      
      this.agnesComponents = {
        aigc: agnesAigc,
        slide: agnesSlide,
        research: agnesResearch,
        artifacts: agnesArtifacts,
        webSearch: agnesWebSearch
      };
      
      console.log('✅ Agnes 组件加载成功');
    } catch (err) {
      console.warn('⚠️  Agnes 组件不可用（非致命，降级为纯 aing 模式）:', err.message);
      this.agnesComponents = null;
    }
    
    return this.agnesComponents;
  }

  /**
   * 图片生成后入库
   */
  async ingestImageGeneration(options = {}) {
    const { prompt, result, sessionId = 'agnes-image' } = options;
    
    const content = `
# 图片生成记录

## 提示词
\`\`\`
${prompt || '无'}
\`\`\`

## 生成结果
- 路径：${result?.path || 'N/A'}
- URL：${result?.url || 'N/A'}
- 尺寸：${result?.size || 'N/A'}
- 比例：${result?.ratio || 'N/A'}

## 元数据
- 生成时间：${new Date().toISOString()}
- 引擎：Agnes AIGC
`;
    
    return this._ingestContent({
      sessionId,
      agentId: 'agnes-aigc',
      content,
      tags: ['image', 'generation', 'agnes'],
      entities: [{ name: prompt?.slice(0, 50) || 'generated-image', type: 'Image' }]
    });
  }

  /**
   * 视频生成后入库
   */
  async ingestVideoGeneration(options = {}) {
    const { prompt, result, sessionId = 'agnes-video' } = options;
    
    const content = `
# 视频生成记录

## 提示词
\`\`\`
${prompt || '无'}
\`\`\`

## 生成结果
- 路径：${result?.path || 'N/A'}
- URL：${result?.url || 'N/A'}
- 时长：${result?.seconds || 'N/A'} 秒
- 尺寸：${result?.size || 'N/A'}
`;
    
    return this._ingestContent({
      sessionId,
      agentId: 'agnes-aigc',
      content,
      tags: ['video', 'generation', 'agnes'],
      entities: [{ name: prompt?.slice(0, 50) || 'generated-video', type: 'Video' }]
    });
  }

  /**
   * 研究结果入库
   */
  async ingestResearch(options = {}) {
    const { query, results, sessionId = 'agnes-research' } = options;
    
    const content = `
# 研究记录：${query || '未指定'}

## 查询
\`\`\`
${query || '无'}
\`\`\`

## 结果摘要
\`\`\`json
${JSON.stringify(results?.slice(0, 5) || [], null, 2)}
\`\`\`

## 来源
- 总数：${results?.length || 0}
- 时间：${new Date().toISOString()}
- 引擎：Agnes Research
`;
    
    return this._ingestContent({
      sessionId,
      agentId: 'agnes-research',
      content,
      tags: ['research', 'query', 'agnes'],
      entities: [{ name: query?.slice(0, 50) || 'research-result', type: 'Research' }]
    });
  }

  /**
   * PPT 生成后入库
   */
  async ingestSlideDeck(options = {}) {
    const { title, path: deckPath, sessionId = 'agnes-slide' } = options;
    
    const content = `
# PPT 生成记录

## 标题
${title || '未指定'}

## 文件
- 路径：${deckPath || 'N/A'}
- 生成时间：${new Date().toISOString()}
- 引擎：Agnes Slide
`;
    
    return this._ingestContent({
      sessionId,
      agentId: 'agnes-slide',
      content,
      tags: ['slide', 'ppt', 'agnes'],
      entities: [{ name: title?.slice(0, 50) || 'slide-deck', type: 'Presentation' }]
    });
  }

  /**
   * 工件（Artifacts）入库
   */
  async ingestArtifact(options = {}) {
    const { artifact, sessionId = 'agnes-artifact' } = options;
    
    const content = `
# 工件记录

## 类型
${artifact?.kind || 'unknown'}

## 路径
${artifact?.path || 'N/A'}

## 元数据
\`\`\`json
${JSON.stringify(artifact, null, 2)}
\`\`\`

## 生成时间
${new Date().toISOString()}
`;
    
    return this._ingestContent({
      sessionId,
      agentId: 'agnes-artifacts',
      content,
      tags: ['artifact', 'generation', 'agnes'],
      entities: [{ name: artifact?.title?.slice(0, 50) || 'artifact', type: 'Artifact' }]
    });
  }

  /**
   * 网络搜索入库
   */
  async ingestWebSearch(options = {}) {
    const { query, results, sessionId = 'agnes-web' } = options;
    
    const content = `
# 网络搜索记录：${query || '未指定'}

## 查询
\`\`\`
${query || '无'}
\`\`\`

## 结果摘要
- 总数：${results?.length || 0}
- 时间：${new Date().toISOString()}
- 引擎：Agnes Web Search

## 来源列表
${results?.slice(0, 5).map(r => `- [${r.title}](${r.url})`).join('\n') || '无'}
`;
    
    return this._ingestContent({
      sessionId,
      agentId: 'agnes-web-search',
      content,
      tags: ['web-search', 'query', 'agnes'],
      entities: [{ name: query?.slice(0, 50) || 'web-search-result', type: 'Search' }]
    });
  }

  /**
   * 统一入库入口
   */
  async _ingestContent(options = {}) {
    const { sessionId, agentId, content, tags = [], entities = [] } = options;
    
    // 1. 生成文件
    const timestamp = Date.now();
    const filename = `${agentId}-${timestamp}.md`;
    const rawPath = path.join(this.kbRoot, 'raw', filename);
    
    // 确保目录存在
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    
    // 写入 Markdown
    const frontmatter = `---
tags: [${tags.join(', ')}]
source: ${agentId}
created: ${new Date().toISOString()}
---

`;
    fs.writeFileSync(rawPath, frontmatter + content, 'utf8');
    
    // 2. 触发入库
    const ingestResult = await this.aingAdapter.ingestSession({
      sessionId,
      agentId,
      messages: [{ role: 'assistant', content: `Agnes 产出入库：${filename}` }]
    });
    
    // 3. 注册意识事件
    this.consciousnessKernel.ingest({
      source: agentId,
      channel: 'generic',
      signalType: 'created',
      target: entities[0]?.name || 'unknown',
      intensity: 0.5,
      confidence: 0.8,
      evidence: { filename, sessionId, tags },
      suggestedAction: 'observe'
    });
    
    return {
      success: true,
      filename,
      rawPath,
      ingestResult,
      timestamp
    };
  }

  /**
   * 注册意识事件
   */
  registerConsciousnessEvent(event) {
    return this.consciousnessKernel.ingest(event);
  }

  /**
   * 获取适配器状态
   */
  getStatus() {
    return {
      ...this.metadata,
      agnesAvailable: Boolean(this.agnesComponents),
      aingConnected: true,
      lastIngest: null
    };
  }

  /**
   * 批量入库
   */
  async batchIngest(items) {
    const results = [];
    for (const item of items) {
      try {
        const result = await this.ingestContent(item);
        results.push({ success: true, ...result });
      } catch (err) {
        results.push({ success: false, error: err.message });
      }
    }
    return results;
  }

  /**
   * 通用入库入口
   */
  async ingestContent(options = {}) {
    const { type, ...rest } = options;
    
    switch (type) {
      case 'image':
        return this.ingestImageGeneration(rest);
      case 'video':
        return this.ingestVideoGeneration(rest);
      case 'research':
        return this.ingestResearch(rest);
      case 'slide':
        return this.ingestSlideDeck(rest);
      case 'artifact':
        return this.ingestArtifact(rest);
      case 'web':
        return this.ingestWebSearch(rest);
      default:
        return this._ingestContent(rest);
    }
  }
}

// CLI 入口
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const adapter = new AgnesAingAdapter();
  
  switch (command) {
    case 'status':
      console.log(JSON.stringify(adapter.getStatus(), null, 2));
      break;
    case 'ingest':
      const payload = args[1] ? JSON.parse(args[1]) : {};
      const result = await adapter.ingestContent(payload);
      console.log(JSON.stringify(result, null, 2));
      break;
    default:
      console.log(`
用法:
  node src/agnes-aing-adapter.js status           # 查看适配器状态
  node src/agnes-aing-adapter.js ingest '<json>'  # 入库内容
`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('❌ Agnes 适配器失败:', err.message);
    process.exit(1);
  });
}

module.exports = { AgnesAingAdapter };
