@echo off
cd /d "%~dp0"
echo.
echo [LEE&NOTE] Telegram notification test.
echo This sends one message using the latest cached disclosure date.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ". '%~dp0telegram_config.local.ps1'; & '%~dp0telegram_notify.ps1'"
echo.
if errorlevel 1 (
  echo TELEGRAM TEST FAILED. Please check bot token and chat id.
) else (
  echo TELEGRAM TEST COMPLETE. Please check your Telegram chat.
)
echo.
pause
