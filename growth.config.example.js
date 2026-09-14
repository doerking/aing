/**
 * growth.config.example.js — 配置模板 / config template
 *
 * 用法：cp growth.config.example.js src/growth.config.js（克隆后必做，仓库不含真实配置）
 * 本文件是 src/growth.config.js 的同构镜像：新增配置段必须两处同步，
 * 由 verify-deploy.js C10d 机器校验（键值深度一致，允许注释差异）。
 * 历史教训 / lesson：模板曾长期缺 triPath、query 段且维度阈值停在 v1 旧语义，
 *   照 AGENTS.md 第 3 步新部署的包执行 npm run tripath 直接 TypeError 崩溃。
 *
 * 所有阈值集中在此文件，方便调整 / all thresholds live here (discipline #5)。
 *
 * 修复记录：
 *   v2: 统一八维方向后，阈值也统一为"越高越好"逻辑
 *       yellow = 黄灯阈值（低于此值=警告）
 *       red = 红灯阈值（低于此值=严重）
 *   v3: 补 triPath / query / gates 段，与运行配置同源（2026-09-14）
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
config.triPath = { exploreAgree: envNum('TRI_PATH_TH_EXPLORE', 0.5), verifyAgree: envNum('TRI_PATH_TH_VERIFY', 0.7), optimizeAgree: envNum('TRI_PATH_TH_OPTIMIZE', 0.7), verifyLink: envNum('TRI_PATH_TH_LINK', 0.5), kespiPass: envNum('TRI_PATH_TH_KESPI_PASS', config.kespi.yellowLight), circuitBreaker: { failureThreshold: envNum('TRI_PATH_CB_FAILURES', 5), resetTimeout: envNum('TRI_PATH_CB_RESET_MS', 60000), halfOpenMax: 3 } };

// 查询精排阈值（query.js 精排化，2026-09-03；阈值唯一来源纪律）
config.query = {
  fusionWeights: { semantic: envNum('AING_QUERY_W_SEMANTIC', 0.6), keyword: envNum('AING_QUERY_W_KEYWORD', 0.25), name: envNum('AING_QUERY_W_NAME', 0.15) },
  slowRecallThreshold: envNum('AING_QUERY_SLOW_TH', 0.35),
  slowRecallExpand: envNum('AING_QUERY_SLOW_N', 6),
  rerank: { kespi: envNum('AING_QUERY_R_KESPI', 0.15), recency: envNum('AING_QUERY_R_RECENCY', 0.1) }
};

// 验收门禁阈值（verify-deploy.js C10 系列唯一读取处；纪律第 5 条：组件内不硬编码阈值）
// panelMaxAgeHours：意识层面板 data/panel.json 由代谢链尾步生成，超过此时数即视为代谢链未跑 / stale dashboard
config.gates = {
  panelMaxAgeHours: envNum('AING_GATE_PANEL_HOURS', 6),
  lineageMinRecords: envNum('AING_GATE_LINEAGE_MIN', 12)
};

// 蒸馏标签抽取（distill.js 机械蒸馏；阈值唯一来源，纪律第 5 条）
// tagMinFreq：词频下限——1 次不算「高频」，避免一次性从句进标签命名空间
// tagMaxCount：单次蒸馏追加标签上限
// tagMaxLen / tagCharset：标签形状——中文未接分词，整句从句不得当标签（否则污染自动建链与 KA 评分）
config.distill = {
  tagMinFreq: envNum('AING_DISTILL_TAG_MIN_FREQ', 2),
  tagMaxCount: envNum('AING_DISTILL_TAG_MAX', 3),
  tagMaxLen: envNum('AING_DISTILL_TAG_MAXLEN', 24)
};

module.exports = config;
