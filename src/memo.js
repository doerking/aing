/**
 * src/memo.js — 备忘录（Memo）唯一组装面
 * aing 状态 + 组件链接状态 + 告警 + 待办 + 会话交接 + 六属性自我报告
 *
 * 2026-09-14：整块搬自 src/api-server.js 的 GET /api/consciousness/briefing 路由体（不是另写第二份）。
 * 动机：备忘录是 agent 的运维仪表台（AGENTS「Memo as Operations Dashboard」），但它原先只存在于
 * HTTP 处理函数里 —— agent 要拿必须先 npm run server，属于"给人用的反模式"。现 HTTP 与 CLI
 * 共用 buildMemo()，单一口径，防双脑脱节（Pitfall 7）。
 *
 * 用法 / Usage:
 *   node src/memo.js              全量 JSON（字段与 GET /api/consciousness/briefing 一致）
 *   node src/memo.js --summary    人读摘要（意识层 + 组件链接 + 告警 + 待办 + 会话交接 + 下一步）
 *   node src/memo.js --actions    只打印按仪表台指标推出的下一步命令
 *   node src/memo.js --no-semantic  跳过语义模型加载（离线快速读）
 *   npm run memo                  等于 node src/memo.js
 *
 * 纪律 5：本文件不新增任何阈值；deriveNextActions 只复用 buildMemo 已产出的告警类型与状态字符串。
 */

const fs = require('fs');
const path = require('path');
const { consciousnessTuning } = require('./config-runtime');

/**
 * 组装备忘录全量结构。
 * @param {object} deps {store, vectorSearch, sessions, consciousnessKernel, aingAdapter, KB_ROOT}
 * @returns {object} memo —— 与历史 HTTP 响应逐字段一致（新增字段只在 CLI 侧附加 nextActions）
 */
