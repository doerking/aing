# AGENTS.md — Agent 配置

## 双脑架构配置

```yaml
order_brain:
  type: tolaria
  storage: markdown
  version_control: git
  
growth_brain:
  sprouting:
    enabled: true
    threshold: 0.7
  pollination:
    enabled: true
    creative_threshold: 0.85
  compression:
    enabled: true
    inactive_days: 30
  kespi:
    freshness: 0.7
    relevance: 0.7
    originality: 0.6
    consistency: 0.8
    provability: 0.7
```
