# aing Agent 控制面板启动脚本
# 用法: .\scripts\dashboard.ps1 [port] [api-key]

param(
    [int]$Port = 3789,
    [string]$ApiKey = ""
)

Write-Host @"

╔══════════════════════════════════════════════════════════════╗
║                 🎛️  aing Agent 控制面板启动                  ║
╚══════════════════════════════════════════════════════════════╝

  端口：$Port
"@

if ($ApiKey) {
    Write-Host "  认证：已启用"
    $env:AING_API_KEY = $ApiKey
} else {
    Write-Host "  认证：本机模式（无认证）"
}

Write-Host @"

  启动命令：node src/agent-dashboard.js --port $Port
"@

Set-Location -Path $PSScriptRoot\..
& node src/agent-dashboard.js --port $Port @(-if ($ApiKey) { "--api-key=$ApiKey" })
