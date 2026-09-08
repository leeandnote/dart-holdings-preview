param(
  [string]$ReportDate = (Get-Date).ToString("yyyyMMdd"),
  [switch]$DryRun,
  [switch]$ForceAll,
  [int]$Top = 20
)

Write-Host "Legacy local intraday Telegram sender is disabled."
Write-Host "Convex cloud now polls DART and sends Telegram alerts directly."
Write-Host "ReportDate: $ReportDate"
Write-Host "This prevents duplicate or old numbered Telegram message formats."
exit 0