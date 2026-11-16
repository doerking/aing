'use strict';
// M6 任务 6.4d failing test —— 会话轨迹的 route 用可读话题（SPEC-6.4 修订 B）
// 轨迹 route 会被预案/派单当依据名显示；markdown 会话的 name 是时间戳，直接进 route 等于没名字。
const fs = require('fs');
const os = require('os');
const path = require('path');

const yard = fs.mkdtempSync(path.join(os.tmpdir(), 'aingv2-traj-route-'));
process.on('exit', () => { try { fs.rmSync(yard, { recursive: true, force: true }); } catch (_) {} });

let pass = 0, fail = 0;
function ac(n, c, d = '') { if (c) { console.log('✅ ' + n); pass++; } else { console.log('❌ ' + n + (d ? ' — ' + d : '')); fail++; } }

const T = require('../src/trajectory.js');
const NL = String.fromCharCode(10);
const mdConv = (ts, summary) => ['# 会话-' + ts, '', '## 来源', '', '- 原始资料：dispatch-x', '', '## 蒸馏摘要', '', '- ' + summary, ''].join(NL);

(async () => {
  // AC-1 markdown 会话：route 取摘要首句
  const mdEntity = { id: 'conv-md', name: '会话-2026-11-09T01:23:41.985Z', type: 'Conversation', content: mdConv('2026-11-09T01:23:41.985Z', '回炉闭环要先补接链') };
  const t1 = T.buildMarkdownTrajectory(mdEntity);
  ac('AC-1 markdown route 可读', t1 && Array.isArray(t1.route) && t1.route.length === 1 &&
    /回炉闭环/.test(t1.route[0]) && !/T01:23:41/.test(t1.route[0]),
    JSON.stringify({ route: t1 && t1.route }));

  // AC-2 JSON 会话：route 用原文 topic
  const jsonEntity = { id: 'conv-json', name: '旧名', type: 'Conversation', content: JSON.stringify({ topic: '检索融合', reply: '检索融合要加 IDF 通道。' }) };
  const t2 = T.buildSessionTrajectory(jsonEntity);
  ac('AC-2 JSON route 用 topic', t2 && t2.route[0] === '检索融合', JSON.stringify({ route: t2 && t2.route }));

  // AC-3 既有契约不破：id / task_type / source 不变
  ac('AC-3 契约不破', t1.id === 'traj-conv-md' && t1.task_type === 'session' && t1.source === 'session-markdown' &&
    t2.id === 'traj-conv-json' && t2.task_type === 'session',
    JSON.stringify({ id1: t1.id, s1: t1.source, id2: t2.id }));

  // AC-4 只读：构造轨迹不改实体
  const before = JSON.stringify(mdEntity);
  T.buildMarkdownTrajectory(mdEntity);
  T.buildSessionTrajectory(mdEntity);
  ac('AC-4 只读', before === JSON.stringify(mdEntity), '构造轨迹改动了实体对象');

  console.log(`${pass}/${pass + fail} 绿`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('❌ 运行异常: ' + e.message); process.exit(1); });
