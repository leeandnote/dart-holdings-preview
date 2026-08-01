@echo off
cd /d "%~dp0"
echo.
echo [DART Major Holdings] Data update started.
echo Do not close this window until it finishes.
echo.
if "%DART_API_KEY%"=="" (
  echo DART_API_KEY environment variable is missing.
  echo Please set DART_API_KEY before running this file.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0daily_update.ps1" -ApiKey "%DART_API_KEY%"
echo.
if errorlevel 1 (
  echo UPDATE FAILED. Please check the messages above.
) else (
  echo UPDATE COMPLETE.
  echo Now open dashboard_click or site\index.html.
)
echo.
pause
