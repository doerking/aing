# setup-vectors.ps1 — aing 本地语义向量一键安装（可选组件）
#
# 效果：把向量检索从默认 64-dim 零依赖哈希，升级为 384-dim 本地语义向量
#       （Xenova/all-MiniLM-L6-v2 量化 onnx 约 22MB，纯本地离线推理，零外呼）。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File setup-vectors.ps1
#
# 装完后：
#   node src/index-vectors.js --semantic --reindex
#
# 网络说明：模型从 hf-mirror.com（HuggingFace 国内镜像）下载——
# 直连 huggingface.co 在国内网络下会超时，这是普通用户部署最常见的卡点。

$ErrorActionPreference = 'Stop'
$pkg = $PSScriptRoot

Write-Host "═══ aing 本地语义向量安装 ═══" -ForegroundColor Cyan

# ── 0) 前置检查 ──────────────────────────────────────────────
try { $nodeVer = (node --version) } catch {
    Write-Host "❌ 未检测到 Node.js，请先安装：https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js $nodeVer"

# ── 1) npm 依赖（--ignore-scripts：避开sharp/onnx安装脚本的网络坑） ──
Push-Location $pkg
try {
    Write-Host "`n[1/3] 安装 @xenova/transformers ..." -ForegroundColor Cyan
    npm install @xenova/transformers --ignore-scripts --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw "npm install @xenova/transformers 失败（exit $LASTEXITCODE）" }

    Write-Host "[1/3] 安装 sharp（transformers 硬依赖，需允许 install 脚本下载原生二进制）..." -ForegroundColor Cyan
    npm install sharp --no-fund --no-audit
    # 注意：sharp 不能加 --ignore-scripts，否则缺 .node 原生库，import transformers 会直接报错

    # transformers 嵌套的旧版 sharp（随 --ignore-scripts 安装）缺原生二进制，
    # 会阻断 import；删除后 Node 解析自动落到顶层新版 sharp
    $nestedSharp = Join-Path $pkg 'node_modules\@xenova\transformers\node_modules\sharp'
    if (Test-Path $nestedSharp) {
        Remove-Item $nestedSharp -Recurse -Force
        Write-Host "  🧹 已清理嵌套旧版 sharp（回退到顶层版本）"
    }
} finally {
    Pop-Location
}

# ── 2) 模型下载（hf-mirror，已存在则跳过，可重复执行） ─────────
$base = 'https://hf-mirror.com/Xenova/all-MiniLM-L6-v2/resolve/main'
$dst  = Join-Path $pkg 'models\Xenova\all-MiniLM-L6-v2'
$files = @(
    'config.json',
    'tokenizer_config.json',
    'tokenizer.json',
    'onnx/model_quantized.onnx'
)

Write-Host "`n[2/3] 下载模型（hf-mirror.com 镜像）..." -ForegroundColor Cyan
foreach ($f in $files) {
    $target = Join-Path $dst ($f -replace '/', '\')
    if (Test-Path $target) {
        Write-Host "  ⏭️  已存在，跳过: $f"
        continue
    }
    $targetDir = Split-Path $target -Parent
    if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Force $targetDir | Out-Null }
    Write-Host "  ⬇️  $f ..."
    # PS 5.1 的 Invoke-WebRequest 不跟随 308 重定向，改用 Win10+ 自带的 curl.exe
    & curl.exe -sSL --retry 3 -o $target "$base/$f"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $target)) {
        Write-Host "❌ 下载失败: $f（网络异常，请重跑本脚本）" -ForegroundColor Red
        exit 1
    }
}
$onnx = Get-Item (Join-Path $dst 'onnx\model_quantized.onnx') -ErrorAction SilentlyContinue
if (-not $onnx -or $onnx.Length -lt 10MB) {
    Write-Host "❌ 模型文件缺失或过小，请检查网络后重跑本脚本" -ForegroundColor Red
    exit 1
}

# ── 3) 端到端验证 ────────────────────────────────────────────
Write-Host "`n[3/3] 验证..." -ForegroundColor Cyan
Push-Location $pkg
try {
    node -e "const sv = require('./src/semantic-vector'); if (!sv.isAvailable()) { console.error('组件未就绪'); process.exit(1); } console.log('✅ 语义向量组件就绪');"
    if ($LASTEXITCODE -ne 0) { throw "验证失败" }
} finally {
    Pop-Location
}

Write-Host "`n═══ 安装完成 ═══" -ForegroundColor Green
Write-Host "下一步（重建索引为 384 维语义向量）：" -ForegroundColor Green
Write-Host "  node src/index-vectors.js --semantic --reindex"
Write-Host "`n说明：模型在 models\ 目录下，全部离线可用；删除 models\ 目录即可回退纯哈希模式。"