function buildMemo({ store, vectorSearch, sessions, consciousnessKernel, aingAdapter, KB_ROOT, feedSignals = false, archiveBriefing = false }) {
  // 读端默认纯读（2026-09-14）：不投事件、不写 briefing 存档。历史行为靠 --feed / --archive 显式开启。
  const briefing = aingAdapter.generateBriefing({ ingestSignals: feedSignals === true, saveBriefing: archiveBriefing === true });
  const kernelStatus = consciousnessKernel.status();

  // 组件链接状态：检测各组件是否在线
  // 向量通道口径统一：VectorSearch.mode 是 'semantic'|'hash'，仪表台约定值是
  // 'semantic-384'|'hash-64'（AGENTS.md 运维表）。旧写法拿 'semantic' 与 'semantic-384'
  // 比较，semantic 布尔恒为 false——即使语义模型在线，仪表台也显示检索通道未语义化。
  const vsMode = !vectorSearch ? 'offline'
    : vectorSearch.mode === 'semantic' ? 'semantic-384'
    : vectorSearch.mode === 'hash' ? 'hash-64' : String(vectorSearch.mode);
  const componentLinks = {
    consciousnessKernel: { status: kernelStatus.state, events: kernelStatus.activeEventCount, focus: kernelStatus.focusTargets?.slice(0, 3) || [] },
    vectorSearch: { status: vsMode, semantic: vsMode === 'semantic-384' },
    knowledgeStore: { status: 'online', entities: store.getStats().entities },
    metabolism: { status: 'available', lastRun: null }, // 代谢链非常驻，标记可用即可
    autoIngest: { status: 'online', pendingSessions: [...sessions.sessions.values()].filter(s => s.messages.length > 0).length },
    // 元认知链接改吃**只读档**（以前吃 ingest 的返回值 → 读端一不投事件就被误报 degraded，属叫狼）。
    metacognition: (() => {
      try {
        const self = JSON.parse(fs.readFileSync(path.join(KB_ROOT, 'data', 'metacognition', 'self-state.json'), 'utf8'));
        const total = Number((self.stats || {}).totalTasks || 0);
        return { status: self && self.selfAwareness ? 'online' : 'degraded', reviewed: total > 0, totalTasks: total, source: 'read-only:self-state.json' };
      } catch (e) { return { status: 'degraded', reviewed: false, totalTasks: 0, source: 'read-only:self-state.json 缺失' }; }
    })()
  };

  // 会话交接：最近 3 条会话的时间线（上次聊到哪）
  let sessionHandoff = [];
  try {
    sessionHandoff = store.all("SELECT id, name, type, created_at FROM entities WHERE type='Conversation' ORDER BY created_at DESC LIMIT 3");
  } catch (e) {}

  // 待办事项：单一来源 entities(type='Todo', status='active')，与 metabolism-panel.js 的 queues 同规则
  // （tags 含 user 即用户待办，否则 agent 待办）。历史上没有任何写入口 → 仪表台永远显示 0 条
  // → 2026-09-14 补 collectTodos/addTodo/doneTodo，读侧沿用旧字段形状，写侧走同一张表。
  const todoSplit = collectTodos(store);
  let todos = todoSplit.user.concat(todoSplit.agent).map(x => ({ id: x.id, name: x.text, tags: JSON.stringify(x.tags), status: 'active' }));

  // 蒸馏债务：pending-distillation 实体数量
  let distillDebt = 0;
  try {
    const debt = store.all("SELECT COUNT(*) as n FROM entities WHERE status = 'pending-distillation'");
    distillDebt = debt.length ? debt[0].n : 0;
  } catch (e) {}

  // 意识层告警：合并 consciousness-layer alerts + metacognition alerts + distill debt
  const consciousnessAlerts = [
    ...(briefing.metacognition?.alerts || []),
    ...(distillDebt > 0 ? [{ type: 'distill-debt', severity: 0.5, message: `${distillDebt} 个实体待蒸馏（pending-distillation）`, targets: [] }] : []),
    ...(kernelStatus.stagnationCount >= consciousnessTuning().stagnationBreakerCycles ? [{ type: 'consciousness-stagnant', severity: 0.8, message: `连续 ${kernelStatus.stagnationCount} 次空产出，意识层已进入停滞态`, targets: [] }] : []),
  ];

  // 意识层反应：从 kernel state 提取高注意力反应摘要
  const kernelReactions = (consciousnessKernel.state?.activeEvents || [])
    .sort((a, b) => (b.attention || 0) - (a.attention || 0))
    .slice(0, 5)
    .map(r => ({
      target: r.target,
      arousal: r.arousal,
      attention: Number(r.attention || 0).toFixed(3),
      channels: r.channels || [],
      suggestedActions: r.suggestedActions || [],
      createdAt: r.createdAt,
    }));

  // 用户面（对用户负责的部分）：只有待办 + 会话交接
  const userFacing = {
    todos: todos.map(t => ({ id: t.id, name: t.name, tags: (() => { try { return JSON.parse(t.tags || '[]'); } catch (e) { return []; } })() })),
    sessionHandoff: sessionHandoff.map(s => ({ id: s.id, name: s.name, created_at: s.created_at }))
  };

  // agent 仪表台（完整）
  const memo = {
    generatedAt: new Date().toISOString(),
    // ── agent 仪表台 ──
    consciousness: kernelStatus,
    componentLinks,
    alerts: briefing.briefing.alerts,
    consciousnessAlerts,
    kernelReactions,
    metacognitionAdjustments: briefing.metacognition?.adjustments || [],
    hotspots: briefing.briefing.hotspots?.slice(0, 5) || [],
    recommendations: briefing.briefing.recommendations || [],
    priority: briefing.priority,
    distillDebt,
    // ── M4 自我报告：六属性自评 ──
    selfAssessment: (() => {
      try {
        // 读取最新自我认知状态
        const selfStateFile = path.join(KB_ROOT, 'data', 'metacognition', 'self-state.json');
        let selfState = null;
        if (fs.existsSync(selfStateFile)) {
          selfState = JSON.parse(fs.readFileSync(selfStateFile, 'utf8'));
        }
        const awareness = selfState?.selfAwareness || {};
        const stats = selfState?.stats || {};
        const measured = awareness.measured === true;

        // 读取训练提升证据（优先 SkillOpt adapter 真实 rollout，降级到 training-sim 推演）
        let improvement = null;
        try {
          const skilloptEvidence = path.join(KB_ROOT, 'simulation', 'skillopt-evidence.json');
          if (fs.existsSync(skilloptEvidence)) {
            improvement = JSON.parse(fs.readFileSync(skilloptEvidence, 'utf8'));
          } else {
            const lastRun = path.join(KB_ROOT, 'simulation', 'last-run.json');
            if (fs.existsSync(lastRun)) {
              const run = JSON.parse(fs.readFileSync(lastRun, 'utf8'));
              improvement = run.improvementEvidence || null;
            }
          }
        } catch (e) {}

        // 读取决策因果链条数
        let decisionCount = 0;
        try {
          const dlFile = path.join(KB_ROOT, 'logs', 'metabolism-decision-lineage.jsonl');
          if (fs.existsSync(dlFile)) {
            decisionCount = fs.readFileSync(dlFile, 'utf8').trim().split('\n').length;
          }
        } catch (e) {}

        // 六属性打分（理论家 Gate2 标准对照）
        return {
          memory: { score: '✓', evidence: `${store.getStats().entities} 实体 / ${store.getStats().links} 链接 / 三层记忆架构` },
          attention: { score: '✓', evidence: `五因子注意力公式 / kernel state=${kernelStatus.state} / ${kernelStatus.activeEventCount} 活跃事件` },
          selfModeling: {
            score: measured ? '✓' : '△',
            evidence: measured
              ? `真实测量: confidence=${(awareness.confidence*100).toFixed(0)}% errorRate=${(awareness.errorRate*100).toFixed(1)}% coverage=${(awareness.knowledgeCoverage*100).toFixed(0)}%`
              : '硬编码默认值（未测量）',
            metrics: awareness,
          },
          selfExplanation: {
            score: decisionCount > 0 ? '✓' : '△',
            evidence: decisionCount > 0
              ? `${decisionCount} 条决策因果链记录 / metabolism-decision-lineage.jsonl`
              : '决策因果链未建立',
            decisionCount,
          },
          selfImprovement: {
            score: improvement ? '✓' : '△',
            evidence: improvement
              ? improvement.source === 'SkillOpt aing adapter (Python, offline rollout)'
                ? `SkillOpt adapter 真实 rollout: ${improvement.baseline.hardCorrect}/${improvement.taskCount} → ${improvement.corrected.hardCorrect}/${improvement.taskCount} (soft ${improvement.baseline.softScore} → ${improvement.corrected.softScore}), Gate ${improvement.improvement.gatePassed ? 'PASS' : 'FAIL'}, delta=${improvement.improvement.deltaSoft}`
                : `训练推演: ${improvement.improvementPercent}% 改进 / Gate ${improvement.gatePassed ? 'PASS' : 'FAIL'} / ${improvement.falseBeliefsRemoved} 个错误信念修正`
              : '训练循环未产出证据',
            improvement,
          },
          selfReport: {
            score: '✓',
            evidence: 'briefing 结构化输出 / KESPI 八维可查 / consciousness alerts 可消费',
          },
        };
      } catch (e) {
        return { error: e.message };
      }
    })(),
    // ── 对用户负责的部分 ──
    userFacing
  };

  // —— 最后一米三块（所有者 2026-09-14 点单）：待办可见 / 健康一眼判 / 派单建议 ——
  const panelRead = readPanel(KB_ROOT);
  // 规模读数单源：活跃数走面板同一条 SQL，全库/链接取 getStats()
  let entActive = NaN;
  try { entActive = Number(((store.all("SELECT COUNT(*) AS n FROM entities WHERE status='active'")[0] || {}).n)); } catch (e) {}
  memo.counts = {
    entitiesActive: Number.isFinite(entActive) ? entActive : null,
    entitiesAll: (memo.componentLinks.knowledgeStore || {}).entities ?? null,
    links: (memo.componentLinks.knowledgeStore || {}).links ?? null,
    rule: 'entitiesActive 同 metabolism-panel.js:49 口径（status=active）'
  };
  memo.todos = todoSplit;
  memo.health = assessHealth(memo, panelRead);
  memo.swarmDispatch = deriveSwarmDispatch(memo.health, memo, panelRead, swarmRolesReady());
  return memo;
}

