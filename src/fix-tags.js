#!/usr/bin/env node
/**
 * fix-tags.js — 批量修复实体标签
 * 
 * 功能：
 * 1. 为 auto-tagged 实体添加正确的关键词标签
 * 2. 根据实体类型和标题智能生成标签
 * 3. 添加代码示例和使用场景
 * 
 * 使用：
 *   node fix-tags.js
 */

const fs = require('fs');
const path = require('path');

// 标签模板映射
const TAG_TEMPLATES = {
  'dual-brain': ['dual-brain', 'architecture', 'knowledge-system'],
  'dual-brain-koreai-production': ['dual-brain', 'architecture', 'production', 'kore-ai', 'shared-spine'],
  'dual-brain-brain-inspired-paper': ['dual-brain', 'research', 'brain-inspired', 'neuroscience'],
  'dual-brain-cognitive-architecture-history': ['dual-brain', 'history', 'cognitive', 'research'],
  'consciousness-layer-pomdp-architecture': ['consciousness', 'pomdp', 'agent', 'architecture'],
  'consciousness-layer-embodied-perception': ['consciousness', 'embodied', 'perception', 'multimodal'],
  'consciousness-layer-neuromorphic-consciousness': ['consciousness', 'neuromorphic', 'hardware', 'consciousness'],
  'consciousness-layer-conductor-model': ['consciousness', 'conductor', 'integrated-information', 'theory'],
  'moahier-architecture': ['moahier', 'swarm', 'agent', 'orchestration', 'architecture'],
  'moahier-swarm-tri-path': ['moahier', 'swarm', 'tri-path', 'orchestration', 'agent'],
  'evox-sidecar-architecture': ['evox', 'sidecar', 'architecture', 'wechat', 'whatsapp'],
  'evox-swarm-pairing': ['evox', 'swarm', 'pairing', 'identity'],
  'evox-zero-dependency': ['evox', 'zero-dependency', 'portable', 'deployment'],
  'evox-security-architecture': ['evox', 'security', 'aes-256', 'encryption'],
  'evox-deep-architecture': ['evox', 'architecture', 'analysis'],
  'evox-pairing-budget': ['evox', 'pairing', 'budget', 'rate-limit'],
  'evox-supervision-watchdog': ['evox', 'supervision', 'watchdog', 'process'],
  'knowledge-graph-representation-learning': ['knowledge-graph', 'embedding', 'representation', 'learning'],
  'knowledge-metabolism-compression-pruning': ['knowledge-metabolism', 'compression', 'pruning', 'optimization'],
  'knowledge-metabolism-sprout-domain-adaptation': ['knowledge-metabolism', 'sprout', 'domain-adaptation'],
  'kespi-check-engine': ['kespi', 'quality', 'check', 'validation'],
  'kespi-diagnostic': ['kespi', 'diagnostic', 'quality-assessment'],
  'kespi-thresholds': ['kespi', 'thresholds', 'configuration'],
  'quality-gates': ['quality-gates', 'validation', 'gate'],
  'sharding': ['sharding', 'concurrency', 'agent', 'locking'],
  'projecache': ['projecache', 'caching', 'performance', 'optimization'],
  'architecture-production-readiness': ['architecture', 'production', 'readiness', 'assessment'],
  'auto-ingest-config': ['auto-ingest', 'configuration', 'ingestion'],
  'aes-encryption': ['aes', 'encryption', 'security'],
  'design-patterns-summary': ['design-patterns', 'summary', 'collection'],
  'error-codes': ['error-codes', 'handing', 'classification'],
  'consciousness-layer': ['consciousness', 'layer', 'awareness']
};

// 使用场景模板
const USE_CASE_TEMPLATES = {
  'dual-brain': {
    scenario: '知识管理系统',
    example: '用户对话自动入库 → 编译 → 代谢 → 质量自检',
    code: '```javascript\n// 双脑架构使用示例\nconst growth = new SelfGrowth(baseDir);\nawait growth.init();\nawait growth.enhanceKespi(true);\nconst results = await growth.search("自成长");\n```'
  },
  'dual-brain-koreai-production': {
    scenario: '生产级 Agent 架构',
    example: 'Kore.ai 生产环境，需要高可靠性和审计追踪',
    code: '```javascript\n// Kore.ai Shared Spine 模式\nconst sharedSpine = new SharedSpine({\n  agentBlueprint: ABL,\n  validation: { threshold: 0.65 },\n  audit: true\n});\nawait sharedSpine.compile();\n```'
  },
  'consciousness-layer-pomdp-architecture': {
    scenario: 'Agentic AI 系统',
    example: '基于 POMDP 的控制循环实现',
    code: '```python\n# POMDP 控制循环\nclass POMDPController:\n    def observe(self): -> Observation\n    def update_belief(self) -> Belief\n    def select_action(self) -> Action\n    def execute(self) -> Transition\n```'
  },
  'moahier-architecture': {
    scenario: '多 Agent 协作系统',
    example: '三路突击 + 队正裁决',
    code: '```python\n# MoA-Hier 蜂群协作\nstate_store = StateStore()\ntri_path = TriPathOrchestrator()\nresult = await tri_path.execute("任务描述")\n```'
  },
  'moahier-swarm-tri-path': {
    scenario: '复杂任务分解',
    example: '探索-验证-优化三路并行',
    code: '```javascript\n// 三路突击编排\nconst tri = new TriPathOrchestrator();\nconst result = await tri.execute({\n  description: "知识质量评审",\n  paths: ["explore", "verify", "optimize"]\n});\n```'
  },
  'evox-sidecar-architecture': {
    scenario: '独立进程桥接',
    example: 'WeChat/WhatsApp 桥接独立进程',
    code: '```javascript\n// EvoX 侧车架构\nconst bridge = new WeixinBridge({\n  loopback: true,\n  auth: "bearer-token"\n});\nawait bridge.start();\n```'
  },
  'kespi-check-engine': {
    scenario: '知识质量门禁',
    example: '入库前检查 freshness/relevance/originality/consistency/provability',
    code: '```javascript\n// KESPI 自检\nconst checker = new KESPIChecker();\nconst result = checker.check("dual-brain");\nif (result.light === "🔴") {\n  await checker.enhance("dual-brain");\n}\n```'
  },
  'knowledge-metabolism-compression-pruning': {
    scenario: '知识库压缩优化',
    example: '剪枝、量化、蒸馏整合流程',
    code: '```python\n# 整合压缩流水线\nclass CompressionPipeline:\n    def prune(self, threshold=0.1):\n        # 结构化剪枝\n        pass\n    def quantize(self, bits=8):\n        # 量化\n        pass\n    def distill(self, teacher_model):\n        # 知识蒸馏\n        pass\n```'
  }
};

