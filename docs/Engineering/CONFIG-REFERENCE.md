# Config Reference / 配置参考

> Actual config file: `src/growth.config.js` (CommonJS).
> Example file: `growth.config.example.js` (reference only).
>
> **The actual config only has two sections: `kespi` and `jiezi`.**
> There are NO `paths`, `ai`, `pruning`, or `performance` sections in the real config.

## 1. kespi

KESPI self-check configuration.

### Overall Thresholds

| Field | Default | Description |
|---|---|---|
| `greenLight` | 0.80 | 🟢 Green: system runs automatically |
| `yellowLight` | 0.65 | 🟡 Yellow: generate optimization tasks |
| `redLight` | 0.00 | 🔴 Red: manual intervention (floor) |

### 8-Dimensional Weights

| Code | Name | Weight | Description |
|---|---|---|---|
| KQ | Quality / 质量 | 0.15 | confidence, logical consistency |
| KG | Growth / 生长 | 0.12 | week-over-week growth rate |
| KA | Assetization / 资产化 | 0.13 | transplant readiness |
| KM | Metabolism / 代谢 | 0.12 | expiry cleanup rate |
| KD | Density / 密度 | 0.13 | link completeness |
| KC | Retrieval / 检索 | 0.10 | hit rate |
| KR | Response / 回答 | 0.15 | accuracy |
| KB | Block / 阻断 | 0.10 | security event count |

Weights sum to 1.0.

### 8-Dimensional Thresholds

| Code | Yellow | Red | Action |
|---|---|---|---|
| KQ | < 0.70 | = 0.00 | verify_conflict |
| KG | < 0.05 | = 0.00 | pollinate_orphan |
| KA | < 0.60 | = 0.00 | transplant_remind |
| KM | 0.60–0.74 | ≥ 0.75 | regenerate_expired |
| KD | > 0.20 | = 0.00 | link_suggest |
| KC | < 0.70 | = 0.00 | optimize_index |
| KR | < 0.85 | = 0.00 | fine_tune |
| KB | = 0.00 | ≥ 1 | freeze_writes |

## 2. jiezi

Mustard seed configuration.

| Field | Default | Description |
|---|---|---|
| `transplantThreshold` | 0.75 | Readiness threshold for mustard seed revival |
| `initialTransplantReadiness` | 0.3 | Initial readiness when a link becomes a mustard seed |
| `maxRegenCount` | 3 | Maximum regeneration attempts before permanent pruning |

## 3. What Does NOT Exist in Config

The following sections are described in older docs but **do not exist** in `growth.config.js`:

- `paths` (tolariaRoot, wikiDir, sqliteFile)
- `ai` (activeEngine, local, cloud, taskForceRules)
- `pruning` (inactiveDays, protectedMinConfidence)
- `performance` (queryLimit, taskRateLimitPerHour, vectorEnabled, fts5Enabled)
- `jiezi.cooldownRules`
- `jiezi.maxTokens`

## 4. How to Change Config

Edit `src/growth.config.js` directly. There is **no hot-reload** — restart the script to apply changes.

```javascript
// src/growth.config.js
const config = {
  kespi: {
    greenLight: 0.80,
    yellowLight: 0.65,
    redLight: 0.00,
    weights: { /* ... */ },
    dimensions: { /* ... */ }
  },
  jiezi: {
    transplantThreshold: 0.75,
    initialTransplantReadiness: 0.3,
    maxRegenCount: 3
  }
};

module.exports = config;
```