/**
 * 自建一整套依赖（CLI 用）。构造顺序与 api-server main() 一致，避免两条路径口径漂移。
 * @param {object} opts {semantic:boolean 是否尝试启用 384 维语义模型, baseDir:string 库根}
 * @returns {Promise<{deps:object, close:Function}>}
 */
async function openMemoContext({ semantic = true, baseDir = path.resolve(__dirname, '..'), dbPath = null } = {}) {
  const KnowledgeStore = require('./knowledge-store');
  const VectorSearch = require('./vector-search');
  const { SessionStore } = require('./auto-ingest');
  const { ConsciousnessKernel } = require('./consciousness-kernel');
  const { HermesAingAdapter } = require('./hermes-aing-adapter');

  const store = new KnowledgeStore(dbPath || path.join(baseDir, 'knowledge.db'));
  await store.init();
  const vectorSearch = new VectorSearch(store);
  await vectorSearch.init();
  if (semantic) {
    try { await vectorSearch.enableSemantic(); } catch (e) { /* 模型未就绪 → 保持 hash，与 HTTP 侧同口径 */ }
  }
  const sessions = new SessionStore();
  const consciousnessKernel = new ConsciousnessKernel({ baseDir, mode: 'coordination-only' });
  const aingAdapter = new HermesAingAdapter({ kbRoot: baseDir, sessions, store, vectorSearch, consciousnessKernel });
  return {
    deps: { store, vectorSearch, sessions, consciousnessKernel, aingAdapter, KB_ROOT: baseDir },
    close: async () => { try { if (typeof store.close === 'function') store.close(); } catch (e) { /* 只读场景，忽略 */ } }
  };
}

/* ══════════════════════════════════════════════════════════════════════
 * 用户待办 / 健康判定 / 神经进化团队派发（2026-09-14 所有者点单）
 *
 * 场景：用户把 agent 拉起来，agent 只看一眼备忘录就要知道三件事——
 *   ① 用户还挂着哪些待办/任务（谁记的都不重要，进场必须看得见）
 *   ② aing 现在健康吗（一句话判定 + 每条理由带读数证据）
 *   ③ 用不用派神经进化团队维护（派哪几个角色、带什么证据、过什么 Gate）
 *
 * 单一来源纪律：待办的存储沿用既有约定 —— `metabolism-panel.js:78-80`
 *   读的就是 `entities WHERE type='Todo' AND status='active'`，且「tags 含 user」
 *   即用户待办、否则 agent 待办。本文件**不另立第二张待办表**，只补上「写入 + 读出」
 *   两端，否则面板与备忘录会各说一套（Pitfall 7 双脑脱节的另一种形态）。
 *
 * 纪律 5（阈值唯一来源 growth.config.js）：下面 health 与 dispatch 的判定**只用离散
 *   信号**（0/非 0、状态字符串、布尔缺口），不新增任何数值阈值。swarm 各角色的
 *   `gate` 字段是从 AGENTS 既有约定**转述给人看的文本**，不参与任何判定分支。
 * ══════════════════════════════════════════════════════════════════════ */

const TODO_ACTIVE_WHERE = "type='Todo' AND status='active'";

