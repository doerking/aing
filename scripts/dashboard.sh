#!/bin/bash
# aing Agent 控制面板启动脚本
# 用法: ./scripts/dashboard.sh [port] [api-key]

PORT=${1:-3789}
API_KEY=${2:-""}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                 🎛️  aing Agent 控制面板启动                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  端口：$PORT"
if [ -n "$API_KEY" ]; then
  echo "  认证：已启用"
  export AING_API_KEY="$API_KEY"
else
  echo "  认证：本机模式（无认证）"
fi
echo ""
echo "  启动命令：node src/agent-dashboard.js --port $PORT"
echo ""

cd "$(dirname "$0")/.."
exec node src/agent-dashboard.js --port "$PORT" ${API_KEY:+--api-key="$API_KEY"}
