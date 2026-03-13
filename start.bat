@echo off
chcp 65001 >nul
set ROOT=%~dp0

echo 正在停止占用端口的进程...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5174 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul

if not exist "%ROOT%logs" mkdir "%ROOT%logs"

echo 启动后端...
start "API" cmd /c "cd /d "%ROOT%api" && npm run start:dev > "%ROOT%logs\api.log" 2>&1"

echo 启动 H5 前端...
start "WEB" cmd /c "cd /d "%ROOT%web" && npm run dev > "%ROOT%logs\web.log" 2>&1"

echo 启动管理后台...
start "ADMIN" cmd /c "cd /d "%ROOT%admin" && npm run dev > "%ROOT%logs\admin.log" 2>&1"

echo 等待后端启动...
:wait_api
timeout /t 2 /nobreak >nul
curl -s http://localhost:3000/api/characters >nul 2>&1
if errorlevel 1 goto wait_api

echo 等待前端启动...
:wait_web
timeout /t 1 /nobreak >nul
curl -s http://localhost:5174 >nul 2>&1
if errorlevel 1 goto wait_web

echo.
echo ========================================
echo 启动成功！
echo   后端 API   - http://localhost:3000
echo   H5 前端    - http://localhost:5174
echo   管理后台   - http://localhost:5173
echo ========================================
echo.
echo 日志文件在 logs\ 目录下
echo 按任意键退出（服务继续在后台运行）
pause >nul