/** 读活跃待办并按既有约定分用户/agent 两侧（与 metabolism-panel.js:78-80 同规则，改一处须同步）。 */
function collectTodos(store) {
  const out = { user: [], agent: [], source: 'entities(type=Todo,status=active)' };
  let rows = [];
  try {
    rows = store.all(`SELECT id, name, tags, confidence, created_at, updated_at FROM entities WHERE ${TODO_ACTIVE_WHERE} ORDER BY created_at DESC`);
  } catch (e) {
    out.error = e.message;
    return out;
  }
  for (const r of rows) {
    let tags = [];
    try { tags = JSON.parse(r.tags || '[]'); } catch (e) { tags = String(r.tags || '').split(/[,;]\s*/).filter(Boolean); }
    const due = tags.map(String).find(t => /^due:/i.test(t)) || null;
    const item = { id: r.id, text: r.name, tags: tags.map(String), due, createdAt: r.created_at, updatedAt: r.updated_at };
    if (tags.map(String).some(t => /^user$/i.test(t) || /^owner:user$/i.test(t))) out.user.push(item);
    else out.agent.push(item);
  }
  return out;
}

/**
 * 记一条待办（agent 代用户挂事，或用户直接挂事）。
 * @param {object} store KnowledgeStore
 * @param {object} input {text 必填, owner 'user'|'agent' 默认 user, tags[], due 'YYYY-MM-DD', note 全文, source}
 */
function addTodo(store, input = {}) {
  const text = String(input.text || '').trim();
  if (!text) { const e = new Error('待办内容不能为空 / todo text is required'); e.code = 'EMPTY_TODO'; throw e; }
  const owner = input.owner === 'agent' ? 'agent' : 'user';
  const extra = (input.tags || []).map(String).filter(t => !/^user$|^agent$/i.test(t));
  const tags = [owner, ...extra];
  if (input.due) tags.push('due:' + String(input.due).slice(0, 10));
  const id = 'todo-' + new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14) + '-' + text.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 18).toLowerCase().replace(/^-|-$/g, '');
  const content = [
    '待办（' + (owner === 'user' ? '用户' : 'agent') + '）：' + text,
    input.due ? '到期：' + String(input.due).slice(0, 10) : '',
    input.note ? '\n补充：' + input.note : '',
    input.source ? '\n来源：' + input.source : '',
    '\n登记时间：' + new Date().toISOString(),
  ].filter(Boolean).join('\n');
  store.saveEntity({ id, name: text.length > 90 ? text.slice(0, 90) + '…' : text, type: 'Todo', content, tags, status: 'active', confidence: 0, source_file: input.source ? String(input.source) : 'memo-todo' });
  return collectTodos(store);
}

/** 销一条待办：status 改 done（不删行，留审计痕迹；删除会连因果链一起丢）。 */
function doneTodo(store, id) {
  const wanted = String(id || '').trim();
  if (!wanted) { const e = new Error('需要待办 id / todo id is required'); e.code = 'NO_ID'; throw e; }
  // 先按精确 id 找活跃项；找不到再按 id/正文关键词模糊匹配（只限 Todo 类型，不误伤其他实体）
  let target = store.get("SELECT id, name FROM entities WHERE " + TODO_ACTIVE_WHERE + " AND id = ?", [wanted]);
  if (!target) {
    target = store.get("SELECT id, name FROM entities WHERE " + TODO_ACTIVE_WHERE + " AND (id LIKE ? OR name LIKE ?) ORDER BY created_at DESC LIMIT 1", ['%' + wanted + '%', '%' + wanted + '%']);
  }
  if (!target) target = store.get("SELECT id, name, status FROM entities WHERE type='Todo' AND id = ?", [wanted]);
  if (!target) { const e = new Error('找不到活跃待办：' + wanted + '（已完成的不能再销，用 memo todo --all 查历史）'); e.code = 'TODO_NOT_FOUND'; throw e; }
  store.run("UPDATE entities SET status='done', updated_at=datetime('now') WHERE id=?", [target.id]);
  return { id: target.id, text: target.name, status: 'done' };
}

/** 列全部（含已销），供人核对。 */
function listAllTodos(store, limit = 30) {
  try {
    return store.all("SELECT id, name, tags, status, created_at, updated_at FROM entities WHERE type='Todo' ORDER BY (status='active') DESC, created_at DESC LIMIT ?", [Number(limit) || 30]);
  } catch (e) { return { error: e.message }; }
}

/** 读意识层面板（gaps/queues/health 是现成读数；缺失只降级不报错）。 */
function readPanel(KB_ROOT) {
  const f = path.join(KB_ROOT, 'data', 'panel.json');
  try { return fs.existsSync(f) ? { ok: true, data: JSON.parse(fs.readFileSync(f, 'utf8')), mtime: fs.statSync(f).mtimeMs } : { ok: false, reason: 'no-panel.json' }; }
  catch (e) { return { ok: false, reason: e.message }; }
}

/**
 * 健康判定：一句话结论 + 每条理由都带读数证据。只用离散信号。
 * opts.probeNoSemantic=true 表示调用方用 --no-semantic 探针模式读表：此时 vectorSearch=hash-64
 * 是**读数口径**而非真实退化，降级为 info 不计入 verdict（否则健康块天天喊狼来了，判定就废了）。
 * verdict: broken（核心链路不可用）/ degraded（可用但有债或缺口）/ ok
 */
