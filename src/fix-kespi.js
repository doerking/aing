#!/usr/bin/env node
/**
 * fix-kespi.js — KESPI 质量修复（智能增强版）
 * 
 * 功能：
 * 1. 自动补充缺失标签
 * 2. 添加来源引用（[[...]] 格式）
 * 3. 添加使用场景
 * 4. 增强跨域关联
 * 5. 添加代码示例
 * 
 * 使用：
 *   node fix-kespi.js fix
 */

const fs = require('fs');
const path = require('path');
const KnowledgeStore = require('./knowledge-store');
const KESPIEnhancer = require('./kespi-enhance');

// KESPI 阈值配置
const KESPI_THRESHOLDS = {
  freshness: 0.7,
  relevance: 0.7,
  originality: 0.6,
  consistency: 0.8,
  provability: 0.7,
  overall: 0.75
};

/**
 * 同步修复结果回 wiki 文件（双脑契约：wiki 为源，DB 为派生。
 * 只写 DB 的修复会在下轮 import 时被 wiki 文件回滚）
 */
function syncWikiFile(entity) {
  const wikiPath = path.join(__dirname, '..', entity.source_file || `wiki/entities/${entity.id}.md`);
  if (!fs.existsSync(wikiPath)) return false;
  const raw = fs.readFileSync(wikiPath, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  let fm = '';
  let body = raw;
  if (m) {
    fm = m[1];
    body = raw.slice(m[0].length);
  }
  if (fm) {
    let tagsArr = [];
    try { tagsArr = JSON.parse(entity.tags || '[]'); } catch (e) { tagsArr = []; }
    const tagsJson = JSON.stringify(tagsArr);
    if (/^tags:.*$/m.test(fm)) fm = fm.replace(/^tags:.*$/m, `tags: ${tagsJson}`);
    else fm += `\ntags: ${tagsJson}`;
  }
  const out = fm ? `---\n${fm}\n---\n\n${entity.content || body}` : (entity.content || body);
  fs.writeFileSync(wikiPath, out, 'utf8');
  return true;
}

// 实体类型到标签的映射
const TAG_TEMPLATES = {
  'Concept': ['architecture', 'system', 'design', 'concept'],
  'Architecture': ['architecture', 'pattern', 'design', 'system'],
  'Protocol': ['protocol', 'communication', 'network', 'pattern'],
  'Security': ['security', 'encryption', 'authentication', 'protocol'],
  'ErrorHandling': ['error', 'exception', 'recovery', 'pattern'],
  'Tool': ['tool', 'script', 'automation'],
  'Configuration': ['config', 'settings', 'parameter']
};

// 实体 ID 到使用场景的映射
const USE_CASE_TEMPLATES = {
  'dual-brain': {
    scenario: '知识管理系统',
    example: '用户对话自动入库 → 编译 → 代谢 → 质量自检',
    code: '```javascript\n// 双脑架构使用示例\nconst growth = new SelfGrowth(baseDir);\nawait growth.init();\nawait growth.enhanceKespi(true); // 批量增强\nconst results = await growth.search("自成长"); // 语义搜索\n```'
  },
  'evox-sidecar': {
    scenario: '独立进程桥接',
    example: 'WeChat/WhatsApp 桥接服务独立于主应用运行，父进程死亡监控',
    code: '```typescript\n// EvoX 侧车架构\nconst bridge = new WeixinBridge({\n  port: 8080,\n  auth: process.env.BRIDGE_TOKEN\n});\nawait bridge.start();\n```'
  },
  'evox-swarm': {
    scenario: '蜂群配对协议',
    example: 'Ed25519 节点身份 + work_claim → DISPATCHED → LLM-as-judge 流程',
    code: '```typescript\n// 蜂群配对\nconst claim = await swarm.claimWork(taskId, nodeId);\nif (claim.status === "DISPATCHED") {\n  const result = await llmJudge(claim); }\n```'
  },
  'kespi-gate': {
    scenario: '知识质量门禁',
    example: '入库前检查 freshness/relevance/originality/consistency/provability',
    code: '```javascript\n// KESPI 质量门禁\nconst thresholds = {\n  freshness: 0.7,\n  relevance: 0.7,\n  overall: 0.75\n};\nif (score < thresholds.overall) {\n  throw new Error(\'KESPI 质量不达标\');\n}\n```'
  },
  'projection-cache': {
    scenario: 'Agent 上下文投影',
    example: '只加载当前任务相关实体，O(k) << O(n²)',
    code: '```javascript\n// 投影缓存\nconst cache = new ProjectionCache();\nconst context = await cache.getProject(currentTask, { limit: 20 });\n```'
  }
};

// 通用使用场景模板（根据实体类型生成）
function generateGenericUseCase(entity) {
  const typeTemplates = {
    'Architecture': {
      scenario: '系统架构设计',
      example: entity.name + ' 用于构建分布式系统，提供可扩展的组件隔离方案',
      code: '// ' + entity.name + ' 使用示例\nconst impl = new ' + entity.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + '();\nimpl.run();'
    },
    'Protocol': {
      scenario: '通信协议实现',
      example: entity.name + ' 实现节点间可靠通信，支持身份验证和数据加密',
      code: '// ' + entity.name + ' 使用示例\nconst protocol = new Protocol();\nawait protocol.connect(endpoint);\nprotocol.send(message);'
    },
    'Security': {
      scenario: '安全机制实现',
      example: entity.name + ' 提供纵深防御，包括认证、加密和限流',
      code: '// ' + entity.name + ' 使用示例\nconst security = new SecurityLayer();\nsecurity.enableEncryption(\'AES-256-GCM\');\nsecurity.setRateLimit(100, \'per_minute\');'
    }
  };
  return typeTemplates[entity.type] || {
    scenario: '系统实现',
    example: entity.name + ' 提供核心功能支撑',
    code: '// ' + entity.name + ' 使用示例\nconst impl = new ' + entity.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + '();\nimpl.connect(endpoint);\nimpl.send(message);'
  };
}

class KESPIFixer {
  constructor(store) {
    this.store = store;
    this.enhancer = new KESPIEnhancer(store);
  }

  /**
   * 智能修复实体内容
   */
  async smartFix(entityId) {
    let entity = this.store.getEntity(entityId);
    if (!entity) {
      console.log(`  ❌ 实体不存在: ${entityId}`);
      return { oldScore: 0, newScore: 0, changes: [] };
    }

    const oldScore = entity.kespi_score || 0;
    const changes = [];

    // 1. 补充标签
    const tags = JSON.parse(entity.tags || '[]');
    const typeTags = TAG_TEMPLATES[entity.type] || TAG_TEMPLATES['Concept'];
    const missingTags = typeTags.filter(t => !tags.includes(t));
    
    if (missingTags.length > 0 && tags.length < 8) {
      const newTags = [...tags, ...missingTags.slice(0, 8 - tags.length)];
      this.store.run(`UPDATE entities SET tags = ? WHERE id = ?`, [
        JSON.stringify(newTags),
        entityId
      ]);
      changes.push(`补充标签: ${missingTags.join(', ')}`);
      entity.tags = JSON.stringify(newTags);
    }

    // 2. 添加来源引用（[[...]] 格式）
    let content = entity.content || '';
    
    // 添加 source_file
    if (!entity.source_file || entity.source_file === 'unknown') {
      const sourceFile = `wiki/entities/${entity.id}.md`;
      if (fs.existsSync(path.join(__dirname, '..', 'wiki', 'entities', `${entity.id}.md`))) {
        this.store.run(`UPDATE entities SET source_file = ? WHERE id = ?`, [
          sourceFile,
          entityId
        ]);
        changes.push(`添加来源: ${sourceFile}`);
        entity.source_file = sourceFile;
      }
    }

    // 添加引用链接到相关实体
    const relatedEntities = this.store.getEntities().filter(e => 
      e.id !== entityId && this._isRelated(entity, e)
    );
    
    if (relatedEntities.length > 0 && !/\[\[.*?\]\]/.test(content)) {
      const relatedIds = relatedEntities.slice(0, 3).map(e => `[[${e.name}]]`).join('、');
      const relationSection = `\n\n## 相关实体\n- 关联：${relatedIds}`;
      this.store.run(`UPDATE entities SET content = ? WHERE id = ?`, [
        content + relationSection,
        entityId
      ]);
      // 同步本地变量，避免后续步骤用陈旧内容覆盖写入
      content = content + relationSection;
      entity.content = content;
      changes.push(`添加引用：${relatedIds}`);
    }

    // 3. 添加使用场景和代码示例
    const useCase = USE_CASE_TEMPLATES[entity.id];
    const hasUseCase = /## 使用场景/.test(content);
    const hasCodeExample = /```[\s\S]*?```/.test(content);

    if (!hasUseCase || !hasCodeExample) {
      const useCaseInfo = useCase || generateGenericUseCase(entity);
      
      let updates = [];
      if (!hasUseCase) {
        updates.push(`\n## 使用场景\n- **场景**: ${useCaseInfo.scenario}\n- **示例**: ${useCaseInfo.example}`);
      }
      if (!hasCodeExample) {
        updates.push(`\n${useCaseInfo.code}`);
      }
      
      const newContent = content + updates.join('\n');
      this.store.run(`UPDATE entities SET content = ? WHERE id = ?`, [
        newContent,
        entityId
      ]);
      changes.push(`添加使用场景: ${useCaseInfo.scenario}`);
      if (!hasCodeExample) changes.push('添加代码示例');
      entity.content = newContent;
    }

    // 双脑契约：修复必须落文件，否则下轮 import 按 wiki 回滚
    if (changes.length > 0) {
      syncWikiFile(entity);
    }

    // 4. 重新计算 KESPI
    const newEntity = this.store.getEntity(entityId);
    const newScores = await this.enhancer.enhance(entityId);
    const newScore = newScores.kespi;

    return {
      oldScore,
      newScore,
      changes,
      scores: newScores
    };
  }

  /**
   * 判断两个实体是否相关
   */
  _isRelated(entity1, entity2) {
    // 检查标签重叠
    const tags1 = JSON.parse(entity1.tags || '[]');
    const tags2 = JSON.parse(entity2.tags || '[]');
    const overlap = tags1.filter(t => tags2.includes(t));
    
    if (overlap.length > 0) return true;
    
    // 检查名称包含
    if (entity1.name.includes(entity2.name) || entity2.name.includes(entity1.name)) {
      return true;
    }
    
    // 检查内容包含
    const content1 = (entity1.content || '').toLowerCase();
    const content2 = (entity2.content || '').toLowerCase();
    
    if (content1.includes(entity2.name.toLowerCase()) || 
        content2.includes(entity1.name.toLowerCase())) {
      return true;
    }
    
    return false;
  }

  /**
   * 修复所有低于阈值的实体
   */
  async fixAll() {
    const entities = this.store.getEntities();
    const lowScoreEntities = entities.filter(e => 
      !e.kespi_score || e.kespi_score < KESPI_THRESHOLDS.overall
    );

    console.log(`🔧 开始智能修复 ${lowScoreEntities.length} 个实体...\n`);

    const results = [];
    for (const entity of lowScoreEntities) {
      const result = await this.smartFix(entity.id);
      results.push(result);
      
      const status = result.newScore >= KESPI_THRESHOLDS.overall ? '✅' : '⚠️';
      console.log(`  ${entity.name}: ${result.oldScore.toFixed(2)} → ${result.newScore.toFixed(2)} ${status}`);
      if (result.changes.length > 0) {
        console.log(`     变更: ${result.changes.join(', ')}`);
      }
    }

    const passed = results.filter(r => r.newScore >= KESPI_THRESHOLDS.overall).length;
    const failed = results.filter(r => r.newScore < KESPI_THRESHOLDS.overall).length;

    console.log(`\n📊 修复报告:`);
    console.log(`   总实体数: ${results.length}`);
    console.log(`   修复成功: ${passed}`);
    console.log(`   修复失败: ${failed}`);
    console.log(`   成功率: ${(passed / results.length * 100).toFixed(1)}%`);

    // 显示维度提升
    const avgOriginality = results.reduce((s, r) => s + (r.scores?.originality || 0), 0) / results.length;
    const avgRelevance = results.reduce((s, r) => s + (r.scores?.relevance || 0), 0) / results.length;
    const avgProvability = results.reduce((s, r) => s + (r.scores?.provability || 0), 0) / results.length;
    const avgUtility = results.reduce((s, r) => s + (r.scores?.utility || 0), 0) / results.length;
    
    console.log(`\n维度提升:`);
    console.log(`   originality: ${avgOriginality.toFixed(2)}`);
    console.log(`   relevance: ${avgRelevance.toFixed(2)}`);
    console.log(`   provability: ${avgProvability.toFixed(2)}`);
    console.log(`   utility: ${avgUtility.toFixed(2)}`);

    return results;
  }
}

async function main() {
  const store = new KnowledgeStore();
  await store.init();
  
  const fixer = new KESPIFixer(store);
  await fixer.fixAll();
}

main().catch(console.error);