function generateGenericUseCase(entity) {
  const typeTemplates = {
    'Architecture': {
      scenario: '系统架构设计',
      example: entity.name + ' 提供整体架构指导，支持扩展和维护',
      code: '// ' + entity.name + ' 架构示例\nconst config = {\n  architecture: "' + entity.name + '",\n  components: ["core", "plugin", "interface"]\n};\nconst system = new Architecture(config);\n```'
    },
    'Protocol': {
      scenario: '通信协议实现',
      example: entity.name + ' 实现节点间可靠通信，支持身份验证和数据加密',
      code: '// ' + entity.name + ' 协议示例\nconst protocol = new Protocol();\nawait protocol.connect(endpoint);\nprotocol.send(message);\n```'
    },
    'Security': {
      scenario: '安全机制实现',
      example: entity.name + ' 提供纵深防御，包括认证、加密和限流',
      code: '// ' + entity.name + ' 安全示例\nconst security = new SecurityLayer();\nsecurity.enableEncryption("AES-256-GCM");\nsecurity.setRateLimit(100, "per_minute");\n```'
    },
    'Tool': {
      scenario: '工具脚本实现',
      example: entity.name + ' 提供自动化处理能力',
      code: '// ' + entity.name + ' 工具示例\nconst tool = new Tool();\nawait tool.initialize();\nconst result = await tool.execute(params);\n```'
    },
    'Configuration': {
      scenario: '系统配置管理',
      example: entity.name + ' 管理系统参数和阈值配置',
      code: '// ' + entity.name + ' 配置示例\nconst config = new Config({\n  threshold: 0.75,\n  enabled: true\n});\nconfig.load();\n```'
    }
  };
  return typeTemplates[entity.type] || {
    scenario: '系统实现',
    example: entity.name + ' 提供核心功能支撑',
    code: '// ' + entity.name + ' 使用示例\nconst impl = new ' + entity.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + '();\nimpl.connect(endpoint);\nimpl.send(message);\n```'
  };
}

function fixTags() {
  const entitiesDir = path.join(__dirname, '..', 'wiki', 'entities');
  const rawDir = path.join(__dirname, '..', 'raw');
  
  if (!fs.existsSync(entitiesDir)) {
    console.log('❌ wiki/entities/ 目录不存在');
    return;
  }
  
  const files = fs.readdirSync(entitiesDir).filter(f => f.endsWith('.md'));
  console.log(`🔧 开始修复 ${files.length} 个实体的标签...\n`);
  
  let fixed = 0;
  let skipped = 0;
  
  for (const file of files) {
    const filePath = path.join(entitiesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 检查是否需要修复（是否有 auto-tagged）
    if (!content.includes('"auto-tagged"')) {
      skipped++;
      continue;
    }
    
    // 提取实体 ID
    const idMatch = content.match(/id:\s*([^\n]+)/);
    const entityId = idMatch ? idMatch[1].trim() : null;
    
    // 获取标签模板
    const tags = TAG_TEMPLATES[entityId] || 
                 TAG_TEMPLATES[file.replace('.md', '')] ||
                 ['concept', 'architecture'];
    
    // 生成使用场景
    const useCase = USE_CASE_TEMPLATES[entityId] || 
                    USE_CASE_TEMPLATES[file.replace('.md', '')] ||
                    generateGenericUseCase({ name: entityId, type: 'Concept' });
    
    // 修复标签
    let newContent = content.replace(/tags:\s*\["auto-tagged"\]/, `tags: [${tags.map(t => `"${t}"`).join(', ')}]`);
    
    // 添加使用场景（如果不存在）
    if (!newContent.includes('## 使用场景')) {
      newContent = newContent.replace(/## KESPI 状态/, `## 使用场景\n- **场景**: ${useCase.scenario}\n- **示例**: ${useCase.example}\n\n${useCase.code}\n\n## KESPI 状态`);
    }
    
    // 保存
    fs.writeFileSync(filePath, newContent, 'utf8');
    fixed++;
    
    console.log(`  ✅ ${file}: ${tags.length} 个标签`);
  }
  
  console.log(`\n📊 修复报告:`);
  console.log(`   修复: ${fixed}`);
  console.log(`   跳过: ${skipped}`);
  console.log(`   总计: ${files.length}`);
}

fixTags();