function assessHealth(memo, panel, opts = {}) {
  const reasons = [];
  const cl = memo.componentLinks || {};
  const push = (code, level, say, evidence) => reasons.push({ code, level, say, evidence });
  // 实体数口径必须与 metabolism-panel.js:49 一致（活跃规模 status='active'）。
  // 先前这里用 getStats() 的全库 COUNT(*)，导致 memo 报 34、面板报 32 两个仪表台打架
  // （销办留痕 status=done 一出现就分叉）。现以活跃数为主读数，全库数并列不藏。
  const entities = (memo.counts && Number.isFinite(memo.counts.entitiesActive))
    ? memo.counts.entitiesActive
    : (cl.knowledgeStore ? Number(cl.knowledgeStore.entities) : 0);
  const entitiesAll = cl.knowledgeStore ? Number(cl.knowledgeStore.entities) : 0;

  if (!(entities > 0)) push('db-empty', 'broken', '知识库零实体：这一院还没代谢过，任何"健康"读数都是空的', 'entities=0');
  if (cl.vectorSearch && cl.vectorSearch.status === 'offline') push('vector-offline', 'broken', '向量检索离线：语义召回整条不可用', 'vectorSearch=offline');
  else if (cl.vectorSearch && cl.vectorSearch.status === 'hash-64') {
    if (opts.probeNoSemantic) push('vector-hash', 'info', '（探针口径，非退化）本次读表用 --no-semantic 跳过了语义模型，真实通道以全量 memo / verify C5-C6 为准', 'vectorSearch=hash-64 @probe');
    else push('vector-hash', 'degraded', '检索仍在 64 维哈希档：语义召回没接上（小语料上等于退化）', 'vectorSearch=hash-64');
  }
  if (cl.metacognition && cl.metacognition.status === 'degraded') push('metacognition-degraded', 'degraded', '元认知未刷新：自我建模读数是旧的', 'metacognition=degraded');
  if (memo.consciousness && memo.consciousness.state === 'stagnant') push('stagnant', 'broken', '意识层判定连续空产出（停滞）：代谢在跑但没产出，须查失败原因而不是再跑一遍', 'stagnationCount=' + (memo.consciousness.stagnationCount !== undefined ? memo.consciousness.stagnationCount : '?'));
  if (Number(memo.distillDebt || 0) > 0) push('distill-debt', 'degraded', '有蒸馏债未兑付：待蒸实体挂着，wiki 落后于 raw', 'distillDebt=' + memo.distillDebt);
  if (panel && panel.ok && panel.data && panel.data.gaps) {
    const g = panel.data.gaps;
    const bad = Object.entries(g).filter(([, n]) => Number(n) > 0);
    if (bad.length) push('gaps', 'degraded', '面板缺口非零：' + bad.map(([k, n]) => k + '=' + n).join(' '), 'panel.gaps');
  } else if (panel && !panel.ok) push('panel-absent', 'degraded', '意识层面板不可读（' + (panel.reason || '?') + '）：缺口与队列读数看不见', 'data/panel.json');
  const weak = Object.entries(memo.selfAssessment || {}).filter(([, v]) => !v || v.score !== '✓').map(([k]) => k);
  if (weak.length) push('self-weak', 'degraded', '自我报告未全绿：' + weak.join(', '), 'selfAssessment');
  if ((memo.consciousnessAlerts || []).length) push('alerts', 'degraded', '意识层告警在响', 'consciousnessAlerts=' + memo.consciousnessAlerts.length);

  const verdict = reasons.some(r => r.level === 'broken') ? 'broken' : (reasons.some(r => r.level === 'degraded') ? 'degraded' : 'ok');
  return {
    verdict,
    say: verdict === 'ok' ? '健康：链路、检索、蒸馏、面板、自我报告都无异常读数'
      : verdict === 'broken' ? '不健康：核心链路有断裂，先修再谈维护'
        : '可用但有账：' + reasons.length + ' 项待处理（见 reasons，每条带读数）',
    reasons,
    counts: { broken: reasons.filter(r => r.level === 'broken').length, degraded: reasons.filter(r => r.level === 'degraded').length, info: reasons.filter(r => r.level === 'info').length },
    probeNoSemantic: Boolean(opts.probeNoSemantic),
    snapshot: {
      entities,
      entitiesAll, links: (panel && panel.ok && panel.data.health ? panel.data.health.link_count : undefined),
      kernelState: memo.consciousness ? memo.consciousness.state : null,
      activeEvents: memo.consciousness ? memo.consciousness.activeEventCount : null,
      // 读表即扰表：suppressed 计数会被"读"这个动作推高，不代表业务事件，故单列标注
      suppressedEvents: memo.consciousness ? memo.consciousness.suppressedEventCount : null,
      suppressedNote: '每次读备忘录会往 kernel 投 alerts+hotspots 信号（同指纹被抑制）→ 该计数只用于诊断，不作健康判据',
      kespiAvg: panel && panel.ok ? panel.data.health.kespi_avg : null,
      panelFresh: panel && panel.ok ? new Date(panel.mtime).toISOString() : null
    }
  };
}

/**
 * 派不派神经进化团队。角色映射沿用 AGENTS「半拉起角色与触发条件」表，判定只用离散信号。
 * 本运行时技能面若没有 neural-evolution-swarm，则如实标 inline-degraded（不许假称能派）。
 */
