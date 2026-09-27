#!/usr/bin/env bash
cd "$(dirname "$0")"
echo ""
echo "  AI Agent Studio 正在启动..."
echo "  启动后请访问 http://localhost:5178"
echo "  按 Ctrl + C 停止服务"
echo ""
if ! command -v node >/dev/null 2>&1; then
  echo "  [!] 没有检测到 Node.js，请先安装 Node.js 18 或更高版本：https://nodejs.org"
  exit 1
fi
(sleep 1; open "http://localhost:5178" 2>/dev/null || xdg-open "http://localhost:5178" 2>/dev/null) &
node server/index.js
