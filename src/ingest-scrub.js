/**
 * ingest-scrub.js — 入库正文采集过程剥除器 / collection-trace scrubber
 *
 * 用户口径（2026-09-14 定）：入库只存「用户/agent 贴出来的详情」，
 * 「贴出来之前为了拿到它所做的 HTTP 行为」一律不入库、不留旁路、不存档。
 * 影子实测过不处理的后果：混在正文里的 curl 命令行、响应头、JSON 报文
 * 会被 distill 当"原话要点"固化进蒸馏摘要（8 行里 5 行是过程行），
 * 并从里面提出 `https` / `example` 当标签（标签是加载单位，纪律 7），
 * 还能被关键词检索当成资料召回。所以剥除必须发生在最上游 addMessage 之前。
 *
 * 设计约束：
 *   - 行首锚定：只认"这一行本身就是过程"的形状，自然语言里提到 curl/URL 的正文保留
 *   - 纯函数、无副作用、无 IO：可被门禁直接真跑（纪律 1 双证据里的"读码"侧要能单测）
 *   - 只删不藏：被剥行的内容不落任何文件、不进 WAL、不写旁路，只回一个计数
 */

'use strict';

// 行首即过程：命令行 / 请求行 / 状态行 / 头 / 报文 / 计时统计
const LINE_ANCHOR = [
  /^\s*\$+\s*(curl|wget|httpie|https?\.exe|nc|ssh|scp|gsutil|aws|az|gh api|git (clone|fetch|ls-remote))\b/i, // $ curl ...
  /^\s*(curl|wget)\s+-\w/i,                                                            // curl -sS ...（无提示符）
  /^\s*(?:[<>]\s*)?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+\S+(\s+HTTP\/\d(\.\d)?)?\s*$/i, // 请求行
  /^\s*[<>]?\s*HTTP\/\d(\.\d)?\s+\d{3}\b/i,                                           // 状态行（含 curl -i 回显的 "< HTTP/1.1 200 OK"）
  /^\s*[<>]\s*[A-Za-z][A-Za-z0-9_-]*\s*:\s*\S/,                                        // < content-type: / > authorization:
  /^\s*[A-Za-z][A-Za-z0-9_-]*(authorization|cookie|token)\s*:\s*\S/i,                   // header: value（含 Bearer）
  /^\s*[{"\[]\s*"?[A-Za-z_$][\w$]*"?\s*:/,                                              // 单行 JSON / 报文起点
  /^\s*[\|┌└├═─]*\s*(status|code|duration|elapsed|bytes|time_(total|start)|x-request-id)\s*[:=]\s*\S/i,
  /^\s*\d{3}\s+(ok|created|accepted|no content|moved|bad request|unauthorized|forbidden|not found|error)\b/i,
  /^\s*(→|=>|->)\s+\d{3}\b/                                                             // → 200
].map(re => re.source).map(src => new RegExp(src, 'i'));

// 行内痕迹特征（2026-09-14 OPT 真机补漏）：痕迹写在行中间时，行首锚定规则看不见。
// 例：tool call: bash -c "curl -H 'x: y' http://10.255.255.1:9/z" → 200 OK 12ms
// 风险：中文讨论句里也可能引用"→ 200 OK"，所以本层要求整行 ASCII 主导——
// 本包知识正文是中文散文，采集回显是 ASCII 命令，ASCII 占比就是两者的分离器。
const LINE_INLINE = [
  /(?:^|[\s"')\]])[→>]{1,2}\s*\d{3}\s+[A-Za-z]/,                                  // … → 200 OK
  /\b\d{3}\s+(ok|created|accepted|no content|bad request|unauthorized|forbidden|not found|too many|internal server error)\b/i,
  /(?:^|[\s"'])(?:bash|sh|zsh|dash|powershell|pwsh|cmd(?:\.exe)?)\s+-[acl]\s+["']/i, // bash -c "…"
  /^\s*(tool\s*call|function\s*call|tool_call|工具调用|调用工具|调用\s*(?:bash|shell))\s*[:：(]/i,
  /\bhttps?:\/\/[\w.-]+(?::\d+)?[\w./?=&%-]*[\s"']*(?:\([^)]*\)\s*)?(?:\|\s*)?(?:-o\s|--data\b|-d\s|\|\s*jq\b)/i, // URL + 落盘/管道/请求体
].map(re => re.source).map(src => new RegExp(src, 'i'));

// ASCII 占比阈值：低于此值视为"人在写中文正文"，行内特征一律不触发
const ASCII_RATIO_MIN = Number(process.env.AING_SCRUB_ASCII_MIN || 0.6);

function asciiRatio(text) {
  const s = String(text == null ? '' : text);
  if (!s.length) return 0;
  const printable = (s.match(/[\x20-\x7E]/g) || []).length;
  return printable / s.length;
}

// 词级噪声：这些词形状是采集手段而非知识主题，不得成为标签（纪律 7：标签是加载单位）
const TRACE_WORDS = new Set([
  'http', 'https', 'ftp', 'ws', 'wss', 'www', 'url', 'uri', 'curl', 'wget', 'json', 'html',
  'xml', 'bearer', 'authorization', 'cookie', 'token', 'request', 'response', 'payload',
  'header', 'headers', 'statuscode', 'elapsed', 'timeout', 'useragent', 'api', 'endpoint',
  'contenttype', 'application', 'textplain', 'octet', 'stream'
]);

// host 形状：example.dev / api.example.cn / 10.0.0.1 → 一律视为出处，不是主题
const HOST_SHAPE = /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const IPV4_SHAPE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isTraceLine(line) {
  const t = String(line == null ? '' : line).trim();
  if (!t) return false;
  if (LINE_ANCHOR.some(re => re.test(t))) return true;
  // 行内特征只在 ASCII 主导的行上生效（中文散文里的引用不被剥除）
  if (asciiRatio(t) >= ASCII_RATIO_MIN && LINE_INLINE.some(re => re.test(t))) return true;
  return false;
}

/**
 * 剥除采集过程行。
 * @returns {{kept:string, keptLines:string[], removed:number, samples:string[]}}
 *   kept 为剥后正文；removed 为剥除行数；samples 仅取被剥行的前 24 字用于日志，不入库
 */
function scrubCollectionTrace(content) {
  const text = String(content == null ? '' : content);
  if (!text.trim()) return { kept: text, keptLines: [], removed: 0, samples: [] };
  const lines = text.split(/\r?\n/);
  const keptLines = [];
  let removed = 0;
  const samples = [];
  for (const ln of lines) {
    if (isTraceLine(ln)) {
      removed++;
      if (samples.length < 2) samples.push(ln.trim().slice(0, 24));
      continue;   // 真删：不留副本、不写旁路
    }
    keptLines.push(ln);
  }
  // 连续空行压缩（剥除后留下的空洞）
  const kept = keptLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { kept, keptLines: kept.split(/\r?\n/).filter(x => x.trim()), removed, samples };
}

/** 词/标签过滤：协议词、host 形状、IP 一律剔除 */
function isTraceToken(word) {
  const w = String(word || '').trim();
  if (!w) return true;
  const lower = w.toLowerCase();
  if (TRACE_WORDS.has(lower)) return true;
  if (HOST_SHAPE.test(w) || IPV4_SHAPE.test(w)) return true;
  if (/^[A-Za-z][A-Za-z0-9-]*\.[A-Za-z]{2,}$/.test(lower)) return true; // 带点即域名形状
  return false;
}

module.exports = { scrubCollectionTrace, isTraceLine, isTraceToken, asciiRatio, ASCII_RATIO_MIN, TRACE_WORDS };