function swarmRolesReady() {
  const os = require('os');
  const home = os.homedir();
  // 三种"有"必须分开说（2026-09-14 W5）：
  //   runtime   = 本运行时（SCNet agent）真会加载技能的目录 —— 只有它才算"我这场能调用"
  //   host      = 宿主机器上其它 agent 面装过的目录（.claude / .agents）—— 说明团队存在，但本场调不动
  //   bundled   = 随包携带在 assets/skills/ 里（W5 起 Tip 包内就有）—— 说明可安装，不等于已装载
  const roots = [
    { dir: path.join(home, '.sclaw', 'agent', 'skills'), kind: 'runtime' },
    { dir: path.join(home, '.claude', 'skills'), kind: 'host' },
    { dir: path.join(home, '.agents', 'skills'), kind: 'host' },
    { dir: path.join(path.resolve(__dirname, '..'), 'assets', 'skills'), kind: 'bundled' },   // 用包根，不用 cwd（否则换个目录跑就变卦）
  ];
  const found = [];
  for (const r of roots) {
    try { if (fs.existsSync(path.join(r.dir, 'neural-evolution-swarm'))) found.push({ where: r.dir.replace(home, '~'), kind: r.kind }); } catch (e) { /* 读不到就当没有，诚实降级 */ }
  }
  const kinds = found.map(f => f.kind);
  return {
    installed: found.length > 0,                                   // 兼容旧字段：机器上任何一处找得到
    inRuntimeSurface: kinds.includes('runtime'),                  // 只有这个为真，才可以说「能派」
    bundledInPackage: kinds.includes('bundled'),                  // 包内是否自带说明书（可安装性）
    where: found.map(f => f.where + '[' + f.kind + ']'),
    preferredRoot: roots[0].dir.replace(home, '~'),
  };
}

function deriveSwarmDispatch(health, memo, panel, ready) {
  const want = { theorist: null, engineer: null, trainer: null, analyst: null };
  const r = (health.reasons || []).map(x => x.code);
  const cl = memo.componentLinks || {};
  if (r.includes('self-weak')) want.theorist = health.reasons.find(x => x.code === 'self-weak').evidence;
  if (r.includes('db-empty') || r.includes('vector-offline') || (!health.probeNoSemantic && r.includes('vector-hash')) || r.includes('metacognition-degraded') || r.includes('panel-absent') || r.includes('stagnant')) {
    want.engineer = health.reasons.filter(x => ['db-empty', 'vector-offline', 'metacognition-degraded', 'panel-absent', 'stagnant'].includes(x.code) || (x.code === 'vector-hash' && !health.probeNoSemantic)).map(x => x.code + ':' + x.evidence).join(', ');
  }
  const sa = memo.selfAssessment || {};
  if (sa.selfImprovement && sa.selfImprovement.score !== '✓') want.trainer = 'selfImprovement=' + sa.selfImprovement.score + '（无训练证据）';
  const g = (panel && panel.ok && panel.data.gaps) ? panel.data.gaps : null;
  if (g && Object.values(g).some(n => Number(n) > 0)) want.analyst = 'gaps ' + Object.entries(g).filter(([, n]) => Number(n) > 0).map(([k, n]) => k + '=' + n).join(' ');
  if (r.includes('distill-debt')) want.analyst = (want.analyst ? want.analyst + '; ' : '') + 'distillDebt=' + memo.distillDebt;

  const GATE = {
    theorist: '六属性 ✓ ≥4 且无关键 ✗（转述 AGENTS 约定，仅供人看，不参与判定）',
    engineer: '回归全过、无新增 lint 错误',
    trainer: '候选分 > 当前基线',
    analyst: '守恒比 0.8~1.5 且回炉闭环成立'
  };
  const ROLE_ID = { theorist: 'neuro-theorist', engineer: 'senior-engineer', trainer: 'skill-trainer', analyst: 'plasticity-analyst' };
  const HOW = {
    theorist: '把 memo.selfAssessment 六属性 + 待审设计稿交给它过堂',
    engineer: '把 verify-deploy 红行 + 组件链接读数 + 失败步 stderr 交给它做最小修复',
    trainer: '把 adapter + 任务包交给它跑 SkillOpt 六阶段；本机无 Python 依赖时先报缺口',
    analyst: '把 panel.gaps + gap-detector/topology 输出交给它出拓扑健康报告与工单'
  };
  const roles = Object.keys(want).filter(k => want[k]).map(k => ({ role: ROLE_ID[k], key: k, why: want[k], gate: GATE[k], how: HOW[k] }));
  const needTeam = roles.length > 0;
  return {
    needed: needTeam,
    say: !needTeam ? '不必派团队：健康判定无异常读数，单 agent 足够（治理红线仍照旧）'
      : ready.inRuntimeSurface ? '建议派 ' + roles.map(x => x.role).join(' + ') + '（本运行时技能面已装 neural-evolution-swarm：' + (ready.where[0] || '') + '）'
      : ready.installed ? '建议派 ' + roles.map(x => x.role).join(' + ') + '，但团队只装在宿主面（' + ready.where.join(' / ') + '），本运行时面 ' + ready.preferredRoot + ' 未加载 → 本场我调不动它，按 inline 降级自办'
      : '建议派 ' + roles.map(x => x.role).join(' + ') + '，但机器上找不到 neural-evolution-swarm → inline 降级自办（治理红线仍照旧）',
    mode: needTeam ? (ready.inRuntimeSurface ? 'swarm-skill' : 'inline-degraded') : 'none',
    swarmInstalled: !!ready.installed,
    inRuntimeSurface: !!ready.inRuntimeSurface,
    bundledInPackage: !!ready.bundledInPackage,
    swarmSearch: ready,
    roles,
    entityNote: '四角色说明书与 aing-operator 自 2026-09-14（W5）起随包携带在 assets/skills/；注意：**包内有说明书 ≠ 本运行时已装载**，能否真派单只看 inRuntimeSurface'
  };
}


