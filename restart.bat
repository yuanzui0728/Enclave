@echo off
cd /d "%~dp0"

echo 关闭占用端口...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " 2^>nul') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5180 " 2^>nul') do taskkill /f /pid %%a >nul 2>&1

echo 启动后端 (port 3000)...
start "yinjie-api" cmd /k "cd /d "%~dp0api" && npm run start:dev"

timeout /t 3 /nobreak >nul

echo 启动前端 (port 5180)...
start "yinjie-app" cmd /k "cd /d "%~dp0apps\app" && npm run dev"

echo.
echo 后端: http://localhost:3000
echo 前端: http://localhost:5180
