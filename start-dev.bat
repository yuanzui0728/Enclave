@echo off
cd /d "%~dp0"
echo Restarting all dev services...
node scripts/dev-services.mjs restart all
echo.
echo Done. Services:
echo   Backend API   http://127.0.0.1:3000
echo   App           http://127.0.0.1:5180
echo   Admin         http://127.0.0.1:5181
echo   Cloud API     http://127.0.0.1:3001
echo   Cloud Console http://127.0.0.1:5182
echo.
pause