/**
 * 按仪表台指标推出下一步命令。
 * 纪律 5：这里**不新设任何阈值** —— 只复用 buildMemo 已经产出的告警类型与组件状态字符串。
 */
function deriveNextActions(memo) {
  const acts = [];
  const cl = memo.componentLinks || {};
  const alerts = memo.consciousnessAlerts || [];
  if ((memo.distillDebt || 0) > 0 || alerts.some(x => x && x.type === 'distill-debt')) acts.push('node src/distill.js');
  if (memo.consciousness && memo.consciousness.state === 'stagnant') acts.push('node src/growth-director.js --execute');
  if (cl.vectorSearch && cl.vectorSearch.status !== 'semantic-384') acts.push('node src/index-vectors.js --semantic --reindex');
  if (cl.metacognition && cl.metacognition.status === 'degraded') acts.push('node src/metacognition-layer.js self-check');
  if (cl.autoIngest && cl.autoIngest.pendingSessions > 0) {
    acts.push('# 有 ' + cl.autoIngest.pendingSessions + ' 个会话缓冲未落盘 → 等 30 秒批次，或 node src/auto-ingest.js <session-id> "<json|文本>"');
  }
  if (memo.selfAssessment) {
    const weak = Object.entries(memo.selfAssessment).filter(([, v]) => !v || v.score !== '✓').map(([k]) => k);
    if (weak.length) acts.push('# 自我报告缺口: ' + weak.join(', ') + ' → 按 AGENTS「M4 组件链引导」逐项修复后复验');
  }
  if (memo.swarmDispatch && memo.swarmDispatch.needed) {
    acts.push('# 建议派神经进化团队：' + memo.swarmDispatch.roles.map(x => x.role).join(' + ') + '（' + memo.swarmDispatch.mode + '）→ node src/memo.js --dispatch 看交什么证据与过什么 Gate');
  }
  if (memo.health && memo.health.verdict === 'broken') {
    acts.unshift('# 健康判定 broken：核心链路有断裂，先修再谈维护（node src/memo.js --summary 看 🔴 项）');
  }
  return acts;
}

module.exports = { buildMemo, openMemoContext, deriveNextActions, collectTodos, addTodo, doneTodo, listAllTodos, assessHealth, deriveSwarmDispatch, swarmRolesReady, readPanel };

/* ── CLI：agent 出场第一步读备忘录，不必先起 HTTP 服务 ──
 * 机器消费约定：本文件 CLI 模式下，依赖模块自带的进度日志一律改走 stderr，
 * stdout 只输出结果本身 → node src/memo.js | jq / > memo.json 可直接解析。
 *
 * 子命令（2026-09-14 所有者点单：待办进备忘录 / 健康一眼可见 / 派不派团队）：
 *   node src/memo.js                        全量 JSON（含 health / swarmDispatch / todos）
 *   node src/memo.js --summary              人读三块：用户待办 + 健康 + 派发建议
 *   node src/memo.js --actions | --dispatch | --peek
 *   node src/memo.js todo add "内容" [--agent] [--due 2026-09-20] [--tag 训练]
 *   node src/memo.js todo list [--all]
 *   node src/memo.js todo done <id|关键词>
 *   全局可选：--no-semantic（跳模型）| --db <文件>（隔离库，门禁探针用）| --logs（保留模块日志到 stdout）
 *   | --feed（本次读表显式投意识事件，即恢复旧副作用）| --archive（写 briefing 存档档）——默认两者都关，读表不扰表
 */
