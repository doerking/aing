#!/usr/bin/env node
/**
 * metabolism-panel.js — 意识层卡 3：注意力队列生成器（代谢链尾步）
 *
 * 功能：对事实层（knowledge.db / wiki/ / raw/ / git）做确定性聚合，输出：
 *   1. data/panel.json   — agent 冷启动第一读物（机器视野，schema 进 C9c 门）
 *   2. wiki/panel.md     — 人读视图（Tolaria 标签格式）
 *
 * 设计纪律（DESIGN-CONSCIOUSNESS-PANEL-2026-09-08）：
 *   - 意识层只陈述事实层，绝不反向改写：本脚本只读 raw/DB/wiki/git，永不写回业务数据
 *   - 全部聚合既有产出，零新计算引擎
 *   - 非关键尾步：失败不改变代谢退出码（由调用方 try/catch 兜底）
 *
 * 用法：
 *   node src/metabolism-panel.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'knowledge.db');
const PANEL_PATH = path.join(ROOT, 'data', 'panel.json');
const PANEL_MD_PATH = path.join(ROOT, 'wiki', 'panel.md');
const STALE_MS = 14 * 24 * 60 * 60 * 1000; // 超两周未更新 = 过期（2026-09-17 起仅用于 queues 文件位清单，不再充当 gaps.stale）

// git 调用失败静默降级（git 不可用不阻塞面板）
function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return null;
  }
}

function num(row) {
  return row && row.length ? Number(row[0].n || 0) : 0;
}

async function main() {
  const KnowledgeStore = require('./knowledge-store.js');
  const store = new KnowledgeStore(DB_PATH);
  await store.init();

  // ── health：KESPI 平均 / 规模 ──────────────────────────────
  // KESPI 均值口径：只算**活跃实体**（2026-09-17，所有者点单全修 #11）——旧法吃 entity_metadata 全行，
  // done/voided 的残留分数行会随留痕累积把均值拖离现值；面板/kespi 跌破触发器/README 引用位都吃此数。
  const kespiRow = store.all('SELECT AVG(m.kespi_score) AS v FROM entity_metadata m JOIN entities e ON e.id = m.entity_id WHERE m.kespi_score > 0 AND e.status = \'active\'');
  const kespiAvg = kespiRow.length && kespiRow[0].v != null ? Number(kespiRow[0].v).toFixed(2) : null;
  const entityCount = num(store.all("SELECT COUNT(*) AS n FROM entities WHERE status='active'"));
  const linkCount = num(store.all('SELECT COUNT(*) AS n FROM links'));

  // ── gaps：缺口 5 维——单一真源 = gap-detector.js 的 GapDetector ────────
  // 2026-09-17 缺陷修复（半拉起巡检）：旧版在此手写 SQL 自定口径（thin=链接数≤1、
  // stale=wiki 文件 mtime>14d），与巡检器（thin=正文<100 字、stagnant=updated_at>30d）
  // 同名异义，实测同库同分钟 panel.thin=0 vs detector.thin=7 静默分叉；
  // memo 健康/派单只吃 panel.gaps → 假痊愈。面板头纪律「零新计算引擎」要求下，
  // 面板改为直接聚合既有巡检引擎，不再另算一套。
  // 键名沿用 orphan/thin/stale/unindexed/empty（stale ← detector 的 stagnant）。
  const { GapDetector } = require('./gap-detector.js');
  const detector = new GapDetector(DB_PATH);
  const scan = await detector.scan();
  const g = scan.gaps || {};
  const orphan = (g.orphan || []).length;
  const thin = (g.thin || []).length;
  const stale = (g.stagnant || []).length;
  const unindexed = (g.unindexed || []).length;
  const empty = (g.empty || []).length;

  // queues 用的两周未动文件位清单（mtime 口径，只作队列展示，不再是 gaps）
  const staleNames = [];
  const entitiesDir = path.join(ROOT, 'wiki', 'entities');
  if (fs.existsSync(entitiesDir)) {
    const now = Date.now();
    for (const f of fs.readdirSync(entitiesDir)) {
      if (!f.endsWith('.md')) continue;
      const st = fs.statSync(path.join(entitiesDir, f));
      if (now - st.mtimeMs > STALE_MS) {
        staleNames.push(f.replace(/\.md$/, ''));
      }
    }
  }

  // ── queues：Todo / Skill / Output 实体（批次三约定）─────────
  const todoRows = store.all("SELECT id, tags FROM entities WHERE type='Todo' AND status='active' ORDER BY created_at");
  const agentTodos = todoRows.filter(r => !String(r.tags || '').includes('user')).map(r => r.id);
  const userTodos = todoRows.filter(r => String(r.tags || '').includes('user')).map(r => r.id);
  const skillRow = store.all("SELECT COUNT(*) AS n FROM entities WHERE type='Skill' AND status='active'");
  const skillTypeRow = store.all("SELECT COUNT(DISTINCT tags) AS n FROM entities WHERE type='Skill' AND status='active'");
  const outputCount = num(store.all("SELECT COUNT(*) AS n FROM entities WHERE type='Output' AND status='active'"));

  // ── timeline：会话时间线 ────────────────────────────────────
  const convToday = num(store.all("SELECT COUNT(*) AS n FROM entities WHERE type='Conversation' AND created_at >= datetime('now','-1 day')"));
  const rawToday = fs.existsSync(path.join(ROOT, 'raw'))
    ? fs.readdirSync(path.join(ROOT, 'raw')).filter(f => f.endsWith('.md')).length
    : 0;
  const latestConvRow = store.all("SELECT id FROM entities WHERE type='Conversation' ORDER BY created_at DESC LIMIT 1");

  // ── lines：版本线路状态 ─────────────────────────────────────
  const branch = git('rev-parse --abbrev-ref HEAD');
  const head = git('rev-parse --short HEAD');
  const remoteHead = git('rev-parse --short @{u}');
  let unpushed = 0;
  if (branch && remoteHead) {
    const n = git('rev-list --count @{u}..HEAD');
    unpushed = n ? parseInt(n, 10) || 0 : 0;
  }

  // ── gates：最近验收登记（验收 agent 写 data/last-verify.json，缺省显式 unknown）──
  let gates = 'unknown（跑 node verify-deploy.js 刷新）';
  const lvPath = path.join(ROOT, 'data', 'last-verify.json');
  if (fs.existsSync(lvPath)) {
    try {
      const lv = JSON.parse(fs.readFileSync(lvPath, 'utf8'));
      gates = `${lv.result} @${lv.hash || '?'}（${lv.date || '?'}）`;
    } catch (e) { /* 损坏登记按 unknown 处理 */ }
  }

  const panel = {
    _meta: {
      generatedBy: 'metabolism-panel.js',
      generatedAt: new Date().toISOString(),
      freshnessRule: '随代谢链刷新；过期 = 代谢链未跑'
    },
    health: {
      kespi_avg: kespiAvg,
      gates,
      subchain_debts: 0,
      entity_count: entityCount,
      link_count: linkCount
    },
    lines: {
      tracked_branch: branch || 'unknown',
      head,
      remote_head: remoteHead,
      unpushed,
      opt_mirror: null,
      drift: 0
    },
    queues: {
      agent_todos: agentTodos,
      user_todos: userTodos,
      stale: staleNames.slice(0, 10),
      skill_count: skillRow.length ? skillRow[0].n : 0,
      skill_types: skillTypeRow.length ? skillTypeRow[0].n : 0,
      output_count: outputCount
    },
    gaps: { orphan, thin, stale, unindexed, empty },
    chains: { top_guide_chains: [] },
    timeline: {
      conversations_today: convToday + rawToday,
      latest_session: latestConvRow.length ? latestConvRow[0].id : null
    }
  };

  // 落盘 machine 视图
  fs.mkdirSync(path.dirname(PANEL_PATH), { recursive: true });
  fs.writeFileSync(PANEL_PATH, JSON.stringify(panel, null, 2) + '\n', 'utf8');
  console.log('🧠 意识层面板已生成: data/panel.json / consciousness panel generated');

  // 落盘人读视图（Tolaria 标签格式）
  const md = `---
tags: [consciousness, panel, meta]
name: "panel"
type: "Consciousness"
status: "active"
confidence: 1.0
updated: "${panel._meta.generatedAt}"
---

# 意识层注意力队列 / Consciousness Attention Queue

[tag:consciousness] 由代谢尾步自动生成，随代谢链刷新；过期 = 代谢链未跑。

## 健康 / Health

- KESPI 平均: ${panel.health.kespi_avg ?? '—'}
- 验收状态: ${panel.health.gates}
- 规模: ${panel.health.entity_count} 实体 / ${panel.health.link_count} 链接

## 线路 / Lines

- 分支: ${panel.lines.tracked_branch} @ ${panel.lines.head ?? '?'}
- 未推送: ${panel.lines.unpushed}（远端 ${panel.lines.remote_head ?? '?'}）
- OPT 镜像: ${panel.lines.opt_mirror ?? '未登记'} · 漂移 ${panel.lines.drift}

## 队列 / Queues

- Agent 待办（type=Todo）: ${panel.queues.agent_todos.length ? panel.queues.agent_todos.join('、') : '（空）'}
- 用户待办: ${panel.queues.user_todos.length ? panel.queues.user_todos.join('、') : '（空）'}
- 技能库: ${panel.queues.skill_count} 条 / ${panel.queues.skill_types} 类 · 产出 ${panel.queues.output_count} 条
- 超两周未更新: ${panel.queues.stale.length ? panel.queues.stale.join('、') : '（无）'}

## 缺口 / Gaps

孤立 ${panel.gaps.orphan} · 薄链接 ${panel.gaps.thin} · 过期 ${panel.gaps.stale} · 未索引 ${panel.gaps.unindexed} · 空内容 ${panel.gaps.empty}

## 时间线 / Timeline

- 今日会话: ${panel.timeline.conversations_today}
- 最近会话: ${panel.timeline.latest_session ?? '—'}
`;

  fs.mkdirSync(path.dirname(PANEL_MD_PATH), { recursive: true });
  fs.writeFileSync(PANEL_MD_PATH, md, 'utf8');
  console.log('🧠 人读视图已生成: wiki/panel.md');
  console.log(`📋 摘要: kespi=${panel.health.kespi_avg ?? '—'} 实体=${panel.health.entity_count} 链接=${panel.health.link_count} 未推送=${panel.lines.unpushed}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`❌ 意识层面板生成失败: ${err.message}`);
    process.exit(1);
  });
} else {
  module.exports = main;
}