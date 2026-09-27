@echo off
chcp 65001 >nul
echo.
echo   AI Agent Studio 正在启动...
echo   启动后请访问 http://localhost:5178
echo   关闭此窗口即可停止服务
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   [!] 没有检测到 Node.js，请先安装 Node.js 18 或更高版本：https://nodejs.org
  pause
  exit /b
)
start "" http://localhost:5178
node server\index.js
pause