if (require.main === module) {
  const argvAll = process.argv.slice(2);
  if (!argvAll.includes('--logs')) {
    const orig = console.log;
    console.log = (...a) => process.stderr.write(a.join(' ') + '\n');
    process.on('exit', () => { console.log = orig; });
  }
  const emit = s => process.stdout.write(s + '\n');
  const flagVal = (name) => { const i = argvAll.indexOf(name); return i >= 0 ? argvAll[i + 1] : null; };
  const pos = argvAll.filter(a => !a.startsWith('--') && a !== flagVal('--db') && a !== flagVal('--due') && a !== flagVal('--tag'));

  const printSummary = (memo) => {
    const cs = memo.consciousness || {};
    const cl = memo.componentLinks || {};
    const uf = memo.userFacing || {};
    const t = memo.todos || { user: [], agent: [] };
    const h = memo.health || {};
    const d = memo.swarmDispatch || {};
    emit('📋 备忘录 / Memo — ' + memo.generatedAt);
    emit('  【用户待办】' + (t.user.length ? t.user.length + ' 条' : '（空）'));
    t.user.forEach(x => emit('    ▢ ' + String(x.text).slice(0, 68) + (x.due ? '  【到期 ' + x.due.slice(4) + '】' : '') + '  [' + x.id + ']'));
    if (t.agent.length) {
      emit('  【agent 待办】' + t.agent.length + ' 条');
      t.agent.forEach(x => emit('    ▸ ' + String(x.text).slice(0, 68) + '  [' + x.id + ']'));
    }
    emit('  【健康】' + (h.verdict === 'ok' ? '🟢' : h.verdict === 'degraded' ? '🟡' : '🔴') + ' ' + (h.say || '?'));
    (h.reasons || []).forEach(x => emit('    ' + (x.level === 'broken' ? '🔴' : '🟡') + ' ' + x.say + '  ← ' + x.evidence));
    if (h.snapshot) emit('    读数: 活跃 ' + h.snapshot.entities + ' / 全库 ' + (h.snapshot.entitiesAll ?? h.snapshot.entities) + ' 实体 / kernel=' + h.snapshot.kernelState + ' / 活跃事件 ' + h.snapshot.activeEvents + ' / KESPI 均 ' + (h.snapshot.kespiAvg || '?') + ' / 面板 ' + (h.snapshot.panelFresh ? h.snapshot.panelFresh.slice(0, 16) + 'Z' : '缺'));
    emit('  【神经进化团队】' + (d.say || '?'));
    (d.roles || []).forEach(x => { emit('    · ' + x.role + ' — 因由: ' + x.why); emit('      交什么: ' + x.how); emit('      过什么 Gate: ' + x.gate); });
    emit('  意识层: ' + (cs.state || '?') + ' / 组件链接: ' + Object.entries(cl).map(([k, v]) => k + '=' + ((v && v.status) || '?')).join(' | '));
    emit('  蒸馏债: ' + (memo.distillDebt || 0) + '  | 告警: ' + (memo.consciousnessAlerts || []).length + '  | 优先级: ' + (memo.priority || '-') + '  | 待办(旧字段) ' + (uf.todos || []).length + ' / 会话交接 ' + (uf.sessionHandoff || []).length + ' 条');
    emit('  自我报告: ' + Object.entries(memo.selfAssessment || {}).map(([k, v]) => k + '=' + ((v && v.score) || '?')).join(' '));
    emit('  下一步:');
    const na = memo.nextActions || [];
    if (!na.length) emit('    （无待执行项）');
    na.forEach(x => emit(x.startsWith('#') ? '    ' + x : '    $ ' + x));
  };

  (async () => {
    const sub = pos[0] === 'todo' ? pos[1] : null;
    const dbPath = flagVal('--db');
    const { deps, close } = await openMemoContext({ semantic: !argvAll.includes('--no-semantic'), dbPath: dbPath || null });
    try {
      // —— 写面：待办增删（沿用 entities type=Todo 单一来源）——
      if (sub === 'add') {
        const text = pos.slice(2).join(' ').trim();
        const owner = argvAll.includes('--agent') ? 'agent' : 'user';
        const res = addTodo(deps.store, { text, owner, due: flagVal('--due'), tags: argvAll.map((a, i) => (a === '--tag' ? argvAll[i + 1] : null)).filter(Boolean), source: flagVal('--from') });
        emit(JSON.stringify({ ok: true, owner, user: res.user.length, agent: res.agent.length }));
        return;
      }
      if (sub === 'done') {
        const res = doneTodo(deps.store, pos.slice(2).join(' '));
        emit(JSON.stringify(Object.assign({ ok: true }, res)));
        return;
      }
      if (sub === 'list') {
        const c = collectTodos(deps.store);
        const rows = argvAll.includes('--all') ? listAllTodos(deps.store) : { user: c.user, agent: c.agent };
        emit(JSON.stringify(rows, null, 2));
        return;
      }

      const memo = buildMemo({ ...deps, feedSignals: argvAll.includes('--feed'), archiveBriefing: argvAll.includes('--archive') });
      // 探针口径回写：--no-semantic 时不让 vector-hash 污染健康判定与派单
      if (argvAll.includes('--no-semantic')) {
        const panelRead = readPanel(deps.KB_ROOT);
        memo.health = assessHealth(memo, panelRead, { probeNoSemantic: true });
        memo.swarmDispatch = deriveSwarmDispatch(memo.health, memo, panelRead, swarmRolesReady());
      }
      memo.nextActions = deriveNextActions(memo);
      if (argvAll.includes('--actions')) { emit(memo.nextActions.length ? memo.nextActions.join('\n') : '（仪表台指标均在正常区间，无待执行项）'); return; }
      if (argvAll.includes('--dispatch')) { emit(JSON.stringify(memo.swarmDispatch, null, 2)); return; }
      if (argvAll.includes('--peek')) {
        // 只读快拍：agent 「看一眼」用的最小完备面（看完整就要能行动，所以 roles 给全对象）。
        // 读表已纯净化（2026-09-14，门禁 C16）：不再投事件、不再写存档 → 看一眼不会扰动被看的表。
        emit(JSON.stringify({
          generatedAt: memo.generatedAt,
          links: memo.componentLinks || null,
          health: memo.health,
          todos: memo.todos,
          dispatch: {
            needed: memo.swarmDispatch.needed,
            mode: memo.swarmDispatch.mode,
            say: memo.swarmDispatch.say,
            swarmInstalled: memo.swarmDispatch.swarmInstalled,
            roles: memo.swarmDispatch.roles,
            nextActions: memo.nextActions || []
          }
        }, null, 2));
        return;
      }
      if (argvAll.includes('--summary')) { printSummary(memo); return; }
      emit(JSON.stringify(memo, null, 2));
    } finally {
      await close();
    }
  })().catch(e => { console.error('备忘录操作失败 / memo op failed: ' + e.message); process.exit(e.code === 'EMPTY_TODO' || e.code === 'TODO_NOT_FOUND' || e.code === 'NO_ID' ? 2 : 1); });
}