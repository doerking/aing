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

  // 意识层离散旋钮（2026-09-14 纪律 5 补账）：`>= 3` 这个数曾在四处各自写死——
  // kernel 熔断、growth-director.js:150 与 :235、memo.js:71。四个脑子各判各的，改一处就脉节。
  // 现在读者一律走 config-runtime 的 consciousnessTuning()，**本段是唯一权威**；
  // fallback 只在没有本文件时兜底（未部署院/探针），见 config-runtime.js 的 CONSCIOUSNESS_FALLBACK。
  // 边界：熔断轮数/默认抑制时长/去重窗口/事件上限这类**离散旋钮**在此；唤醒共振规则
  // （channels≥3、attention≥0.6）与六条融合权重仍是 kernel 内部单一逻辑，未拆出（拆了反而多一处脑子）。
  consciousness: {
    stagnationBreakerCycles: 3,   // 连续多少轮空产出后熔断转 stagnant（原 kernel 硬编码 3）
    inhibitDefaultHours: 1,       // kernel.inhibit 未指定时长时的缺省抑制小时数（原 3600000ms）
    dedupeWindowSeconds: 300,     // 同指纹事件去重窗口（原 300000ms）
    maxRetainedEvents: 200,       // activeEvents / suppressedEvents 保留上限（原 200）
  },
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

// 剪枝步（代谢第 11 步）旋钮（2026-09-17 F2 显式化，顶层段与 src/growth.config.js 同构——C10d）：
// 默认 false=恒 dry-run 预览（只报不删，即原链路现状）；true=随整链自动归档删除。
config.prune = { autoForce: process.env.AING_PRUNE_AUTO_FORCE === '1' };



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



// 会话入库（auto-ingest.js）阈值；纪律第 5 条：组件内不硬编码
// sessionIdleMs：单会话静默此时长即 flush。旧实现只看全局 lastIngestTime——
//   任何一次入库都会重置它，会话尾巴要等别的会话触发才落盘（实测：accepted 后杀进程，整段会话消失）。
// bufferFile：accepted 与落盘之间的追加式 WAL，重启回放，不再拿内存当持久化。
// rawDir：入库产物落点。运行态与版本化知识源物理分离，避免每次入库都污染 git 工作树
//   （院际换血 sync-opt 的 clean 判定与 robocopy 串院，两条事故链共用这个入口）。
config.ingest = {
  minMessageLength: envNum('AING_INGEST_MIN_LEN', 20),
  maxMessagesPerBatch: envNum('AING_INGEST_BATCH', 5),
  batchIntervalMs: envNum('AING_INGEST_BATCH_MS', 30000),
  sessionIdleMs: envNum('AING_INGEST_IDLE_MS', 15000),
  // 只入贴出来的详情：贴出来之前的采集步骤（命令行/请求行/响应头/报文）在入口剥除，
  // 一行不留、不写旁路。关掉仅用于排障对照，正常运行不许置 0（门禁 C10h 会验）。
  scrubTrace: process.env.AING_INGEST_SCRUB !== '0',
  bufferFile: process.env.AING_INGEST_BUFFER || 'data/ingest-buffer.jsonl',
  rawDir: process.env.AING_INGEST_RAW_DIR || 'raw/inbox'
};
module.exports = config;
