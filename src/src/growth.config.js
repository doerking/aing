/**
 * growth.config.js — KESPI 阈值配置（CommonJS 版本）
 * 
 * 所有阈值集中在此文件，方便调整
 * 
 * 修复记录：
 *   v2: 统一八维方向后，阈值也统一为"越高越好"逻辑
 *       yellow = 黄灯阈值（低于此值=警告）
 *       red = 红灯阈值（低于此值=严重）
 */

const config = {
  kespi: {
    // 综合分阈值（普通用户只看这两个）
    greenLight: 0.80,      // 🟢 绿灯：系统自动运行
    yellowLight: 0.65,     // 🟡 黄灯：生成优化任务
    redLight: 0.50,        // 🔴 红灯：人工干预
    
    // 八维权重（加起来 = 1.0）
    weights: {
      KQ: 0.15,  // 质量：confidence、逻辑一致性
      KG: 0.12,  // 生长：时效性
      KA: 0.13,  // 资产化：移植就绪度
      KM: 0.12,  // 代谢：活跃度
      KD: 0.13,  // 密度：链接完整度（已修复为越高越好）
      KC: 0.10,  // 检索：向量索引命中率
      KR: 0.15,  // 回答：内容完整度
      KB: 0.10   // 阻断：无事件=高（已修复为越高越好）
    },
    
    // 八维单项阈值（统一为"越高越好"）
    // yellow = 低于此值触发黄灯警告
    // red = 低于此值触发红灯严重
    dimensions: {
      KQ: {
        yellow: 0.70,
        red: 0.50,
        action: 'verify_conflict'
      },
      KG: {
        yellow: 0.60,
        red: 0.40,
        action: 'pollinate_orphan'
      },
      KA: {
        yellow: 0.60,
        red: 0.40,
        action: 'transplant_remind'
      },
      KM: {
        yellow: 0.60,
        red: 0.40,
        action: 'regenerate_expired'
      },
      KD: {
        yellow: 0.50,
        red: 0.30,
        action: 'link_suggest'
      },
      KC: {
        yellow: 0.70,
        red: 0.50,
        action: 'optimize_index'
      },
      KR: {
        yellow: 0.65,
        red: 0.40,
        action: 'fine_tune'
      },
      KB: {
        yellow: 0.70,
        red: 0.40,
        action: 'freeze_writes'
      }
    }
  },
  
  jiezi: {
    transplantThreshold: 0.75,   // 芥子亮绿灯的移植就绪度
    initialTransplantReadiness: 0.3,
    maxRegenCount: 3
  }
};

// 环境变量数值读取（未设置或非法时用默认值）—— 阈值运行时可覆盖的唯一入口
function envNum(key, def) {
  const v = process.env[key];
  if (v == null || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// 三路突击阈值（tri-path-orchestrator 唯一读取处）
config.triPath = {
  exploreAgree:  envNum('TRI_PATH_TH_EXPLORE',  0.5),
  verifyAgree:   envNum('TRI_PATH_TH_VERIFY',   0.7),
  optimizeAgree: envNum('TRI_PATH_TH_OPTIMIZE', 0.7),
  verifyLink:    envNum('TRI_PATH_TH_LINK',     0.5),
  kespiPass:     envNum('TRI_PATH_TH_KESPI_PASS', config.kespi.yellowLight),
  circuitBreaker: {
    failureThreshold: envNum('TRI_PATH_CB_FAILURES', 5),
    resetTimeout:     envNum('TRI_PATH_CB_RESET_MS', 60000),
    halfOpenMax:      3
  }
};

module.exports = config;
