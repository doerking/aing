/**
 * growth.config.example.js — KESPI 阈值配置示例（CommonJS 版本）
 *
 * 实际配置文件：growth.config.js（位于 scripts/ 目录）
 * 本文件仅作为参考，展示配置结构。
 *
 * 注意：实际代码只使用 kespi 和 jiezi 两个配置段。
 * 没有 paths / ai / pruning / performance 段。
 */

const config = {
  kespi: {
    // 综合分阈值
    greenLight: 0.80,      // 🟢 绿灯：系统自动运行
    yellowLight: 0.65,     // 🟡 黄灯：生成优化任务
    redLight: 0.00,        // 🔴 红灯：人工干预（底层保底）

    // 八维权重（加起来 = 1.0）
    weights: {
      KQ: 0.15,  // 质量：confidence、逻辑一致性
      KG: 0.12,  // 生长：周环比增长率
      KA: 0.13,  // 资产化：移植就绪度
      KM: 0.12,  // 代谢：过期清理率
      KD: 0.13,  // 密度：链接完整度
      KC: 0.10,  // 检索：命中率
      KR: 0.15,  // 回答：准确率
      KB: 0.10   // 阻断：安全事件数
    },

    // 八维单项阈值（系统自己看）
    dimensions: {
      KQ: { yellow: 0.70, red: 0.00, action: 'verify_conflict' },
      KG: { yellow: 0.05, red: 0.00, action: 'pollinate_orphan' },
      KA: { yellow: 0.60, red: 0.00, action: 'transplant_remind' },
      KM: { yellow: 0.60, red: 0.75, action: 'regenerate_expired' },
      KD: { yellow: 0.20, red: 0.00, action: 'link_suggest' },
      KC: { yellow: 0.70, red: 0.00, action: 'optimize_index' },
      KR: { yellow: 0.85, red: 0.00, action: 'fine_tune' },
      KB: { yellow: 0.00, red: 1, action: 'freeze_writes' }
    }
  },

  jiezi: {
    transplantThreshold: 0.75,   // 芥子亮绿灯的移植就绪度
    initialTransplantReadiness: 0.3,
    maxRegenCount: 3
  }
};

module.exports = config;
