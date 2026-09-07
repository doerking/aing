# Core Interfaces / 核心接口

> aing is a collection of standalone Node.js scripts. There is no shared interface like `IGrowthEngine`.
> Each script is a self-contained CLI tool. This document describes the actual module exports.

## 1. KnowledgeStore (knowledge-store.js)

```javascript
class KnowledgeStore {
  constructor(dbPath)
  async init()
  _initTables()
  _save()
  run(sql, params)
  get(sql, params)
  all(sql, params)
  exec(sql, params)
  saveEntity(entity)
  getEntity(id)
  getEntities(filters)
  saveLink(sourceId, targetId, relation, confidence)
  getLinks(entityId)
  saveKespiScore(entityId, scores)
  logError(error)
  getPendingErrors(limit)
  resolveError(errorId)
  saveEmbedding(entityId, embedding)
  getEmbedding(entityId)
  getStats()
  close()
}
```

## 2. VectorSearch (vector-search.js)

```javascript
// 64-dim char n-gram hash vector search
function hash(text)          // returns 64-dim hash vector
function cosineSimilarity(a, b)  // returns similarity score
function getStatus()         // returns { model: 'char-ngram-hash-64' }
```

## 3. KESPIEnhancer (kespi-enhance.js)

```javascript
// 5-dim KESPI enhancement
function enhanceKESPI(entity)  // returns { originality, relevance, consistency, provability, utility }
```

## 4. ErrorHandler (error-handler.js)

```javascript
// Error code action table
function handleError(error)  // maps error codes to actions
```

## 5. SelfGrowth (self-growth.js)

```javascript
// Integrates KnowledgeStore + KESPIEnhancer + ErrorHandler + VectorSearch
class SelfGrowth {
  constructor()
  // growth methods
}
```

## 6. SensoryEndings (sensory-ends.js)

```javascript
// File system polling (5s interval)
function pollDirectory()  // detects new/modified .md files
```

## 7. NeuralGuideChain (neural-guide-chain.js)

```javascript
// Attention scoring
function calculateAttention(entity)  // vitality×0.3 + recency×0.25 + connectionDensity×0.2 + anomaly×0.15 + userInterest×0.1
```

## 8. ConsciousnessLayer (consciousness-layer.js)

```javascript
// Briefing generation
function generateBriefing(entities)  // returns { hotspots, alerts, recommendations }
```

## 9. MetacognitionLayer (metacognition-layer.js)

```javascript
// Three-layer self-reflection
function selfCheck(reasoning)
function evaluate(output)
function adjust(approach)
```

## 10. TriPathOrchestrator (tri-path-orchestrator.js)

```javascript
// Three paths with circuit breaker
class TriPathOrchestrator {
  runPath(path)  // EXPLORE / VERIFY / OPTIMIZE
  // circuit breaker: failureThreshold=5, resetTimeout=60000ms, halfOpenMax=3
}
```

## 11. KESPI Check (kespi-check.js)

```javascript
function calculateKespiScore(entity)  // 8-dim weighted scoring
function getLightStatus(score)        // 🟢 ≥0.80, 🟡 ≥0.65, 🔴 <0.65
function checkDimensionThresholds(dimensions)  // per-dimension triggers
function checkKespi(entity)
function batchCheck(entities)
function displayCheckResult(result)
function displayAllResults(results)
```

## What Does NOT Exist

The following interfaces are described in older docs but **do not exist in code**:

- `IGrowthEngine` interface
- `HybridGrowthEngine` with multi-model routing
- `TaskType` enum
- `PrivacyLevel` enum
- `GrowthTaskContext` interface
- `Jiezi CRUD` methods (createJiezi, getPendingJiezi, updateJieziReadiness, etc.)
- `Shared Graph API` (Express routes)
- `TraceContext` interface
- `createKnowledgeAPI()` function
